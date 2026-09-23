import { commentate, completeRound } from "./game.js";

const POSITIONS = ["GK", "RB", "CB", "LB", "DM", "CM", "AM", "RW", "LW", "ST"];

const archetype = (label, description, attributes) => Object.freeze({
  label,
  description,
  attributes: Object.freeze(attributes),
});

export const ARCHETYPES = Object.freeze({
  playmaker: archetype("플레이메이커", "시야와 패스로 공격을 설계합니다.", {
    pace: 10, finishing: 9, passing: 15, dribbling: 12, vision: 15, flair: 14,
    tackling: 8, marking: 7, strength: 8, stamina: 11, heading: 7, reflexes: 6,
  }),
  scorer: archetype("득점원", "침착한 마무리와 움직임으로 득점을 노립니다.", {
    pace: 13, finishing: 16, passing: 9, dribbling: 12, vision: 9, flair: 11,
    tackling: 6, marking: 5, strength: 12, stamina: 11, heading: 13, reflexes: 5,
  }),
  winger: archetype("윙어", "속도와 드리블로 측면을 돌파합니다.", {
    pace: 16, finishing: 11, passing: 11, dribbling: 15, vision: 10, flair: 14,
    tackling: 7, marking: 6, strength: 8, stamina: 13, heading: 6, reflexes: 5,
  }),
  "box-to-box": archetype("박스투박스", "왕성한 활동량으로 공수에 기여합니다.", {
    pace: 12, finishing: 10, passing: 12, dribbling: 10, vision: 11, flair: 9,
    tackling: 12, marking: 11, strength: 12, stamina: 16, heading: 10, reflexes: 5,
  }),
  defender: archetype("수비 전문가", "대인 수비와 제공권으로 위험을 차단합니다.", {
    pace: 10, finishing: 5, passing: 9, dribbling: 6, vision: 8, flair: 5,
    tackling: 16, marking: 16, strength: 15, stamina: 12, heading: 15, reflexes: 5,
  }),
  goalkeeper: archetype("골키퍼", "반사 신경과 집중력으로 골문을 지킵니다.", {
    pace: 6, finishing: 5, passing: 9, dribbling: 6, vision: 10, flair: 5,
    tackling: 7, marking: 6, strength: 11, stamina: 9, heading: 7, reflexes: 17,
  }),
});

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const total = (values) => values.reduce((sum, value) => sum + value, 0);

export function validatePlayerIdentity(draft) {
  const errors = [];
  if (!isRecord(draft)) return { ok: false, errors: ["선수 정보가 필요합니다."] };

  const name = typeof draft.name === "string" ? draft.name.trim() : "";
  const nationality = typeof draft.nationality === "string" ? draft.nationality.trim() : "";
  if (name.length < 2 || name.length > 30) errors.push("이름은 2~30자로 입력하세요.");
  if (nationality.length < 2 || nationality.length > 30) errors.push("국가는 2~30자로 입력하세요.");
  if (!Number.isInteger(draft.age) || draft.age < 16 || draft.age > 25) errors.push("나이는 16~25세여야 합니다.");
  if (!Number.isInteger(draft.height) || draft.height < 150 || draft.height > 210) errors.push("키는 150~210cm여야 합니다.");
  if (!['left', 'right'].includes(draft.foot)) errors.push("주발을 선택하세요.");
  if (typeof draft.appearance !== "string" || !draft.appearance.trim()) errors.push("외형을 선택하세요.");

  return { ok: errors.length === 0, errors };
}

export function validatePlayerDraft(draft) {
  const identity = validatePlayerIdentity(draft);
  if (!isRecord(draft)) return identity;
  const errors = [...identity.errors];

  if (!POSITIONS.includes(draft.preferredPosition)) errors.push("주 포지션을 선택하세요.");
  const secondary = Array.isArray(draft.secondaryPositions) ? draft.secondaryPositions : [];
  if (!Array.isArray(draft.secondaryPositions) || secondary.length > 2
    || secondary.some((position) => !POSITIONS.includes(position))
    || new Set(secondary).size !== secondary.length
    || secondary.includes(draft.preferredPosition)) {
    errors.push("보조 포지션은 주 포지션과 다른 두 개 이하로 선택하세요.");
  }

  const selectedArchetype = Object.hasOwn(ARCHETYPES, draft.archetype) ? ARCHETYPES[draft.archetype] : null;
  if (!selectedArchetype) errors.push("선수 유형을 선택하세요.");
  const adjustments = isRecord(draft.adjustments) ? draft.adjustments : null;
  if (!adjustments) {
    errors.push("능력치 조정이 필요합니다.");
  } else if (selectedArchetype) {
    const entries = Object.entries(adjustments);
    const values = entries.map(([, value]) => value);
    if (entries.some(([name, value]) => !Object.hasOwn(selectedArchetype.attributes, name) || !Number.isInteger(value))) {
      errors.push("능력치 조정은 알려진 항목의 정수만 사용할 수 있습니다.");
    } else {
      const positive = total(values.filter((value) => value > 0));
      const negative = total(values.filter((value) => value < 0));
      if (positive !== 10 || negative !== -10 || total(values) !== 0) {
        errors.push("10포인트를 더하고 같은 만큼 빼야 합니다.");
      }
      if (Object.entries(selectedArchetype.attributes).some(([name, value]) => {
        const adjusted = value + (adjustments[name] || 0);
        return adjusted < 1 || adjusted > 20;
      })) errors.push("능력치는 1~20 범위여야 합니다.");
    }
  }

  return { ok: errors.length === 0, errors };
}

const emptyStats = () => ({
  appearances: 0,
  starts: 0,
  minutes: 0,
  goals: 0,
  assists: 0,
  cleanSheets: 0,
  yellowCards: 0,
  redCards: 0,
  passesAttempted: 0,
  passesCompleted: 0,
  shots: 0,
  shotsOnTarget: 0,
  tackles: 0,
  interceptions: 0,
  saves: 0,
  averageRating: 0,
});

export function createCareerPlayer(draft) {
  const validation = validatePlayerDraft(draft);
  if (!validation.ok) throw new Error(validation.errors.join(" "));
  const identity = {
    name: draft.name.trim(),
    nationality: draft.nationality.trim(),
    age: draft.age,
    height: draft.height,
    foot: draft.foot,
  };
  const base = ARCHETYPES[draft.archetype].attributes;
  const attributes = Object.fromEntries(Object.entries(base).map(([name, value]) => (
    [name, value + (draft.adjustments[name] || 0)]
  )));
  const overall = Math.round(total(Object.values(attributes)) / Object.keys(attributes).length);
  const secondaryPositions = [...draft.secondaryPositions];

  return {
    ...identity,
    identity,
    appearance: draft.appearance,
    preferredPosition: draft.preferredPosition,
    secondaryPositions,
    positionMastery: Object.fromEntries([
      [draft.preferredPosition, 100],
      ...secondaryPositions.map((position) => [position, 75]),
    ]),
    archetype: draft.archetype,
    attributes,
    overall,
    condition: 100,
    injuryDays: 0,
    potential: Math.min(20, overall + 5),
    value: overall * overall * 100_000,
    wage: overall * 12_000,
    clubId: null,
    contract: { clubId: null, role: null, wage: 0, years: 0 },
    trust: 50,
    training: { experience: 0, recentFocus: [], schedule: [] },
    seasonStats: emptyStats(),
    careerStats: emptyStats(),
  };
}

function isValidPlayerCareerSlot(slot) {
  if (!isRecord(slot) || slot.mode !== "player" || !isRecord(slot.career)) return false;
  if (!Object.hasOwn(slot.career, "player")) return true;
  const player = slot.career.player;
  if (!isRecord(player)
    || typeof player.name !== "string" || !player.name.trim()
    || typeof player.nationality !== "string" || !player.nationality.trim()
    || !Number.isInteger(player.age) || !Number.isInteger(player.height)
    || !["left", "right"].includes(player.foot)
    || typeof player.appearance !== "string" || !player.appearance
    || !POSITIONS.includes(player.preferredPosition)
    || !Array.isArray(player.secondaryPositions)
    || player.secondaryPositions.length > 2
    || player.secondaryPositions.some((position) => !POSITIONS.includes(position))
    || !isRecord(player.positionMastery)
    || !Object.hasOwn(ARCHETYPES, player.archetype)
    || !isRecord(player.attributes)
    || !Number.isInteger(player.overall)
    || !Number.isFinite(player.condition)
    || !Number.isInteger(player.potential)
    || !Number.isFinite(player.value)
    || !Number.isFinite(player.wage) || player.wage <= 0
    || !isRecord(player.contract)
    || typeof player.contract.clubId !== "string"
    || typeof player.contract.role !== "string" || !player.contract.role
    || !Number.isFinite(player.contract.wage) || player.contract.wage <= 0
    || !Number.isInteger(player.contract.years) || player.contract.years <= 0
    || !Number.isFinite(player.trust)
    || !isRecord(player.training)
    || !isRecord(player.seasonStats)
    || !isRecord(player.careerStats)) return false;

  const positions = [player.preferredPosition, ...player.secondaryPositions];
  if (new Set(positions).size !== positions.length
    || positions.some((position) => !Number.isFinite(player.positionMastery[position]))) return false;
  const attributeNames = Object.keys(ARCHETYPES[player.archetype].attributes);
  return Object.keys(player.attributes).length === attributeNames.length
    && attributeNames.every((name) => Object.hasOwn(player.attributes, name)
      && Number.isInteger(player.attributes[name])
      && player.attributes[name] >= 1
      && player.attributes[name] <= 20);
}

export function validatePlayerCareerStore(store) {
  const slotResults = store.slotResults.map((result) => (
    result.ok && result.slot.mode === "player" && !isValidPlayerCareerSlot(result.slot)
      ? { ok: false, index: result.index, error: "선수 저장 정보가 올바르지 않습니다." }
      : result
  ));
  const activeSlotId = slotResults.some((result) => result.ok && result.slot.id === store.activeSlotId)
    ? store.activeSlotId
    : null;
  return { ...store, activeSlotId, slotResults };
}

const teamRating = (team) => Number.isFinite(team.rating) ? team.rating : 70;

function positionSuitability(player, team) {
  const needs = Array.isArray(team.needs) ? team.needs : [];
  if (!needs.length) return 100;
  return Math.max(0, ...needs.map((position) => (
    Object.hasOwn(player.positionMastery, position) ? player.positionMastery[position] : 0
  )));
}

function offerFor(player, team, considerNeeds) {
  const rating = teamRating(team);
  const ability = player.overall * 5 - (considerNeeds ? (100 - positionSuitability(player, team)) / 5 : 0);
  const gap = ability - rating;
  const role = gap >= 5 ? "핵심" : gap >= 0 ? "주전" : gap >= -6 ? "로테이션" : "유망주";
  const roleBonus = { "핵심": 1.5, "주전": 1.25, "로테이션": 1, "유망주": 0.8 }[role];
  return {
    clubId: team.id,
    clubName: team.name || team.id,
    role,
    wage: Math.round((player.wage + rating * 1_000) * roleBonus / 1_000) * 1_000,
    years: gap >= 0 ? 3 : 2,
  };
}

export function createEntryOffers(player, path, teams) {
  const eligibleTeams = Array.isArray(teams)
    ? teams.filter((team) => isRecord(team) && typeof team.id === "string" && Number.isFinite(team.rating ?? 70))
    : [];
  const ranked = [...eligibleTeams].sort((left, right) => (
    Math.abs(teamRating(left) - player.overall * 5) + (path === "trial" ? (100 - positionSuitability(player, left)) / 4 : 0)
      - Math.abs(teamRating(right) - player.overall * 5) - (path === "trial" ? (100 - positionSuitability(player, right)) / 4 : 0)
      || left.id.localeCompare(right.id)
  ));

  if (path === "club-choice") return ranked.slice(0, 1).map((team) => offerFor(player, team, false));
  if (path === "trial") return ranked.slice(0, 3).map((team) => offerFor(player, team, true));
  if (path === "free-agent") {
    const suitable = ranked.filter((team) => teamRating(team) <= player.overall * 5 + 18);
    return (suitable.length ? suitable : ranked.slice(0, 3)).map((team) => offerFor(player, team, false));
  }
  return [];
}

const TRAINING_TYPES = ["technique", "physical", "mental", "position", "recovery", "rest", "match"];
const TRAINING_GOALS = ["technique", "physical", "mental", "position"];
const TRAINING_INTENSITIES = ["low", "normal", "hard"];
const INTENSITY_FACTOR = { low: 0.6, normal: 1, hard: 1.5 };
const TRAINING_ATTRIBUTES = {
  technique: ["finishing", "passing", "dribbling"],
  physical: ["pace", "strength", "stamina", "heading"],
  mental: ["vision", "flair", "marking", "tackling"],
};
const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

export function buildAutoSchedule(player, matchDay, goal, intensity) {
  const safeMatchDay = Number.isInteger(matchDay) && matchDay >= 0 && matchDay < 7 ? matchDay : 5;
  const recoveryDay = (safeMatchDay + 1) % 7;
  const preMatchDay = (safeMatchDay + 6) % 7;
  const safeGoal = TRAINING_GOALS.includes(goal) ? goal : "technique";
  const safeIntensity = TRAINING_INTENSITIES.includes(intensity) ? intensity : "normal";

  return Array.from({ length: 7 }, (_, day) => {
    if (day === safeMatchDay) return { day, type: "match", intensity: "low" };
    if (day === recoveryDay) return { day, type: "recovery", intensity: "low" };
    if (day === preMatchDay || player?.injuryDays > 0) return { day, type: "rest", intensity: "low" };
    return { day, type: safeGoal, intensity: safeIntensity };
  });
}

export function validateSchedule(player, schedule, matchDay) {
  const errors = [];
  const recoveryDay = (matchDay + 1) % 7;
  if (!Number.isInteger(matchDay) || matchDay < 0 || matchDay > 6) errors.push("경기일이 올바르지 않습니다.");
  if (!Array.isArray(schedule) || schedule.length !== 7) {
    errors.push("월요일부터 일요일까지 7일 일정을 채우세요.");
  } else {
    schedule.forEach((session, day) => {
      if (!isRecord(session) || session.day !== day || !TRAINING_TYPES.includes(session.type)
        || !TRAINING_INTENSITIES.includes(session.intensity)) errors.push(`${day + 1}일차 일정이 올바르지 않습니다.`);
    });
    if (schedule[matchDay]?.type !== "match") errors.push("경기일은 변경할 수 없습니다.");
    if (schedule[recoveryDay]?.type !== "recovery") errors.push("경기 다음 날은 회복일입니다.");
    if (player?.injuryDays > 0 && schedule.some((session) => (
      isRecord(session) && TRAINING_GOALS.includes(session.type) && session.intensity === "hard"
    ))) errors.push("부상 중에는 고강도 훈련을 할 수 없습니다.");
  }
  return { ok: errors.length === 0, errors };
}

function focusEfficiency(recentFocus, type) {
  let repeats = 0;
  for (let index = recentFocus.length - 1; index >= 0 && recentFocus[index] === type; index -= 1) repeats += 1;
  return Math.max(0.4, 1 - repeats * 0.2);
}

export function applyTrainingWeek(player, schedule, random = Math.random) {
  const matchDay = Array.isArray(schedule) ? schedule.find((session) => session?.type === "match")?.day : undefined;
  const validation = validateSchedule(player, schedule, matchDay);
  if (!validation.ok) throw new Error(validation.errors.join(" "));

  const attributes = { ...player.attributes };
  const positionMastery = { ...player.positionMastery };
  const recentFocus = [...(player.training?.recentFocus || player.recentTraining || [])].slice(-3);
  const progress = { ...(player.training?.progress || {}) };
  const initialCondition = clamp(player.condition, 0, 100);
  const initialInjuryDays = Math.max(0, player.injuryDays || 0);
  const ageFactor = player.age <= 21 ? 1 : player.age <= 25 ? 0.8 : player.age <= 29 ? 0.6 : 0.4;
  const potentialFactor = clamp((player.potential - player.overall + 4) / 8, 0.35, 1.25);
  const efficiencies = [];
  let condition = initialCondition;
  let experience = player.training?.experience || 0;
  let injuryDays = initialInjuryDays;
  let injuryRisk = 0;
  const preMatchDay = (matchDay + 6) % 7;
  const recoveryDay = (matchDay + 1) % 7;

  for (const session of schedule) {
    const injuredAtStart = injuryDays > 0;
    if (session.type === "rest") {
      condition = clamp(condition + 8, 0, 100);
    } else if (session.type === "recovery") {
      condition = clamp(condition + 14 + (session.day === recoveryDay ? 4 : 0), 0, 100);
    } else if (session.type === "match") {
      condition = clamp(condition - 7, 0, 100);
    } else if (!injuredAtStart || session.intensity !== "hard") {
      const efficiency = focusEfficiency(recentFocus, session.type);
      const intensityFactor = INTENSITY_FACTOR[session.intensity];
      const gained = 6 * intensityFactor * efficiency * ageFactor * potentialFactor;
      efficiencies.push(efficiency);
      experience += gained;
      condition = clamp(condition - ({ low: 2, normal: 5, hard: 9 }[session.intensity]
        + (session.type === "physical" ? 2 : 0)
        + (session.intensity === "hard" && session.day === preMatchDay ? 4 : 0)), 0, 100);

      if (session.type === "position") {
        for (const position of player.secondaryPositions) {
          positionMastery[position] = clamp(positionMastery[position] + 1.5 * intensityFactor * efficiency, 0, 100);
        }
      } else {
        for (const attribute of TRAINING_ATTRIBUTES[session.type]) {
          progress[attribute] = (progress[attribute] || 0) + gained / TRAINING_ATTRIBUTES[session.type].length;
          while (progress[attribute] >= 8 && attributes[attribute] < 20) {
            attributes[attribute] += 1;
            progress[attribute] -= 8;
          }
        }
      }

      recentFocus.push(session.type);
      recentFocus.splice(0, Math.max(0, recentFocus.length - 3));
      if (session.intensity === "hard" && condition < 50) {
        const risk = clamp((50 - condition) / 100 + 0.08, 0, 0.5);
        injuryRisk = Math.max(injuryRisk, risk);
        if (random() < risk) injuryDays = Math.max(injuryDays, 3 + Math.ceil((50 - condition) / 10));
      }
    }
    if (injuredAtStart) injuryDays = Math.max(0, injuryDays - 1);
  }

  const overall = Math.round(total(Object.values(attributes)) / Object.keys(attributes).length);
  const nextPlayer = {
    ...player,
    attributes,
    positionMastery,
    overall,
    value: overall * overall * 100_000,
    condition,
    injuryDays,
    training: { ...player.training, weeks: (player.training?.weeks || 0) + 1, experience, progress, recentFocus, schedule: schedule.map((session) => ({ ...session })) },
  };
  return {
    player: nextPlayer,
    efficiency: efficiencies.length ? total(efficiencies) / efficiencies.length : 1,
    injuryRisk,
    conditionChange: condition - initialCondition,
    growth: Object.fromEntries(Object.keys(attributes).map((name) => [name, attributes[name] - player.attributes[name]])),
  };
}

export function selectPlayerStatus(player, club = {}, random = Math.random) {
  if ((player?.injuryDays || 0) > 0) return "out";
  const mastery = Number(player?.positionMastery?.[player?.preferredPosition]) || 0;
  const score = (Number(player?.overall) || 0) * 3
    + mastery * 0.2
    + clamp(Number(player?.condition) || 0, 0, 100) * 0.25
    + clamp(Number(player?.trust) || 0, 0, 100) * 0.15
    + (random() - 0.5) * 20;
  const rating = teamRating(club);
  if (score >= rating + 8) return "starter";
  if (score >= rating - 8) return "bench";
  return "out";
}

function positionEventTypes(position) {
  if (position === "GK") return ["distribution", "save", "save"];
  if (["RB", "CB", "LB"].includes(position)) return ["tackle", "interception", "tackle"];
  if (["DM", "CM", "AM"].includes(position)) return ["pass", "key-pass", "pass"];
  return ["dribble", "shot", "shot"];
}

const ACTION_ATTRIBUTES = {
  distribution: ["passing", "vision"],
  save: ["reflexes"],
  tackle: ["tackling", "strength"],
  interception: ["marking", "vision"],
  pass: ["passing"],
  "key-pass": ["passing", "vision", "flair"],
  dribble: ["dribbling", "flair", "pace"],
  shot: ["finishing"],
};

function playerActionOutcome(player, type, random) {
  const attributes = ACTION_ATTRIBUTES[type];
  const ability = total(attributes.map((name) => player.attributes[name])) / attributes.length / 20;
  const condition = clamp(player.condition, 0, 100) / 100;
  const mastery = clamp(player.positionMastery[player.preferredPosition] || 0, 0, 100) / 100;
  const success = random() < ability * 0.6 + condition * 0.2 + mastery * 0.2;
  return {
    distribution: success ? "completed" : "failed",
    save: success ? "saved" : "failed",
    tackle: success ? "won" : "lost",
    interception: success ? "won" : "missed",
    pass: success ? "completed" : "failed",
    "key-pass": success ? "completed" : "failed",
    dribble: success ? "completed" : "lost",
    shot: success ? "on-target" : "off-target",
  }[type];
}

function playerEventCommentary(event, player, previous) {
  const flow = previous.at(-1)?.type === "pass" || previous.at(-1)?.type === "key-pass"
    ? "앞선 패스 흐름을 이어 "
    : previous.at(-1)?.type === "interception" || previous.at(-1)?.type === "tackle"
      ? "공을 되찾은 뒤 "
      : "";
  const action = {
    distribution: event.outcome === "completed" ? "정확한 킥으로 공격을 시작합니다." : "전진 패스가 상대에게 차단됩니다.",
    save: event.outcome === "saved" ? "반사적으로 몸을 날려 선방합니다!" : "슈팅에 손이 닿지 않습니다.",
    tackle: event.outcome === "won" ? "타이밍 좋은 태클로 공격을 끊습니다." : "태클을 시도했지만 공격수가 벗어납니다.",
    interception: event.outcome === "won" ? "패스 길을 읽고 가로챕니다." : "가로채기를 노렸지만 공이 지나갑니다.",
    pass: event.outcome === "completed" ? "동료에게 정확히 패스를 연결합니다." : "패스가 수비에 차단됩니다.",
    "key-pass": event.outcome === "completed" ? "수비 사이로 날카로운 킬패스를 보냅니다." : "킬패스를 노렸지만 수비가 읽었습니다.",
    dribble: event.outcome === "completed" ? "개인기로 압박을 벗어나 전진합니다." : "돌파를 시도하다 공을 빼앗깁니다.",
    shot: event.outcome === "on-target" ? "공간을 만들고 유효 슈팅을 시도합니다." : "슈팅이 골문을 벗어납니다.",
    goal: event.contribution === "goal" ? "실제 득점 장면을 마무리합니다!" : "실제 득점으로 이어지는 도움을 기록합니다!",
  }[event.type];
  return `${event.minute}' ${player.name}, ${flow}${action}`;
}

function personalEvents(player, fixture, selection, random) {
  if (selection === "out") return [];
  const types = positionEventTypes(player.preferredPosition).slice(selection === "starter" ? 0 : 1, selection === "starter" ? 3 : 3);
  const start = selection === "starter" ? 16 : 68;
  return types.map((type, index) => {
    return {
      id: `${fixture.id || fixture.round}-player-${index}`,
      minute: start + index * 18,
      type,
      teamId: player.clubId,
      playerId: null,
      playerName: player.name,
      targetPlayerId: null,
      outcome: playerActionOutcome(player, type, random),
      zone: type === "save" || type === "distribution" ? "goal" : type === "tackle" || type === "interception" ? "defense" : type === "pass" ? "midfield" : "box",
      personal: true,
      variant: index % 2,
    };
  });
}

function attributeGoalContributions(events, personal, player, selection) {
  let goals = personal.filter(({ type, outcome }) => type === "shot" && outcome === "on-target").length;
  let assists = personal.filter(({ type, outcome }) => type === "key-pass" && outcome === "completed").length;
  const entryMinute = selection === "bench" ? 65 : 0;
  return events.map((event) => {
    if (event.type !== "goal" || event.teamId !== player.clubId || event.minute < entryMinute) return event;
    if (goals > 0) {
      goals -= 1;
      return { ...event, personal: true, playerName: player.name, contribution: "goal" };
    }
    if (assists > 0) {
      assists -= 1;
      return { ...event, personal: true, playerName: player.name, contribution: "assist" };
    }
    return event;
  });
}

const freezeEvents = (events) => Object.freeze(events.map((event) => Object.freeze(event)));

export function createPlayerMatch(player, fixture, world, random = Math.random) {
  const club = world.teams.find(({ id }) => id === player.clubId) || {};
  const selection = selectPlayerStatus(player, club, random);
  const requested = world.fixtures.flat().find(({ id, home, away }) => id === fixture.id || (home === fixture.home && away === fixture.away));
  const round = requested?.round ?? fixture.round ?? world.round;
  const scheduledFixture = requested || world.fixtures[round]?.find(({ home, away }) => home === player.clubId || away === player.clubId);
  const outcome = completeRound(world, random, round);
  const completedFixture = outcome.season.fixtures[round]?.find(({ id }) => id === scheduledFixture?.id);
  if (!completedFixture?.result) throw new Error("경기 결과를 만들 수 없습니다.");
  const result = Object.freeze({ home: completedFixture.result.home, away: completedFixture.result.away });
  const personal = personalEvents(player, completedFixture, selection, random);
  const shared = attributeGoalContributions(completedFixture.result.events, personal, player, selection);
  const ordered = [...shared, ...personal]
    .sort((left, right) => left.minute - right.minute || left.id.localeCompare(right.id));
  const events = freezeEvents(ordered.map((event, index, all) => ({
    ...event,
    commentary: event.personal
      ? playerEventCommentary(event, player, all.slice(Math.max(0, index - 3), index))
      : commentate(event, outcome.season),
  })));
  return {
    id: `player-match-${completedFixture.id}`,
    player,
    fixture: Object.freeze({ id: completedFixture.id, round: completedFixture.round, home: completedFixture.home, away: completedFixture.away }),
    world: outcome.season,
    selection,
    result,
    events,
    personalEvents: Object.freeze(events.filter(({ personal }) => personal)),
    cursor: 0,
    speed: "1x",
    recordsApplied: false,
  };
}

export function consumePlayerEvent(match, cursor = match.cursor) {
  const index = clamp(Number.isInteger(cursor) ? cursor : match.cursor || 0, 0, match.events.length);
  if (index >= match.events.length) return { event: null, match: { ...match, cursor: match.events.length } };
  return { event: match.events[index], match: { ...match, cursor: index + 1 } };
}

function addMatchStats(stats, summary, selection, position) {
  const appearances = stats.appearances + Number(summary.minutes > 0);
  return {
    ...stats,
    appearances,
    starts: stats.starts + Number(selection === "starter"),
    minutes: stats.minutes + summary.minutes,
    goals: stats.goals + summary.goals,
    assists: stats.assists + summary.assists,
    cleanSheets: stats.cleanSheets + Number(position === "GK" && summary.minutes > 0 && summary.goalsAgainst === 0),
    yellowCards: stats.yellowCards + summary.yellowCards,
    passesAttempted: (stats.passesAttempted || 0) + summary.passesAttempted,
    passesCompleted: (stats.passesCompleted || 0) + summary.passesCompleted,
    shots: (stats.shots || 0) + summary.shots,
    shotsOnTarget: (stats.shotsOnTarget || 0) + summary.shotsOnTarget,
    tackles: (stats.tackles || 0) + summary.tackles,
    interceptions: (stats.interceptions || 0) + summary.interceptions,
    saves: (stats.saves || 0) + summary.saves,
    averageRating: appearances ? Math.round(((stats.averageRating || 0) * stats.appearances + summary.rating) / appearances * 10) / 10 : stats.averageRating,
  };
}

export function summarizePlayerMatch(match) {
  if (match.recordsApplied) return { ...match.recordSummary, player: match.player, match };
  const minutes = match.selection === "starter" ? 90 : match.selection === "bench" ? 25 : 0;
  const events = match.personalEvents || [];
  const summary = {
    minutes,
    goals: events.filter(({ type, contribution }) => type === "goal" && contribution === "goal").length,
    assists: events.filter(({ type, contribution }) => type === "goal" && contribution === "assist").length,
    passesAttempted: events.filter(({ type }) => ["pass", "key-pass", "distribution"].includes(type)).length,
    passesCompleted: events.filter(({ type, outcome }) => ["pass", "key-pass", "distribution"].includes(type) && outcome !== "failed").length,
    shots: events.filter(({ type }) => type === "shot").length,
    shotsOnTarget: events.filter(({ type, outcome }) => type === "shot" && outcome !== "off-target").length,
    tackles: events.filter(({ type, outcome }) => type === "tackle" && outcome === "won").length,
    interceptions: events.filter(({ type, outcome }) => type === "interception" && outcome === "won").length,
    saves: events.filter(({ type, outcome }) => type === "save" && outcome === "saved").length,
    defending: events.filter(({ type, outcome }) => (type === "tackle" || type === "interception") ? outcome === "won" : type === "save" && outcome === "saved").length,
    yellowCards: events.filter(({ type }) => type === "caution").length,
    goalsAgainst: match.fixture.home === match.player.clubId ? match.result.away : match.result.home,
  };
  summary.rating = minutes ? clamp(Math.round((6 + summary.goals * 1.2 + summary.assists * 0.8 + summary.passesCompleted * 0.12 + summary.defending * 0.25) * 10) / 10, 1, 10) : 0;
  const player = minutes ? {
    ...match.player,
    condition: clamp(match.player.condition - (match.selection === "starter" ? 12 : 5), 0, 100),
    trust: clamp(match.player.trust + summary.rating - 6, 0, 100),
    training: { ...match.player.training, experience: (match.player.training?.experience || 0) + Math.round(minutes / 3 + summary.rating * 2) },
    seasonStats: addMatchStats(match.player.seasonStats, summary, match.selection, match.player.preferredPosition),
    careerStats: addMatchStats(match.player.careerStats, summary, match.selection, match.player.preferredPosition),
  } : { ...match.player, trust: clamp(match.player.trust - 1, 0, 100) };
  const recordSummary = Object.freeze({ ...summary });
  const appliedMatch = { ...match, player, recordsApplied: true, recordSummary };
  return { ...summary, player, match: appliedMatch };
}
