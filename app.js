import { calculateTable, commentate, completeRound, createSeason, formationPositions, lineupPositions, migrateSeason, swapStarter } from "./game.js";

const STORAGE_KEY = "pixel-manager-season-v1";
const app = document.querySelector("#app");
const saveStatus = document.querySelector("#save-status");
const roundStatus = document.querySelector("#round-status");
let activeView = "dashboard";
let matchRunning = false;

function validSeason(value) {
  return (value?.version === 1 || value?.version === 2)
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
    if (validSeason(saved)) return migrateSeason(saved);
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

const eventShift = (position, event, home) => {
  const direction = home ? 1 : -1;
  const shifts = {
    "build-up": [8, 0], pressure: [12, 0], dribble: [16, position.y < 50 ? -10 : 10],
    pass: [18, 0], shot: [28, 0], goal: [34, 0],
  };
  const [x, y] = shifts[event?.type] || [event?.zone === "counter" ? 22 : 0, event?.zone === "flank" ? 12 : 0];
  return { x: Math.max(4, Math.min(96, position.x + x * direction)), y: Math.max(5, Math.min(95, position.y + y)) };
};

function drawPitch(canvas, event = { type: "kickoff" }, fixture = userFixture(), progress = 1) {
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
  const base = lineupPositions(season);
  const userHome = fixture?.home === "team-0";
  const sides = [
    { home: userHome, color: team("team-0")?.color || "#44d17a", positions: base },
    { home: !userHome, color: team(fixture?.home === "team-0" ? fixture?.away : fixture?.home)?.color || "#fb7185", positions: formationPositions("4-3-3") },
  ];
  let ball = { x: 50, y: 50 };
  for (const side of sides) {
    for (const position of side.positions) {
      const start = side.home ? position : { ...position, x: 100 - position.x, y: 100 - position.y };
      const active = event?.teamId === (side.home ? fixture?.home : fixture?.away);
      const target = active ? eventShift(start, event, side.home) : start;
      const x = start.x + (target.x - start.x) * progress;
      const y = start.y + (target.y - start.y) * progress;
      const px = 18 + (width - 36) * x / 100;
      const py = 18 + (height - 36) * y / 100;
      context.fillStyle = side.color;
      context.fillRect(px - 5, py - 5, 10, 10);
      context.fillRect(px - 8, py - 3, 16, 4);
      if (active && position.playerId === event.playerId) ball = { x: px, y: py };
    }
  }
  context.fillStyle = "#f7f2d0";
  context.fillRect(ball.x - 4, ball.y - 4, 8, 8);
}

function animatePitch(canvas, event, fixture, reduceMotion) {
  if (reduceMotion) {
    drawPitch(canvas, event, fixture);
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const started = performance.now();
    const frame = (now) => {
      const progress = Math.min(1, (now - started) / 360);
      drawPitch(canvas, event, fixture, progress);
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
    <section class="panel"><div class="pitch-wrap"><canvas id="match-canvas" aria-label="22명의 선수와 공이 움직이는 픽셀 경기장"></canvas><div class="scoreboard"><span id="match-minute">00'</span><br><strong id="match-score">${home.short} ${result.home} : ${result.away} ${away.short}</strong></div></div><ol class="commentary" id="commentary" aria-live="polite"></ol></section>`;
  const canvas = document.querySelector("#match-canvas");
  const score = document.querySelector("#match-score");
  const minuteLabel = document.querySelector("#match-minute");
  const log = document.querySelector("#commentary");
  for (const event of result.events) {
    await animatePitch(canvas, event, fixture, reduceMotion);
    minuteLabel.textContent = `${event.minute}'`;
    const item = document.createElement("li");
    item.textContent = commentate(event, season);
    log.append(item);
    log.scrollTop = log.scrollHeight;
    await new Promise((resolve) => setTimeout(resolve, reduceMotion ? 600 : 60));
  }
  score.textContent = `${home.short} ${result.home} : ${result.away} ${away.short}`;
  season = outcome.season;
  saveSeason();
  matchRunning = false;
  log.insertAdjacentHTML("afterend", '<button class="primary-button" id="match-complete">경기 결과 계속 보기</button>');
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
  } else if (event.target.closest("#match-complete")) {
    renderDashboard();
  }
});

window.addEventListener("resize", () => {
  const canvas = document.querySelector("#match-canvas");
  if (canvas) drawPitch(canvas);
});

render();
