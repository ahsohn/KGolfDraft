const sheets = require("./sheets");

const AUTO_DRAFT_DELAY_MS = 2000;

let state = {
  status: "waiting", // waiting | active | complete
  currentRound: 0,
  currentPickInRound: 0,
  totalRounds: 10,
  overallPick: 0,
  users: [],
  players: [],
  availablePlayers: [],
  picks: [],
  teams: {},
  autoDraft: {},
  onlineUsers: new Set(),
};

let autoDraftTimer = null;
let onPickCallback = null;

function getState() {
  return {
    status: state.status,
    currentRound: state.currentRound,
    currentPickInRound: state.currentPickInRound,
    totalRounds: state.totalRounds,
    overallPick: state.overallPick,
    users: state.users,
    availablePlayers: state.availablePlayers,
    picks: state.picks,
    teams: state.teams,
    autoDraft: Object.fromEntries(
      Object.entries(state.autoDraft)
    ),
    onlineUsers: Array.from(state.onlineUsers),
    currentPicker: getCurrentPicker(),
  };
}

function getCurrentPicker() {
  if (state.status !== "active") return null;
  const order = getPickOrderForRound(state.currentRound);
  if (state.currentPickInRound >= order.length) return null;
  return order[state.currentPickInRound];
}

function getPickOrderForRound(round) {
  const sorted = [...state.users].sort((a, b) => a.draftOrder - b.draftOrder);
  // Odd rounds: ascending, even rounds: descending (snake)
  if (round % 2 === 0) {
    return sorted.reverse();
  }
  return sorted;
}

async function initialize() {
  const [players, users, existingPicks] = await Promise.all([
    sheets.getPlayers(),
    sheets.getUsers(),
    sheets.getExistingPicks(),
  ]);

  state.players = players.sort((a, b) => a.rank - b.rank);
  state.users = users.sort((a, b) => a.draftOrder - b.draftOrder);
  state.availablePlayers = [...state.players];
  state.picks = [];
  state.teams = {};
  state.autoDraft = {};

  for (const user of state.users) {
    state.teams[user.email] = [];
    state.autoDraft[user.email] = false;
  }

  // Restore any existing picks from the sheet
  if (existingPicks.length > 0) {
    for (const pick of existingPicks) {
      state.picks.push(pick);
      state.availablePlayers = state.availablePlayers.filter(
        (p) => p.name !== pick.golferName
      );
      if (state.teams[pick.userEmail]) {
        const player = state.players.find((p) => p.name === pick.golferName);
        if (player) {
          state.teams[pick.userEmail].push(player);
        }
      }
    }
  }

  console.log(
    `Initialized: ${state.players.length} players, ${state.users.length} users, ${existingPicks.length} existing picks`
  );
}

function setOnPickCallback(cb) {
  onPickCallback = cb;
}

function startDraft(totalRounds) {
  if (state.status === "active") return { error: "Draft already in progress" };

  state.totalRounds = totalRounds || 10;

  if (state.picks.length > 0) {
    // Resume from existing picks
    state.overallPick = state.picks.length;
    state.currentRound =
      Math.floor(state.overallPick / state.users.length) + 1;
    state.currentPickInRound =
      state.overallPick % state.users.length;
  } else {
    state.currentRound = 1;
    state.currentPickInRound = 0;
    state.overallPick = 0;
  }

  if (state.currentRound > state.totalRounds) {
    state.status = "complete";
    return { error: "All rounds already completed in sheet" };
  }

  state.status = "active";
  console.log(
    `Draft started: ${state.totalRounds} rounds, ${state.users.length} users, resuming at pick ${state.overallPick + 1}`
  );

  scheduleAutoDraftIfNeeded();
  return { success: true };
}

function makePick(userEmail, golferName, isAdminOverride = false) {
  if (state.status !== "active") {
    return { error: "Draft is not active" };
  }

  const currentPicker = getCurrentPicker();
  if (!currentPicker) {
    return { error: "No current picker" };
  }

  if (!isAdminOverride && currentPicker.email !== userEmail) {
    return { error: "It's not your turn" };
  }

  const playerIndex = state.availablePlayers.findIndex(
    (p) => p.name === golferName
  );
  if (playerIndex === -1) {
    return { error: "Player not available" };
  }

  clearAutoDraftTimer();

  const player = state.availablePlayers[playerIndex];
  state.availablePlayers.splice(playerIndex, 1);

  state.overallPick++;
  const pick = {
    round: state.currentRound,
    pickNumber: state.overallPick,
    userEmail: currentPicker.email,
    userName: currentPicker.name,
    golferName: player.name,
  };

  state.picks.push(pick);
  state.teams[currentPicker.email].push(player);

  // Write to Google Sheet (fire and forget, log errors)
  sheets.writePick(pick).catch((err) => {
    console.error("Error writing pick to sheet:", err.message);
  });

  // Advance to next pick
  state.currentPickInRound++;
  if (state.currentPickInRound >= state.users.length) {
    state.currentRound++;
    state.currentPickInRound = 0;

    if (state.currentRound > state.totalRounds) {
      state.status = "complete";
      console.log("Draft complete!");
      return { success: true, pick, complete: true };
    }
  }

  // Schedule auto-draft for next picker if applicable
  scheduleAutoDraftIfNeeded();

  return { success: true, pick };
}

function scheduleAutoDraftIfNeeded() {
  clearAutoDraftTimer();

  if (state.status !== "active") return;

  const picker = getCurrentPicker();
  if (!picker) return;

  if (state.autoDraft[picker.email]) {
    autoDraftTimer = setTimeout(() => {
      const topPlayer = state.availablePlayers[0];
      if (!topPlayer) return;

      console.log(
        `Auto-drafting ${topPlayer.name} for ${picker.name}`
      );
      const result = makePick(picker.email, topPlayer.name);
      if (result.success && onPickCallback) {
        onPickCallback(result.pick, true);
      }
    }, AUTO_DRAFT_DELAY_MS);
  }
}

function clearAutoDraftTimer() {
  if (autoDraftTimer) {
    clearTimeout(autoDraftTimer);
    autoDraftTimer = null;
  }
}

function setAutoDraft(email, enabled) {
  if (state.autoDraft.hasOwnProperty(email)) {
    state.autoDraft[email] = enabled;

    // If the draft is active and it's this user's turn, trigger auto-draft
    const picker = getCurrentPicker();
    if (enabled && picker && picker.email === email && state.status === "active") {
      scheduleAutoDraftIfNeeded();
    }

    return { success: true };
  }
  return { error: "User not found" };
}

function setUserOnline(email) {
  state.onlineUsers.add(email);
}

function setUserOffline(email) {
  state.onlineUsers.delete(email);
}

module.exports = {
  initialize,
  getState,
  startDraft,
  makePick,
  setAutoDraft,
  setUserOnline,
  setUserOffline,
  setOnPickCallback,
  getCurrentPicker,
};
