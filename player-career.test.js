import test from "node:test";
import assert from "node:assert/strict";
import { createCareerSlot, parseSlots } from "./career.js";
import { completeRound, createSeason } from "./game.js";
import {
  applyTrainingWeek,
  ARCHETYPES,
  buildAutoSchedule,
  acceptCareerOffer,
  consumePlayerEvent,
  createCareerOffers,
  createCareerPlayer,
  createEmptyAttributeAdjustments,
  capAttributeAdjustment,
  updateAttributeDraftAdjustments,
  createEntryOffers,
  createPlayerMatch,
  ratePlayerEvents,
  PLAYER_SCENE_IMAGES,
  selectPlayerStatus,
  summarizePlayerMatch,
  summarizeAttributeAdjustments,
  validatePlayerCareerStore,
  validatePlayerDraft,
  validatePlayerIdentity,
  validateSchedule,
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
  },
};

test("career offers are valid deterministic renewals and transfers", () => {
  const world = createSeason();
  const player = {
    ...createCareerPlayer(draft),
    clubId: "team-0",
    wage: 150_000,
    contract: { clubId: "team-0", role: "주전", wage: 150_000, years: 2 },
  };
  const offers = createCareerOffers(player, world);

  assert.deepEqual(createCareerOffers(player, world), offers);
  assert.equal(offers[0].type, "renewal");
  assert.equal(offers[0].clubId, "team-0");
  assert.ok(offers.some(({ type }) => type === "transfer"));
  assert.ok(offers.every(({ clubId, clubName, role, wage, years }) => (
    typeof clubId === "string" && typeof clubName === "string" && typeof role === "string"
    && wage > 0 && Number.isInteger(years) && years >= 1 && years <= 5
  )));
});

test("accepted career offer updates contract without erasing records", () => {
  const player = {
    ...createCareerPlayer(draft),
    clubId: "team-0",
    careerStats: { appearances: 12, goals: 4 },
    seasonStats: { appearances: 3, goals: 1 },
  };
  const offer = createCareerOffers(player, createSeason())[1];
  const next = acceptCareerOffer(player, offer);

  assert.equal(next.clubId, offer.clubId);
  assert.equal(next.wage, offer.wage);
  assert.deepEqual(next.contract, { clubId: offer.clubId, role: offer.role, wage: offer.wage, years: offer.years });
  assert.deepEqual(next.careerStats, player.careerStats);
  assert.deepEqual(next.seasonStats, player.seasonStats);
  assert.throws(() => acceptCareerOffer(player, { ...offer, years: 6 }), /offer/i);
});

test("player scene ids map to the seven exact assets", () => {
  assert.deepEqual(PLAYER_SCENE_IMAGES, {
    dribble: "assets/player-scenes/dribble.png",
    assist: "assets/player-scenes/assist.png",
    tackle: "assets/player-scenes/tackle.png",
    caution: "assets/player-scenes/card.png",
    substitution: "assets/player-scenes/substitution.png",
    training: "assets/player-scenes/training.png",
    contract: "assets/player-scenes/contract.png",
  });
});

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

test("creation requires ten added points, rejects decreases, and caps attributes at twenty", () => {
  for (const adjustments of [
    { vision: 1.5, passing: 8.5 },
    { vision: 9 },
    { vision: 11 },
    { vision: 10, tackling: -1 },
    { vision: 6, passing: 4 },
    { vision: 10, unknown: 0 },
  ]) {
    assert.equal(validatePlayerDraft({ ...draft, adjustments }).ok, false, JSON.stringify(adjustments));
  }
});

test("attribute adjustment summary reports remaining or excess added points", () => {
  assert.deepEqual(summarizeAttributeAdjustments({ passing: 8, tackling: 2 }), {
    added: 10,
    remaining: 0,
    excess: 0,
  });
  assert.deepEqual(summarizeAttributeAdjustments({ passing: 12 }), {
    added: 12,
    remaining: 0,
    excess: 2,
  });
});

test("new attribute adjustments start with the full ten-point pool available", () => {
  const adjustments = createEmptyAttributeAdjustments();

  assert.equal(Object.keys(adjustments).length, 12);
  assert.ok(Object.values(adjustments).every((value) => value === 0));
  assert.deepEqual(summarizeAttributeAdjustments(adjustments), { added: 0, remaining: 10, excess: 0 });
});

test("attribute edits persist in the player draft without mutating prior state", () => {
  const original = { ...draft, adjustments: createEmptyAttributeAdjustments() };
  const next = updateAttributeDraftAdjustments(original, { ...original.adjustments, passing: 3 });

  assert.equal(summarizeAttributeAdjustments(next.adjustments).remaining, 7);
  assert.equal(original.adjustments.passing, 0);
});

test("an attribute edit is capped by the points remaining after other allocations", () => {
  const base = ARCHETYPES.playmaker.attributes;
  const adjustments = { ...createEmptyAttributeAdjustments(), pace: 4, passing: 3 };

  assert.equal(capAttributeAdjustment(adjustments, "flair", 8, base), 3);
  assert.equal(capAttributeAdjustment(adjustments, "finishing", 8, base), 3);
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

  assert.equal(finalTotal, baseTotal + 10);
  assert.ok(Object.values(player.attributes).every((value) => Number.isInteger(value) && value >= 1 && value <= 20));
  assert.ok(Object.entries(player.attributes).every(([name, value]) => value >= ARCHETYPES.playmaker.attributes[name]));
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

test("automatic training protects match and recovery days", () => {
  const schedule = buildAutoSchedule(createCareerPlayer(draft), 5, "technique", "normal");

  assert.equal(schedule.length, 7);
  assert.deepEqual(schedule.map(({ day }) => day), [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(schedule[5].type, "match");
  assert.equal(schedule[6].type, "recovery");
  assert.equal(validateSchedule(createCareerPlayer(draft), schedule, 5).ok, true);
  assert.equal(validateSchedule(createCareerPlayer(draft), schedule.with(5, { day: 5, type: "rest", intensity: "low" }), 5).ok, false);
  assert.equal(validateSchedule(createCareerPlayer(draft), schedule.with(6, { day: 6, type: "physical", intensity: "normal" }), 5).ok, false);
});

test("malformed saved training days are rejected without crashing", () => {
  const player = { ...createCareerPlayer(draft), injuryDays: 3 };
  const schedule = buildAutoSchedule(player, 5, "technique", "normal").with(0, null);

  assert.doesNotThrow(() => validateSchedule(player, schedule, 5));
  assert.equal(validateSchedule(player, schedule, 5).ok, false);
  assert.throws(() => applyTrainingWeek(player, schedule, () => 1), /일정/);
});

test("injury blocks hard training", () => {
  const player = { ...createCareerPlayer(draft), injuryDays: 3 };
  const schedule = buildAutoSchedule(player, 5, "physical", "normal");

  assert.equal(validateSchedule(player, schedule.with(0, { day: 0, type: "physical", intensity: "hard" }), 5).ok, false);
});

test("repeated focus loses efficiency and low condition raises injury risk", () => {
  const player = {
    ...createCareerPlayer(draft),
    condition: 30,
    training: { experience: 0, recentFocus: ["technique", "technique"], schedule: [] },
  };
  const schedule = buildAutoSchedule(player, 5, "technique", "hard");
  const result = applyTrainingWeek(player, schedule, () => 0);

  assert.ok(result.efficiency < 1);
  assert.ok(result.injuryRisk > 0);
});

test("a Monday injury counts down through every remaining day", () => {
  const player = { ...createCareerPlayer(draft), condition: 30 };
  const result = applyTrainingWeek(player, buildAutoSchedule(player, 5, "technique", "hard"), () => 0);

  assert.ok(result.injuryRisk > 0);
  assert.equal(result.player.injuryDays, 0);
});

test("calendar days modify pre-match fatigue and post-match recovery", () => {
  const player = { ...createCareerPlayer(draft), condition: 50 };
  const base = Array.from({ length: 7 }, (_, day) => ({
    day,
    type: day === 5 ? "match" : day === 6 ? "recovery" : "rest",
    intensity: "low",
  }));
  const mondayHard = base.with(0, { day: 0, type: "technique", intensity: "hard" });
  const fridayHard = base.with(4, { day: 4, type: "technique", intensity: "hard" });
  const ordinaryRecovery = base.with(0, { day: 0, type: "recovery", intensity: "low" });

  assert.equal(
    applyTrainingWeek(player, mondayHard, () => 1).player.condition
      - applyTrainingWeek(player, fridayHard, () => 1).player.condition,
    4,
  );
  const tiredPlayer = { ...player, condition: 0 };
  assert.equal(applyTrainingWeek(tiredPlayer, base, () => 1).player.condition, 51);
  assert.equal(applyTrainingWeek(tiredPlayer, ordinaryRecovery, () => 1).player.condition, 57);
});

test("rest and recovery raise condition", () => {
  const player = { ...createCareerPlayer(draft), condition: 45 };
  const schedule = Array.from({ length: 7 }, (_, day) => ({
    day,
    type: day === 5 ? "match" : day === 6 ? "recovery" : "rest",
    intensity: "low",
  }));

  assert.ok(applyTrainingWeek(player, schedule, () => 1).player.condition > player.condition);
});

test("a valid week grows the player without mutating the input", () => {
  const player = createCareerPlayer(draft);
  const before = structuredClone(player);
  const schedule = buildAutoSchedule(player, 5, "position", "normal");
  const result = applyTrainingWeek(player, schedule, () => 1);

  assert.deepEqual(player, before);
  assert.equal(result.player.training.weeks, 1);
  assert.ok(result.player.training.experience > player.training.experience);
  assert.ok(result.player.positionMastery.CM > player.positionMastery.CM);
  assert.ok(result.player.condition < player.condition);
});

const contractedPlayer = (changes = {}) => ({
  ...createCareerPlayer(draft),
  clubId: "team-0",
  contract: { clubId: "team-0", role: "주전", wage: 150_000, years: 3 },
  ...changes,
});

test("injured player is excluded while the shared world still completes the round", () => {
  const world = createSeason();
  const fixture = world.fixtures[0].find(({ home, away }) => home === "team-0" || away === "team-0");
  const player = contractedPlayer({ injuryDays: 2 });

  assert.equal(selectPlayerStatus(player, world.teams.find(({ id }) => id === "team-0"), () => 0.5), "out");
  const match = createPlayerMatch(player, fixture, world, () => 0.5);

  assert.equal(match.selection, "out");
  assert.equal(match.personalEvents.length, 0);
  assert.equal(match.world.round, 1);
  assert.equal(match.world.completedRoundIds.includes(0), true);
  assert.ok(Number.isInteger(match.result.home));
  assert.ok(Number.isInteger(match.result.away));
  assert.equal(world.round, 0);
});

test("an unscheduled fixture request resolves to the club's shared-world fixture", () => {
  const match = createPlayerMatch(
    contractedPlayer({ injuryDays: 2 }),
    { home: "team-0", away: "team-1" },
    createSeason(),
    () => 0.5,
  );

  assert.equal(match.fixture.home === "team-0" || match.fixture.away === "team-0", true);
  assert.ok(Number.isInteger(match.result.home));
  assert.equal(match.world.fixtures[match.fixture.round].every(({ result }) => result !== null), true);
});

test("event cursor emits every immutable ordered event once and ends cleanly", () => {
  const events = Object.freeze([
    Object.freeze({ id: "a", minute: 1 }),
    Object.freeze({ id: "b", minute: 2 }),
  ]);
  let match = { events, cursor: 0, speed: "1x" };
  const seen = [];

  for (const speed of ["pause", "0.5x", "2x", "highlights"]) {
    match = { ...match, speed };
    const consumed = consumePlayerEvent(match, match.cursor);
    if (consumed.event) seen.push(consumed.event.id);
    match = consumed.match;
  }

  assert.deepEqual(seen, ["a", "b"]);
  assert.equal(match.cursor, 2);
  assert.equal(consumePlayerEvent(match, match.cursor).event, null);
  assert.equal(consumePlayerEvent(match, match.cursor).match.cursor, 2);
  assert.equal(match.events, events);
});

test("an out player receives zero minutes and no personal statistics", () => {
  const player = contractedPlayer({ injuryDays: 3 });
  const world = createSeason();
  const fixture = world.fixtures[0].find(({ home, away }) => home === "team-0" || away === "team-0");
  const summary = summarizePlayerMatch(createPlayerMatch(player, fixture, world, () => 0.5));

  assert.equal(summary.minutes, 0);
  assert.equal(summary.goals, 0);
  assert.equal(summary.assists, 0);
  assert.equal(summary.passesCompleted, 0);
  assert.equal(summary.shots, 0);
  assert.equal(summary.defending, 0);
  assert.deepEqual(summary.match.personalEvents, []);
});

test("match ids and final result remain identical at every display speed", () => {
  const speeds = ["pause", "0.5x", "1x", "2x", "highlights"];
  const runs = speeds.map((speed) => {
    const world = createSeason();
    const fixture = world.fixtures[0].find(({ home, away }) => home === "team-0" || away === "team-0");
    const match = { ...createPlayerMatch(contractedPlayer(), fixture, world, () => 0.5), speed };
    return { ids: match.events.map(({ id }) => id), result: match.result };
  });

  runs.slice(1).forEach((run) => assert.deepEqual(run, runs[0]));
});

test("personal events use position-specific actions and contextual commentary", () => {
  const cases = [
    ["GK", "goalkeeper", ["save", "distribution"]],
    ["CB", "defender", ["tackle", "interception"]],
    ["CM", "box-to-box", ["pass", "key-pass"]],
    ["ST", "scorer", ["dribble", "shot"]],
  ];

  for (const [preferredPosition, archetype, allowed] of cases) {
    const base = createCareerPlayer({ ...draft, preferredPosition, secondaryPositions: [], archetype });
    const player = contractedPlayer({ ...base, trust: 100, condition: 100 });
    const world = createSeason();
    const fixture = world.fixtures[0].find(({ home, away }) => home === "team-0" || away === "team-0");
    const match = createPlayerMatch(player, fixture, world, () => 0.99);

    assert.notEqual(match.selection, "out");
    assert.ok(match.personalEvents.length > 0);
    assert.ok(match.personalEvents.every(({ type }) => allowed.includes(type)), preferredPosition);
    assert.ok(match.personalEvents.every(({ commentary }) => commentary.includes(player.name)), preferredPosition);
  }
});

test("completion applies match records, experience, and trust exactly once", () => {
  const world = createSeason();
  const fixture = world.fixtures[0].find(({ home, away }) => home === "team-0" || away === "team-0");
  const player = contractedPlayer({ trust: 50, condition: 100 });
  const match = createPlayerMatch(player, fixture, world, () => 0.5);
  const first = summarizePlayerMatch(match);
  const second = summarizePlayerMatch(first.match);

  assert.equal(first.player.seasonStats.appearances, 1);
  assert.equal(first.player.careerStats.appearances, 1);
  assert.equal(first.player.training.experience > player.training.experience, true);
  assert.notEqual(first.player.trust, player.trust);
  assert.deepEqual(second.player, first.player);
  assert.equal(second.match.recordsApplied, true);
});

test("summary counts only contributions attached to actual goal events", () => {
  const player = contractedPlayer();
  const match = {
    player,
    selection: "starter",
    fixture: { home: "team-0", away: "team-1" },
    result: { home: 2, away: 0 },
    personalEvents: [
      { type: "goal", contribution: "goal" },
      { type: "goal", contribution: "assist" },
      { type: "shot", outcome: "goal" },
      { type: "key-pass", outcome: "assist" },
    ],
    recordsApplied: false,
  };

  const summary = summarizePlayerMatch(match);

  assert.equal(summary.goals, 1);
  assert.equal(summary.assists, 1);
});

test("personal scoring is attributed only on actual shared team goals", () => {
  const world = createSeason();
  const fixture = world.fixtures[0].find(({ home, away }) => home === "team-0" || away === "team-0");
  const player = contractedPlayer({
    preferredPosition: "ST",
    secondaryPositions: [],
    positionMastery: { ST: 100 },
    trust: 100,
    condition: 100,
  });
  player.attributes.finishing = 20;
  const match = createPlayerMatch(player, fixture, world, () => 0.8);
  const sharedGoalIds = new Set(match.events.filter(({ type, teamId }) => type === "goal" && teamId === player.clubId).map(({ id }) => id));
  const attributed = match.personalEvents.filter(({ contribution }) => contribution === "goal" || contribution === "assist");

  assert.ok(attributed.length > 0);
  assert.ok(attributed.every(({ id, type, teamId }) => sharedGoalIds.has(id) && type === "goal" && teamId === player.clubId));
  assert.equal(match.personalEvents.some(({ type, outcome }) => type === "shot" && outcome === "goal"), false);
});

test("detailed finishing changes shot outcomes for equal-overall players", () => {
  const base = contractedPlayer({
    preferredPosition: "ST",
    secondaryPositions: [],
    positionMastery: { ST: 100 },
    trust: 100,
    condition: 100,
  });
  const highFinishing = { ...base, attributes: { ...base.attributes, finishing: 16, strength: 5 } };
  const lowFinishing = { ...base, attributes: { ...base.attributes, finishing: 6, strength: 15 } };
  const create = (player) => {
    const world = createSeason();
    const fixture = world.fixtures[0].find(({ home, away }) => home === "team-0" || away === "team-0");
    return createPlayerMatch(player, fixture, world, () => 0.7).personalEvents
      .filter(({ type, contribution }) => type === "shot" && !contribution)
      .map(({ outcome }) => outcome);
  };

  assert.equal(highFinishing.overall, lowFinishing.overall);
  assert.deepEqual(create(highFinishing), ["on-target", "on-target"]);
  assert.deepEqual(create(lowFinishing), ["off-target", "off-target"]);
});

test("a bench player cannot receive a goal from before entering the match", () => {
  const world = createSeason();
  const fixture = world.fixtures[0].find(({ home, away }) => home === "team-0" || away === "team-0");
  const player = contractedPlayer({
    preferredPosition: "ST",
    secondaryPositions: [],
    positionMastery: { ST: 100 },
    overall: 10,
    condition: 32,
    trust: 0,
    attributes: { ...contractedPlayer().attributes, finishing: 20, dribbling: 20, flair: 20, pace: 20 },
  });
  const match = createPlayerMatch(player, fixture, world, () => 0.5);

  assert.equal(match.selection, "bench");
  assert.ok(match.personalEvents.filter(({ contribution }) => contribution).every(({ minute }) => minute >= 65));
});

test("attributed scorer agrees across paired shot, timeline, and persisted world result", () => {
  const baselineWorld = createSeason();
  const fixture = baselineWorld.fixtures[0].find(({ home, away }) => home === "team-0" || away === "team-0");
  const baseline = completeRound(baselineWorld, () => 0.8, fixture.round).season.fixtures[fixture.round].find(({ id }) => id === fixture.id).result;
  const player = contractedPlayer({
    id: "career-player-test",
    preferredPosition: "ST",
    secondaryPositions: [],
    positionMastery: { ST: 100 },
    trust: 100,
    condition: 100,
    attributes: { ...contractedPlayer().attributes, finishing: 20 },
  });
  const match = createPlayerMatch(player, fixture, createSeason(), () => 0.8);
  const goal = match.events.find(({ contribution }) => contribution === "goal");
  const shot = match.events.find(({ minute, type, teamId, outcome }) => (
    minute === goal.minute - 1 && type === "shot" && teamId === goal.teamId && outcome === "goal"
  ));
  const persisted = match.world.fixtures[fixture.round].find(({ id }) => id === fixture.id).result;
  const persistedGoal = persisted.events.find(({ id }) => id === goal.id);
  const persistedShot = persisted.events.find(({ id }) => id === shot.id);
  const baselineGoal = baseline.events.find(({ id }) => id === goal.id);

  assert.deepEqual(match.result, { home: baseline.home, away: baseline.away });
  assert.equal(goal.minute, baselineGoal.minute);
  assert.equal(goal.id, baselineGoal.id);
  assert.equal(goal.playerId, player.id);
  assert.equal(shot.playerId, player.id);
  assert.equal(persistedGoal.playerId, player.id);
  assert.equal(persistedShot.playerId, player.id);
  assert.equal(persistedGoal.contribution, "goal");
});

test("live rating rewards attributed goal and assist contributions", () => {
  const contribution = (changes, type) => {
    const world = createSeason();
    const fixture = world.fixtures[0].find(({ home, away }) => home === "team-0" || away === "team-0");
    const player = contractedPlayer({ trust: 100, condition: 100, secondaryPositions: [], ...changes });
    return createPlayerMatch(player, fixture, world, () => 0.8).events.find((event) => event.contribution === type);
  };
  const goal = contribution({
    preferredPosition: "ST",
    positionMastery: { ST: 100 },
    attributes: { ...contractedPlayer().attributes, finishing: 20 },
  }, "goal");
  const assist = contribution({
    preferredPosition: "CM",
    positionMastery: { CM: 100 },
    attributes: { ...contractedPlayer().attributes, passing: 20, vision: 20, flair: 20 },
  }, "assist");

  assert.equal(goal.outcome, "scored");
  assert.equal(assist.outcome, "scored");
  assert.equal(ratePlayerEvents([goal, assist], "starter"), 8);
  assert.equal(ratePlayerEvents([goal, assist], "out"), null);
});
