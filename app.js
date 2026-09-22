import { calculateTable, completeRound, createSeason, swapStarter } from "./game.js";

const STORAGE_KEY = "pixel-manager-season-v1";
const app = document.querySelector("#app");
const saveStatus = document.querySelector("#save-status");
const roundStatus = document.querySelector("#round-status");
let activeView = "dashboard";
let matchRunning = false;

function validSeason(value) {
  return value?.version === 1
    && Array.isArray(value.teams)
    && value.teams.length === 8
    && Array.isArray(value.players)
    && value.players.length === 18
    && Array.isArray(value.fixtures)
    && value.fixtures.length === 14
    && Array.isArray(value.completedRoundIds);
}

function loadSeason() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (validSeason(saved)) return saved;
  } catch {
    saveStatus.textContent = "새 시즌 복구";
  }
  return createSeason();
}

let season = loadSeason();

function saveSeason() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(season));
    saveStatus.textContent = "저장 완료";
  } catch {
    saveStatus.textContent = "저장 실패";
  }
}

const team = (id) => season.teams.find((item) => item.id === id);
const userFixture = (round = season.round) => season.fixtures[round]?.find(
  (fixture) => fixture.home === "team-0" || fixture.away === "team-0",
);

function header(title, description, kicker = "CLUB HQ") {
  return `<div class="page-heading"><div><span class="kicker">${kicker}</span><h1>${title}</h1></div><p>${description}</p></div>`;
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

function render() {
  roundStatus.textContent = season.round >= 14 ? "SEASON COMPLETE" : `ROUND ${String(season.round + 1).padStart(2, "0")} / 14`;
  if (activeView === "squad") renderSquad();
  else if (activeView === "fixtures") renderFixtures();
  else if (activeView === "table") renderTable();
  else renderDashboard();
}

function drawPitch(canvas, minute = 0) {
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
  const ballX = 30 + (width - 60) * (minute / 90);
  context.fillStyle = "#f7f2d0";
  context.fillRect(ballX - 4, height / 2 - 4, 8, 8);
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
    <section class="panel"><div class="pitch-wrap"><canvas id="match-canvas" aria-label="픽셀 경기장 경기 진행 화면"></canvas><div class="scoreboard"><span id="match-minute">00'</span><br><strong id="match-score">${home.short} 0 : 0 ${away.short}</strong></div></div><ol class="commentary" id="commentary" aria-live="polite"><li>킥오프! 경기가 시작됩니다.</li></ol></section>`;
  const canvas = document.querySelector("#match-canvas");
  const score = document.querySelector("#match-score");
  const minuteLabel = document.querySelector("#match-minute");
  const log = document.querySelector("#commentary");
  let homeGoals = 0;
  let awayGoals = 0;
  const moments = [...result.events, { minute: 90, type: "full-time" }];
  for (const event of moments) {
    await new Promise((resolve) => setTimeout(resolve, reduceMotion ? 40 : 420));
    drawPitch(canvas, event.minute);
    minuteLabel.textContent = `${event.minute}'`;
    if (event.type === "goal") {
      if (event.side === "home") homeGoals += 1; else awayGoals += 1;
      score.textContent = `${home.short} ${homeGoals} : ${awayGoals} ${away.short}`;
      log.insertAdjacentHTML("beforeend", `<li><strong>${event.minute}' GOAL!</strong> ${event.side === "home" ? home.name : away.name} 득점.</li>`);
      log.scrollTop = log.scrollHeight;
    }
  }
  log.insertAdjacentHTML("beforeend", `<li><strong>FULL TIME</strong> ${home.name} ${result.home}-${result.away} ${away.name}</li>`);
  season = outcome.season;
  saveSeason();
  matchRunning = false;
  await new Promise((resolve) => setTimeout(resolve, reduceMotion ? 80 : 900));
  renderDashboard();
}

document.querySelector(".sidebar").addEventListener("click", (event) => {
  const button = event.target.closest("[data-view]");
  if (!button || matchRunning) return;
  activeView = button.dataset.view;
  document.querySelectorAll("[data-view]").forEach((item) => {
    const active = item === button;
    item.classList.toggle("active", active);
    item.setAttribute("aria-pressed", String(active));
  });
  render();
  app.focus();
});

app.addEventListener("click", (event) => {
  const tactic = event.target.closest("[data-tactic]");
  const player = event.target.closest("[data-player]");
  if (tactic) {
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
      season = createSeason();
      activeView = "dashboard";
      saveSeason();
      render();
    }
  }
});

window.addEventListener("resize", () => {
  const canvas = document.querySelector("#match-canvas");
  if (canvas) drawPitch(canvas);
});

render();
