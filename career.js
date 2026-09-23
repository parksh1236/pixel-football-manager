export const MAX_SLOTS = 3;

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isMode = (value) => value === "manager" || value === "player";
const isNonNegativeInteger = (value) => Number.isInteger(value) && value >= 0;
const isIsoTimestamp = (value) => typeof value === "string"
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  && Number.isFinite(Date.parse(value))
  && new Date(value).toISOString() === value;
const newId = () => globalThis.crypto?.randomUUID?.()
  || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

function validSlot(value) {
  return isRecord(value)
    && typeof value.id === "string" && value.id.length > 0
    && Number.isInteger(value.version) && value.version > 0
    && isMode(value.mode)
    && typeof value.name === "string"
    && typeof value.clubId === "string" && value.clubId.length > 0
    && isNonNegativeInteger(value.season)
    && isNonNegativeInteger(value.round)
    && isIsoTimestamp(value.savedAt)
    && isRecord(value.career)
    && isRecord(value.world);
}

export function createCareerSlot(mode, name, world, career) {
  if (!isMode(mode)) throw new Error("모드는 manager 또는 player여야 합니다.");
  const progress = isRecord(career) ? career : {};
  return {
    id: newId(),
    version: 1,
    mode,
    name: String(name ?? ""),
    clubId: String(progress.clubId ?? progress.teamId ?? "team-0"),
    season: isNonNegativeInteger(progress.season) ? progress.season : 1,
    round: isNonNegativeInteger(progress.round) ? progress.round : 0,
    savedAt: new Date().toISOString(),
    career: progress,
    world: isRecord(world) ? world : {},
  };
}

export function parseSlots(rawSlots) {
  let values;
  try {
    values = typeof rawSlots === "string" ? JSON.parse(rawSlots) : rawSlots;
  } catch {
    return [{ ok: false, index: 0, error: "저장 데이터를 읽을 수 없습니다." }];
  }
  if (values == null) return [];
  if (!Array.isArray(values)) values = [values];
  return values.map((value, index) => {
    try {
      const slot = typeof value === "string" ? JSON.parse(value) : value;
      return validSlot(slot)
        ? { ok: true, slot, index }
        : { ok: false, index, error: "저장 슬롯 형식이 올바르지 않습니다." };
    } catch {
      return { ok: false, index, error: "저장 슬롯을 읽을 수 없습니다." };
    }
  });
}

export function upsertSlot(slots, slot) {
  const next = [...slots];
  const index = next.findIndex(({ id }) => id === slot.id);
  if (index >= 0) {
    next[index] = slot;
    return next;
  }
  if (next.length >= MAX_SLOTS) throw new Error("저장 슬롯은 최대 3개입니다.");
  return [...next, slot];
}

const validLegacy = (value) => isRecord(value)
  && Number.isInteger(value.version)
  && isNonNegativeInteger(value.round)
  && Array.isArray(value.teams)
  && Array.isArray(value.players)
  && Array.isArray(value.fixtures)
  && Array.isArray(value.completedRoundIds);

const sameLegacy = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function migrateLegacySave(rawLegacy, slots) {
  let legacy;
  try {
    legacy = typeof rawLegacy === "string" ? JSON.parse(rawLegacy) : rawLegacy;
  } catch {
    return { migrated: false, slots, legacyMayBeRemoved: false };
  }
  if (!validLegacy(legacy)) return { migrated: false, slots, legacyMayBeRemoved: false };

  const current = Array.isArray(slots) ? slots : parseSlots(slots)
    .flatMap((result) => result.ok ? [result.slot] : []);
  if (current.some((slot) => slot.mode === "manager" && sameLegacy(slot.career, legacy))) {
    return { migrated: false, slots: current, legacyMayBeRemoved: true };
  }
  if (current.length >= MAX_SLOTS) return { migrated: false, slots: current, legacyMayBeRemoved: false };

  const name = legacy.teams.find(({ id }) => id === "team-0")?.name || "기존 커리어";
  const slot = createCareerSlot("manager", name, {}, legacy);
  const next = upsertSlot(current, slot);
  return { migrated: true, slots: next, legacyMayBeRemoved: next.some(({ id }) => id === slot.id) };
}
