const test = require("node:test");
const assert = require("node:assert");
const { isDescendingRound } = require("./draft");

test("standard snake alternates every round", () => {
  assert.strictEqual(isDescendingRound(1, "snake"), false); // 1 → N
  assert.strictEqual(isDescendingRound(2, "snake"), true); // N → 1
  assert.strictEqual(isDescendingRound(3, "snake"), false);
  assert.strictEqual(isDescendingRound(4, "snake"), true);
  assert.strictEqual(isDescendingRound(5, "snake"), false);
  assert.strictEqual(isDescendingRound(6, "snake"), true);
});

test("third round reversal repeats descending in round 3, then alternates", () => {
  assert.strictEqual(isDescendingRound(1, "thirdRoundReversal"), false); // 1 → N
  assert.strictEqual(isDescendingRound(2, "thirdRoundReversal"), true); // N → 1
  assert.strictEqual(isDescendingRound(3, "thirdRoundReversal"), true); // N → 1 again
  assert.strictEqual(isDescendingRound(4, "thirdRoundReversal"), false); // 1 → N
  assert.strictEqual(isDescendingRound(5, "thirdRoundReversal"), true);
  assert.strictEqual(isDescendingRound(6, "thirdRoundReversal"), false);
});

test("unknown format falls back to standard snake", () => {
  assert.strictEqual(isDescendingRound(2, undefined), true);
  assert.strictEqual(isDescendingRound(3, "bogus"), false);
});
