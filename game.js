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

export function formationSuitability(season) {
  // ponytail: broad position bands; add detailed role ratings only if tactics need them.
  const bands = { GK: [0, 18], DF: [0, 60], MF: [25, 80], FW: [45, 100] };
  const warnings = lineupPositions(season).flatMap((slot) => {
    const player = season.players.find(({ id }) => id === slot.playerId);
    const [min, max] = bands[player.position];
    const mismatch = roleGroup(slot.role) !== player.position && !(slot.role.includes("WB") && player.position === "MF");
    const penalty = (mismatch ? 3 : 0) + Math.max(0, min - slot.x, slot.x - max) / 10;
    return penalty ? [{ playerId: player.id, name: player.name, penalty }] : [];
  });
  return { warnings, penalty: warnings.reduce((sum, item) => sum + item.penalty, 0) / 11 };
}

export function teamStrength(season, teamId) {
  if (teamId !== "team-0") return season.teams.find(({ id }) => id === teamId).rating;
  const starters = season.players.filter(({ starter }) => starter);
  return starters.reduce((sum, player) => sum + player.rating * player.condition / 100, 0) / starters.length
    - formationSuitability(season).penalty;
}

export function scoreForEvents(fixture, events) {
  const score = { home: 0, away: 0 };
  for (const event of events) {
    if (event.type !== "goal") continue;
    if (event.teamId === fixture.home) score.home += 1;
    else if (event.teamId === fixture.away) score.away += 1;
  }
  return score;
}

export function matchVisualState(season, fixture, event = { type: "kickoff" }) {
  const resting = ["kickoff", "half-time", "second-half-kickoff", "full-time", "caution", "substitution", "tactical-effect"].includes(event.type);
  const players = [fixture.home, fixture.away].flatMap((teamId) => {
    const home = teamId === fixture.home;
    const positions = teamId === "team-0" ? lineupPositions(season) : formationPositions("4-3-3");
    return positions.map((position, slot) => {
      const group = roleGroup(position.role);
      const attacking = event.teamId === teamId;
      const actor = attacking && (teamId === "team-0" ? event.playerId === position.playerId : event.visualSlot === slot);
      const danger = ["box", "goal", "counter"].includes(event.zone);
      let { x, y } = position;
      if (!resting) {
        const advance = group === "GK" ? 2 : group === "DF" ? 8 : group === "MF" ? 14 : 20;
        x += attacking ? advance * (danger ? 1.3 : 0.7) : -(group === "FW" ? 14 : 8);
        if (!attacking) y += (50 - y) * 0.2;
        if (attacking && event.zone === "flank" && /W|^[RL]B$/.test(position.role)) y += y < 50 ? -10 : 10;
        if (actor && danger && group !== "GK") x = event.zone === "counter" ? 80 : 90;
      }
      x = clamp(x, group === "GK" ? 0 : 4, group === "GK" ? 18 : 96);
      y = clamp(y, group === "GK" ? 21 : 5, group === "GK" ? 79 : 95);
      return { ...position, slot, teamId, x: home ? x : 100 - x, y: home ? y : 100 - y };
    });
  });
  const actor = !resting && players.find((player) => player.teamId === event.teamId
    && (event.teamId === "team-0" ? player.playerId === event.playerId : player.slot === event.visualSlot));
  return { players, ball: actor ? { x: actor.x, y: actor.y } : { x: 50, y: 50 } };
}

export function interpolateMatchState(previous, next, progress) {
  const blend = (from, to) => ({ ...to, x: from.x + (to.x - from.x) * progress, y: from.y + (to.y - from.y) * progress });
  return { players: next.players.map((player, index) => blend(previous.players[index], player)), ball: blend(previous.ball, next.ball) };
}

export function pitchPoint(position, width, height) {
  return { x: 18 + (width - 36) * position.x / 100, y: 18 + (height - 36) * position.y / 100 };
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
    { minute: 22, type: "cross", teamId: fixture.home, playerId: eventPlayer(season, fixture.home, random), targetPlayerId: null, outcome: "delivered", zone: "flank" },
    { minute: 23, type: "interception", teamId: fixture.away, playerId: eventPlayer(season, fixture.away, random), targetPlayerId: null, outcome: "won", zone: "defense" },
    { minute: 45, type: "half-time", teamId: null, playerId: null, targetPlayerId: null, outcome: "interval", zone: "center" },
    { minute: 46, type: "second-half-kickoff", teamId: fixture.away, playerId: null, targetPlayerId: null, outcome: "started", zone: "center" },
    { minute: 55, type: "key-pass", teamId: fixture.home, playerId: eventPlayer(season, fixture.home, random), targetPlayerId: eventPlayer(season, fixture.home, random), outcome: "completed", zone: "counter" },
    { minute: 60, type: "caution", teamId: fixture.away, playerId: eventPlayer(season, fixture.away, random), targetPlayerId: null, outcome: "yellow", zone: "midfield" },
    { minute: 65, type: "substitution", teamId: fixture.home === "team-0" ? fixture.away : fixture.home, playerId: null, targetPlayerId: null, outcome: "replaced", zone: "center" },
  ];
  if (fixture.home === "team-0" || fixture.away === "team-0") events.push({
    minute: 50, type: "tactical-effect", teamId: "team-0", playerId: null, targetPlayerId: null, outcome: season.tactic, zone: "center",
  });
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
  for (const event of events) {
    if (event.playerId && event.targetPlayerId === event.playerId) {
      event.targetPlayerId = season.players.find(({ id, starter, position }) => starter && position !== "GK" && id !== event.playerId)?.id || null;
    }
  }
  const phaseOrder = (event) => event.type === "half-time" ? 1 : event.type === "second-half-kickoff" ? -1 : 0;
  return events.sort((a, b) => a.minute - b.minute || phaseOrder(a) - phaseOrder(b)).map((event, index) => ({
    ...event,
    visualSlot: event.teamId && event.teamId !== "team-0" ? (event.type === "save" ? 0 : 1 + Math.floor(random() * 10)) : null,
    variant: index % 2,
  }));
}

export function commentate(event, season) {
  const player = season.players.find(({ id }) => id === event.playerId)?.name || "상대 선수";
  const target = season.players.find(({ id }) => id === event.targetPlayerId)?.name || "동료";
  const prefix = `${event.minute}'`;
  const tactic = { attacking: "공격형 전술로 전방에 힘을 싣습니다", defensive: "수비형 전술로 수비를 보강합니다", balanced: "균형형 전술로 공수 간격을 유지합니다" }[event.outcome] || "대형을 정비합니다";
  const lines = {
    kickoff: ["킥오프! 경기가 시작됩니다.", "주심의 휘슬과 함께 경기 시작!"],
    "half-time": ["전반 종료. 하프타임입니다.", "하프타임! 선수들이 휴식에 들어갑니다."],
    "second-half-kickoff": ["후반 킥오프! 경기가 다시 시작됩니다.", "후반전 시작! 다시 공이 움직입니다."],
    "build-up": [`${player}, 후방에서 차분히 공격을 전개합니다.`, `${player}, 빌드업으로 전진합니다.`],
    pressure: [`${player}의 강한 압박!`, `${player}, 간격을 좁히며 압박합니다.`],
    interception: [`${player}, 패스를 차단합니다!`, `${player}의 패스 차단으로 소유권이 바뀝니다.`],
    dribble: [`${player}, 측면을 따라 드리블합니다.`, `${player}, 드리블로 측면을 파고듭니다.`],
    cross: [`${player}, 측면에서 크로스를 올립니다.`, `${player}의 크로스가 문전으로 향합니다.`],
    pass: [`${player}가 ${target}에게 패스합니다.`, `${player}, ${target}에게 공을 연결합니다.`],
    "key-pass": [`${player}, ${target}에게 날카로운 킬패스!`, `${player}의 창의적인 패스가 ${target}에게 연결됩니다.`],
    shot: [`${player}의 슈팅!`, `${player}, 골문을 향해 슈팅합니다!`],
    save: [`${player}의 멋진 선방!`, `${player}, 슈팅을 막아냅니다!`],
    goal: [`골! ${player}가 마무리합니다.`, `${player}의 득점! 골망이 흔들립니다.`],
    caution: [`${player}, 옐로카드를 받습니다.`, `주심이 ${player}에게 경고를 줍니다.`],
    substitution: ["상대 팀이 선수를 교체합니다.", "상대 팀 교체, 새 선수가 투입됩니다."],
    "tactical-effect": [`우리 팀, ${tactic}.`, `전술 지시: ${tactic}.`],
    "full-time": ["경기 종료.", "마지막 휘슬! 경기가 끝났습니다."],
  };
  return `${prefix} ${lines[event.type]?.[(event.variant || 0) % 2] || "경기가 계속됩니다."}`;
}

export function simulateFixture(season, fixture, random = Math.random) {
  const userHome = fixture.home === "team-0";
  const userAway = fixture.away === "team-0";
  const homeStrength = teamStrength(season, fixture.home);
  const awayStrength = teamStrength(season, fixture.away);
  const tactic = season.tactic === "attacking" ? 0.25 : season.tactic === "defensive" ? -0.2 : 0;
  const homeAttack = 1.2 + (homeStrength - awayStrength) / 24
    + (userHome ? tactic : userAway ? -tactic : 0);
  const awayAttack = 0.95 + (awayStrength - homeStrength) / 24
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
