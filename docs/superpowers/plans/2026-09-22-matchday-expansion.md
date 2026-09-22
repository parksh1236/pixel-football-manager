# Matchday Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add editable formations, 22-player movement, Korean commentary, and four anime-style highlight panels to the live match.

**Architecture:** Pure formation and event functions stay in `game.js`; `app.js` renders those results without recalculating them. Four generated raster assets live under `assets/highlights/` and are selected by event type.

**Tech Stack:** HTML, CSS, JavaScript ES modules, Canvas, Pointer Events, Node.js test runner, built-in image generation

**Spec:** `docs/superpowers/specs/2026-09-22-matchday-expansion-design.md`

## Global Constraints

- Support 4-3-3, 4-2-3-1, 3-5-2, 4-4-2, and 5-3-2 plus free positioning.
- Keep the goalkeeper inside its own penalty area and every player inside the pitch.
- The animation must only visualize precomputed results.
- Use four original fictional Japanese sports-anime-style scenes without real players, clubs, or existing characters.
- Preserve reduced-motion, keyboard, mobile, and version-1 save support.

---

### Task 1: Formation State and Save Migration

**Files:**
- Modify: `game.js`
- Modify: `game.test.js`

**Interfaces:**
- Produces: `FORMATIONS`, `formationPositions(name): Position[]`, `movePlayer(season, playerId, x, y): Season`, `migrateSeason(value): Season`
- `Position` is `{ playerId: string, x: number, y: number, role: string }`, with `x` and `y` constrained to `0..100`.

- [ ] **Step 1: Write failing tests**

```js
import { FORMATIONS, formationPositions, migrateSeason, movePlayer } from "./game.js";

test("every formation supplies eleven unique legal positions", () => {
  for (const name of Object.keys(FORMATIONS)) {
    const positions = formationPositions(name);
    assert.equal(positions.length, 11);
    assert.equal(new Set(positions.map(({ playerId }) => playerId)).size, 11);
    assert.ok(positions.every(({ x, y }) => x >= 0 && x <= 100 && y >= 0 && y <= 100));
  }
});

test("goalkeeper movement is clamped to its penalty area", () => {
  const next = movePlayer(createSeason(), "player-0", 80, 50);
  assert.ok(next.customPositions["player-0"].x <= 18);
});

test("version one saves migrate to version two with a formation", () => {
  const old = createSeason();
  old.version = 1;
  const next = migrateSeason(old);
  assert.equal(next.version, 2);
  assert.equal(next.formation, "4-3-3");
  assert.equal(Object.keys(next.customPositions).length, 11);
});
```

- [ ] **Step 2: Run `node --test game.test.js`**

Expected: FAIL because the four new exports do not exist.

- [ ] **Step 3: Implement formation constants, coordinate clamping, and migration**

Define the five named coordinate arrays, add `formation` and `customPositions` to `createSeason`, and make `migrateSeason` preserve fixtures, results, tactic, and round while adding version-2 fields.

- [ ] **Step 4: Run `node --test game.test.js`**

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add game.js game.test.js
git commit -m "feat: add editable match formations"
```

### Task 2: Match Events and Commentary

**Files:**
- Modify: `game.js`
- Modify: `game.test.js`
- Modify: `app.js`

**Interfaces:**
- Produces: `createMatchEvents(season, fixture, result, random): MatchEvent[]`, `commentate(event, season): string`
- `MatchEvent` is `{ minute, type, teamId, playerId, targetPlayerId, outcome, zone }`.

- [ ] **Step 1: Write failing tests**

```js
import { commentate, createMatchEvents } from "./game.js";

test("match events are ordered and reproduce the final score", () => {
  const season = createSeason();
  const fixture = season.fixtures[0][0];
  const events = createMatchEvents(season, fixture, { home: 2, away: 1 }, () => 0.5);
  assert.deepEqual([...events].sort((a, b) => a.minute - b.minute), events);
  assert.equal(events.filter(({ type }) => type === "goal").length, 3);
});

test("commentary names the event player", () => {
  const season = createSeason();
  const text = commentate({ minute: 9, type: "shot", teamId: "team-0", playerId: "player-8", outcome: "saved", zone: "box" }, season);
  assert.match(text, /임성민/);
  assert.match(text, /슈팅|선방/);
});
```

- [ ] **Step 2: Run `node --test game.test.js`**

Expected: FAIL because event and commentary exports are missing.

- [ ] **Step 3: Implement deterministic event generation and valid commentary templates**

Generate kickoff, build-up, pressure, dribble, pass, shot, save, goal, and full-time events. Reuse the generated events in `simulateFixture`; never append a goal that is absent from `result`.

- [ ] **Step 4: Render events in `app.js`**

Replace the single moving ball with 22 shirt markers and the ball. Interpolate players between their formation, build-up, flank, counter, and shot coordinates; populate the existing `aria-live` commentary list from `commentate`.

- [ ] **Step 5: Run `node --test game.test.js` and `node --check app.js`**

Expected: all tests pass and no syntax errors.

- [ ] **Step 6: Commit**

```bash
git add game.js game.test.js app.js
git commit -m "feat: animate players and match commentary"
```

### Task 3: Highlight Art and Browser Verification

**Files:**
- Create: `assets/highlights/shot.png`
- Create: `assets/highlights/save.png`
- Create: `assets/highlights/pass.png`
- Create: `assets/highlights/celebration.png`
- Modify: `app.js`
- Modify: `styles.css`

**Interfaces:**
- Consumes: `MatchEvent.type` from Task 2.
- Produces: responsive highlight panel mapping `shot`, `save`, `key-pass`, and `goal` to the four PNG assets.

- [ ] **Step 1: Generate four original highlight images**

Use the built-in image generator once per asset. Shared prompt: “Original fictional Korean football club, dynamic Japanese sports-animation visual language, dramatic speed lines, cel shading, widescreen match highlight, no text, no logo, no real player, no existing anime character.” Vary only the action: decisive striker shot; diving goalkeeper save; genius midfielder through-ball; team goal celebration. Save final files at the exact paths above.

- [ ] **Step 2: Add the highlight panel**

Render an `<img>` only for matching decisive events, use the commentary sentence as `alt`, keep a 16:9 crop, and hide the panel between highlights. On mobile, place it below the scoreboard rather than over the pitch.

- [ ] **Step 3: Verify in a browser**

At 1280×800 and 390×844, select every formation, drag one field player, move the goalkeeper beyond the box and confirm it is clamped, then play one full match. Confirm 22 markers, ordered commentary, matching highlights, reduced-motion completion, no console error, and no horizontal page overflow.

- [ ] **Step 4: Run final checks**

Run: `node --test game.test.js && node --check app.js && git diff --check`

Expected: all tests pass and no warnings from the application.

- [ ] **Step 5: Commit**

```bash
git add assets/highlights app.js styles.css
git commit -m "feat: add anime match highlights"
```
