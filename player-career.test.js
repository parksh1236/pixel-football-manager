import test from "node:test";
import assert from "node:assert/strict";
import { createCareerSlot, parseSlots } from "./career.js";
import { createSeason } from "./game.js";
import {
  ARCHETYPES,
  createCareerPlayer,
  createEntryOffers,
  validatePlayerCareerStore,
  validatePlayerDraft,
  validatePlayerIdentity,
} from "./player-career.js";

const draft = {
  name: "김하늘",
  nationality: "대한민국",
  age: 18,
  height: 178,
  foot: "right",
  appearance: "short-dark",
  preferredPosition: "AM",
  secondaryPositions: ["CM", "RW"],
  archetype: "playmaker",
  adjustments: {
    vision: 4,
    passing: 3,
    flair: 3,
    tackling: -4,
    strength: -3,
    heading: -3,
  },
};

test("creation rejects malformed identity fields", () => {
  for (const change of [
    { name: " " },
    { nationality: "" },
    { age: 15 },
    { age: 26 },
    { height: 149 },
    { height: 211 },
    { foot: "both" },
    { archetype: "unknown" },
  ]) {
    assert.equal(validatePlayerDraft({ ...draft, ...change }).ok, false, JSON.stringify(change));
  }
});

test("step-one identity validation ignores later fields while full validation still blocks creation", () => {
  const incompleteLaterSteps = { ...draft, preferredPosition: "invalid" };

  assert.equal(validatePlayerIdentity(incompleteLaterSteps).ok, true);
  assert.equal(validatePlayerDraft(incompleteLaterSteps).ok, false);
  assert.throws(() => createCareerPlayer(incompleteLaterSteps));
});

test("creation rejects duplicate and malformed positions", () => {
  for (const secondaryPositions of [
    ["AM"],
    ["CM", "CM"],
    ["CM", "RW", "ST"],
    ["CM", "invalid"],
  ]) {
    assert.equal(validatePlayerDraft({ ...draft, secondaryPositions }).ok, false, secondaryPositions.join(","));
  }
  assert.equal(validatePlayerDraft({ ...draft, preferredPosition: "invalid" }).ok, false);
});

test("creation rejects fractional, unbalanced, and non-ten-point adjustments", () => {
  for (const adjustments of [
    { vision: 1.5, tackling: -1.5 },
    { vision: 10, tackling: -9 },
    { vision: 9, tackling: -9 },
    { vision: 11, tackling: -11 },
    { vision: 10, unknown: -10 },
  ]) {
    assert.equal(validatePlayerDraft({ ...draft, adjustments }).ok, false, JSON.stringify(adjustments));
  }
});

test("creation rejects inherited archetype and attribute keys without throwing", () => {
  assert.doesNotThrow(() => validatePlayerDraft({ ...draft, archetype: "constructor" }));
  assert.equal(validatePlayerDraft({ ...draft, archetype: "constructor" }).ok, false);
  assert.equal(validatePlayerDraft({
    ...draft,
    adjustments: { ...draft.adjustments, constructor: 0 },
  }).ok, false);
});

test("created player keeps the archetype total and attribute bounds", () => {
  const player = createCareerPlayer(draft);
  const baseTotal = Object.values(ARCHETYPES.playmaker.attributes).reduce((sum, value) => sum + value, 0);
  const finalTotal = Object.values(player.attributes).reduce((sum, value) => sum + value, 0);

  assert.equal(finalTotal, baseTotal);
  assert.ok(Object.values(player.attributes).every((value) => Number.isInteger(value) && value >= 1 && value <= 20));
  assert.equal(player.attributes.vision, ARCHETYPES.playmaker.attributes.vision + 4);
  assert.equal(player.preferredPosition, "AM");
  assert.deepEqual(player.secondaryPositions, ["CM", "RW"]);
});

test("all six archetypes create complete player records", () => {
  assert.equal(Object.keys(ARCHETYPES).length, 6);
  for (const archetype of Object.keys(ARCHETYPES)) {
    const player = createCareerPlayer({ ...draft, archetype });
    assert.deepEqual(Object.keys(player.positionMastery).sort(), ["AM", "CM", "RW"]);
    assert.equal(player.positionMastery.AM, 100);
    assert.ok(player.positionMastery.CM < 100);
    assert.equal(player.condition, 100);
    assert.ok(player.potential >= 1 && player.potential <= 20);
    assert.ok(player.value > 0);
    assert.ok(player.wage > 0);
    assert.deepEqual(player.contract, { clubId: null, role: null, wage: 0, years: 0 });
    assert.ok(player.training && player.seasonStats && player.careerStats);
  }
});

test("all three entry paths return deterministic eligible offers", () => {
  const player = createCareerPlayer(draft);
  const teams = createSeason().teams;
  const selected = teams[4];
  const clubChoice = createEntryOffers(player, "club-choice", [selected]);
  const trial = createEntryOffers(player, "trial", teams);
  const freeAgent = createEntryOffers(player, "free-agent", teams);

  assert.equal(clubChoice.length, 1);
  assert.equal(clubChoice[0].clubId, selected.id);
  assert.ok(trial.length > 0 && trial.length <= 3);
  assert.deepEqual(createEntryOffers(player, "trial", teams), trial);
  assert.deepEqual(createEntryOffers(player, "free-agent", teams), freeAgent);
  assert.equal(new Set(trial.map(({ clubId }) => clubId)).size, trial.length);
  assert.ok([...clubChoice, ...trial, ...freeAgent].every(({ clubId, role, wage, years }) => (
    teams.some(({ id }) => id === clubId)
      && ["핵심", "주전", "로테이션", "유망주"].includes(role)
      && wage > 0
      && Number.isInteger(years)
      && years > 0
  )));
});

test("an unrated club still receives a finite positive offer", () => {
  const player = createCareerPlayer(draft);
  const [offer] = createEntryOffers(player, "club-choice", [{ id: "unrated", name: "Unrated FC" }]);

  assert.equal(Number.isFinite(offer.wage), true);
  assert.ok(offer.wage > 0);
});

test("trial ranking changes when a club needs the player's position", () => {
  const teams = [
    { id: "club-am", rating: 70, needs: ["AM"] },
    { id: "club-cm", rating: 70, needs: ["CM"] },
    { id: "club-gk", rating: 70, needs: ["GK"] },
  ];
  const attackingMidfielder = createCareerPlayer(draft);
  const goalkeeper = createCareerPlayer({
    ...draft,
    preferredPosition: "GK",
    secondaryPositions: [],
    archetype: "goalkeeper",
  });

  assert.equal(createEntryOffers(attackingMidfielder, "trial", teams)[0].clubId, "club-am");
  assert.equal(createEntryOffers(goalkeeper, "trial", teams)[0].clubId, "club-gk");
});

test("generated clubs expose positional needs to trial offers", () => {
  const world = createSeason();
  const attackingMidfielder = createCareerPlayer(draft);
  const goalkeeper = {
    ...attackingMidfielder,
    preferredPosition: "GK",
    secondaryPositions: [],
    positionMastery: { GK: 100 },
  };

  assert.ok(world.teams.every(({ needs }) => Array.isArray(needs) && needs.length));
  assert.deepEqual(createEntryOffers(attackingMidfielder, "trial", world.teams).map(({ clubId }) => clubId), ["team-0", "team-3", "team-5"]);
  assert.deepEqual(createEntryOffers(goalkeeper, "trial", world.teams).map(({ clubId }) => clubId), ["team-2", "team-6", "team-0"]);
});

test("created player can be stored as a valid player career slot", () => {
  const world = createSeason();
  const player = createCareerPlayer(draft);
  const [offer] = createEntryOffers(player, "club-choice", [world.teams[0]]);
  const contractedPlayer = {
    ...player,
    clubId: offer.clubId,
    wage: offer.wage,
    contract: { clubId: offer.clubId, role: offer.role, wage: offer.wage, years: offer.years },
  };
  const slot = createCareerSlot("player", player.name, world, {
    clubId: offer.clubId,
    entryPath: "club-choice",
    player: contractedPlayer,
  });

  const [result] = parseSlots(JSON.stringify([slot]));
  assert.equal(result.ok, true);
  assert.equal(result.slot.mode, "player");
  assert.equal(result.slot.career.player.name, "김하늘");
  assert.equal(result.slot.career.player.contract.clubId, "team-0");
});

test("restored player slots isolate malformed profiles but allow legacy placeholders", () => {
  const world = createSeason();
  const player = createCareerPlayer(draft);
  const contractedPlayer = {
    ...player,
    clubId: "team-0",
    wage: 150_000,
    contract: { clubId: "team-0", role: "유망주", wage: 150_000, years: 2 },
  };
  const legacySlot = createCareerSlot("player", "기존 선수", world, { playerName: "기존 선수" });
  const malformedSlot = {
    ...createCareerSlot("player", "손상 선수", world, { player: contractedPlayer }),
    career: { player: { ...contractedPlayer, archetype: "constructor", contract: null } },
  };
  const validSlot = createCareerSlot("player", player.name, world, { player: contractedPlayer });
  const slots = [legacySlot, malformedSlot, validSlot];
  const slotResults = parseSlots(slots);
  const restored = validatePlayerCareerStore({ activeSlotId: malformedSlot.id, slots, slotResults });
  const legacyRestored = validatePlayerCareerStore({ activeSlotId: legacySlot.id, slots, slotResults });

  assert.deepEqual(restored.slotResults.map(({ ok }) => ok), [true, false, true]);
  assert.equal(restored.activeSlotId, null);
  assert.equal(restored.slots[1], malformedSlot);
  assert.equal(legacyRestored.activeSlotId, legacySlot.id);
});
