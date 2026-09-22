import test from "node:test";
import assert from "node:assert/strict";
import * as engine from "./game.js";
import {
  calculateTable,
  completeRound,
  commentate,
  createMatchEvents,
  createSchedule,
  createSeason,
  FORMATIONS,
  formationPositions,
  lineupPositions,
  migrateSeason,
  movePlayer,
  swapStarter,
} from "./game.js";

test("match events are ordered and reproduce the final score", () => {
  const season = createSeason();
  const fixture = season.fixtures[0][0];
  const events = createMatchEvents(season, fixture, { home: 2, away: 1 }, () => 0.5);
  assert.deepEqual([...events].sort((a, b) => a.minute - b.minute), events);
  assert.equal(events.filter(({ type }) => type === "goal").length, 3);
  assert.equal(events.filter(({ type, teamId }) => type === "goal" && teamId === fixture.home).length, 2);
  assert.equal(events.filter(({ type, teamId }) => type === "goal" && teamId === fixture.away).length, 1);
});

test("score advances only when each team's precomputed goal is consumed", () => {
  assert.equal(typeof engine.scoreForEvents, "function");
  const fixture = { home: "team-1", away: "team-0" };
  const events = [
    { type: "kickoff", teamId: fixture.home },
    { type: "shot", teamId: fixture.away, outcome: "goal" },
    { type: "goal", teamId: fixture.away },
    { type: "save", teamId: fixture.home },
    { type: "goal", teamId: fixture.home },
    { type: "goal", teamId: fixture.away },
  ];
  const expected = [[0, 0], [0, 0], [0, 0], [0, 1], [0, 1], [1, 1], [1, 2]];
  expected.forEach(([home, away], index) => assert.deepEqual(engine.scoreForEvents(fixture, events.slice(0, index)), { home, away }));
});

test("opponent possession has a visual actor and ball follows that marker", () => {
  assert.equal(typeof engine.matchVisualState, "function");
  assert.equal(typeof engine.pitchPoint, "function");
  const season = createSeason();
  for (const fixture of [{ home: "team-0", away: "team-1" }, { home: "team-1", away: "team-0" }]) {
    const events = createMatchEvents(season, fixture, { home: 2, away: 2 }, () => 0.5);
    for (const event of events.filter((item) => item.teamId === "team-1" && item.zone !== "center")) {
      assert.equal(event.playerId, null);
      assert.ok(Number.isInteger(event.visualSlot));
      const state = engine.matchVisualState(season, fixture, event);
      const actor = state.players.find((player) => player.teamId === event.teamId && player.slot === event.visualSlot);
      assert.ok(actor);
      assert.deepEqual(state.ball, { x: actor.x, y: actor.y });
    }
  }
  assert.deepEqual(engine.pitchPoint({ x: 50, y: 50 }, 800, 360), { x: 400, y: 180 });
});

test("visual transitions preserve prior state, move defenders, and keep goalkeepers in their own box", () => {
  assert.equal(typeof engine.matchVisualState, "function");
  assert.equal(typeof engine.interpolateMatchState, "function");
  const season = createSeason();
  const fixture = { home: "team-0", away: "team-1" };
  const initial = engine.matchVisualState(season, fixture, { type: "kickoff" });
  const attack = engine.matchVisualState(season, fixture, { type: "shot", teamId: "team-0", playerId: "player-8", zone: "box" });
  const counter = engine.matchVisualState(season, fixture, { type: "pass", teamId: "team-1", visualSlot: 8, zone: "counter" });
  assert.deepEqual(engine.interpolateMatchState(attack, counter, 0), attack);
  assert.deepEqual(engine.interpolateMatchState(attack, counter, 1), counter);
  const halfway = engine.interpolateMatchState(attack, counter, 0.5);
  assert.equal(halfway.players[8].x, (attack.players[8].x + counter.players[8].x) / 2);
  assert.notDeepEqual(attack.players[12], initial.players[12]);
  assert.notEqual(attack.players[1].x - initial.players[1].x, attack.players[8].x - initial.players[8].x);
  const flank = engine.matchVisualState(season, fixture, { type: "dribble", teamId: "team-0", playerId: "player-8", zone: "flank" });
  assert.equal(flank.players[2].y, initial.players[2].y, "center-backs retain their central lane");
  assert.ok(flank.players[1].y < initial.players[1].y, "fullbacks widen on flank attacks");
  for (const formation of Object.keys(FORMATIONS)) {
    season.formation = formation;
    season.customPositions = {};
    for (const state of [attack, counter, halfway, ...createMatchEvents(season, fixture, { home: 5, away: 5 }, () => 0.5).map((event) => engine.matchVisualState(season, fixture, event))]) {
      assert.equal(state.players.length, 22);
      for (const player of state.players) {
        assert.ok(player.x >= 0 && player.x <= 100 && player.y >= 0 && player.y <= 100);
        if (player.role === "GK") assert.ok((player.teamId === fixture.home ? player.x <= 18 : player.x >= 82) && player.y >= 21 && player.y <= 79);
      }
    }
  }
});

test("out-of-position placement lowers the same strength used by simulation", () => {
  assert.equal(typeof engine.formationSuitability, "function");
  assert.equal(typeof engine.teamStrength, "function");
  const season = createSeason();
  assert.equal(engine.formationSuitability(season).penalty, 0);
  const moved = movePlayer(season, "player-1", 95, 18);
  const suitability = engine.formationSuitability(moved);
  assert.ok(suitability.warnings.some(({ playerId }) => playerId === "player-1"));
  assert.ok(suitability.penalty > 0);
  assert.ok(Math.abs(engine.teamStrength(season, "team-0") - engine.teamStrength(moved, "team-0") - suitability.penalty) < 1e-10);
  assert.equal(engine.teamStrength(season, "team-1"), engine.teamStrength(moved, "team-1"));
  const fixture = season.fixtures[0][0];
  const displaced = season.players.filter(({ starter, position }) => starter && position !== "GK").reduce((next, player) => movePlayer(next, player.id, player.position === "FW" ? 0 : 100, 50), season);
  const normal = engine.simulateFixture(season, fixture, () => 0.5);
  const weakened = engine.simulateFixture(displaced, fixture, () => 0.5);
  assert.equal(normal.home, 1);
  assert.equal(weakened.home, 0);
});

test("timeline covers match phases and applicable commentary without inventing goals", () => {
  const season = createSeason();
  season.tactic = "attacking";
  const events = createMatchEvents(season, season.fixtures[0][0], { home: 0, away: 0 }, () => 0.5);
  for (const type of ["half-time", "second-half-kickoff", "interception", "cross", "caution", "substitution", "tactical-effect", "key-pass"]) {
    const event = events.find((item) => item.type === type);
    assert.ok(event, type);
    assert.doesNotMatch(commentate(event, season), /경기가 계속됩니다/);
    assert.notEqual(commentate({ ...event, variant: 0 }, season), commentate({ ...event, variant: 1 }, season));
  }
  assert.equal(events.filter(({ type }) => type === "goal").length, 0);
  assert.ok(events.findIndex(({ type }) => type === "half-time") < events.findIndex(({ type }) => type === "second-half-kickoff"));
});

test("a named pass receiver is a different current starter from the passer", () => {
  const season = createSeason();
  const fixture = { home: "team-0", away: "team-1" };
  const pass = createMatchEvents(season, fixture, { home: 0, away: 0 }, () => 0.5).find(({ type }) => type === "key-pass");
  assert.notEqual(pass.playerId, pass.targetPlayerId);
  assert.ok(season.players.some(({ id, starter }) => id === pass.targetPlayerId && starter));
});

test("commentary names the event player", () => {
  const season = createSeason();
  const text = commentate({ minute: 9, type: "shot", teamId: "team-0", playerId: "player-8", outcome: "saved", zone: "box" }, season);
  assert.match(text, /임성민/);
  assert.match(text, /슈팅|선방/);
});

test("opponent events never borrow a user player identity", () => {
  const season = createSeason();
  const fixture = season.fixtures[0][0];
  const events = createMatchEvents(season, fixture, { home: 0, away: 0 }, () => 0.5);
  const opponentEvent = events.find(({ teamId }) => teamId !== "team-0" && teamId);
  assert.equal(opponentEvent.playerId, null);
  assert.doesNotMatch(commentate(opponentEvent, season), /임성민|강민준|윤태호/);
});

test("every formation assigns each current starter exactly once", () => {
  const season = createSeason();
  const substitute = season.players.find(({ starter, position }) => !starter && position !== "GK");
  const next = swapStarter(season, substitute.id);
  const starterIds = next.players.filter(({ starter }) => starter).map(({ id }) => id).sort();
  for (const formation of Object.keys(FORMATIONS)) {
    next.formation = formation;
    next.customPositions = Object.fromEntries(formationPositions(formation).map((position) => [position.playerId, position]));
    const positions = lineupPositions(next);
    const assignedIds = positions.map(({ playerId }) => playerId);
    assert.equal(positions.length, 11, formation);
    assert.equal(new Set(assignedIds).size, 11, formation);
    assert.deepEqual([...assignedIds].sort(), starterIds, formation);
  }
});

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
  const benchPlayer = season.players.find(
    (player) => !player.starter && player.position !== "GK",
  );
  const next = swapStarter(season, benchPlayer.id);
  assert.equal(next.players.filter((player) => player.starter).length, 11);
  assert.equal(
    next.players.find((player) => player.id === benchPlayer.id).starter,
    true,
  );
});

test("a completed round cannot be awarded twice", () => {
  const season = createSeason();
  const first = completeRound(season, () => 0.5);
  const second = completeRound(first.season, () => 0.5, 0);
  assert.equal(second.season.round, 1);
  assert.equal(second.alreadyCompleted, true);
});

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

test("player movement keeps non-finite coordinates legal", () => {
  const season = createSeason();
  const fieldPlayer = movePlayer(season, "player-1", Number.NaN, undefined);
  const goalkeeper = movePlayer(season, "player-0", Number.NaN, Infinity);
  assert.deepEqual(fieldPlayer.customPositions["player-1"], season.customPositions["player-1"]);
  assert.deepEqual(goalkeeper.customPositions["player-0"], season.customPositions["player-0"]);
});

test("version one saves migrate to version two with a formation", () => {
  const old = createSeason();
  old.version = 1;
  delete old.formation;
  delete old.customPositions;
  old.round = 1;
  old.completedRoundIds = [0];
  old.fixtures[0][0].result = { home: 2, away: 1, events: [{ minute: 90, type: "full-time" }] };
  const next = migrateSeason(old);
  assert.equal(next.version, 2);
  assert.equal(next.formation, "4-3-3");
  assert.equal(Object.keys(next.customPositions).length, 11);
  assert.equal(next.round, 1);
  assert.deepEqual(next.completedRoundIds, [0]);
  assert.deepEqual(next.fixtures, old.fixtures);
  assert.equal(old.version, 1);
});
