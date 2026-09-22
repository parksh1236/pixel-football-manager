# Player Data Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add detailed player attributes, identity, role suitability, market value, and wages that affect match events.

**Architecture:** Pure calculations remain in `game.js`, seeded player generation makes migrations repeatable, and `app.js` only formats and renders calculated data. The existing match engine consumes situation-specific attributes instead of adding a second simulation path.

**Tech Stack:** JavaScript ES modules, Node.js test runner, HTML, CSS

**Spec:** `docs/superpowers/specs/2026-09-22-player-data-expansion-design.md`

## Global Constraints

- Store attributes as integers from 1 through 20.
- Include nationality, age, preferred foot, height, potential, flair, technique, mentality, composure, and decisions.
- Derive overall ability, role suitability, market value, and weekly wage deterministically.
- Preserve previous season results and convert version-2 saves to version 3.

---

### Task 1: Detailed Player Model

**Files:**
- Modify: `game.js`
- Modify: `game.test.js`

**Interfaces:**
- Produces: `createPlayerDetails(player): PlayerDetails`, `calculateOverall(player): number`, `roleSuitability(player, role): number`, `migrateSeason(value): Season`

- [ ] **Step 1: Write failing tests**

```js
import { calculateOverall, createPlayerDetails, migrateSeason, roleSuitability } from "./game.js";

test("seeded details stay in approved ranges", () => {
  const details = createPlayerDetails({ id: "player-8", name: "임성민", position: "FW", rating: 67 });
  assert.ok(details.age >= 16 && details.age <= 40);
  assert.ok(details.height >= 155 && details.height <= 205);
  assert.ok(Object.values(details.attributes).every((value) => value >= 1 && value <= 20));
});

test("a striker values finishing more than tackling", () => {
  const player = { position: "FW", attributes: { finishing: 18, shooting: 16, pace: 15, composure: 15, tackling: 2 } };
  assert.ok(calculateOverall(player) >= 70);
  assert.ok(roleSuitability(player, "ST") > roleSuitability(player, "CB"));
});

test("version two migration generates stable detailed players", () => {
  const old = createSeason(); old.version = 2;
  assert.deepEqual(migrateSeason(old).players, migrateSeason(old).players);
});
```

- [ ] **Step 2: Run `node --test game.test.js`**

Expected: FAIL because detailed-player exports are missing.

- [ ] **Step 3: Implement seeded details and positional weights**

Use a small string hash of `player.id + player.name` for repeatable values. Define explicit GK, DF, MF, and FW weight maps; clamp all migrated values to the approved ranges and set version to 3.

- [ ] **Step 4: Run `node --test game.test.js`**

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add game.js game.test.js
git commit -m "feat: add detailed player attributes"
```

### Task 2: Value, Wage, and Match Influence

**Files:**
- Modify: `game.js`
- Modify: `game.test.js`

**Interfaces:**
- Produces: `calculateMarketValue(player): number`, `calculateWeeklyWage(player): number`, `resolveEvent(event, attackers, defenders, random): MatchEvent`

- [ ] **Step 1: Write failing tests**

```js
import { calculateMarketValue, calculateWeeklyWage, resolveEvent } from "./game.js";

test("value and wage are deterministic positive integers", () => {
  const player = createSeason().players[8];
  assert.equal(calculateMarketValue(player), calculateMarketValue(player));
  assert.equal(calculateWeeklyWage(player), calculateWeeklyWage(player));
  assert.ok(Number.isInteger(calculateMarketValue(player)) && calculateMarketValue(player) > 0);
});

test("high flair and vision can create a key pass", () => {
  const event = resolveEvent({ type: "creative-pass" }, [{ attributes: { vision: 20, decisions: 18, flair: 20 } }], [{ attributes: { positioning: 5 } }], () => 0.4);
  assert.equal(event.type, "key-pass");
});
```

- [ ] **Step 2: Run `node --test game.test.js`**

Expected: FAIL because economic and event-resolution exports are missing.

- [ ] **Step 3: Implement formulas in integer ten-thousand-won units**

Use overall, potential, age curve, position multiplier, and contract years for value; derive wage from value and overall. Update match-event resolution to use the exact attribute pairings in the spec, including the counterattack risk of failed flair actions.

- [ ] **Step 4: Run `node --test game.test.js`**

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add game.js game.test.js
git commit -m "feat: connect player attributes and economics"
```

### Task 3: Player Detail Interface

**Files:**
- Modify: `app.js`
- Modify: `styles.css`

**Interfaces:**
- Consumes: all Task 1 and 2 player calculations.
- Produces: selectable roster cards and a responsive detailed-player panel.

- [ ] **Step 1: Render the approved summary fields**

Show nationality, age, position, overall, formatted market value, and formatted weekly wage on each roster card. Selecting a card opens identity, attack, passing, defence, physical, mental, and goalkeeping sections plus current-role suitability.

- [ ] **Step 2: Add accessible responsive interaction**

Use buttons with `aria-expanded` and `aria-controls`; keep a visible focus ring. On widths below 760px, insert the detail panel directly after the selected card.

- [ ] **Step 3: Verify in browser and run checks**

At desktop and 390px widths, open a field player and goalkeeper, confirm every approved field is visible, and operate cards by keyboard. Run `node --test game.test.js && node --check app.js && git diff --check`.

- [ ] **Step 4: Commit**

```bash
git add app.js styles.css
git commit -m "feat: show detailed player profiles"
```
