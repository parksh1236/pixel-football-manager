import test from "node:test";
import assert from "node:assert/strict";
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
  const next = migrateSeason(old);
  assert.equal(next.version, 2);
  assert.equal(next.formation, "4-3-3");
  assert.equal(Object.keys(next.customPositions).length, 11);
});
