const test = require("node:test");
const assert = require("node:assert");
const path = require("path");

// Stub the db module before draft.js requires it — these tests exercise the
// in-memory state machine only.
const dbPath = path.resolve(__dirname, "..", "db.js");
const dbCalls = { insertedPicks: [], deletedPicks: 0, statusUpdates: [] };
let mockDraftRow = null;
let mockPlayers = [];
let mockParticipants = [];
let mockPicks = [];

require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: {
    getCurrentDraft: async () => mockDraftRow,
    getDraftPlayers: async () => mockPlayers,
    getDraftParticipants: async () => mockParticipants,
    getPicks: async () => mockPicks,
    insertPick: async (draftId, pick) => {
      dbCalls.insertedPicks.push(pick);
    },
    deleteLastPick: async () => {
      dbCalls.deletedPicks++;
      return null;
    },
    updateDraftStatus: async (id, status) => {
      dbCalls.statusUpdates.push(status);
    },
  },
};

const draft = require("../draft.js");

function makeUsers(n) {
  return Array.from({ length: n }, (_, i) => ({
    email: `user${i + 1}@test.com`,
    name: `User ${i + 1}`,
    isAdmin: false,
    draftOrder: i + 1,
  }));
}

function makePlayers(n) {
  return Array.from({ length: n }, (_, i) => ({
    name: `Player ${i + 1}`,
    rank: i + 1,
  }));
}

async function setupDraft({
  users = 4,
  players = 40,
  status = "waiting",
  picks = [],
  totalRounds = 3,
  draftFormat = "snake",
} = {}) {
  mockDraftRow = {
    id: 1,
    name: "Test Draft",
    theme: "golf",
    status,
    totalRounds,
    draftFormat,
  };
  mockPlayers = makePlayers(players);
  mockParticipants = makeUsers(users);
  mockPicks = picks;
  dbCalls.insertedPicks = [];
  dbCalls.deletedPicks = 0;
  dbCalls.statusUpdates = [];
  await draft.loadCurrentDraft();
}

test("snake order reverses on even rounds", async () => {
  await setupDraft();
  await draft.startDraft(2, "snake");

  const pickSequence = [];
  for (let i = 0; i < 8; i++) {
    const picker = draft.getCurrentPicker();
    pickSequence.push(picker.email);
    const top = draft.getState().availablePlayers[0];
    const result = draft.makePick(picker.email, top.name);
    assert.ok(result.success, result.error);
  }

  assert.deepStrictEqual(pickSequence, [
    "user1@test.com",
    "user2@test.com",
    "user3@test.com",
    "user4@test.com",
    "user4@test.com",
    "user3@test.com",
    "user2@test.com",
    "user1@test.com",
  ]);
  assert.strictEqual(draft.getState().status, "complete");
});

test("undo restores player, team, and turn", async () => {
  await setupDraft();
  await draft.startDraft(3, "snake");

  for (let i = 0; i < 3; i++) {
    const picker = draft.getCurrentPicker();
    const top = draft.getState().availablePlayers[0];
    draft.makePick(picker.email, top.name);
  }

  // Pick #3 was made by user3 (Player 3)
  let state = draft.getState();
  assert.strictEqual(state.picks.length, 3);
  assert.strictEqual(state.currentPicker.email, "user4@test.com");
  assert.strictEqual(state.teams["user3@test.com"].length, 1);

  const result = await draft.undoLastPick();
  assert.ok(result.success, result.error);
  assert.strictEqual(result.pick.golferName, "Player 3");

  state = draft.getState();
  assert.strictEqual(state.picks.length, 2);
  assert.strictEqual(state.overallPick, 2);
  assert.strictEqual(state.currentPicker.email, "user3@test.com");
  assert.strictEqual(state.teams["user3@test.com"].length, 0);
  assert.ok(
    state.availablePlayers.some((p) => p.name === "Player 3"),
    "undone player back in pool"
  );
  // Restored in rank order
  assert.strictEqual(state.availablePlayers[0].name, "Player 3");
  assert.strictEqual(dbCalls.deletedPicks, 1);
});

test("undo across a round boundary", async () => {
  await setupDraft();
  await draft.startDraft(2, "snake");

  // Complete round 1 (4 picks) — round 2 begins with user4
  for (let i = 0; i < 4; i++) {
    const picker = draft.getCurrentPicker();
    draft.makePick(picker.email, draft.getState().availablePlayers[0].name);
  }
  assert.strictEqual(draft.getState().currentRound, 2);

  const result = await draft.undoLastPick();
  assert.ok(result.success);

  const state = draft.getState();
  assert.strictEqual(state.currentRound, 1);
  assert.strictEqual(state.currentPicker.email, "user4@test.com");
});

test("undo reopens a completed draft", async () => {
  await setupDraft();
  await draft.startDraft(1, "snake");

  for (let i = 0; i < 4; i++) {
    const picker = draft.getCurrentPicker();
    draft.makePick(picker.email, draft.getState().availablePlayers[0].name);
  }
  assert.strictEqual(draft.getState().status, "complete");

  const result = await draft.undoLastPick();
  assert.ok(result.success);

  const state = draft.getState();
  assert.strictEqual(state.status, "active");
  assert.strictEqual(state.currentRound, 1);
  assert.strictEqual(state.currentPicker.email, "user4@test.com");
  assert.ok(dbCalls.statusUpdates.includes("active"));
});

test("undo disables auto-draft for the picker back on the clock", async () => {
  await setupDraft();
  await draft.startDraft(3, "snake");

  const picker = draft.getCurrentPicker();
  draft.makePick(picker.email, draft.getState().availablePlayers[0].name);

  // user1 (who just picked) turns auto-draft on, then their pick is undone
  draft.setAutoDraft("user1@test.com", true);
  const result = await draft.undoLastPick();
  assert.ok(result.success);
  assert.strictEqual(result.autoDraftDisabledFor, "user1@test.com");
  assert.strictEqual(draft.getState().autoDraft["user1@test.com"], false);
});

test("active draft resumes mid-round from stored picks", async () => {
  const picks = [
    { round: 1, pickNumber: 1, userEmail: "user1@test.com", userName: "User 1", golferName: "Player 1" },
    { round: 1, pickNumber: 2, userEmail: "user2@test.com", userName: "User 2", golferName: "Player 2" },
    { round: 1, pickNumber: 3, userEmail: "user3@test.com", userName: "User 3", golferName: "Player 3" },
    { round: 1, pickNumber: 4, userEmail: "user4@test.com", userName: "User 4", golferName: "Player 4" },
    { round: 2, pickNumber: 5, userEmail: "user4@test.com", userName: "User 4", golferName: "Player 5" },
  ];
  await setupDraft({ status: "active", picks, totalRounds: 3 });

  const state = draft.getState();
  assert.strictEqual(state.status, "active");
  assert.strictEqual(state.currentRound, 2);
  assert.strictEqual(state.currentPicker.email, "user3@test.com");
  assert.strictEqual(state.availablePlayers.length, 35);
  assert.strictEqual(state.teams["user4@test.com"].length, 2);
});

test("3rd round reversal keeps its fixed order with compensatory picks", async () => {
  await setupDraft({ users: 8, players: 60 });
  await draft.startDraft(10, "thirdRoundReversal");

  const state = draft.getState();
  assert.strictEqual(state.totalRounds, 6);

  // Play through round 1 (8 picks) and the start of round 2
  const sequence = [];
  for (let i = 0; i < 12; i++) {
    const picker = draft.getCurrentPicker();
    sequence.push(picker.draftOrder);
    draft.makePick(picker.email, draft.getState().availablePlayers[0].name);
  }

  assert.deepStrictEqual(
    sequence,
    [1, 2, 3, 4, 5, 6, 7, 8, 8, 7, 6, 5]
  );

  // Round 2 includes the compensatory picks: positions 8, 7 appear again
  for (let i = 0; i < 6; i++) {
    const picker = draft.getCurrentPicker();
    sequence.push(picker.draftOrder);
    draft.makePick(picker.email, draft.getState().availablePlayers[0].name);
  }
  assert.deepStrictEqual(sequence.slice(8), [8, 7, 6, 5, 4, 3, 8, 7, 2, 1]);
});
