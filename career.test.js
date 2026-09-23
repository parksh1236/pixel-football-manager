import test from "node:test";
import assert from "node:assert/strict";
import { createSeason } from "./game.js";
import { createCareerSlot, migrateLegacySave, parseSlots, upsertSlot } from "./career.js";

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
  world: {},
});

test("a corrupt middle slot leaves neighboring slots available", () => {
  const parsed = parseSlots(JSON.stringify([slot("first"), "not json", slot("third")]));

  assert.deepEqual(parsed.map(({ ok }) => ok), [true, false, true]);
  assert.equal(parsed[0].slot.name, "first");
  assert.equal(parsed[2].slot.name, "third");
});

test("adding a fourth slot reports Korean capacity without replacing a save", () => {
  const slots = [slot("first"), slot("second"), slot("third")];

  assert.throws(() => upsertSlot(slots, slot("fourth")), /저장 슬롯은 최대 3개입니다/);
  assert.deepEqual(slots.map(({ name }) => name), ["first", "second", "third"]);
});

test("legacy migration imports once and retains the complete season state", () => {
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
  assert.deepEqual(first.slots[0].career.fixtures, legacy.fixtures);
  assert.deepEqual(first.slots[0].career.players, legacy.players);
  assert.equal(first.slots[0].career.tactic, "attacking");
  assert.equal(first.slots[0].career.formation, "4-4-2");
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
