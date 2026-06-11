# World Cup Theme + 3rd Round Reversal — Design

**Date:** 2026-06-10
**Status:** Approved
**Version target:** 1.2.0

## Overview

Two independent features delivered together:

1. **World Cup theme** — an alternate visual theme for drafting World Cup countries instead of golfers. Labels and color palette change; data structures and Google Sheet layout do not.
2. **3rd Round Reversal format** — an alternate snake-draft configuration where the direction does NOT reverse at the start of round 3, but reverses every round after.

## Feature 1: World Cup Theme

### Selection mechanism

- New backend env var: `DRAFT_THEME` with values `golf` (default) or `worldcup`.
- The backend exposes the theme in two places:
  - `getState()` includes `theme`, so every logged-in client receives it with draft state.
  - The `/health` endpoint includes `theme`, so the login page (which renders before any socket connection) can fetch it.
- The frontend login page fetches `/health` on mount and applies the theme; if the backend is unreachable, it falls back to the golf theme.

### Frontend theme definitions

New file `frontend/src/lib/themes.ts` exporting a `Theme` object per key:

| Property | Golf | World Cup |
|----------|------|-----------|
| App title | KGolfDraft | World Cup Draft |
| Subtitle | Golf Snake Draft | World Cup Country Draft |
| Item term (singular/plural) | golfer / golfers | country / countries |
| Available-list heading | Available Golfers | Available Countries |
| Color palette | Green (existing) | Blue/navy |

- Color theming is done with class strings stored in the theme object (literal Tailwind classes so JIT picks them up), applied to the major surfaces: page background/gradient, header, panel backgrounds, and accent buttons.
- No flags or images — labels + colors only.

### What does NOT change

- Internal field names: `golferName` in picks, Socket.IO payloads, and the Picks sheet column header.
- Google Sheet structure: countries are entered in the `Players` tab with `Name` and `Rank`, exactly like golfers.
- Backend chat messages ("X picked Y") — already terminology-neutral.

## Feature 2: 3rd Round Reversal

### Rule (confirmed with user)

- Round 1: ascending (1 → N)
- Round 2: descending (N → 1)
- Round 3: descending again (N → 1) — no reversal at the round-3 boundary
- Round 4 onward: normal alternation resumes (R4 ascending, R5 descending, R6 ascending, …)

Equivalently: rounds 1–2 follow standard snake; from round 3 on, the parity is inverted (odd rounds descending, even rounds ascending).

### Selection mechanism

- Admin Panel gains a **Draft Format** dropdown next to Total Rounds, shown while the draft is `waiting`: `Standard Snake` (default) / `3rd Round Reversal`.
- `start-draft` payload becomes `{ totalRounds, draftFormat }` where `draftFormat` is `"snake" | "thirdRoundReversal"`.
- Stored in draft state (`state.draftFormat`), included in `getState()`.

### Logic change

Confined to `getPickOrderForRound(round)` in `backend/draft.js`:

```
standard snake:        descending when round is even
3rd round reversal:    rounds 1–2 as standard; rounds ≥ 3 descending when round is odd
```

### Visibility

- The "Draft started!" system chat message mentions the format when it is 3rd Round Reversal.
- The draft page shows the format as a small label when 3rd Round Reversal is active.

### Resume behavior

Resume-from-sheet computes round/pick position from the pick count, which is independent of direction — so resume works unchanged. The admin must select the same format when restarting the server mid-draft.

## Shared changes

- `DraftState` TypeScript type gains `theme: "golf" | "worldcup"` and `draftFormat: "snake" | "thirdRoundReversal"`.
- `backend/.env.example` documents `DRAFT_THEME`.
- CLAUDE.md updated: env var, `start-draft` payload, new state fields.
- `frontend/src/lib/version.ts` → 1.2.0 (minor bump, feature addition).

## Testing

- New `backend/draft.test.js` using `node:test`. The direction decision is extracted into a pure exported function `isDescendingRound(round, draftFormat)` so it can be unit-tested directly across rounds 1–6 for both formats.
- Manual verification: run backend with `DRAFT_THEME=worldcup`, confirm login page + draft page render World Cup labels/colors; start a draft with 3rd Round Reversal and ≥3 users, confirm pick order R1 asc, R2 desc, R3 desc, R4 asc.

## Out of scope

- Country flags or images.
- Theme selection from the UI or Google Sheet.
- Renaming internal fields, sheet tabs, or Socket.IO events.
