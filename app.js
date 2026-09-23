import { calculateTable, commentate, completeRound, createSeason, FORMATIONS, formationPositions, formationSuitability, interpolateMatchState, lineupPositions, matchVisualState, migrateSeason, movePlayer, pitchPoint, scoreForEvents, swapStarter } from "./game.js";
import { assignCareerClub, createCareerSlot, LEGACY_STORAGE_KEY, loadCareerStore, MAX_SLOTS, migrateLegacySave, parseSlots, saveCareerStore, updateActiveSlot } from "./career.js";
import { applyTrainingWeek, ARCHETYPES, buildAutoSchedule, createCareerPlayer, createEntryOffers, validatePlayerCareerStore, validatePlayerDraft, validatePlayerIdentity, validateSchedule } from "./player-career.js";

const app = document.querySelector("#app");
const saveStatus = document.querySelector("#save-status");
const roundStatus = document.querySelector("#round-status");
const clubName = document.querySelector("#club-name");
const careerContext = document.querySelector("#career-context");
const careerExit = document.querySelector("#career-exit");
const sidebar = document.querySelector(".sidebar");
const workspace = document.querySelector(".workspace");
let activeView = "dashboard";
let matchRunning = false;
let draggedMarker = null;
let visualState = null;
let screen = "start";
let startView = "home";
let selectedMode = "manager";
let createSlotIndex = 0;
let creationWorld = null;
let playerCreationStep = 1;
let playerCreationError = "";
let playerOfferState = null;
let playerDraft = null;
let playerTrainingMessage = "";
let careerStore;
let statusMessage = "저장 준비";
let season = createSeason();

const HIGHLIGHTS = {
  shot: "assets/highlights/shot.png",
  save: "assets/highlights/save.png",
  "key-pass": "assets/highlights/pass.png",
  goal: "assets/highlights/celebration.png",
};
const highlightImages = {};
const POSITION_LABELS = {
  GK: "골키퍼", RB: "오른쪽 수비", CB: "중앙 수비", LB: "왼쪽 수비", DM: "수비형 미드필더",
  CM: "중앙 미드필더", AM: "공격형 미드필더", RW: "오른쪽 윙", LW: "왼쪽 윙", ST: "스트라이커",
};
const ATTRIBUTE_LABELS = {
  pace: "속도", finishing: "골 결정력", passing: "패스", dribbling: "드리블", vision: "시야", flair: "천재성",
  tackling: "태클", marking: "마크", strength: "몸싸움", stamina: "활동량", heading: "헤딩", reflexes: "반사 신경",
};
const TRAINING_DAYS = ["월", "화", "수", "목", "금", "토", "일"];
const TRAINING_LABELS = { technique: "기술", physical: "신체", mental: "정신", position: "포지션", recovery: "회복", rest: "휴식", match: "경기" };
const INTENSITY_LABELS = { low: "낮음", normal: "보통", hard: "높음" };
const PLAYER_MATCH_DAY = 5;
const highlightsReady = Promise.all(Object.entries(HIGHLIGHTS).map(async ([type, src]) => {
  const image = new Image();
  image.src = src;
  try {
    await image.decode();
    highlightImages[type] = image;
  } catch {
    // Commentary still describes the event if an optional local image is unavailable.
  }
}));

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
}[character]));

function resetPlayerCreation() {
  playerCreationStep = 1;
  playerCreationError = "";
  playerOfferState = null;
  playerDraft = {
    name: "",
    nationality: "대한민국",
    age: 18,
    height: 178,
    foot: "right",
    appearance: "short-dark",
    preferredPosition: "AM",
    secondaryPositions: ["CM", "RW"],
    archetype: "playmaker",
    adjustments: { vision: 4, passing: 3, flair: 3, tackling: -4, strength: -3, heading: -3 },
    entryPath: "club-choice",
    selectedClubId: "team-0",
  };
}

function normalizeStore(activeSlotId, slots) {
  const slotResults = parseSlots(slots);
  return validatePlayerCareerStore({ activeSlotId, slots, slotResults });
}

function activeSlotResult() {
  return careerStore?.slotResults.find((result) => result.ok && result.slot.id === careerStore.activeSlotId);
}

function firstOpenSlot(store = careerStore) {
  for (let index = 0; index < MAX_SLOTS; index += 1) {
    if (index >= store.slots.length) return index;
  }
  return -1;
}

function initializeCareerStore() {
  const loaded = validatePlayerCareerStore(loadCareerStore(localStorage));
  statusMessage = loaded.error || "저장 준비";
  const imported = loaded.slotResults.some((result) => result.ok && result.slot.career.legacyImportId === LEGACY_STORAGE_KEY);
  if (imported) return loaded;

  let rawLegacy;
  try {
    rawLegacy = localStorage.getItem(LEGACY_STORAGE_KEY);
  } catch {
    statusMessage = "기존 시즌을 읽지 못했습니다.";
    return loaded;
  }
  const openIndex = firstOpenSlot(loaded);
  if (!rawLegacy || openIndex < 0) return loaded;
  const validSlots = loaded.slotResults.flatMap((result) => result.ok ? [result.slot] : []);
  const migration = migrateLegacySave(rawLegacy, validSlots);
  if (!migration.migrated) return loaded;
  const importedSlot = migration.slots.find((slot) => slot.career.legacyImportId === LEGACY_STORAGE_KEY);
  const slots = [...loaded.slots];
  slots[openIndex] = importedSlot;
  const next = normalizeStore(loaded.activeSlotId, slots);
  const saved = saveCareerStore(localStorage, next);
  if (!saved.ok) {
    statusMessage = saved.error;
    return next;
  }
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    statusMessage = "커리어 저장 완료 · 기존 저장 정리 실패";
    return next;
  }
  statusMessage = "기존 시즌을 슬롯으로 가져왔습니다.";
  return next;
}

function updateActiveSlotInMemory(nextActiveSlotId = careerStore.activeSlotId) {
  const next = updateActiveSlot(careerStore, season, {
    tactic: season.tactic,
    formation: season.formation,
    lineup: season.players.filter(({ starter }) => starter).map(({ id }) => id),
    customPositions: season.customPositions,
  });
  return normalizeStore(nextActiveSlotId, next.slots);
}

function saveSeason() {
  const next = updateActiveSlotInMemory();
  const saved = saveCareerStore(localStorage, next);
  careerStore = next;
  statusMessage = saved.ok ? "저장 완료" : saved.error;
  saveStatus.textContent = statusMessage;
  return saved;
}

const team = (id) => season.teams.find((item) => item.id === id);
const userFixture = (round = season.round) => season.fixtures[round]?.find(
  (fixture) => fixture.home === "team-0" || fixture.away === "team-0",
);

function header(title, description, kicker = "CLUB HQ") {
  return `<div class="page-heading"><div><span class="kicker">${kicker}</span><h1>${title}</h1></div><p>${description}</p></div>`;
}

function slotClub(slot) {
  return slot.world.teams?.find(({ id }) => id === slot.clubId)?.name || slot.clubId;
}

function slotCard(index) {
  const result = careerStore.slotResults[index];
  if (result?.ok) {
    const slot = result.slot;
    return `<article class="slot-card">
      <div class="slot-number">SLOT ${index + 1}</div>
      <span class="mode-badge">${slot.mode === "manager" ? "감독 모드" : "선수 모드"}</span>
      <h2>${escapeHtml(slot.name)}</h2>
      <dl><div><dt>구단</dt><dd>${escapeHtml(slotClub(slot))}</dd></div><div><dt>시즌</dt><dd>${slot.season}</dd></div><div><dt>라운드</dt><dd>${slot.round}</dd></div></dl>
      <time datetime="${slot.savedAt}">${new Date(slot.savedAt).toLocaleString("ko-KR")}</time>
      <button class="primary-button" data-slot-action="continue" data-slot-index="${index}">이어하기</button>
    </article>`;
  }
  if (index < careerStore.slots.length) {
    return `<article class="slot-card corrupt-slot"><div class="slot-number">SLOT ${index + 1}</div><span class="mode-badge">복구 불가</span><h2>손상된 저장</h2><p>${escapeHtml(result?.error || "저장 슬롯을 읽을 수 없습니다.")}</p><button class="secondary-button" data-slot-action="overwrite" data-slot-index="${index}">새 커리어로 덮어쓰기</button></article>`;
  }
  return `<article class="slot-card empty-slot"><div class="slot-number">SLOT ${index + 1}</div><h2>빈 슬롯</h2><p>새 감독 또는 선수 커리어를 시작하세요.</p><button class="secondary-button" data-slot-action="create" data-slot-index="${index}">이 슬롯에 새 커리어</button></article>`;
}

function renderStart() {
  const descriptions = {
    home: "세 개의 독립된 저장 슬롯에서 커리어를 시작하거나 이어가세요.",
    continue: "계속할 커리어 슬롯을 선택하세요.",
    manage: "손상된 슬롯은 새 커리어로 덮어쓸 수 있습니다.",
  };
  app.innerHTML = `${header("CAREER SELECT", descriptions[startView], "PIXEL TOUCHLINE")}
    <div class="start-actions" aria-label="커리어 메뉴">
      <button class="primary-button" data-start-view="new">새 커리어</button>
      <button class="secondary-button" data-start-view="continue">이어하기</button>
      <button class="secondary-button" data-start-view="manage">저장 관리</button>
    </div>
    <div class="slot-grid">${Array.from({ length: MAX_SLOTS }, (_, index) => slotCard(index)).join("")}</div>`;
}

function clubOptions(selected = "team-0") {
  return creationWorld.teams.map((club) => `<option value="${club.id}" ${club.id === selected ? "selected" : ""}>${escapeHtml(club.name)}</option>`).join("");
}

function playerStepProgress() {
  return `<ol class="creation-progress" aria-label="선수 생성 진행 단계">
    ${["기본 정보", "포지션", "선수 유형", "능력 조정"].map((label, index) => `<li class="${index + 1 === playerCreationStep ? "current" : index + 1 < playerCreationStep ? "complete" : ""}" ${index + 1 === playerCreationStep ? 'aria-current="step"' : ""}><span>${index + 1}</span>${label}</li>`).join("")}
  </ol>`;
}

function playerFormActions(submitLabel = "다음") {
  return `<div class="creation-actions">
    ${playerCreationStep > 1 ? '<button class="secondary-button" data-player-back type="button">이전</button>' : ""}
    <button class="primary-button" type="submit">${submitLabel}</button>
  </div>`;
}

function renderPlayerCreationStep() {
  let fields;
  if (playerCreationStep === 1) {
    fields = `<fieldset><legend>1. 기본 정보</legend>
      <div class="form-grid">
        <label>선수 이름<input name="name" minlength="2" maxlength="30" required autocomplete="name" value="${escapeHtml(playerDraft.name)}"></label>
        <label>국가<input name="nationality" minlength="2" maxlength="30" required value="${escapeHtml(playerDraft.nationality)}"></label>
        <label>시작 나이<input name="age" type="number" min="16" max="25" step="1" required value="${playerDraft.age}"></label>
        <label>키 (cm)<input name="height" type="number" min="150" max="210" step="1" required value="${playerDraft.height}"></label>
        <label>주발<select name="foot"><option value="right" ${playerDraft.foot === "right" ? "selected" : ""}>오른발</option><option value="left" ${playerDraft.foot === "left" ? "selected" : ""}>왼발</option></select></label>
        <label>외형<select name="appearance"><option value="short-dark" ${playerDraft.appearance === "short-dark" ? "selected" : ""}>짧은 검은 머리</option><option value="wavy-brown" ${playerDraft.appearance === "wavy-brown" ? "selected" : ""}>갈색 웨이브</option><option value="buzz-cut" ${playerDraft.appearance === "buzz-cut" ? "selected" : ""}>스포츠 컷</option></select></label>
      </div>
    </fieldset>${playerFormActions()}`;
  } else if (playerCreationStep === 2) {
    fields = `<fieldset><legend>2. 포지션</legend>
      <label>주 포지션<select name="preferredPosition">${Object.entries(POSITION_LABELS).map(([value, label]) => `<option value="${value}" ${playerDraft.preferredPosition === value ? "selected" : ""}>${value} · ${label}</option>`).join("")}</select></label>
      <fieldset class="choice-fieldset"><legend>보조 포지션 (최대 2개)</legend><div class="check-grid">
        ${Object.entries(POSITION_LABELS).map(([value, label]) => `<label><input type="checkbox" name="secondaryPositions" value="${value}" ${playerDraft.secondaryPositions.includes(value) ? "checked" : ""}>${value} · ${label}</label>`).join("")}
      </div></fieldset>
    </fieldset>${playerFormActions()}`;
  } else if (playerCreationStep === 3) {
    fields = `<fieldset><legend>3. 선수 유형</legend><div class="archetype-grid">
      ${Object.entries(ARCHETYPES).map(([value, item]) => `<label class="archetype-card"><input type="radio" name="archetype" value="${value}" ${playerDraft.archetype === value ? "checked" : ""} required><strong>${item.label}</strong><span>${item.description}</span><small>주요 능력 ${Object.entries(item.attributes).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, score]) => `${ATTRIBUTE_LABELS[name]} ${score}`).join(" · ")}</small></label>`).join("")}
    </div></fieldset>${playerFormActions()}`;
  } else {
    const base = ARCHETYPES[playerDraft.archetype].attributes;
    const values = Object.values(playerDraft.adjustments);
    const positive = values.filter((value) => value > 0).reduce((sum, value) => sum + value, 0);
    const balance = values.reduce((sum, value) => sum + value, 0);
    const offers = playerOfferState ? `<section class="offer-list" aria-labelledby="offer-heading"><h3 id="offer-heading">입단 제안</h3>${playerOfferState.offers.map((offer, index) => `<article class="offer-card"><div><strong>${escapeHtml(offer.clubName)}</strong><span>${offer.role}</span></div><dl><div><dt>주급</dt><dd>₩${offer.wage.toLocaleString("ko-KR")}</dd></div><div><dt>기간</dt><dd>${offer.years}년</dd></div></dl><button type="button" class="primary-button" data-offer-index="${index}">이 제안 수락</button></article>`).join("")}</section>` : "";
    fields = `<fieldset><legend>4. 능력 조정과 시작 경로</legend>
      <p class="point-summary" id="point-summary" aria-live="polite">더한 포인트 <strong>${positive}/10</strong> · 총 조정 <strong>${balance}</strong></p>
      <div class="attribute-grid">${Object.entries(base).map(([name, score]) => {
        const adjustment = playerDraft.adjustments[name] || 0;
        return `<label>${ATTRIBUTE_LABELS[name]} <small>기본 ${score} → <output data-final-attribute="${name}">${score + adjustment}</output></small><input name="adjustment-${name}" type="number" min="-${Math.min(10, score - 1)}" max="${Math.min(10, 20 - score)}" step="1" required value="${adjustment}"></label>`;
      }).join("")}</div>
      <fieldset class="choice-fieldset"><legend>시작 경로</legend><div class="entry-paths">
        ${[["club-choice", "구단 선택", "선택한 구단과 즉시 계약"], ["trial", "입단 테스트", "적합한 구단 최대 3곳의 제안"], ["free-agent", "자유계약", "관심 구단의 조건 비교"]].map(([value, label, help]) => `<label><input type="radio" name="entryPath" value="${value}" ${playerDraft.entryPath === value ? "checked" : ""}><strong>${label}</strong><span>${help}</span></label>`).join("")}
      </div></fieldset>
      <label>구단 선택 경로의 희망 구단<select name="selectedClubId">${clubOptions(playerDraft.selectedClubId)}</select></label>
    </fieldset>${offers}${playerFormActions(playerOfferState ? "제안 다시 확인" : "입단 제안 확인")}`;
  }

  return `${playerStepProgress()}<form class="career-form player-create-form" id="player-create-form">
    <p class="form-error" id="player-create-error" role="alert" tabindex="-1" ${playerCreationError ? "" : "hidden"}>${escapeHtml(playerCreationError)}</p>
    ${fields}
  </form>`;
}

function renderCreate() {
  const form = selectedMode === "manager"
    ? `<form class="career-form" id="manager-create-form">
        <label>감독 이름<input name="name" maxlength="30" required autocomplete="name"></label>
        <label>국가<input name="nationality" maxlength="30" required value="대한민국"></label>
        <label>담당 구단<select name="clubId">${clubOptions()}</select></label>
        <button class="primary-button" type="submit">감독 커리어 시작</button>
      </form>`
    : renderPlayerCreationStep();
  app.innerHTML = `${header("NEW CAREER", `SLOT ${createSlotIndex + 1}에 새 커리어를 만듭니다.`, "CREATE")}
    <div class="mode-picker" aria-label="커리어 모드 선택">
      <button class="choice-button" data-career-mode="manager" aria-pressed="${selectedMode === "manager"}">감독 모드</button>
      <button class="choice-button" data-career-mode="player" aria-pressed="${selectedMode === "player"}">선수 모드</button>
    </div>
    <section class="panel create-panel"><div class="panel-body">${form}<button class="secondary-button" id="cancel-create" type="button">취소</button></div></section>`;
}

function playerSchedule(player) {
  const saved = player.training?.schedule;
  return validateSchedule(player, saved, PLAYER_MATCH_DAY).ok
    ? saved
    : buildAutoSchedule(player, PLAYER_MATCH_DAY, player.training?.goal || "technique", player.training?.intensity || "normal");
}

function savePlayerCareer(player, successMessage) {
  const active = activeSlotResult();
  const slot = {
    ...active.slot,
    savedAt: new Date().toISOString(),
    career: { ...active.slot.career, player },
  };
  const slots = careerStore.slots.map((item) => item?.id === slot.id ? slot : item);
  const next = normalizeStore(slot.id, slots);
  const saved = saveCareerStore(localStorage, next);
  careerStore = next;
  statusMessage = saved.ok ? successMessage : saved.error;
  saveStatus.textContent = statusMessage;
  return saved;
}

function playerStats(stats) {
  return [["출전", stats.appearances], ["선발", stats.starts], ["분", stats.minutes], ["골", stats.goals], ["도움", stats.assists], ["평점", stats.averageRating || "-"]]
    .map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join("");
}

function renderPlayerCareer() {
  const slot = activeSlotResult().slot;
  const player = slot.career.player;
  if (!player) {
    app.innerHTML = `${header("PLAYER CAREER", `${escapeHtml(slot.name)}의 선수 커리어입니다.`, "PLAYER MODE")}
      <section class="panel player-profile"><div class="panel-body"><p>선수 정보가 없는 이전 저장입니다. 새 선수 커리어를 만들어 주세요.</p></div></section>`;
    return;
  }
  const schedule = playerSchedule(player);
  const preview = applyTrainingWeek(player, schedule, () => 1);
  const experienceGain = Math.round(preview.player.training.experience - (player.training.experience || 0));
  const conditionChange = `${preview.conditionChange > 0 ? "+" : ""}${preview.conditionChange}`;
  const trainingOptions = Object.entries(TRAINING_LABELS).filter(([type]) => type !== "match");
  const warning = player.injuryDays > 0
    ? `부상 ${player.injuryDays}일 남음 · 고강도 훈련과 경기 출전이 제한됩니다.`
    : player.condition <= 40 ? "컨디션이 낮습니다. 고강도 훈련은 부상 위험을 높입니다." : "";
  app.innerHTML = `${header("PLAYER CAREER", `${escapeHtml(slot.name)}의 선수 커리어입니다.`, "PLAYER MODE")}
    ${warning ? `<p class="player-warning" role="status">${warning}</p>` : ""}
    ${playerTrainingMessage ? `<p class="training-message" role="status">${escapeHtml(playerTrainingMessage)}</p>` : ""}
    <div class="player-profile-grid">
      <section class="panel player-profile"><div class="panel-body"><span class="mode-badge">SLOT ${activeSlotResult().index + 1}</span><h2>${escapeHtml(player.name)}</h2><p>${escapeHtml(player.nationality)} · ${player.age}세 · ${player.height}cm · ${player.foot === "right" ? "오른발" : "왼발"}</p><dl><div><dt>소속</dt><dd>${escapeHtml(slotClub(slot))}</dd></div><div><dt>주 포지션</dt><dd>${player.preferredPosition} · ${Math.round(player.positionMastery[player.preferredPosition])}%</dd></div>${player.secondaryPositions.map((position) => `<div><dt>보조 ${position}</dt><dd>${Math.round(player.positionMastery[position])}%</dd></div>`).join("")}<div><dt>선수 유형</dt><dd>${ARCHETYPES[player.archetype].label}</dd></div><div><dt>컨디션</dt><dd>${Math.round(player.condition)}%</dd></div><div><dt>잠재력</dt><dd>${player.potential}</dd></div><div><dt>시장 가치</dt><dd>₩${player.value.toLocaleString("ko-KR")}</dd></div><div><dt>주급</dt><dd>₩${player.wage.toLocaleString("ko-KR")}</dd></div><div><dt>계약</dt><dd>${escapeHtml(player.contract.role)} · ${player.contract.years}년</dd></div><div><dt>감독 신뢰</dt><dd>${Math.round(player.trust)}%</dd></div></dl></div></section>
      <section class="panel"><div class="panel-header"><h2>PLAYER ATTRIBUTES</h2><span class="kicker">OVERALL ${player.overall}</span></div><div class="panel-body attribute-summary">${Object.entries(player.attributes).map(([name, value]) => `<div><span>${ATTRIBUTE_LABELS[name]}</span><strong>${value}</strong></div>`).join("")}</div></section>
    </div>
    <section class="panel training-panel"><div class="panel-header"><h2>WEEKLY TRAINING</h2><span class="kicker">WEEK ${(player.training.weeks || 0) + 1}</span></div><div class="panel-body">
      <div class="training-toolbar">
        <label>성장 목표<select id="training-goal">${["technique", "physical", "mental", "position"].map((goal) => `<option value="${goal}" ${player.training.goal === goal ? "selected" : ""}>${TRAINING_LABELS[goal]}</option>`).join("")}</select></label>
        <label>자동 강도<select id="training-intensity">${Object.entries(INTENSITY_LABELS).map(([value, label]) => `<option value="${value}" ${player.training.intensity === value || (!player.training.intensity && value === "normal") ? "selected" : ""} ${player.injuryDays > 0 && value === "hard" ? "disabled" : ""}>${label}</option>`).join("")}</select></label>
        <button class="secondary-button" id="auto-training" type="button">자동 일정 만들기</button>
      </div>
      <div class="training-week">${schedule.map((session) => {
        const protectedDay = session.day === PLAYER_MATCH_DAY || session.day === (PLAYER_MATCH_DAY + 1) % 7;
        const passive = ["match", "recovery", "rest"].includes(session.type);
        return `<article class="training-day ${protectedDay ? "protected" : ""}"><strong>${TRAINING_DAYS[session.day]}요일</strong><label>활동<select data-training-day="${session.day}" data-training-field="type" ${protectedDay ? "disabled" : ""}>${(protectedDay ? [[session.type, TRAINING_LABELS[session.type]]] : trainingOptions).map(([value, label]) => `<option value="${value}" ${session.type === value ? "selected" : ""}>${label}</option>`).join("")}</select></label><label>강도<select data-training-day="${session.day}" data-training-field="intensity" ${protectedDay || passive ? "disabled" : ""}>${Object.entries(INTENSITY_LABELS).map(([value, label]) => `<option value="${value}" ${session.intensity === value ? "selected" : ""} ${player.injuryDays > 0 && value === "hard" ? "disabled" : ""}>${label}</option>`).join("")}</select></label>${protectedDay ? '<small>보호 일정</small>' : ""}</article>`;
      }).join("")}</div>
      <div class="growth-preview"><div><span>예상 경험치</span><strong>+${experienceGain}</strong></div><div><span>예상 컨디션</span><strong>${conditionChange}</strong></div><div><span>훈련 효율</span><strong>${Math.round(preview.efficiency * 100)}%</strong></div></div>
      <button class="primary-button" id="complete-training-week" type="button">이번 주 훈련 완료</button>
    </div></section>
    <div class="record-grid"><section class="panel"><div class="panel-header"><h2>SEASON RECORD</h2></div><dl class="record-list">${playerStats(player.seasonStats)}</dl></section><section class="panel"><div class="panel-header"><h2>CAREER RECORD</h2></div><dl class="record-list">${playerStats(player.careerStats)}</dl></section></div>`;
}

function beginCreation(index) {
  createSlotIndex = index;
  selectedMode = "manager";
  creationWorld = createSeason();
  resetPlayerCreation();
  screen = "create";
  render();
  app.focus();
}

function activateSlot(index) {
  const result = careerStore.slotResults[index];
  if (!result?.ok) return;
  season = migrateSeason(result.slot.world);
  const next = normalizeStore(result.slot.id, careerStore.slots);
  const saved = saveCareerStore(localStorage, next);
  careerStore = next;
  statusMessage = saved.ok ? "커리어 불러오기 완료" : saved.error;
  screen = "active";
  activeView = "dashboard";
  render();
  app.focus();
}

function createCareer(form) {
  const data = new FormData(form);
  const name = String(data.get("name") || "").trim();
  if (!name) return;
  const selectedClubId = String(data.get("clubId") || "team-0");
  const world = assignCareerClub(creationWorld, selectedClubId);
  const clubId = "team-0";
  const career = selectedMode === "manager"
    ? { managerName: name, nationality: String(data.get("nationality") || "").trim(), clubId, selectedClubId }
    : { playerName: name, clubId, selectedClubId, route: "player-create" };
  const slot = createCareerSlot(selectedMode, name, world, career);
  const slots = [...careerStore.slots];
  slots[createSlotIndex] = slot;
  const next = normalizeStore(slot.id, slots);
  const saved = saveCareerStore(localStorage, next);
  careerStore = next;
  season = migrateSeason(slot.world);
  statusMessage = saved.ok ? "새 커리어 저장 완료" : saved.error;
  screen = "active";
  activeView = "dashboard";
  render();
  app.focus();
}

function playerCreationFailure(message) {
  playerCreationError = message;
  renderCreate();
  document.querySelector("#player-create-error")?.focus();
}

function submitPlayerCreationStep(form) {
  const data = new FormData(form);
  playerCreationError = "";
  playerOfferState = null;

  if (playerCreationStep === 1) {
    playerDraft = {
      ...playerDraft,
      name: String(data.get("name") || "").trim(),
      nationality: String(data.get("nationality") || "").trim(),
      age: Number(data.get("age")),
      height: Number(data.get("height")),
      foot: String(data.get("foot")),
      appearance: String(data.get("appearance")),
    };
    const validation = validatePlayerIdentity(playerDraft);
    if (!validation.ok) {
      playerCreationFailure(validation.errors.join(" "));
      return;
    }
  } else if (playerCreationStep === 2) {
    const preferredPosition = String(data.get("preferredPosition"));
    const secondaryPositions = data.getAll("secondaryPositions").map(String);
    playerDraft = { ...playerDraft, preferredPosition, secondaryPositions };
    if (secondaryPositions.length > 2 || secondaryPositions.includes(preferredPosition)) {
      playerCreationFailure("보조 포지션은 주 포지션과 다른 두 개 이하로 선택하세요.");
      return;
    }
  } else if (playerCreationStep === 3) {
    playerDraft = { ...playerDraft, archetype: String(data.get("archetype")) };
  } else {
    const base = ARCHETYPES[playerDraft.archetype].attributes;
    const adjustments = Object.fromEntries(Object.keys(base).map((name) => [name, Number(data.get(`adjustment-${name}`))]));
    const entryPath = String(data.get("entryPath"));
    const selectedClubId = String(data.get("selectedClubId"));
    playerDraft = { ...playerDraft, adjustments, entryPath, selectedClubId };
    const validation = validatePlayerDraft(playerDraft);
    if (!validation.ok) {
      playerCreationFailure(validation.errors.join(" "));
      return;
    }
    const player = createCareerPlayer(playerDraft);
    const teams = entryPath === "club-choice"
      ? creationWorld.teams.filter(({ id }) => id === selectedClubId)
      : creationWorld.teams;
    const offers = createEntryOffers(player, entryPath, teams);
    if (!offers.length) {
      playerCreationFailure("조건에 맞는 입단 제안이 없습니다. 시작 경로를 바꿔 보세요.");
      return;
    }
    playerOfferState = { player, path: entryPath, offers };
    renderCreate();
    document.querySelector("#offer-heading")?.scrollIntoView({ block: "nearest" });
    return;
  }

  playerCreationStep += 1;
  renderCreate();
  document.querySelector("#player-create-form input, #player-create-form select")?.focus();
}

function acceptPlayerOffer(index) {
  const offer = playerOfferState?.offers[index];
  if (!offer) return;
  const world = assignCareerClub(creationWorld, offer.clubId);
  const player = {
    ...playerOfferState.player,
    clubId: "team-0",
    wage: offer.wage,
    contract: { clubId: "team-0", role: offer.role, wage: offer.wage, years: offer.years },
  };
  const career = {
    clubId: "team-0",
    selectedClubId: offer.clubId,
    entryPath: playerOfferState.path,
    entryOffer: offer,
    player,
  };
  const slot = createCareerSlot("player", player.name, world, career);
  const slots = [...careerStore.slots];
  slots[createSlotIndex] = slot;
  const next = normalizeStore(slot.id, slots);
  const saved = saveCareerStore(localStorage, next);
  if (!saved.ok) {
    playerCreationFailure(saved.error);
    return;
  }
  careerStore = next;
  season = migrateSeason(world);
  statusMessage = "새 선수 커리어 저장 완료";
  screen = "active";
  activeView = "dashboard";
  render();
  app.focus();
}

function tableMarkup(limit) {
  const rows = calculateTable(season);
  return `<div class="table-wrap"><table><thead><tr><th>#</th><th>구단</th><th>경기</th><th>승</th><th>무</th><th>패</th><th>득실</th><th>승점</th></tr></thead><tbody>${rows.slice(0, limit).map((row, index) => `
    <tr class="${row.teamId === "team-0" ? "user-row" : ""}"><td>${index + 1}</td><td><i class="club-dot" style="--club-color:${row.color}"></i>${row.name}</td><td>${row.played}</td><td>${row.won}</td><td>${row.drawn}</td><td>${row.lost}</td><td>${row.goalDifference > 0 ? "+" : ""}${row.goalDifference}</td><td><strong>${row.points}</strong></td></tr>`).join("")}</tbody></table></div>`;
}

function renderDashboard() {
  if (season.round >= season.fixtures.length) return renderSeasonEnd();
  const fixture = userFixture();
  const home = team(fixture.home);
  const away = team(fixture.away);
  const table = calculateTable(season);
  const userRow = table.find(({ teamId }) => teamId === "team-0");
  const recent = season.fixtures.flat().filter((item) => item.result && (item.home === "team-0" || item.away === "team-0")).slice(-5);
  const slots = formationPositions(season.formation).map((slot) => season.customPositions[slot.playerId] || slot);
  const lineup = lineupPositions(season);
  app.innerHTML = `${header("MATCHDAY CONTROL", "선발과 전술을 정하고 다음 경기를 지휘하세요.", `ROUND ${String(season.round + 1).padStart(2, "0")}`)}
    <div class="grid dashboard-grid">
      <section class="panel">
        <div class="panel-header"><h2>NEXT FIXTURE</h2><span class="kicker">${fixture.home === "team-0" ? "HOME" : "AWAY"}</span></div>
        <div class="panel-body">
          <div class="versus">
            <div><span class="crest" style="color:${home.color}">${home.short}</span><span class="team-name">${home.name}</span><span class="team-rating">POWER ${home.rating}</span></div>
            <span class="vs-mark">VS</span>
            <div><span class="crest" style="color:${away.color}">${away.short}</span><span class="team-name">${away.name}</span><span class="team-rating">POWER ${away.rating}</span></div>
          </div>
          <div class="formation-editor">
            <div class="formation-buttons" aria-label="포메이션 선택">
              ${Object.keys(FORMATIONS).map((formation) => `<button class="choice-button" data-formation="${formation}" aria-pressed="${season.formation === formation}">${formation}</button>`).join("")}
            </div>
            <p class="editor-help" id="editor-help">선수 마커를 드래그하거나 초점을 맞춘 뒤 방향키로 3%씩 이동하세요. 골키퍼는 페널티 구역 안에서만 움직입니다.</p>
            <div class="formation-pitch" id="formation-pitch" aria-label="선발 11명 위치 편집" aria-describedby="editor-help">
              ${slots.map((slot, index) => { const player = season.players.find(({ id }) => id === lineup[index].playerId); return `<button class="formation-marker${slot.playerId === "player-0" ? " goalkeeper" : ""}" data-slot="${slot.playerId}" style="--x:${slot.x};--y:${slot.y}" aria-label="${player?.name || slot.role}, ${slot.role}, 위치 ${slot.x}, ${slot.y}">${player?.name.slice(-2) || slot.role}<span>${slot.role}</span></button>`; }).join("")}
            </div>
            <p class="editor-status" id="position-status" aria-live="polite">선수를 선택해 위치를 조정하세요.</p>
            <p class="editor-status" id="suitability-status" aria-live="polite">${suitabilityMessage()}</p>
          </div>
          <div class="tactics" aria-label="전술 선택">
            ${[["attacking", "공격형"], ["balanced", "균형형"], ["defensive", "수비형"]].map(([value, label]) => `<button class="choice-button tactic" data-tactic="${value}" aria-pressed="${season.tactic === value}">${label}</button>`).join("")}
          </div>
          <button class="primary-button" id="start-match" ${matchRunning ? "disabled" : ""}>${matchRunning ? "경기 진행 중" : "경기 시작"}</button>
        </div>
      </section>
      <div class="stack">
        <section class="panel"><div class="panel-header"><h2>SEASON SNAPSHOT</h2></div><div class="panel-body stat-row"><div class="stat"><strong>${table.indexOf(userRow) + 1}</strong><span>현재 순위</span></div><div class="stat"><strong>${userRow.points}</strong><span>승점</span></div><div class="stat"><strong>${userRow.goalDifference > 0 ? "+" : ""}${userRow.goalDifference}</strong><span>득실차</span></div></div></section>
        <section class="panel"><div class="panel-header"><h2>RECENT FORM</h2></div><div class="panel-body"><div class="form">${recent.length ? recent.map((item) => { const ours = item.home === "team-0" ? item.result.home : item.result.away; const theirs = item.home === "team-0" ? item.result.away : item.result.home; const result = ours > theirs ? "W" : ours < theirs ? "L" : "D"; return `<span class="${result === "L" ? "loss" : result === "D" ? "draw" : ""}">${result}</span>`; }).join("") : "<small>첫 경기를 준비하세요.</small>"}</div></div></section>
        <section class="panel"><div class="panel-header"><h2>TOP TABLE</h2></div>${tableMarkup(4)}</section>
      </div>
    </div>`;
}

function suitabilityMessage() {
  const { warnings, penalty } = formationSuitability(season);
  return warnings.length ? `적합도 경고: ${warnings.map(({ name }) => name).join(", ")} · 팀 전력 -${penalty.toFixed(2)}` : "포지션 적합 · 팀 전력 감점 없음";
}

function positionMarker(marker, x, y) {
  season = movePlayer(season, marker.dataset.slot, x, y);
  const position = season.customPositions[marker.dataset.slot];
  marker.style.setProperty("--x", position.x);
  marker.style.setProperty("--y", position.y);
  const playerName = marker.getAttribute("aria-label").split(",")[0];
  marker.setAttribute("aria-label", `${playerName}, ${position.role}, 위치 ${position.x}, ${position.y}`);
  const status = document.querySelector("#position-status");
  if (status) status.textContent = `${playerName} 위치 ${position.x}, ${position.y}`;
  document.querySelector("#suitability-status").textContent = suitabilityMessage();
}

function pointerPosition(event) {
  const pitch = document.querySelector("#formation-pitch");
  if (!pitch) return null;
  const bounds = pitch.getBoundingClientRect();
  return {
    x: (event.clientX - bounds.left) / bounds.width * 100,
    y: (event.clientY - bounds.top) / bounds.height * 100,
  };
}

function renderSquad() {
  const ordered = [...season.players].sort((a, b) => Number(b.starter) - Number(a.starter));
  app.innerHTML = `${header("FIRST TEAM", "후보를 선택하면 같은 포지션의 선발과 교체됩니다.", "SQUAD / 18")}
    <div class="grid squad-grid">${ordered.map((player) => `<article class="player-card ${player.starter ? "starter" : ""}">
      <span class="position">${player.position}</span><div><strong>${player.name}</strong><small>${player.starter ? "STARTING XI" : `컨디션 ${player.condition}%`}</small></div><span class="rating">${player.rating}</span>
      ${player.starter ? "" : `<button data-player="${player.id}">${player.position} 선발로 교체</button>`}
    </article>`).join("")}</div>`;
}

function renderFixtures() {
  app.innerHTML = `${header("FIXTURE GRID", "14라운드 전체 일정과 결과입니다.", "SEASON 01")}
    <section class="panel">${season.fixtures.map((round, index) => `<div class="round-block"><h3>ROUND ${String(index + 1).padStart(2, "0")} ${index === season.round ? "· NEXT" : ""}</h3>${round.map((fixture) => `<div class="fixture-row"><span>${team(fixture.home).name}</span><strong class="fixture-score">${fixture.result ? `${fixture.result.home} : ${fixture.result.away}` : "— : —"}</strong><span>${team(fixture.away).name}</span></div>`).join("")}</div>`).join("")}</section>`;
}

function renderTable() {
  app.innerHTML = `${header("LEAGUE TABLE", "승점, 득실차, 다득점 순으로 결정됩니다.", "LIVE STANDINGS")}<section class="panel">${tableMarkup()}</section>`;
}

function renderSeasonEnd() {
  const table = calculateTable(season);
  const position = table.findIndex(({ teamId }) => teamId === "team-0") + 1;
  app.innerHTML = `${header("SEASON COMPLETE", "14라운드의 여정이 끝났습니다.", "FULL TIME")}<section class="panel season-end"><span class="kicker">FINAL POSITION</span><strong>${position}위</strong><p>${position === 1 ? "리그 챔피언입니다!" : "다음 시즌에는 더 높은 곳으로."}</p><button class="secondary-button" id="new-season">새 시즌 시작</button></section><section class="panel" style="margin-top:18px">${tableMarkup()}</section>`;
}

function updateChrome() {
  const active = screen === "active" ? activeSlotResult() : null;
  const managerActive = active?.slot.mode === "manager";
  sidebar.hidden = !managerActive;
  workspace.classList.toggle("single-column", !managerActive);
  careerExit.hidden = !active;
  saveStatus.textContent = statusMessage;
  if (!active) {
    careerContext.textContent = screen === "create" ? `새 커리어 · SLOT ${createSlotIndex + 1}` : "메인 메뉴";
    clubName.textContent = "커리어 선택";
    roundStatus.textContent = "3 SAVE SLOTS";
    return;
  }
  const slot = active.slot;
  const round = slot.mode === "manager" ? season.round : slot.round;
  careerContext.textContent = `${slot.mode === "manager" ? "감독" : "선수"} 모드 · SLOT ${active.index + 1}`;
  clubName.textContent = slotClub(slot);
  roundStatus.textContent = round >= 14 ? "SEASON COMPLETE" : `ROUND ${String(round + 1).padStart(2, "0")} / 14`;
  document.querySelector(".manager-card strong").textContent = slot.name;
}

function syncNavigation() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    const active = button.dataset.view === activeView;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function render() {
  updateChrome();
  syncNavigation();
  if (screen === "start") return renderStart();
  if (screen === "create") return renderCreate();
  if (activeSlotResult()?.slot.mode === "player") return renderPlayerCareer();
  if (activeView === "squad") renderSquad();
  else if (activeView === "fixtures") renderFixtures();
  else if (activeView === "table") renderTable();
  else renderDashboard();
}

function drawPitch(canvas, state = visualState) {
  const ratio = devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  const context = canvas.getContext("2d");
  context.scale(ratio, ratio);
  context.fillStyle = "#174c37";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#1b5940";
  for (let x = 0; x < width; x += 60) context.fillRect(x, 0, 30, height);
  context.strokeStyle = "#9ed3b6";
  context.lineWidth = 2;
  context.strokeRect(18, 18, width - 36, height - 36);
  context.beginPath(); context.moveTo(width / 2, 18); context.lineTo(width / 2, height - 18); context.stroke();
  context.beginPath(); context.arc(width / 2, height / 2, 48, 0, Math.PI * 2); context.stroke();
  const boxWidth = (width - 36) * 0.18;
  const boxTop = 18 + (height - 36) * 0.21;
  context.strokeRect(18, boxTop, boxWidth, (height - 36) * 0.58);
  context.strokeRect(width - 18 - boxWidth, boxTop, boxWidth, (height - 36) * 0.58);
  for (const position of state.players) {
    const { x, y } = pitchPoint(position, width, height);
    context.fillStyle = team(position.teamId).color;
    context.fillRect(x - 5, y - 5, 10, 10);
    context.fillRect(x - 8, y - 3, 16, 4);
  }
  const ball = pitchPoint(state.ball, width, height);
  context.fillStyle = "#f7f2d0";
  context.fillRect(ball.x - 4, ball.y - 4, 8, 8);
}

function animatePitch(canvas, event, fixture, reduceMotion) {
  const previous = visualState;
  const target = matchVisualState(season, fixture, event);
  if (reduceMotion) {
    visualState = target;
    drawPitch(canvas);
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const started = performance.now();
    const frame = (now) => {
      const progress = Math.min(1, (now - started) / 360);
      visualState = interpolateMatchState(previous, target, progress);
      drawPitch(canvas);
      if (progress < 1) requestAnimationFrame(frame); else resolve();
    };
    requestAnimationFrame(frame);
  });
}

async function playMatch() {
  if (matchRunning) return;
  matchRunning = true;
  const round = season.round;
  const fixture = userFixture(round);
  const outcome = completeRound(season, Math.random, round);
  const result = outcome.userResult;
  const home = team(fixture.home);
  const away = team(fixture.away);
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  app.innerHTML = `${header("LIVE MATCH", "전술 지시가 경기장에서 실행되고 있습니다.", "TOUCHLINE FEED")}
    <section class="panel"><div class="match-stage"><div class="pitch-wrap"><canvas id="match-canvas" aria-label="22명의 선수와 공이 움직이는 픽셀 경기장"></canvas><div class="scoreboard"><span id="match-minute">00'</span><br><strong id="match-score">${home.short} 0 : 0 ${away.short}</strong></div></div><div class="highlight" id="match-highlight" hidden></div></div><p class="sr-only" id="match-announcement" aria-live="assertive" aria-atomic="true"></p><ol class="commentary" id="commentary" aria-live="polite"></ol></section>`;
  const canvas = document.querySelector("#match-canvas");
  const score = document.querySelector("#match-score");
  const minuteLabel = document.querySelector("#match-minute");
  const log = document.querySelector("#commentary");
  const highlight = document.querySelector("#match-highlight");
  visualState = matchVisualState(season, fixture);
  drawPitch(canvas);
  await highlightsReady;
  for (const [index, event] of result.events.entries()) {
    highlight.hidden = true;
    highlight.replaceChildren();
    await animatePitch(canvas, event, fixture, reduceMotion);
    minuteLabel.textContent = `${event.minute}'`;
    const sentence = commentate(event, season);
    const currentScore = scoreForEvents(fixture, result.events.slice(0, index + 1));
    score.textContent = `${home.short} ${currentScore.home} : ${currentScore.away} ${away.short}`;
    if (event.type === "goal" || event.type === "full-time") document.querySelector("#match-announcement").textContent = `${sentence} ${score.textContent}`;
    const item = document.createElement("li");
    item.textContent = sentence;
    log.append(item);
    const image = highlightImages[event.type];
    if (image) {
      image.alt = sentence;
      const caption = document.createElement("p");
      caption.textContent = sentence;
      highlight.append(image, caption);
      highlight.hidden = false;
    }
    log.scrollTop = log.scrollHeight;
    await new Promise((resolve) => setTimeout(resolve, image ? 1800 : 600));
    if (event.type === "goal" || event.type === "save") await animatePitch(canvas, { type: "kickoff" }, fixture, reduceMotion);
  }
  score.textContent = `${home.short} ${result.home} : ${result.away} ${away.short}`;
  season = outcome.season;
  saveSeason();
  matchRunning = false;
  log.insertAdjacentHTML("afterend", '<button class="primary-button" id="match-complete">경기 결과 계속 보기</button>');
}

sidebar.addEventListener("click", (event) => {
  const button = event.target.closest("[data-view]");
  if (!button || matchRunning) return;
  activeView = button.dataset.view;
  render();
  app.focus();
});

app.addEventListener("click", (event) => {
  const startButton = event.target.closest("[data-start-view]");
  const modeButton = event.target.closest("[data-career-mode]");
  const slotButton = event.target.closest("[data-slot-action]");
  const formation = event.target.closest("[data-formation]");
  const tactic = event.target.closest("[data-tactic]");
  const player = event.target.closest("[data-player]");
  const autoTraining = event.target.closest("#auto-training");
  const completeTraining = event.target.closest("#complete-training-week");
  if (startButton) {
    if (startButton.dataset.startView === "new") {
      const openIndex = firstOpenSlot();
      if (openIndex < 0) {
        startView = "manage";
        statusMessage = "저장 슬롯은 최대 3개입니다.";
        render();
      } else beginCreation(openIndex);
    } else {
      startView = startButton.dataset.startView;
      render();
    }
  } else if (modeButton) {
    if (modeButton.dataset.careerMode === "player" && selectedMode !== "player") resetPlayerCreation();
    selectedMode = modeButton.dataset.careerMode;
    renderCreate();
  } else if (slotButton) {
    const index = Number(slotButton.dataset.slotIndex);
    if (slotButton.dataset.slotAction === "continue") activateSlot(index);
    else beginCreation(index);
  } else if (event.target.closest("#cancel-create")) {
    screen = "start";
    render();
  } else if (event.target.closest("[data-player-back]")) {
    playerCreationStep = Math.max(1, playerCreationStep - 1);
    playerCreationError = "";
    playerOfferState = null;
    renderCreate();
  } else if (event.target.closest("[data-offer-index]")) {
    acceptPlayerOffer(Number(event.target.closest("[data-offer-index]").dataset.offerIndex));
  } else if (autoTraining) {
    const current = activeSlotResult().slot.career.player;
    const goal = document.querySelector("#training-goal").value;
    const intensity = document.querySelector("#training-intensity").value;
    const schedule = buildAutoSchedule(current, PLAYER_MATCH_DAY, goal, intensity);
    const nextPlayer = { ...current, training: { ...current.training, goal, intensity, schedule } };
    playerTrainingMessage = "자동 일정이 저장되었습니다.";
    savePlayerCareer(nextPlayer, "훈련 일정 저장 완료");
    renderPlayerCareer();
  } else if (completeTraining) {
    const current = activeSlotResult().slot.career.player;
    try {
      const result = applyTrainingWeek(current, playerSchedule(current), Math.random);
      const improved = Object.values(result.growth).reduce((sum, value) => sum + value, 0);
      playerTrainingMessage = `주간 훈련 완료 · 경험치 +${Math.round(result.player.training.experience - (current.training.experience || 0))} · 능력치 +${improved}`;
      savePlayerCareer(result.player, "주간 훈련 저장 완료");
      renderPlayerCareer();
    } catch (error) {
      playerTrainingMessage = error.message;
      renderPlayerCareer();
    }
  } else if (formation) {
    season.formation = formation.dataset.formation;
    season.customPositions = Object.fromEntries(formationPositions(season.formation).map((position) => [position.playerId, position]));
    saveSeason();
    renderDashboard();
  } else if (tactic) {
    season.tactic = tactic.dataset.tactic;
    saveSeason();
    renderDashboard();
  } else if (player) {
    season = swapStarter(season, player.dataset.player);
    saveSeason();
    renderSquad();
  } else if (event.target.closest("#start-match")) {
    playMatch();
  } else if (event.target.closest("#new-season")) {
    if (confirm("현재 시즌 기록을 지우고 새 시즌을 시작할까요?")) {
      season = assignCareerClub(createSeason(), activeSlotResult().slot.career.selectedClubId || "team-0");
      activeView = "dashboard";
      saveSeason();
      render();
    }
  } else if (event.target.closest("#match-complete")) {
    renderDashboard();
  }
});

app.addEventListener("change", (event) => {
  const control = event.target.closest("[data-training-day]");
  if (!control) return;
  const current = activeSlotResult().slot.career.player;
  const day = Number(control.dataset.trainingDay);
  const schedule = playerSchedule(current);
  const session = { ...schedule[day], [control.dataset.trainingField]: control.value };
  if (["recovery", "rest"].includes(session.type)) session.intensity = "low";
  const nextSchedule = schedule.with(day, session);
  const validation = validateSchedule(current, nextSchedule, PLAYER_MATCH_DAY);
  if (!validation.ok) {
    playerTrainingMessage = validation.errors.join(" ");
    renderPlayerCareer();
    return;
  }
  const nextPlayer = { ...current, training: { ...current.training, schedule: nextSchedule } };
  playerTrainingMessage = `${TRAINING_DAYS[day]}요일 일정이 저장되었습니다.`;
  savePlayerCareer(nextPlayer, "훈련 일정 저장 완료");
  renderPlayerCareer();
});

app.addEventListener("submit", (event) => {
  if (!event.target.matches("#manager-create-form, #player-create-form")) return;
  event.preventDefault();
  if (event.target.matches("#player-create-form")) submitPlayerCreationStep(event.target);
  else createCareer(event.target);
});

app.addEventListener("input", (event) => {
  const form = event.target.closest("#player-create-form");
  if (!form || playerCreationStep !== 4) return;
  if (playerOfferState) {
    playerOfferState = null;
    form.querySelector(".offer-list")?.remove();
    const submit = form.querySelector('button[type="submit"]');
    if (submit) submit.textContent = "입단 제안 확인";
  }
  const base = ARCHETYPES[playerDraft.archetype].attributes;
  const values = Object.keys(base).map((name) => Number(form.elements[`adjustment-${name}`].value));
  const positive = values.filter((value) => value > 0).reduce((sum, value) => sum + value, 0);
  const balance = values.reduce((sum, value) => sum + value, 0);
  const summary = form.querySelector("#point-summary");
  if (summary) summary.textContent = `더한 포인트 ${positive}/10 · 총 조정 ${balance}`;
  Object.entries(base).forEach(([name, score]) => {
    const output = form.querySelector(`[data-final-attribute="${name}"]`);
    if (output) output.value = String(score + Number(form.elements[`adjustment-${name}`].value));
  });
});

careerExit.addEventListener("click", () => {
  if (matchRunning) return;
  const active = activeSlotResult();
  const next = updateActiveSlotInMemory(null);
  const saved = saveCareerStore(localStorage, next);
  if (!saved.ok) {
    careerStore = normalizeStore(active.slot.id, next.slots);
    statusMessage = saved.error;
    updateChrome();
    return;
  }
  careerStore = next;
  statusMessage = "저장 완료";
  screen = "start";
  startView = "home";
  render();
  app.focus();
});

app.addEventListener("pointerdown", (event) => {
  const marker = event.target.closest("[data-slot]");
  if (!marker) return;
  draggedMarker = marker;
  marker.setPointerCapture(event.pointerId);
  event.preventDefault();
});

app.addEventListener("pointermove", (event) => {
  if (!draggedMarker) return;
  const position = pointerPosition(event);
  if (position) positionMarker(draggedMarker, position.x, position.y);
});

app.addEventListener("pointerup", () => {
  if (!draggedMarker) return;
  draggedMarker = null;
  saveSeason();
});

app.addEventListener("pointercancel", () => {
  if (!draggedMarker) return;
  draggedMarker = null;
  saveSeason();
});

app.addEventListener("keydown", (event) => {
  const marker = event.target.closest("[data-slot]");
  const moves = { ArrowLeft: [-3, 0], ArrowRight: [3, 0], ArrowUp: [0, -3], ArrowDown: [0, 3] };
  if (!marker || !moves[event.key]) return;
  event.preventDefault();
  const current = season.customPositions[marker.dataset.slot];
  positionMarker(marker, current.x + moves[event.key][0], current.y + moves[event.key][1]);
  saveSeason();
});

window.addEventListener("resize", () => {
  const canvas = document.querySelector("#match-canvas");
  if (canvas) drawPitch(canvas);
});

careerStore = initializeCareerStore();
const restored = activeSlotResult();
if (restored) {
  season = migrateSeason(restored.slot.world);
  screen = "active";
}
render();
