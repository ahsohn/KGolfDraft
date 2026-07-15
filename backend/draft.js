const db = require("./db");

const AUTO_DRAFT_DELAY_MS = 2000;

const emptyState = () => ({
  draftId: null,
  draftName: null,
  theme: "golf",
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
});

let state = emptyState();

// Online users are connection-level, not draft-level — survives draft switches
const onlineUsers = new Set();

let autoDraftTimer = null;
let onPickCallback = null;

function getState() {
  return {
    draftId: state.draftId,
    draftName: state.draftName,
    theme: state.theme,
    status: state.status,
    currentRound: state.currentRound,
    currentPickInRound: state.currentPickInRound,
    totalRounds: state.totalRounds,
    draftFormat: state.draftFormat,
    overallPick: state.overallPick,
    users: state.users,
    availablePlayers: state.availablePlayers,
    picks: state.picks,
    teams: state.teams,
    autoDraft: Object.fromEntries(Object.entries(state.autoDraft)),
    onlineUsers: Array.from(onlineUsers),
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
  [8, 7, 6, 5, 4, 3, 2, 1],
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

// Walk the rounds to convert a pick count into (round, pickInRound)
function computePositionFromPicks(pickCount) {
  let remaining = pickCount;
  let round = 1;
  while (round <= state.totalRounds) {
    const roundLength = getPickOrderForRound(round).length;
    if (remaining < roundLength) break;
    remaining -= roundLength;
    round++;
  }
  return { round, pickInRound: remaining };
}

// Load the current draft (players, participants, picks) from the database.
// Called at startup and whenever the super-admin changes the current draft
// or edits its players/participants.
async function loadCurrentDraft() {
  clearAutoDraftTimer();

  // Preserve auto-draft flags when the same draft is reloaded mid-session
  // (e.g. the super-admin renames a user during an active draft)
  const prevDraftId = state.draftId;
  const prevAutoDraft = state.autoDraft;

  const draft = await db.getCurrentDraft();
  if (!draft) {
    state = emptyState();
    console.log("No current draft set");
    return;
  }

  const [players, users, picks] = await Promise.all([
    db.getDraftPlayers(draft.id),
    db.getDraftParticipants(draft.id),
    db.getPicks(draft.id),
  ]);

  state = emptyState();
  state.draftId = draft.id;
  state.draftName = draft.name;
  state.theme = draft.theme;
  state.status = draft.status;
  state.totalRounds = draft.totalRounds;
  state.draftFormat = draft.draftFormat;
  state.players = players.sort((a, b) => a.rank - b.rank);
  state.users = users.sort((a, b) => a.draftOrder - b.draftOrder);
  state.availablePlayers = [...state.players];

  for (const user of state.users) {
    state.teams[user.email] = [];
    state.autoDraft[user.email] =
      prevDraftId === draft.id ? !!prevAutoDraft[user.email] : false;
  }

  for (const pick of picks) {
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

  state.overallPick = state.picks.length;
  if (state.status === "active") {
    const pos = computePositionFromPicks(state.picks.length);
    state.currentRound = pos.round;
    state.currentPickInRound = pos.pickInRound;
    if (state.currentRound > state.totalRounds) {
      state.status = "complete";
      db.updateDraftStatus(state.draftId, "complete").catch((err) =>
        console.error("Error updating draft status:", err.message)
      );
    }
  }

  console.log(
    `Loaded draft "${draft.name}" (#${draft.id}): ${state.players.length} players, ${state.users.length} participants, ${picks.length} picks, status=${state.status}`
  );

  // If we reloaded mid-draft and the on-clock user has auto-draft on, re-arm it
  scheduleAutoDraftIfNeeded();
}

function setOnPickCallback(cb) {
  onPickCallback = cb;
}

async function startDraft(totalRounds, draftFormat) {
  if (!state.draftId) return { error: "No draft is set up yet" };
  if (state.status === "active") return { error: "Draft already in progress" };
  if (state.status === "complete") return { error: "Draft is already complete" };
  if (state.users.length === 0) return { error: "No participants assigned" };
  if (state.players.length === 0) return { error: "No players loaded" };

  state.draftFormat =
    draftFormat === "thirdRoundReversal" ? "thirdRoundReversal" : "snake";
  // 3rd Round Reversal has a fixed pick order, so its round count is fixed too
  state.totalRounds =
    state.draftFormat === "thirdRoundReversal"
      ? THIRD_ROUND_REVERSAL_ORDER.length
      : totalRounds || 10;

  const pos = computePositionFromPicks(state.picks.length);
  state.overallPick = state.picks.length;
  state.currentRound = pos.round;
  state.currentPickInRound = pos.pickInRound;

  if (state.currentRound > state.totalRounds) {
    state.status = "complete";
    return { error: "All rounds already completed" };
  }

  state.status = "active";
  db.updateDraftStatus(state.draftId, "active", {
    totalRounds: state.totalRounds,
    draftFormat: state.draftFormat,
  }).catch((err) => console.error("Error updating draft status:", err.message));

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

  // Persist to Postgres (fire and forget, log errors)
  db.insertPick(state.draftId, pick).catch((err) => {
    console.error("Error writing pick to database:", err.message);
  });

  // Advance to next pick
  state.currentPickInRound++;
  if (state.currentPickInRound >= getPickOrderForRound(state.currentRound).length) {
    state.currentRound++;
    state.currentPickInRound = 0;

    if (state.currentRound > state.totalRounds) {
      state.status = "complete";
      db.updateDraftStatus(state.draftId, "complete").catch((err) =>
        console.error("Error updating draft status:", err.message)
      );
      console.log("Draft complete!");
      return { success: true, pick, complete: true };
    }
  }

  // Schedule auto-draft for next picker if applicable
  scheduleAutoDraftIfNeeded();

  return { success: true, pick };
}

// Super-admin: undo the most recent pick. Returns the undone pick and, if
// auto-draft had to be switched off to prevent an instant re-pick, the email
// of the user it was disabled for.
async function undoLastPick() {
  if (!state.draftId) return { error: "No draft is set up" };
  if (state.picks.length === 0) return { error: "There are no picks to undo" };

  clearAutoDraftTimer();

  const undone = state.picks.pop();
  state.overallPick = state.picks.length;

  // Restore the player to the available pool, keeping rank order
  const player = state.players.find((p) => p.name === undone.golferName);
  if (player) {
    state.availablePlayers.push(player);
    state.availablePlayers.sort((a, b) => a.rank - b.rank);
  }
  if (state.teams[undone.userEmail]) {
    state.teams[undone.userEmail] = state.teams[undone.userEmail].filter(
      (p) => p.name !== undone.golferName
    );
  }

  // A completed draft re-opens when a pick is undone
  if (state.status === "complete") {
    state.status = "active";
    db.updateDraftStatus(state.draftId, "active").catch((err) =>
      console.error("Error updating draft status:", err.message)
    );
  }

  const pos = computePositionFromPicks(state.picks.length);
  state.currentRound = pos.round;
  state.currentPickInRound = pos.pickInRound;

  try {
    await db.deleteLastPick(state.draftId);
  } catch (err) {
    console.error("Error deleting pick from database:", err.message);
  }

  // Don't let auto-draft instantly re-make the pick that was just undone
  let autoDraftDisabledFor = null;
  const picker = getCurrentPicker();
  if (picker && state.autoDraft[picker.email]) {
    state.autoDraft[picker.email] = false;
    autoDraftDisabledFor = picker.email;
  }

  return { success: true, pick: undone, autoDraftDisabledFor };
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

      console.log(`Auto-drafting ${topPlayer.name} for ${picker.name}`);
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
  onlineUsers.add(email);
}

function setUserOffline(email) {
  onlineUsers.delete(email);
}

module.exports = {
  loadCurrentDraft,
  getState,
  startDraft,
  makePick,
  undoLastPick,
  setAutoDraft,
  setUserOnline,
  setUserOffline,
  setOnPickCallback,
  getCurrentPicker,
  isDescendingRound,
};
