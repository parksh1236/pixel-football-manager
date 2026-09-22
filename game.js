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

const FOUR_THREE_THREE = [
  [8, 50, "GK"], [26, 18, "RB"], [24, 39, "RCB"], [24, 61, "LCB"], [26, 82, "LB"],
  [52, 24, "RCM"], [50, 50, "CM"], [52, 76, "LCM"], [78, 20, "RW"], [82, 50, "ST"], [78, 80, "LW"],
];
const FOUR_TWO_THREE_ONE = [
  [8, 50, "GK"], [26, 18, "RB"], [24, 39, "RCB"], [24, 61, "LCB"], [26, 82, "LB"],
  [45, 35, "RDM"], [45, 65, "LDM"], [66, 20, "RW"], [68, 50, "CAM"], [66, 80, "LW"], [84, 50, "ST"],
];
const THREE_FIVE_TWO = [
  [8, 50, "GK"], [25, 28, "RCB"], [22, 50, "CB"], [25, 72, "LCB"], [50, 15, "RWB"],
  [48, 35, "RCM"], [50, 50, "CM"], [48, 65, "LCM"], [50, 85, "LWB"], [78, 35, "RS"], [78, 65, "LS"],
];
const FOUR_FOUR_TWO = [
  [8, 50, "GK"], [26, 18, "RB"], [24, 39, "RCB"], [24, 61, "LCB"], [26, 82, "LB"],
  [52, 18, "RM"], [48, 40, "RCM"], [48, 60, "LCM"], [52, 82, "LM"], [78, 38, "RS"], [78, 62, "LS"],
];
const FIVE_THREE_TWO = [
  [8, 50, "GK"], [28, 12, "RWB"], [24, 30, "RCB"], [22, 50, "CB"], [24, 70, "LCB"],
  [28, 88, "LWB"], [52, 30, "RCM"], [50, 50, "CM"], [52, 70, "LCM"], [78, 38, "RS"], [78, 62, "LS"],
];

const positionSet = (positions) => positions.map(([x, y, role], index) => ({
  playerId: `player-${index}`,
  x,
  y,
  role,
}));

export const FORMATIONS = {
  "4-3-3": positionSet(FOUR_THREE_THREE),
  "4-2-3-1": positionSet(FOUR_TWO_THREE_ONE),
  "3-5-2": positionSet(THREE_FIVE_TWO),
  "4-4-2": positionSet(FOUR_FOUR_TWO),
  "5-3-2": positionSet(FIVE_THREE_TWO),
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value)));
const validCoordinate = (value) => Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 100;
const finiteCoordinate = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function formationPositions(name) {
  return clone(FORMATIONS[name] || FORMATIONS["4-3-3"]);
}

const defaultCustomPositions = (formation) => Object.fromEntries(
  formationPositions(formation).map((position) => [position.playerId, position]),
);

function legalPosition(playerId, x, y, role, fallback = { x: 0, y: 0 }) {
  const safeX = finiteCoordinate(x, fallback.x);
  const safeY = finiteCoordinate(y, fallback.y);
  const position = { playerId, x: clamp(safeX, 0, 100), y: clamp(safeY, 0, 100), role };
  if (playerId === "player-0") {
    position.x = clamp(safeX, 0, 18);
    position.y = clamp(safeY, 21, 79);
  }
  return position;
}

export function movePlayer(season, playerId, x, y) {
  const next = migrateSeason(season);
  const current = next.customPositions[playerId];
  if (!current) return next;
  next.customPositions[playerId] = legalPosition(playerId, x, y, current.role, current);
  return next;
}

const roleGroup = (role) => role === "GK" ? "GK" : role.includes("B") ? "DF" : role.includes("M") ? "MF" : "FW";

export function lineupPositions(season) {
  const slots = formationPositions(season.formation).map((slot) => season.customPositions?.[slot.playerId] || slot);
  const unused = season.players.filter(({ starter }) => starter);
  const assignments = new Map();
  const ordered = [...slots].sort((a, b) => Number(a.role.includes("WB")) - Number(b.role.includes("WB")));
  for (const slot of ordered) {
    const groups = slot.role.includes("WB") ? ["DF", "MF"] : [roleGroup(slot.role)];
    let index = unused.findIndex(({ position }) => groups.includes(groupFor(position)));
    if (index < 0) index = 0;
    assignments.set(slot.playerId, unused.splice(index, 1)[0]?.id || slot.playerId);
  }
  return slots.map((slot) => ({ ...slot, playerId: assignments.get(slot.playerId) }));
}

export function migrateSeason(value) {
  const next = clone(value);
  const formation = FORMATIONS[next.formation] ? next.formation : "4-3-3";
  const defaults = defaultCustomPositions(formation);
  const saved = next.customPositions || {};
  next.version = 2;
  next.formation = formation;
  next.customPositions = Object.fromEntries(Object.entries(defaults).map(([playerId, fallback]) => {
    const position = saved[playerId];
    const valid = position && validCoordinate(position.x) && validCoordinate(position.y)
      && (playerId !== "player-0" || (Number(position.x) <= 18 && Number(position.y) >= 21 && Number(position.y) <= 79));
    return [playerId, valid ? legalPosition(playerId, position.x, position.y, position.role || fallback.role) : fallback];
  }));
  return next;
}

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
    version: 2,
    round: 0,
    tactic: "balanced",
    formation: "4-3-3",
    customPositions: defaultCustomPositions("4-3-3"),
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

const eventPlayer = (season, teamId, random, attacking = true) => {
  if (teamId !== "team-0") return null;
  const pool = season.players.filter(({ starter, position }) => starter && (attacking ? position !== "GK" : position === "GK"));
  return pool[Math.floor(random() * pool.length)]?.id || (attacking ? "player-8" : "player-0");
};

export function createMatchEvents(season, fixture, result, random = Math.random) {
  const events = [
    { minute: 0, type: "kickoff", teamId: fixture.home, playerId: null, targetPlayerId: null, outcome: "started", zone: "center" },
    { minute: 5, type: "build-up", teamId: fixture.home, playerId: eventPlayer(season, fixture.home, random), targetPlayerId: null, outcome: "progressed", zone: "defense" },
    { minute: 12, type: "pressure", teamId: fixture.away, playerId: eventPlayer(season, fixture.away, random), targetPlayerId: null, outcome: "won", zone: "midfield" },
    { minute: 19, type: "dribble", teamId: fixture.home, playerId: eventPlayer(season, fixture.home, random), targetPlayerId: null, outcome: "completed", zone: "flank" },
    { minute: 27, type: "pass", teamId: fixture.away, playerId: eventPlayer(season, fixture.away, random), targetPlayerId: eventPlayer(season, fixture.away, random), outcome: "completed", zone: "counter" },
    { minute: 34, type: "shot", teamId: fixture.home, playerId: eventPlayer(season, fixture.home, random), targetPlayerId: null, outcome: "saved", zone: "box" },
    { minute: 34, type: "save", teamId: fixture.away, playerId: eventPlayer(season, fixture.away, random, false), targetPlayerId: null, outcome: "saved", zone: "goal" },
  ];
  const goals = [
    ...Array.from({ length: result.home }, () => fixture.home),
    ...Array.from({ length: result.away }, () => fixture.away),
  ];
  goals.forEach((teamId, index) => {
    const minute = Math.min(89, 10 + Math.floor(((index + 1) * 75) / (goals.length + 1)) + Math.floor(random() * 5));
    const playerId = eventPlayer(season, teamId, random);
    events.push(
      { minute: Math.max(1, minute - 1), type: "shot", teamId, playerId, targetPlayerId: null, outcome: "goal", zone: "box" },
      { minute, type: "goal", teamId, playerId, targetPlayerId: null, outcome: "scored", zone: "goal" },
    );
  });
  events.push({ minute: 90, type: "full-time", teamId: null, playerId: null, targetPlayerId: null, outcome: "finished", zone: "center" });
  return events.sort((a, b) => a.minute - b.minute);
}

export function commentate(event, season) {
  const player = season.players.find(({ id }) => id === event.playerId)?.name || "상대 선수";
  const target = season.players.find(({ id }) => id === event.targetPlayerId)?.name || "동료";
  const prefix = `${event.minute}'`;
  const lines = {
    kickoff: `${prefix} 킥오프! 경기가 시작됩니다.`,
    "build-up": `${prefix} ${player}, 후방에서 차분히 공격을 전개합니다.`,
    pressure: `${prefix} ${player}의 강한 압박!`,
    dribble: `${prefix} ${player}, 측면을 따라 드리블합니다.`,
    pass: `${prefix} ${player}가 ${target}에게 패스합니다.`,
    shot: `${prefix} ${player}의 슈팅${event.outcome === "saved" ? ", 골키퍼가 선방합니다!" : "!"}`,
    save: `${prefix} ${player}의 멋진 선방!`,
    goal: `${prefix} 골! ${player}가 마무리합니다.`,
    "full-time": `${prefix} 경기 종료.`,
  };
  return lines[event.type] || `${prefix} 경기가 계속됩니다.`;
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
  const events = createMatchEvents(season, fixture, { home, away }, random);
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
