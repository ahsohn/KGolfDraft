const sheets = require("./sheets");

const AUTO_DRAFT_DELAY_MS = 2000;

const DRAFT_THEME =
  process.env.DRAFT_THEME === "worldcup" ? "worldcup" : "golf";

let state = {
  status: "waiting", // waiting | active | complete
  currentRound: 0,
  currentPickInRound: 0,
  totalRounds: 10,
  draftFormat: "snake", // snake | thirdRoundReversal
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
    draftFormat: state.draftFormat,
    theme: DRAFT_THEME,
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

// 3rd Round Reversal format: a fixed 6-round order (by draft-order position)
// with compensatory picks for teams 7 and 8 in round 2. Rounds have varying
// lengths, so the order is defined explicitly rather than computed.
const THIRD_ROUND_REVERSAL_ORDER = [
  [1, 2, 3, 4, 5, 6, 7, 8],
  [8, 7, 6, 5, 4, 3, 8, 7, 2, 1],
  [8, 7, 6, 4, 3, 2, 1],
  [1, 2, 3, 4, 5, 6, 7, 8],
  [8, 7, 6, 5, 4, 3, 2, 1],
  [1, 2, 3, 4, 5, 6],
];

function isDescendingRound(round) {
  return round % 2 === 0;
}

function getPickOrderForRound(round) {
  const sorted = [...state.users].sort((a, b) => a.draftOrder - b.draftOrder);
  if (state.draftFormat === "thirdRoundReversal") {
    const positions = THIRD_ROUND_REVERSAL_ORDER[round - 1] || [];
    return positions
      .map((pos) => sorted.find((u) => u.draftOrder === pos))
      .filter(Boolean);
  }
  if (isDescendingRound(round)) {
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

function startDraft(totalRounds, draftFormat) {
  if (state.status === "active") return { error: "Draft already in progress" };

  state.draftFormat =
    draftFormat === "thirdRoundReversal" ? "thirdRoundReversal" : "snake";
  // 3rd Round Reversal has a fixed pick order, so its round count is fixed too
  state.totalRounds =
    state.draftFormat === "thirdRoundReversal"
      ? THIRD_ROUND_REVERSAL_ORDER.length
      : totalRounds || 10;

  if (state.picks.length > 0) {
    // Resume from existing picks — rounds can have different lengths
    state.overallPick = state.picks.length;
    let remaining = state.overallPick;
    let round = 1;
    while (round <= state.totalRounds) {
      const roundLength = getPickOrderForRound(round).length;
      if (remaining < roundLength) break;
      remaining -= roundLength;
      round++;
    }
    state.currentRound = round;
    state.currentPickInRound = remaining;
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
  if (state.currentPickInRound >= getPickOrderForRound(state.currentRound).length) {
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
  isDescendingRound,
};
