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

export function validatePlayerDraft(draft) {
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

  if (!POSITIONS.includes(draft.preferredPosition)) errors.push("주 포지션을 선택하세요.");
  const secondary = Array.isArray(draft.secondaryPositions) ? draft.secondaryPositions : [];
  if (!Array.isArray(draft.secondaryPositions) || secondary.length > 2
    || secondary.some((position) => !POSITIONS.includes(position))
    || new Set(secondary).size !== secondary.length
    || secondary.includes(draft.preferredPosition)) {
    errors.push("보조 포지션은 주 포지션과 다른 두 개 이하로 선택하세요.");
  }

  const selectedArchetype = ARCHETYPES[draft.archetype];
  if (!selectedArchetype) errors.push("선수 유형을 선택하세요.");
  const adjustments = isRecord(draft.adjustments) ? draft.adjustments : null;
  if (!adjustments) {
    errors.push("능력치 조정이 필요합니다.");
  } else if (selectedArchetype) {
    const entries = Object.entries(adjustments);
    const values = entries.map(([, value]) => value);
    if (entries.some(([name, value]) => !(name in selectedArchetype.attributes) || !Number.isInteger(value))) {
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

function offerFor(player, team) {
  const ability = player.overall * 5;
  const gap = ability - team.rating;
  const role = gap >= 5 ? "핵심" : gap >= 0 ? "주전" : gap >= -6 ? "로테이션" : "유망주";
  const roleBonus = { "핵심": 1.5, "주전": 1.25, "로테이션": 1, "유망주": 0.8 }[role];
  return {
    clubId: team.id,
    clubName: team.name || team.id,
    role,
    wage: Math.round((player.wage + team.rating * 1_000) * roleBonus / 1_000) * 1_000,
    years: gap >= 0 ? 3 : 2,
  };
}

export function createEntryOffers(player, path, teams) {
  const eligibleTeams = Array.isArray(teams)
    ? teams.filter((team) => isRecord(team) && typeof team.id === "string" && Number.isFinite(team.rating ?? 70))
    : [];
  const ranked = [...eligibleTeams].sort((left, right) => (
    Math.abs((left.rating ?? 70) - player.overall * 5) - Math.abs((right.rating ?? 70) - player.overall * 5)
      || left.id.localeCompare(right.id)
  ));

  if (path === "club-choice") return ranked.slice(0, 1).map((team) => offerFor(player, team));
  if (path === "trial") return ranked.slice(0, 3).map((team) => offerFor(player, team));
  if (path === "free-agent") {
    const suitable = ranked.filter((team) => (team.rating ?? 70) <= player.overall * 5 + 18);
    return (suitable.length ? suitable : ranked.slice(0, 3)).map((team) => offerFor(player, team));
  }
  return [];
}
