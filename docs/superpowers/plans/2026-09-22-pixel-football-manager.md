# Pixel Football Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a playable 14-round pixel-art football manager game that runs as a static browser app.

**Architecture:** A dependency-free ES module owns deterministic league rules and serializable state; a second module renders and operates the browser UI. HTML and CSS provide the responsive pixel-art shell, while Canvas draws the match pitch.

**Tech Stack:** HTML5, CSS, JavaScript ES modules, Node.js built-in test runner, Canvas, localStorage

**Spec:** `docs/superpowers/specs/2026-09-22-pixel-football-manager-design.md`

## Global Constraints

- Use 8 fictional clubs in a 14-round home-and-away league.
- Keep exactly 18 players and 11 starters for the user's club, including at least one goalkeeper.
- Support attacking, balanced, and defensive tactics.
- Store the current season in browser `localStorage` and recover safely from invalid data.
- Use no framework, server-side application, external image, external font, or runtime dependency.
- Keep every control keyboard accessible and visibly focused.
- Reflow the interface to one column on small screens.

---

### Task 1: League and Match Engine

**Files:**
- Create: `game.js`
- Create: `game.test.js`

**Interfaces:**
- Produces: `createSeason(): Season`, `createSchedule(teamIds: string[]): Fixture[][]`, `calculateTable(season: Season): Standing[]`, `swapStarter(season: Season, playerId: string): Season`, `simulateFixture(season: Season, fixture: Fixture, random?: () => number): MatchResult`, `completeRound(season: Season, random?: () => number): RoundOutcome`
- `Season` contains `version`, `round`, `tactic`, `teams`, `players`, `fixtures`, and `completedRoundIds`.

- [ ] **Step 1: Write the failing engine tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { calculateTable, completeRound, createSchedule, createSeason, swapStarter } from "./game.js";

test("eight teams produce fourteen rounds and 56 fixtures", () => {
  const rounds = createSchedule(["a", "b", "c", "d", "e", "f", "g", "h"]);
  assert.equal(rounds.length, 14);
  assert.equal(rounds.flat().length, 56);
});

test("table sorts by points, goal difference, then goals scored", () => {
  const season = createSeason();
  season.fixtures[0][0].result = { home: 2, away: 0, events: [] };
  const table = calculateTable(season);
  assert.equal(table[0].points, 3);
  assert.equal(table.at(-1).points, 0);
});

test("bench selection swaps a starter in the same position group", () => {
  const season = createSeason();
  const benchPlayer = season.players.find((player) => !player.starter && player.position !== "GK");
  const next = swapStarter(season, benchPlayer.id);
  assert.equal(next.players.filter((player) => player.starter).length, 11);
  assert.equal(next.players.find((player) => player.id === benchPlayer.id).starter, true);
});

test("a completed round cannot be awarded twice", () => {
  const season = createSeason();
  const first = completeRound(season, () => 0.5);
  const second = completeRound(first.season, () => 0.5);
  assert.equal(second.season.round, 1);
  assert.equal(second.alreadyCompleted, true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test game.test.js`
Expected: FAIL because `game.js` does not exist or exports are missing.

- [ ] **Step 3: Implement the minimal engine**

Create the domain data and exported functions named above. Use a circle-method schedule duplicated with reversed venues. Calculate strength from starter rating and condition, apply a small home bonus and tactic modifiers, and cap generated goals at five. Make `swapStarter` immutable and replace one starter from the same broad position group. Make `completeRound` record a round identifier before advancing so repeated calls cannot score it twice.

- [ ] **Step 4: Run engine tests**

Run: `node --test game.test.js`
Expected: 4 tests pass.

- [ ] **Step 5: Commit the engine**

```bash
git add game.js game.test.js
git commit -m "feat: add football season engine"
```

### Task 2: Playable Pixel-Art Interface

**Files:**
- Create: `index.html`
- Create: `styles.css`
- Create: `app.js`

**Interfaces:**
- Consumes: all Task 1 exports, especially `createSeason`, `calculateTable`, `swapStarter`, and `completeRound`.
- Produces: browser navigation, squad selection, tactic selection, animated match presentation, schedule and standings views, and persistence under `pixel-manager-season-v1`.

- [ ] **Step 1: Add the semantic application shell**

Create `index.html` with a skip link; header status; navigation buttons for dashboard, squad, fixtures, and table; a live save-status region; and `<main id="app" tabindex="-1">`. Load `styles.css` and `app.js` as an ES module.

- [ ] **Step 2: Add the pixel-art visual system**

Create `styles.css` with local system monospace fonts, navy surfaces, grass green and amber accents, 4px hard shadows, square corners, `image-rendering: pixelated`, visible `:focus-visible` outlines, responsive cards and tables, and a one-column layout below 760px. Include reduced-motion rules that disable nonessential animation.

- [ ] **Step 3: Implement browser state and persistence**

In `app.js`, load `pixel-manager-season-v1`, validate `version === 1` and the required arrays, otherwise call `createSeason()`. Wrap saves in `try/catch`; on failure update the live status without blocking play. Wire navigation, tactic controls, same-position squad swaps, and a confirmed new-season action.

- [ ] **Step 4: Implement the four views**

Render dashboard cards for the next opponent and form, a squad view with 11 starters and 7 substitutes, a full fixture list grouped by round, and a sorted league table. Use buttons with `aria-pressed` for the selected tactic and active navigation item.

- [ ] **Step 5: Implement match presentation**

Render a Canvas pitch, scoreboard, minute counter, and `aria-live="polite"` commentary log. Animate the precomputed user fixture events from minute 0 to 90, disable the start button while running, then call `completeRound` exactly once, save, and reveal the updated result and table. With reduced motion, finish in a short single transition.

- [ ] **Step 6: Run automated checks**

Run: `node --test game.test.js`
Expected: all tests pass.

- [ ] **Step 7: Commit the interface**

```bash
git add index.html styles.css app.js
git commit -m "feat: add playable pixel manager interface"
```

### Task 3: Browser Verification and Final Polish

**Files:**
- Modify: `index.html`
- Modify: `styles.css`
- Modify: `app.js`
- Modify: `game.js`
- Modify: `game.test.js`

**Interfaces:**
- Consumes: the complete static game from Tasks 1 and 2.
- Produces: a verified desktop and mobile gameplay loop with no console errors.

- [ ] **Step 1: Start a local static server**

Run: `python -m http.server 4173`
Expected: the game is available at `http://localhost:4173`.

- [ ] **Step 2: Verify the desktop gameplay loop**

At 1280×800, confirm navigation works, swap one substitute into the starting eleven, select attacking tactics, play one match, and verify the result appears once in both fixtures and table. Reload and confirm the same round and result persist.

- [ ] **Step 3: Verify mobile and keyboard use**

At 390×844, confirm the layout is one column without horizontal page scrolling. Navigate all controls using Tab, confirm visible focus, and complete the same starter swap and tactic selection without a pointer.

- [ ] **Step 4: Run the final checks**

Run: `node --test game.test.js`
Expected: all tests pass.

Run: `git diff --check`
Expected: no output.

- [ ] **Step 5: Commit only evidence-driven fixes**

```bash
git add index.html styles.css app.js game.js game.test.js
git commit -m "fix: polish verified game flow"
```
