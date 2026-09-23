import test from "node:test";
import assert from "node:assert/strict";
import { createSeason } from "./game.js";
import { assignCareerClub, createCareerSlot, loadCareerStore, migrateLegacySave, parseSlots, saveCareerStore, upsertSlot } from "./career.js";

const savedAt = "2026-09-23T00:00:00.000Z";
const slot = (name = "Seoul") => ({
  id: name,
  version: 1,
  mode: "manager",
  name,
  clubId: "team-0",
  season: 1,
  round: 0,
  savedAt,
  career: { round: 0 },
  world: createSeason(),
});

test("a corrupt middle slot leaves neighboring slots available", () => {
  const parsed = parseSlots(JSON.stringify([slot("first"), "not json", slot("third")]));

  assert.deepEqual(parsed.map(({ ok }) => ok), [true, false, true]);
  assert.equal(parsed[0].slot.name, "first");
  assert.equal(parsed[2].slot.name, "third");
});

test("an invalid manager player position leaves neighboring slots available", () => {
  const broken = slot("broken");
  broken.world.players[0].position = "INVALID";

  const parsed = parseSlots([slot("first"), broken, slot("third")]);

  assert.deepEqual(parsed.map(({ ok }) => ok), [true, false, true]);
  assert.equal(parsed[0].slot.name, "first");
  assert.equal(parsed[2].slot.name, "third");
});

test("adding a fourth slot reports Korean capacity without replacing a save", () => {
  const slots = [slot("first"), slot("second"), slot("third")];

  assert.throws(() => upsertSlot(slots, slot("fourth")), /저장 슬롯은 최대 3개입니다/);
  assert.deepEqual(slots.map(({ name }) => name), ["first", "second", "third"]);
});

test("legacy migration imports once and retains the complete league state in world", () => {
  const legacy = createSeason();
  legacy.round = 2;
  legacy.tactic = "attacking";
  legacy.formation = "4-4-2";
  legacy.players[0].condition = 71;
  legacy.fixtures[0][0].result = { home: 2, away: 1, events: [{ minute: 90, type: "full-time" }] };

  const first = migrateLegacySave(JSON.stringify(legacy), []);
  const second = migrateLegacySave(JSON.stringify(legacy), first.slots);

  assert.equal(first.migrated, true);
  assert.equal(first.legacyMayBeRemoved, true);
  assert.equal(first.slots.length, 1);
  assert.equal(second.migrated, false);
  assert.deepEqual(second.slots, first.slots);
  assert.equal(first.slots[0].round, 2);
  assert.equal(first.slots[0].world.round, 2);
  assert.deepEqual(first.slots[0].world.fixtures, legacy.fixtures);
  assert.deepEqual(first.slots[0].world.players, legacy.players);
  assert.equal(first.slots[0].world.tactic, "attacking");
  assert.equal(first.slots[0].world.formation, "4-4-2");
});

test("legacy import marker blocks re-import after career progress changes", () => {
  const legacy = JSON.stringify(createSeason());
  const first = migrateLegacySave(legacy, []);
  const advanced = structuredClone(first.slots);
  advanced[0].career.tactic = "defensive";

  const repeated = migrateLegacySave(legacy, advanced);

  assert.equal(repeated.migrated, false);
  assert.equal(repeated.slots.length, 1);
  assert.equal(repeated.slots[0].career.tactic, "defensive");
});

test("new slots validate modes and generate ISO save timestamps", () => {
  const created = createCareerSlot("player", "Kim", {}, { clubId: "club-1", season: 3, round: 4 });

  assert.equal(created.mode, "player");
  assert.equal(created.clubId, "club-1");
  assert.equal(created.season, 3);
  assert.equal(created.round, 4);
  assert.equal(new Date(created.savedAt).toISOString(), created.savedAt);
  assert.throws(() => createCareerSlot("coach", "Kim", {}, {}), /manager 또는 player/);
  assert.deepEqual(parseSlots([{ ...created, savedAt: "not-an-iso-date" }]).map(({ ok }) => ok), [false]);
  assert.deepEqual(parseSlots([{ ...created, savedAt: "2026-02-30T00:00:00.000Z" }]).map(({ ok }) => ok), [false]);
});

test("write failure is reported without mutating the store", () => {
  const active = createCareerSlot("manager", "감독", {}, {});
  const store = { activeSlotId: active.id, slots: [active] };
  const storage = { setItem() { throw new Error("quota"); } };
  const before = structuredClone(store);

  assert.deepEqual(saveCareerStore(storage, store), { ok: false, error: "커리어를 저장하지 못했습니다." });
  assert.deepEqual(store, before);
});

test("active slot and mode survive store reload", () => {
  const active = createCareerSlot("player", "신인", {}, {});
  const raw = JSON.stringify({ activeSlotId: active.id, slots: [active] });

  const store = loadCareerStore({ getItem: () => raw });

  assert.equal(store.activeSlotId, active.id);
  assert.equal(store.slots[0].mode, "player");
});

test("loading a corrupt slot keeps neighboring careers available", () => {
  const first = createCareerSlot("manager", "첫 감독", createSeason(), {});
  const third = createCareerSlot("player", "세 번째 선수", {}, {});
  const raw = JSON.stringify({ activeSlotId: first.id, slots: [first, "{broken", third] });

  const store = loadCareerStore({ getItem: () => raw });

  assert.deepEqual(store.slotResults.map(({ ok }) => ok), [true, false, true]);
  assert.equal(store.slots[0].name, "첫 감독");
  assert.equal(store.slots[2].name, "세 번째 선수");
});

test("malformed active manager world is isolated and its selection is cleared", () => {
  const first = createCareerSlot("player", "정상 선수", {}, {});
  const broken = createCareerSlot("manager", "손상 감독", {}, {});
  const third = createCareerSlot("manager", "정상 감독", createSeason(), {});
  const raw = JSON.stringify({ activeSlotId: broken.id, slots: [first, broken, third] });

  const store = loadCareerStore({ getItem: () => raw });

  assert.deepEqual(store.slotResults.map(({ ok }) => ok), [true, false, true]);
  assert.equal(store.activeSlotId, null);
  assert.equal(store.slots[0].name, "정상 선수");
  assert.equal(store.slots[2].name, "정상 감독");
});

test("selected club is reapplied to a fresh season without mutating it", () => {
  const world = createSeason();
  const selectedName = world.teams.find(({ id }) => id === "team-3").name;
  const original = structuredClone(world);

  const next = assignCareerClub(world, "team-3");

  assert.equal(next.teams.find(({ id }) => id === "team-0").name, selectedName);
  assert.deepEqual(world, original);
});
