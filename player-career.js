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
