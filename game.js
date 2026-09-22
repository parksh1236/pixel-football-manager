const TEAM_NAMES = [
  "서울 네온 FC",
  "부산 파도",
  "인천 코멧",
  "대전 볼트",
  "광주 타이거",
  "대구 포지",
  "수원 캐슬",
  "제주 윈드",
];

const PLAYER_NAMES = [
  "강민준", "윤태호", "김도윤", "박시우", "이현우", "최준서",
  "정우진", "한지호", "임성민", "오재원", "서지훈", "조유찬",
  "백승호", "문하준", "신태윤", "권민재", "노준혁", "장시온",
];

const POSITIONS = [
  "GK", "DF", "DF", "DF", "DF", "MF", "MF", "MF", "FW", "FW", "FW",
  "GK", "DF", "DF", "MF", "MF", "FW", "FW",
];

const groupFor = (position) => (position === "GK" ? "GK" : position);
const clone = (value) => structuredClone(value);

export function createSchedule(teamIds) {
  const rotation = [...teamIds];
  const firstLeg = [];

  for (let round = 0; round < teamIds.length - 1; round += 1) {
    const fixtures = [];
    for (let index = 0; index < rotation.length / 2; index += 1) {
      const home = rotation[index];
      const away = rotation[rotation.length - 1 - index];
      fixtures.push({
        id: `${round}-${index}`,
        round,
        home: round % 2 === 0 ? home : away,
        away: round % 2 === 0 ? away : home,
        result: null,
      });
    }
    firstLeg.push(fixtures);
    rotation.splice(1, 0, rotation.pop());
  }

  const secondLeg = firstLeg.map((fixtures, offset) =>
    fixtures.map((fixture, index) => ({
      ...fixture,
      id: `${offset + firstLeg.length}-${index}`,
      round: offset + firstLeg.length,
      home: fixture.away,
      away: fixture.home,
      result: null,
    })),
  );

  return [...firstLeg, ...secondLeg];
}

export function createSeason() {
  const teams = TEAM_NAMES.map((name, index) => ({
    id: `team-${index}`,
    name,
    short: name.split(" ").at(-1).slice(0, 3),
    rating: 66 + ((index * 7) % 13),
    color: ["#44d17a", "#38bdf8", "#fb7185", "#fbbf24", "#a78bfa", "#fb923c", "#e2e8f0", "#2dd4bf"][index],
  }));
  const players = PLAYER_NAMES.map((name, index) => ({
    id: `player-${index}`,
    name,
    position: POSITIONS[index],
    rating: 63 + ((index * 5) % 18),
    condition: 82 + ((index * 3) % 17),
    starter: index < 11,
  }));

  return {
    version: 1,
    round: 0,
    tactic: "balanced",
    teams,
    players,
    fixtures: createSchedule(teams.map(({ id }) => id)),
    completedRoundIds: [],
  };
}

export function calculateTable(season) {
  const rows = season.teams.map((team) => ({
    teamId: team.id,
    name: team.name,
    color: team.color,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points: 0,
  }));
  const byId = new Map(rows.map((row) => [row.teamId, row]));

  for (const fixture of season.fixtures.flat()) {
    if (!fixture.result) continue;
    const home = byId.get(fixture.home);
    const away = byId.get(fixture.away);
    home.played += 1;
    away.played += 1;
    home.goalsFor += fixture.result.home;
    home.goalsAgainst += fixture.result.away;
    away.goalsFor += fixture.result.away;
    away.goalsAgainst += fixture.result.home;
    if (fixture.result.home > fixture.result.away) {
      home.won += 1;
      away.lost += 1;
      home.points += 3;
    } else if (fixture.result.home < fixture.result.away) {
      away.won += 1;
      home.lost += 1;
      away.points += 3;
    } else {
      home.drawn += 1;
      away.drawn += 1;
      home.points += 1;
      away.points += 1;
    }
  }

  for (const row of rows) row.goalDifference = row.goalsFor - row.goalsAgainst;
  return rows.sort(
    (a, b) => b.points - a.points
      || b.goalDifference - a.goalDifference
      || b.goalsFor - a.goalsFor
      || a.name.localeCompare(b.name, "ko"),
  );
}

export function swapStarter(season, playerId) {
  const next = clone(season);
  const incoming = next.players.find((player) => player.id === playerId);
  if (!incoming || incoming.starter) return next;
  const outgoing = next.players
    .filter((player) => player.starter && groupFor(player.position) === groupFor(incoming.position))
    .sort((a, b) => a.rating - b.rating)[0];
  if (!outgoing) return next;
  outgoing.starter = false;
  incoming.starter = true;
  return next;
}

function poisson(lambda, random) {
  const limit = Math.exp(-lambda);
  let product = 1;
  let value = 0;
  do {
    value += 1;
    product *= random();
  } while (product > limit && value < 6);
  return Math.min(5, value - 1);
}

export function simulateFixture(season, fixture, random = Math.random) {
  const userHome = fixture.home === "team-0";
  const userAway = fixture.away === "team-0";
  const teamStrength = (teamId) => {
    const team = season.teams.find(({ id }) => id === teamId);
    if (teamId !== "team-0") return team.rating;
    const starters = season.players.filter(({ starter }) => starter);
    return starters.reduce((sum, player) => sum + player.rating * player.condition / 100, 0) / starters.length;
  };
  const tactic = season.tactic === "attacking" ? 0.25 : season.tactic === "defensive" ? -0.2 : 0;
  const homeAttack = 1.2 + (teamStrength(fixture.home) - teamStrength(fixture.away)) / 24
    + (userHome ? tactic : userAway ? -tactic : 0);
  const awayAttack = 0.95 + (teamStrength(fixture.away) - teamStrength(fixture.home)) / 24
    + (userAway ? tactic : userHome ? -tactic : 0);
  const home = poisson(Math.max(0.2, homeAttack), random);
  const away = poisson(Math.max(0.2, awayAttack), random);
  const events = [];
  const addGoals = (count, side) => {
    for (let index = 0; index < count; index += 1) {
      events.push({ minute: 4 + Math.floor(random() * 86), side, type: "goal" });
    }
  };
  addGoals(home, "home");
  addGoals(away, "away");
  events.sort((a, b) => a.minute - b.minute);
  return { home, away, events };
}

export function completeRound(season, random = Math.random, roundIndex = season.round) {
  if (season.completedRoundIds.includes(roundIndex) || roundIndex >= season.fixtures.length) {
    return { season: clone(season), alreadyCompleted: true, userResult: null };
  }
  const next = clone(season);
  let userResult = null;
  for (const fixture of next.fixtures[roundIndex]) {
    fixture.result = simulateFixture(next, fixture, random);
    if (fixture.home === "team-0" || fixture.away === "team-0") userResult = fixture.result;
  }
  next.completedRoundIds.push(roundIndex);
  next.round = Math.max(next.round, roundIndex + 1);
  next.players.forEach((player) => {
    player.condition = Math.max(68, Math.min(100, player.condition + (player.starter ? -2 : 2)));
  });
  return { season: next, alreadyCompleted: false, userResult };
}
