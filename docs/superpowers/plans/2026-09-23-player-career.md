# Player Career Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add player creation, training, career match simulation, rich commentary, speed control, images, contracts, and persistent individual records.

**Architecture:** `player-career.js` owns pure creation, training, selection, event, growth, and contract transitions. The shared `game.js` world engine supplies teams and fixtures; `app.js` renders the player-career views and stores their results through `career.js`.

**Tech Stack:** JavaScript ES modules, Node.js built-in test runner, HTML, CSS, Canvas, localStorage, built-in image generation

**Spec:** `docs/superpowers/specs/2026-09-23-player-career-design.md`

## Global Constraints

- Create one player through four validated steps with one preferred position and at most two secondary positions.
- Supply exactly 10 redistributable points while preserving the archetype total and 1–20 bounds.
- Support club choice, trial offers, and free-agent offers.
- Support manual seven-day training and automatic goal/intensity scheduling.
- Match speed is pause, 0.5×, 1×, 2×, or highlights-only and must never change event order or results.
- Preserve actual results in contextual commentary and use fictional no-text/no-logo scene art.

## Review Focus

- Duplicate secondary positions or a secondary equal to the preferred position block creation; Task 1 tests it.
- Point redistribution with negative values, decimals, or a changed total blocks creation; Task 1 tests it.
- Injured players cannot receive hard training or selection, but world fixtures still advance; Task 2 and Task 3 test it.
- Pausing/resuming and changing speed mid-event never processes an event twice; Task 3 tests an event cursor.
- A player left out of the squad receives zero minutes and personal events while team results and records remain valid; Task 3 tests it.

---

### Task 1: Player Creation and Entry Paths

**Files:**
- Create: `player-career.js`
- Create: `player-career.test.js`
- Modify: `app.js`
- Modify: `styles.css`

**Interfaces:**
- Produces: `ARCHETYPES`, `validatePlayerDraft(draft): ValidationResult`, `createCareerPlayer(draft): PlayerCareer`, `createEntryOffers(player, path, teams): Offer[]`
- `PlayerCareer` contains identity, appearance, preferred/secondary positions, position mastery, attributes, condition, potential, value, wage, contract, trust, training, seasonStats, and careerStats.

- [ ] **Step 1: Write failing creation tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { createCareerPlayer, createEntryOffers, validatePlayerDraft } from "./player-career.js";

const draft = { name: "김하늘", nationality: "대한민국", age: 18, height: 178, foot: "right", appearance: "short-dark", preferredPosition: "AM", secondaryPositions: ["CM", "RW"], archetype: "playmaker", adjustments: { vision: 4, passing: 3, flair: 3, tackling: -4, strength: -3, heading: -3 } };

test("creation rejects duplicate positions and invalid point totals", () => {
  assert.equal(validatePlayerDraft({ ...draft, secondaryPositions: ["AM"] }).ok, false);
  assert.equal(validatePlayerDraft({ ...draft, adjustments: { vision: 1.5 } }).ok, false);
  assert.equal(validatePlayerDraft({ ...draft, adjustments: { vision: 11, tackling: -9 } }).ok, false);
});

test("created player keeps archetype total and attribute bounds", () => {
  const player = createCareerPlayer(draft);
  assert.ok(Object.values(player.attributes).every((value) => Number.isInteger(value) && value >= 1 && value <= 20));
  assert.equal(player.preferredPosition, "AM");
  assert.deepEqual(player.secondaryPositions, ["CM", "RW"]);
});

test("all three entry paths return eligible offers", () => {
  const player = createCareerPlayer(draft);
  assert.equal(createEntryOffers(player, "club-choice", [{ id: "team-0" }]).length, 1);
  assert.ok(createEntryOffers(player, "trial", Array.from({ length: 8 }, (_, i) => ({ id: `team-${i}`, rating: 65 + i }))).length <= 3);
  assert.ok(createEntryOffers(player, "free-agent", Array.from({ length: 8 }, (_, i) => ({ id: `team-${i}`, rating: 65 + i }))).every(({ wage, years }) => wage > 0 && years > 0));
});
```

- [ ] **Step 2: Run `node --test player-career.test.js`**

Expected: FAIL because `player-career.js` does not exist.

- [ ] **Step 3: Implement six archetypes, validation, deterministic player creation, and offers**

Keep adjustment values integer, total zero, positive allocation exactly 10, and final attributes 1–20. Trial returns at most three deterministic offers; free-agent offers include role, wage, and years.

- [ ] **Step 4: Build the four-step accessible creation UI**

Add labeled controls, step progress, back/next actions, inline validation, archetype comparison, remaining-point counter, three entry paths, and offer selection. Completing an offer creates a player-mode career slot and saves it.

- [ ] **Step 5: Run and verify**

Run `node --test player-career.test.js career.test.js game.test.js`, `node --check app.js`, and `git diff --check`. Create a player through each path with keyboard at desktop and 390px mobile width.

- [ ] **Step 6: Commit**

```bash
git add player-career.js player-career.test.js app.js styles.css
git commit -m "feat: add player career creation"
```

### Task 2: Weekly Training and Growth

**Files:**
- Modify: `player-career.js`
- Modify: `player-career.test.js`
- Modify: `app.js`
- Modify: `styles.css`

**Interfaces:**
- Produces: `buildAutoSchedule(player, matchDay, goal, intensity): TrainingDay[]`, `validateSchedule(player, schedule, matchDay): ValidationResult`, `applyTrainingWeek(player, schedule, random): TrainingResult`

- [ ] **Step 1: Write failing training tests**

```js
import { applyTrainingWeek, buildAutoSchedule, validateSchedule } from "./player-career.js";

test("automatic schedule protects match and recovery days", () => {
  const schedule = buildAutoSchedule(createCareerPlayer(draft), 5, "technique", "normal");
  assert.equal(schedule[5].type, "match");
  assert.equal(schedule[6].type, "recovery");
});

test("injury blocks hard training", () => {
  const player = { ...createCareerPlayer(draft), injuryDays: 3 };
  assert.equal(validateSchedule(player, [{ day: 0, type: "physical", intensity: "hard" }], 5).ok, false);
});

test("repeated focus loses efficiency and low condition raises risk", () => {
  const player = { ...createCareerPlayer(draft), condition: 30, recentTraining: ["technique", "technique"] };
  const result = applyTrainingWeek(player, Array.from({ length: 7 }, (_, day) => ({ day, type: "technique", intensity: "hard" })), () => 0);
  assert.ok(result.efficiency < 1);
  assert.ok(result.player.injuryDays > 0);
});
```

- [ ] **Step 2: Run `node --test player-career.test.js`**

Expected: FAIL because training exports are missing.

- [ ] **Step 3: Implement six activities, auto scheduling, fatigue, diminishing returns, growth, and injury**

Keep the seven-day array stable; manual edits replace one day. Match day cannot be overwritten. Growth uses potential and age, while recovery/rest restores condition. Injury never deletes attributes or records.

- [ ] **Step 4: Build the weekly planner and player profile**

Render seven days, direct activity/intensity selection, auto goal/intensity controls, condition/injury warnings, growth preview, preferred/secondary mastery, detailed attributes, value, wage, contract, trust, and season/career records.

- [ ] **Step 5: Run and verify**

Run `node --test player-career.test.js career.test.js game.test.js`, `node --check app.js`, and `git diff --check`. Verify manual/auto schedules, injury blocking, save/reload, and mobile layout.

- [ ] **Step 6: Commit**

```bash
git add player-career.js player-career.test.js app.js styles.css
git commit -m "feat: add player training and growth"
```

### Task 3: Player Match Simulation, Speed, and Records

**Files:**
- Modify: `player-career.js`
- Modify: `player-career.test.js`
- Modify: `game.js`
- Modify: `app.js`
- Modify: `styles.css`

**Interfaces:**
- Produces: `selectPlayerStatus(player, club, random): SelectionStatus`, `createPlayerMatch(player, fixture, world, random): PlayerMatch`, `consumePlayerEvent(match, cursor): CursorResult`, `summarizePlayerMatch(match): MatchSummary`
- `PlayerMatch` stores immutable ordered events/result plus mutable display cursor and speed outside the event array.

- [ ] **Step 1: Write failing match tests**

```js
import { consumePlayerEvent, createPlayerMatch, selectPlayerStatus, summarizePlayerMatch } from "./player-career.js";
import { createSeason } from "./game.js";

test("injured player is excluded while team result remains", () => {
  const player = { ...createCareerPlayer(draft), injuryDays: 2 };
  assert.equal(selectPlayerStatus(player, {}, () => 0.5), "out");
  const match = createPlayerMatch(player, { home: "team-0", away: "team-1" }, createSeason(), () => 0.5);
  assert.equal(match.personalEvents.length, 0);
  assert.ok(match.result && Number.isInteger(match.result.home));
});

test("event cursor never duplicates an event across pause and speed changes", () => {
  const match = { events: [{ id: "a" }, { id: "b" }], cursor: 0 };
  const first = consumePlayerEvent(match, 0);
  const second = consumePlayerEvent(first.match, first.match.cursor);
  assert.equal(first.event.id, "a");
  assert.equal(second.event.id, "b");
  assert.equal(consumePlayerEvent(second.match, second.match.cursor).event, null);
});

test("summary gives excluded player zero minutes and no personal stats", () => {
  const summary = summarizePlayerMatch({ selection: "out", personalEvents: [], result: { home: 1, away: 0 } });
  assert.equal(summary.minutes, 0);
  assert.equal(summary.goals, 0);
});
```

- [ ] **Step 2: Run `node --test player-career.test.js`**

Expected: FAIL because match exports are missing.

- [ ] **Step 3: Implement selection, immutable results/events, cursor, contextual commentary, ratings, and records**

Use ability, mastery, condition, trust, and injury for selection. Generate position-specific personal events and team events. Commentary may inspect only the previous three events and must not contradict result fields. Update minutes, goals, assists, passing, shots, defending, rating, experience, trust, season stats, and career stats once at match completion.

- [ ] **Step 4: Add five speed controls and player-match views**

Render pause, 0.5×, 1×, 2×, highlights-only. Speed changes only the timer/filter, never events or cursor. Show selection status, score progression, rating changes, contextual commentary, and shared highlight images.

- [ ] **Step 5: Run and verify**

Run `node --test player-career.test.js career.test.js game.test.js`, `node --check app.js`, and `git diff --check`. Replay one deterministic match at all speeds and assert identical final event IDs/result; pause mid-event and resume; verify excluded-player world progression.

- [ ] **Step 6: Commit**

```bash
git add player-career.js player-career.test.js game.js app.js styles.css
git commit -m "feat: add player career match simulation"
```

### Task 4: Player Scenes, Contracts, and Final Browser Verification

**Files:**
- Create: `assets/player-scenes/dribble.png`
- Create: `assets/player-scenes/assist.png`
- Create: `assets/player-scenes/tackle.png`
- Create: `assets/player-scenes/card.png`
- Create: `assets/player-scenes/substitution.png`
- Create: `assets/player-scenes/training.png`
- Create: `assets/player-scenes/contract.png`
- Modify: `player-career.js`
- Modify: `player-career.test.js`
- Modify: `app.js`
- Modify: `styles.css`

**Interfaces:**
- Produces: `createCareerOffers(player, world): Offer[]`, `acceptCareerOffer(player, offer): PlayerCareer`, seven event-image mappings, complete player-career browser flow.

- [ ] **Step 1: Write failing contract tests**

```js
import { acceptCareerOffer, createCareerOffers } from "./player-career.js";
import { createSeason } from "./game.js";

test("accepted career offer updates club and contract without erasing records", () => {
  const player = { ...createCareerPlayer(draft), careerStats: { appearances: 12, goals: 4 } };
  const offer = createCareerOffers(player, createSeason())[0];
  const next = acceptCareerOffer(player, offer);
  assert.equal(next.clubId, offer.clubId);
  assert.equal(next.contract.wage, offer.wage);
  assert.deepEqual(next.careerStats, player.careerStats);
});
```

- [ ] **Step 2: Run `node --test player-career.test.js`**

Expected: FAIL because career-offer exports are missing.

- [ ] **Step 3: Implement deterministic renewal/transfer offers and acceptance**

Offers include club, role, wage, and 1–5 years. Acceptance updates club and contract, auto-saves through the active slot, and preserves all records.

- [ ] **Step 4: Generate seven original scene assets**

Read and follow the `imagegen` skill. Use the built-in generator once per asset. Shared constraints: original fictional Korean football world, dynamic Japanese sports-animation visual language, cel shading, widescreen 16:9, no text, no logo, no real player, no existing character. Actions: dribble, assist, tackle, caution, substitution, successful training, contract signing. Save to the exact paths above.

- [ ] **Step 5: Map scenes and verify the full career**

Preload/decode images; use commentary as alt and caption; keep each readable; place below pitch on mobile. In browser create a player via each entry path, use manual and auto training, simulate selected/bench/out matches at all speeds, reload records, and accept a contract. Confirm no console errors or overflow at desktop and 390×844.

- [ ] **Step 6: Run final checks and commit**

Run `node --test player-career.test.js career.test.js game.test.js`, `node --check app.js`, and `git diff --check`.

```bash
git add assets/player-scenes player-career.js player-career.test.js app.js styles.css
git commit -m "feat: complete player career mode"
```
