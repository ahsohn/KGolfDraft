# World Cup Theme + 3rd Round Reversal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a backend-selected World Cup countries theme (labels + blue palette) and an admin-selected 3rd Round Reversal draft format to KGolfDraft.

**Architecture:** The backend exposes `theme` (from a `DRAFT_THEME` env var) in `/health` and in draft state; the frontend maps green Tailwind utilities to a CSS-variable-backed `theme-*` palette switched by a `data-theme` attribute, with labels from a new `themes.ts`. The 3rd-round-reversal rule is isolated in a pure `isDescendingRound(round, draftFormat)` function in `backend/draft.js`, selected via a new dropdown in the Admin Panel and carried in the `start-draft` payload.

**Tech Stack:** Node.js + Socket.IO backend (`node:test` for tests), Next.js + Tailwind CSS frontend.

**Spec:** `docs/superpowers/specs/2026-06-10-worldcup-theme-third-round-reversal-design.md`

---

### Task 1: Backend — `isDescendingRound` + draft format (TDD)

**Files:**
- Test: `backend/draft.test.js` (create)
- Modify: `backend/draft.js`
- Modify: `backend/package.json`

- [ ] **Step 1: Add a test script to backend/package.json**

In `backend/package.json`, add to `"scripts"`:

```json
"test": "node --test"
```

- [ ] **Step 2: Write the failing test**

Create `backend/draft.test.js`:

```js
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
```

- [ ] **Step 3: Run the test to verify it fails**

Run (from `backend/`): `npm test`
Expected: FAIL — `isDescendingRound is not a function`.

- [ ] **Step 4: Implement `isDescendingRound` and wire the format into state**

In `backend/draft.js`:

a) Add `draftFormat` to the state object (after `totalRounds: 10,`):

```js
  draftFormat: "snake", // snake | thirdRoundReversal
```

b) Add the pure function above `getPickOrderForRound` and rewrite `getPickOrderForRound` to use it:

```js
function isDescendingRound(round, draftFormat) {
  if (draftFormat === "thirdRoundReversal" && round >= 3) {
    // Round 3 repeats the descending direction, alternation resumes after
    return round % 2 === 1;
  }
  return round % 2 === 0;
}

function getPickOrderForRound(round) {
  const sorted = [...state.users].sort((a, b) => a.draftOrder - b.draftOrder);
  if (isDescendingRound(round, state.draftFormat)) {
    return sorted.reverse();
  }
  return sorted;
}
```

c) Change the `startDraft` signature and store the format. Replace:

```js
function startDraft(totalRounds) {
  if (state.status === "active") return { error: "Draft already in progress" };

  state.totalRounds = totalRounds || 10;
```

with:

```js
function startDraft(totalRounds, draftFormat) {
  if (state.status === "active") return { error: "Draft already in progress" };

  state.totalRounds = totalRounds || 10;
  state.draftFormat =
    draftFormat === "thirdRoundReversal" ? "thirdRoundReversal" : "snake";
```

d) Expose it in `getState()` — add after `totalRounds: state.totalRounds,`:

```js
    draftFormat: state.draftFormat,
```

e) Export it — add `isDescendingRound,` to `module.exports`.

- [ ] **Step 5: Run the test to verify it passes**

Run (from `backend/`): `npm test`
Expected: 3 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/draft.js backend/draft.test.js backend/package.json
git commit -m "feat: add 3rd round reversal draft format to snake order logic"
```

---

### Task 2: Backend — theme exposure + start-draft payload + chat message

**Files:**
- Modify: `backend/draft.js`
- Modify: `backend/server.js`
- Modify: `backend/.env.example`

- [ ] **Step 1: Expose the theme in draft state**

In `backend/draft.js`, add near the top (below `const AUTO_DRAFT_DELAY_MS = 2000;`):

```js
const DRAFT_THEME =
  process.env.DRAFT_THEME === "worldcup" ? "worldcup" : "golf";
```

In `getState()`, add after `draftFormat: state.draftFormat,`:

```js
    theme: DRAFT_THEME,
```

(Note: `server.js` calls `require("dotenv").config()` before requiring `draft.js`, so the env var is loaded by the time this module is evaluated.)

- [ ] **Step 2: Add theme to /health and pass draftFormat through start-draft**

In `backend/server.js`:

a) Health endpoint — replace:

```js
app.get("/health", (req, res) => {
  res.json({ status: "ok", draftStatus: draft.getState().status });
});
```

with:

```js
app.get("/health", (req, res) => {
  const state = draft.getState();
  res.json({ status: "ok", draftStatus: state.status, theme: state.theme });
});
```

b) `start-draft` handler — replace:

```js
  socket.on("start-draft", ({ totalRounds }, callback) => {
```

with:

```js
  socket.on("start-draft", ({ totalRounds, draftFormat }, callback) => {
```

and replace:

```js
    const result = draft.startDraft(totalRounds);
```

with:

```js
    const result = draft.startDraft(totalRounds, draftFormat);
```

c) Mention the format in the "Draft started!" chat message — replace:

```js
    const msg = addChatMessage(
      "System",
      `Draft started! ${state.totalRounds} rounds, ${state.users.length} players. Good luck!`,
      true
    );
```

with:

```js
    const formatNote =
      state.draftFormat === "thirdRoundReversal"
        ? " (3rd Round Reversal)"
        : "";
    const msg = addChatMessage(
      "System",
      `Draft started! ${state.totalRounds} rounds, ${state.users.length} players${formatNote}. Good luck!`,
      true
    );
```

- [ ] **Step 3: Document the env var**

Append to `backend/.env.example`:

```
DRAFT_THEME=golf
```

- [ ] **Step 4: Verify the backend still runs the test suite and syntax-checks**

Run (from `backend/`): `npm test` — Expected: PASS.
Run (from `backend/`): `node --check server.js && node --check draft.js` — Expected: no output, exit 0.

- [ ] **Step 5: Commit**

```bash
git add backend/draft.js backend/server.js backend/.env.example
git commit -m "feat: expose DRAFT_THEME and wire draftFormat through start-draft"
```

---

### Task 3: Frontend — theme infrastructure (palette + labels)

**Files:**
- Modify: `frontend/tailwind.config.js`
- Modify: `frontend/src/app/globals.css`
- Create: `frontend/src/lib/themes.ts`
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/app/layout.tsx`

- [ ] **Step 1: Add the CSS-variable-backed `theme` palette to Tailwind**

Replace the contents of `frontend/tailwind.config.js` with:

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        green: {
          950: "#052e16",
        },
        theme: {
          200: "rgb(var(--theme-200) / <alpha-value>)",
          300: "rgb(var(--theme-300) / <alpha-value>)",
          400: "rgb(var(--theme-400) / <alpha-value>)",
          500: "rgb(var(--theme-500) / <alpha-value>)",
          600: "rgb(var(--theme-600) / <alpha-value>)",
          700: "rgb(var(--theme-700) / <alpha-value>)",
          800: "rgb(var(--theme-800) / <alpha-value>)",
          900: "rgb(var(--theme-900) / <alpha-value>)",
          950: "rgb(var(--theme-950) / <alpha-value>)",
        },
      },
    },
  },
  plugins: [],
};
```

- [ ] **Step 2: Define the palettes in globals.css**

In `frontend/src/app/globals.css`, add directly after the `@tailwind` directives:

```css
/* Theme palettes — golf (green, default) and worldcup (blue/navy).
   Values are R G B triplets so Tailwind alpha modifiers keep working. */
:root {
  --theme-200: 187 247 208;
  --theme-300: 134 239 172;
  --theme-400: 74 222 128;
  --theme-500: 34 197 94;
  --theme-600: 22 163 74;
  --theme-700: 21 128 61;
  --theme-800: 22 101 52;
  --theme-900: 20 83 45;
  --theme-950: 5 46 22;
}

[data-theme="worldcup"] {
  --theme-200: 191 219 254;
  --theme-300: 147 197 253;
  --theme-400: 96 165 250;
  --theme-500: 59 130 246;
  --theme-600: 37 99 235;
  --theme-700: 29 78 216;
  --theme-800: 30 64 175;
  --theme-900: 30 58 138;
  --theme-950: 23 37 84;
}
```

- [ ] **Step 3: Create the theme label definitions**

Create `frontend/src/lib/themes.ts`:

```ts
export type ThemeKey = "golf" | "worldcup";

export interface ThemeConfig {
  appTitle: string;
  subtitle: string;
  availableHeading: string;
  searchPlaceholder: string;
}

export const THEMES: Record<ThemeKey, ThemeConfig> = {
  golf: {
    appTitle: "KGolfDraft",
    subtitle: "Golf Snake Draft",
    availableHeading: "Available Players",
    searchPlaceholder: "Search players...",
  },
  worldcup: {
    appTitle: "World Cup Draft",
    subtitle: "World Cup Country Draft",
    availableHeading: "Available Countries",
    searchPlaceholder: "Search countries...",
  },
};

export function getTheme(key: string | undefined): ThemeConfig {
  return THEMES[key as ThemeKey] ?? THEMES.golf;
}

// Switches the CSS palette by setting <html data-theme="...">
export function applyThemeAttr(key: string | undefined) {
  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme =
      key === "worldcup" ? "worldcup" : "golf";
  }
}
```

- [ ] **Step 4: Add the new fields to DraftState**

In `frontend/src/lib/types.ts`, add to the `DraftState` interface (after `totalRounds: number;`):

```ts
  draftFormat: "snake" | "thirdRoundReversal";
  theme: "golf" | "worldcup";
```

- [ ] **Step 5: Default the html attribute and theme the body background**

In `frontend/src/app/layout.tsx`, replace:

```tsx
    <html lang="en">
      <body className="bg-green-950 text-white min-h-screen">{children}</body>
    </html>
```

with:

```tsx
    <html lang="en" data-theme="golf">
      <body className="bg-theme-950 text-white min-h-screen">{children}</body>
    </html>
```

- [ ] **Step 6: Verify the frontend builds**

Run (from `frontend/`): `npm run build`
Expected: build succeeds (the `theme` palette compiles; no component uses it yet besides layout).

- [ ] **Step 7: Commit**

```bash
git add frontend/tailwind.config.js frontend/src/app/globals.css frontend/src/lib/themes.ts frontend/src/lib/types.ts frontend/src/app/layout.tsx
git commit -m "feat: add CSS-variable theme palette and theme label definitions"
```

---

### Task 4: Frontend — apply theme to all components

**Files:**
- Modify: `frontend/src/app/page.tsx`
- Modify: `frontend/src/app/draft/page.tsx`
- Modify: `frontend/src/components/PlayerList.tsx`
- Modify: `frontend/src/components/MyTeam.tsx`
- Modify: `frontend/src/components/DraftBoard.tsx`
- Modify: `frontend/src/components/AdminPanel.tsx`

- [ ] **Step 1: Sweep `green-` → `theme-` utility classes**

Run from the repo root (PowerShell):

```powershell
$files = @(
  "frontend/src/app/page.tsx",
  "frontend/src/app/draft/page.tsx",
  "frontend/src/components/PlayerList.tsx",
  "frontend/src/components/MyTeam.tsx",
  "frontend/src/components/DraftBoard.tsx",
  "frontend/src/components/AdminPanel.tsx"
)
foreach ($f in $files) {
  (Get-Content $f -Raw) -replace 'green-', 'theme-' | Set-Content $f -NoNewline
}
```

- [ ] **Step 2: Restore the two semantic status greens**

These are status indicators, not chrome — they stay green in every theme:

a) `frontend/src/components/AdminPanel.tsx` — the online dot. Replace:

```tsx
                          isOnline ? "bg-theme-400" : "bg-gray-600"
```

with:

```tsx
                          isOnline ? "bg-green-400" : "bg-gray-600"
```

b) `frontend/src/app/draft/page.tsx` — the "active" status badge in the header. Replace:

```tsx
                  : draftState.status === "active"
                  ? "bg-theme-600"
                  : "bg-blue-600"
```

with:

```tsx
                  : draftState.status === "active"
                  ? "bg-green-600"
                  : "bg-blue-600"
```

- [ ] **Step 3: Theme the login page (labels + /health fetch)**

In `frontend/src/app/page.tsx`:

a) Replace the imports block at the top:

```tsx
import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSocket } from "@/lib/socket";
import { APP_VERSION } from "@/lib/version";
```

with:

```tsx
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSocket } from "@/lib/socket";
import { APP_VERSION } from "@/lib/version";
import { getTheme, applyThemeAttr } from "@/lib/themes";
```

b) Inside `LoginPage`, add theme state and the /health fetch after the existing `useState` declarations:

```tsx
  const [themeKey, setThemeKey] = useState<string>("golf");

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";
    fetch(`${url}/health`)
      .then((res) => res.json())
      .then((data) => {
        if (data.theme) {
          setThemeKey(data.theme);
          applyThemeAttr(data.theme);
        }
      })
      .catch(() => {
        // Backend unreachable — keep the golf default
      });
  }, []);

  const theme = getTheme(themeKey);
```

c) Replace the title block:

```tsx
          <h1 className="text-4xl font-bold text-white mb-2">KGolfDraft</h1>
          <p className="text-theme-300 text-lg">Golf Snake Draft</p>
```

with:

```tsx
          <h1 className="text-4xl font-bold text-white mb-2">
            {theme.appTitle}
          </h1>
          <p className="text-theme-300 text-lg">{theme.subtitle}</p>
```

- [ ] **Step 4: Theme the draft page (apply attr, title, format badge, start-draft payload)**

In `frontend/src/app/draft/page.tsx`:

a) Add the import:

```tsx
import { getTheme, applyThemeAttr } from "@/lib/themes";
```

b) Apply the palette whenever draft state carries a theme. Add this effect after the main connect `useEffect`:

```tsx
  useEffect(() => {
    if (draftState?.theme) {
      applyThemeAttr(draftState.theme);
    }
  }, [draftState?.theme]);
```

c) Replace the hard-coded header title:

```tsx
            <h1 className="text-xl font-bold">KGolfDraft</h1>
```

with:

```tsx
            <h1 className="text-xl font-bold">
              {getTheme(draftState.theme).appTitle}
            </h1>
```

d) Show the format when 3rd Round Reversal is active — directly after the status `<span>` (the one rendering `Waiting` / `Round x/y` / `Complete`), add:

```tsx
            {draftState.draftFormat === "thirdRoundReversal" &&
              draftState.status !== "waiting" && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-theme-700">
                  3rd Round Reversal
                </span>
              )}
```

e) Update `handleStartDraft` to carry the format. Replace:

```tsx
  const handleStartDraft = useCallback((totalRounds: number) => {
    const socket = getSocket();
    socket.emit(
      "start-draft",
      { totalRounds },
```

with:

```tsx
  const handleStartDraft = useCallback(
    (totalRounds: number, draftFormat: string) => {
      const socket = getSocket();
      socket.emit(
        "start-draft",
        { totalRounds, draftFormat },
```

and close the callback accordingly (the body is otherwise unchanged — re-indent one level):

```tsx
        (res: { success: boolean; error?: string }) => {
          if (!res.success) {
            alert(res.error || "Failed to start draft");
          }
        }
      );
    },
    []
  );
```

- [ ] **Step 5: Add the Draft Format dropdown to the Admin Panel**

In `frontend/src/components/AdminPanel.tsx`:

a) Update the prop type. Replace:

```tsx
  onStartDraft: (totalRounds: number) => void;
```

with:

```tsx
  onStartDraft: (totalRounds: number, draftFormat: string) => void;
```

b) Add format state after `const [rounds, setRounds] = useState(10);`:

```tsx
  const [draftFormat, setDraftFormat] = useState("snake");
```

c) In the Start Draft block, add the dropdown between the Total Rounds input `</div>` and the Start Draft `<button>`:

```tsx
              <div>
                <label className="block text-xs text-yellow-200 mb-1">
                  Draft Format
                </label>
                <select
                  value={draftFormat}
                  onChange={(e) => setDraftFormat(e.target.value)}
                  className="px-2 py-1 rounded bg-theme-950 border border-yellow-700 text-white text-sm focus:outline-none"
                >
                  <option value="snake">Standard Snake</option>
                  <option value="thirdRoundReversal">3rd Round Reversal</option>
                </select>
              </div>
```

d) Update the start button click:

```tsx
                onClick={() => onStartDraft(rounds, draftFormat)}
```

- [ ] **Step 6: Theme the PlayerList labels**

In `frontend/src/components/PlayerList.tsx`:

a) Add the import:

```tsx
import { getTheme } from "@/lib/themes";
```

b) Inside the component, after the `canPick` declaration, add:

```tsx
  const theme = getTheme(draftState.theme);
```

c) Replace the heading:

```tsx
        Available Players ({draftState.availablePlayers.length})
```

with:

```tsx
        {theme.availableHeading} ({draftState.availablePlayers.length})
```

d) Replace the search placeholder:

```tsx
        placeholder="Search players..."
```

with:

```tsx
        placeholder={theme.searchPlaceholder}
```

- [ ] **Step 7: Remove dead code in DraftBoard**

In `frontend/src/components/DraftBoard.tsx`, delete the unused function (it duplicates snake logic and is never called):

```tsx
  // Determine which column index in a given round corresponds to which user
  function getUserForRoundSlot(round: number, slotIndex: number) {
    // Odd rounds: ascending, even rounds: descending
    if (round % 2 === 0) {
      return sortedUsers[sortedUsers.length - 1 - slotIndex];
    }
    return sortedUsers[slotIndex];
  }
```

- [ ] **Step 8: Verify build and lint**

Run (from `frontend/`): `npm run build`
Expected: build succeeds with no type errors.
Run (from `frontend/`): `npm run lint`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add frontend/src
git commit -m "feat: World Cup theme support and 3rd Round Reversal admin option"
```

---

### Task 5: Version bump, docs, and final verification

**Files:**
- Modify: `frontend/src/lib/version.ts`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Bump the version (minor — feature addition)**

Replace the contents of `frontend/src/lib/version.ts` with:

```ts
export const APP_VERSION = "1.2.0";
```

- [ ] **Step 2: Update CLAUDE.md**

a) In the **Backend (Admin's Computer)** setup section, replace:

```
3. Set environment variables: `GOOGLE_SHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_KEY_PATH`, `PORT=3001`
```

with:

```
3. Set environment variables: `GOOGLE_SHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_KEY_PATH`, `PORT=3001`, and optionally `DRAFT_THEME` (`golf` (default) or `worldcup` — switches the frontend labels and color palette for drafting World Cup countries; the sheet structure is identical, countries go in the Players tab)
```

b) In the **Snake Draft Order** section, append:

```
- **3rd Round Reversal format** (admin-selectable at draft start): rounds 1–2 follow standard snake, round 3 repeats the descending direction (no reversal at the round-3 boundary), and normal alternation resumes from round 4 (R1: 1→N, R2: N→1, R3: N→1, R4: 1→N, …)
```

c) In the **Client → Server** Socket.IO events table, replace the `start-draft` row:

```
| `start-draft` | `{ totalRounds }` | Admin starts the draft |
```

with:

```
| `start-draft` | `{ totalRounds, draftFormat }` | Admin starts the draft (`draftFormat`: `"snake"` or `"thirdRoundReversal"`) |
```

- [ ] **Step 3: Run the full verification suite**

Run (from `backend/`): `npm test` — Expected: PASS.
Run (from `frontend/`): `npm run build` — Expected: success.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/version.ts CLAUDE.md
git commit -m "chore: bump version to 1.2.0 and document new theme/format options"
```

---

## Manual verification (after all tasks)

1. From `backend/`: create/edit `.env` with `DRAFT_THEME=worldcup`, run `npm start`. From `frontend/`: `npm run dev`.
2. Open `localhost:3000` — login page should show "World Cup Draft" with a blue/navy palette.
3. Log in as the admin, open the Admin Panel — Draft Format dropdown shows Standard Snake / 3rd Round Reversal.
4. Start a draft with 3rd Round Reversal and ≥3 users in the sheet; make picks (or toggle auto-draft for everyone) and confirm the pick order on the Draft Board is R1 ascending, R2 descending, R3 descending, R4 ascending.
5. Restart the backend without `DRAFT_THEME` — login page shows green "KGolfDraft" again.
