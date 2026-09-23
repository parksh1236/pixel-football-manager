# Career Modes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a start screen, manager/player career creation, and three isolated save slots while preserving the existing manager season.

**Architecture:** A small `career.js` module owns slot validation, migration, and persistence data shapes; `game.js` remains the world engine. `app.js` switches between start, creation, and active-career screens and delegates slot mutations to the pure career functions.

**Tech Stack:** HTML, CSS, JavaScript ES modules, localStorage, Node.js built-in test runner

**Spec:** `docs/superpowers/specs/2026-09-23-career-modes-design.md`

## Global Constraints

- Support exactly three independent save slots.
- Career mode is exactly `manager` or `player`.
- Preserve shared league state under `world` and mode-specific state under `career`.
- Convert the existing `pixel-manager-season-v1` save into the first empty manager slot without deleting it before a successful new save.
- One corrupt slot must not block the other slots.
- Auto-save after career creation, round completion, and contracts.

## Review Focus

- Invalid JSON in slot 2 still permits slots 1 and 3 to load; Task 1 tests it.
- A fourth slot creation attempt returns a visible capacity error without overwriting a slot; Task 1 tests it.
- Re-running legacy migration does not duplicate the imported career; Task 1 tests it.
- A storage write exception preserves the active in-memory career and reports failure; Task 2 tests the UI adapter result.
- Refreshing while a slot is active restores its mode and screen rather than creating a new career; Task 2 tests session selection logic.

---

### Task 1: Career Slot Domain and Legacy Migration

**Files:**
- Create: `career.js`
- Create: `career.test.js`

**Interfaces:**
- Produces: `MAX_SLOTS`, `createCareerSlot(mode, name, world, career): CareerSlot`, `parseSlots(rawSlots): SlotResult[]`, `upsertSlot(slots, slot): CareerSlot[]`, `migrateLegacySave(rawLegacy, slots): MigrationResult`
- `CareerSlot` is `{ id, version, mode, name, clubId, season, round, savedAt, career, world }`.
- `SlotResult` is `{ ok, slot?, index, error? }`; `MigrationResult` is `{ migrated, slots, legacyMayBeRemoved }`.

- [ ] **Step 1: Write failing domain tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { MAX_SLOTS, createCareerSlot, migrateLegacySave, parseSlots, upsertSlot } from "./career.js";

test("corrupt slot stays isolated", () => {
  const good = JSON.stringify(createCareerSlot("manager", "감독 1", { round: 2 }, {}));
  const result = parseSlots([good, "{broken", good]);
  assert.deepEqual(result.map(({ ok }) => ok), [true, false, true]);
});

test("a fourth career never overwrites three slots", () => {
  const slots = Array.from({ length: MAX_SLOTS }, (_, index) => createCareerSlot("manager", `감독 ${index}`, {}, {}));
  assert.throws(() => upsertSlot(slots, createCareerSlot("player", "신인", {}, {})), /3개/);
});

test("legacy migration is idempotent and preserves season state", () => {
  const legacy = JSON.stringify({ version: 2, round: 4, fixtures: [[{ result: { home: 1, away: 0 } }]], players: [], tactic: "attacking", formation: "4-3-3" });
  const first = migrateLegacySave(legacy, []);
  const second = migrateLegacySave(legacy, first.slots);
  assert.equal(first.slots[0].world.round, 4);
  assert.equal(second.migrated, false);
  assert.equal(second.slots.length, 1);
});
```

- [ ] **Step 2: Run `node --test career.test.js`**

Expected: FAIL because `career.js` does not exist.

- [ ] **Step 3: Implement immutable slot creation, parsing, capacity checks, and idempotent migration**

Use `crypto.randomUUID()` when available and a timestamp-plus-random fallback otherwise. Validate exact modes and ISO `savedAt`; do not throw while parsing individual slots. Mark `legacyMayBeRemoved` true only after the migrated slot is present in returned slots.

- [ ] **Step 4: Run `node --test career.test.js game.test.js`**

Expected: all career and existing engine tests pass.

- [ ] **Step 5: Commit**

```bash
git add career.js career.test.js
git commit -m "feat: add isolated career save slots"
```

### Task 2: Persistence Adapter and Start Screen

**Files:**
- Modify: `index.html`
- Modify: `app.js`
- Modify: `styles.css`
- Modify: `career.js`
- Modify: `career.test.js`

**Interfaces:**
- Consumes: Task 1 slot functions.
- Produces: `loadCareerStore(storage): CareerStore`, `saveCareerStore(storage, store): SaveResult`, start/continue/save-management UI, active slot restoration.
- `SaveResult` is `{ ok: boolean, error?: string }` and never discards in-memory state.

- [ ] **Step 1: Add failing persistence tests**

```js
import { loadCareerStore, saveCareerStore } from "./career.js";

test("write failure is reported without mutating the store", () => {
  const store = { activeSlotId: "slot-1", slots: [createCareerSlot("manager", "감독", {}, {})] };
  const storage = { setItem() { throw new Error("quota"); } };
  const before = structuredClone(store);
  assert.equal(saveCareerStore(storage, store).ok, false);
  assert.deepEqual(store, before);
});

test("active slot survives store reload", () => {
  const slot = createCareerSlot("player", "신인", {}, {});
  const raw = JSON.stringify({ activeSlotId: slot.id, slots: [slot] });
  const store = loadCareerStore({ getItem: () => raw });
  assert.equal(store.activeSlotId, slot.id);
  assert.equal(store.slots[0].mode, "player");
});
```

- [ ] **Step 2: Run `node --test career.test.js`**

Expected: FAIL because persistence exports are missing.

- [ ] **Step 3: Implement the adapter and migrate app startup**

Store one JSON document under `pixel-manager-careers-v1`; read the legacy key only when no imported slot exists. Keep the current season in memory if writes fail and expose a Korean status message.

- [ ] **Step 4: Build the start and slot screens**

Render 새 커리어, 이어하기, 저장 관리; show mode, name, club, season, round, and local `savedAt` for each of three slots. Add manager/player mode selection, manager name/nationality/club inputs, and a route hook for player creation. Show mode and slot in the active-career header and provide a 저장 후 메인 메뉴 action.

- [ ] **Step 5: Run checks and browser verification**

Run `node --test career.test.js game.test.js`, `node --check app.js`, and `git diff --check`. In browser, create manager and player slots, refresh each, corrupt one slot through storage tooling, and confirm the other slot remains usable at 1280×800 and 390×844.

- [ ] **Step 6: Commit**

```bash
git add index.html app.js styles.css career.js career.test.js
git commit -m "feat: add career start and save screens"
```

### Task 3: Manager Career Integration

**Files:**
- Modify: `app.js`
- Modify: `career.js`
- Modify: `career.test.js`

**Interfaces:**
- Consumes: active manager `CareerSlot` and existing match completion state.
- Produces: `updateActiveSlot(store, world, careerPatch): CareerStore` and manager auto-save hooks.

- [ ] **Step 1: Write the failing integration test**

```js
import { updateActiveSlot } from "./career.js";

test("manager round autosave updates only the active slot", () => {
  const first = createCareerSlot("manager", "A", { round: 0 }, { tactic: "balanced" });
  const second = createCareerSlot("manager", "B", { round: 5 }, { tactic: "defensive" });
  const next = updateActiveSlot({ activeSlotId: first.id, slots: [first, second] }, { round: 1 }, { tactic: "attacking" });
  assert.equal(next.slots[0].world.round, 1);
  assert.equal(next.slots[1].world.round, 5);
});
```

- [ ] **Step 2: Run `node --test career.test.js`**

Expected: FAIL because `updateActiveSlot` is missing.

- [ ] **Step 3: Implement immutable active-slot updates and wire manager actions**

Update only the selected slot after tactic, formation, lineup, match/round completion, and later contract events. Keep the existing manager dashboard as the active manager screen.

- [ ] **Step 4: Run and verify**

Run `node --test career.test.js game.test.js`, `node --check app.js`, and `git diff --check`. Complete one manager match, return to main menu, continue, and verify the round, score, tactic, formation, and lineup persist.

- [ ] **Step 5: Commit**

```bash
git add app.js career.js career.test.js
git commit -m "feat: connect manager career autosave"
```
