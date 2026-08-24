(function () {
"use strict";

const COLS = 24, ROWS = 24;
const canvas = document.getElementById("stage");
const ctx = canvas.getContext("2d");
let CELL = canvas.width / COLS;

const SPEED_MS = { slow: 150, normal: 105, fast: 72 };

const BONUS_TYPES = [
  { id: "ruby",     color: getVar("--red"),    pts: 50, life: 5000, kind: "score" },
  { id: "topaz",    color: getVar("--gold"),   pts: 80, life: 4000, kind: "score+coin", coins: 8 },
  { id: "sapphire", color: getVar("--blue"),   pts: 40, life: 5000, kind: "slowmo", fxMs: 4000 },
  { id: "amethyst", color: getVar("--purple"), pts: 40, life: 5000, kind: "multiplier", fxMs: 8000 },
  { id: "coin",     color: getVar("--silver"), pts: 0,  life: 6000, kind: "coin", coins: 15 },
];

let G = null;

function freshState() {
  const startX = Math.floor(COLS / 2), startY = Math.floor(ROWS / 2);
  return {
    snake: [{ x: startX - 1, y: startY }, { x: startX - 2, y: startY }, { x: startX - 3, y: startY }],
    dir: { x: 1, y: 0 }, nextDir: { x: 1, y: 0 },
    food: null,
    bonus: null, bonusExpireAt: 0,
    foodStreak: 0,
    score: 0,
    tickMs: SPEED_MS[save.settings.speed],
    baseTickMs: SPEED_MS[save.settings.speed],
    running: true, paused: false, over: false,
    multiplierUntil: 0, slowUntil: 0,
    lastTick: 0, acc: 0,
    particles: [],
    shakeUntil: 0,
  };
}

function randCell(exclude) {
  let p;
  do { p = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) }; }
  while (exclude.some(e => e.x === p.x && e.y === p.y));
  return p;
}

function startGame() {
  ensureAudio();
  G = freshState();
  G.food = randCell(G.snake);
  document.getElementById("overlay-gameover").classList.remove("show");
  document.getElementById("overlay-pause").classList.remove("show");
  document.getElementById("bonus-banner").classList.remove("show");
  document.getElementById("active-fx").innerHTML = "";
  document.getElementById("hud-best").textContent = save.highScore;
  updateHud();
  requestAnimationFrame(loop);
}
function updateHud() { document.getElementById("hud-score").textContent = G.score; }

/* ---- input ---- */
const KEY_DIR = {
  ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 }, ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 },
  w: { x: 0, y: -1 }, s: { x: 0, y: 1 }, a: { x: -1, y: 0 }, d: { x: 1, y: 0 },
};
window.addEventListener("keydown", (e) => {
  if (!G) return;
  if (e.key === "p" || e.key === "P" || e.key === "Escape") { togglePause(); return; }
  const d = KEY_DIR[e.key];
  if (d && G.running && !G.paused) trySetDir(d);
});
function trySetDir(d) {
  if (d.x === -G.dir.x && d.y === -G.dir.y) return;
  G.nextDir = d;
}
document.querySelectorAll("#dpad [data-dir]").forEach(b => {
  b.addEventListener("click", () => {
    const map = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
    if (G && G.running && !G.paused) trySetDir(map[b.dataset.dir]);
  });
});
document.getElementById("btn-pause-mid").addEventListener("click", togglePause);

let touchStart = null;
canvas.addEventListener("touchstart", (e) => { touchStart = e.changedTouches[0]; }, { passive: true });
canvas.addEventListener("touchend", (e) => {
  if (!touchStart || !G) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - touchStart.clientX, dy = t.clientY - touchStart.clientY;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
  if (Math.abs(dx) > Math.abs(dy)) trySetDir({ x: dx > 0 ? 1 : -1, y: 0 });
  else trySetDir({ x: 0, y: dy > 0 ? 1 : -1 });
}, { passive: true });

function togglePause() {
  if (!G || G.over) return;
  G.paused = !G.paused;
  document.getElementById("overlay-pause").classList.toggle("show", G.paused);
}
document.getElementById("btn-resume").addEventListener("click", togglePause);
document.getElementById("btn-quit-pause").addEventListener("click", () => { window.location.href = "index.html"; });
document.getElementById("btn-quit-go").addEventListener("click", () => { window.location.href = "index.html"; });
document.getElementById("btn-again").addEventListener("click", () => { startGame(); });

/* ---- bonus spawn ---- */
function maybeSpawnBonus() {
  if (G.bonus) return;
  if (G.foodStreak > 0 && G.foodStreak % 5 === 0) {
    const type = G.foodStreak === 5 ? BONUS_TYPES[0] : BONUS_TYPES[Math.floor(Math.random() * BONUS_TYPES.length)];
    const cell = randCell([...G.snake, G.food]);
    G.bonus = { ...type, x: cell.x, y: cell.y };
    G.bonusExpireAt = performance.now() + type.life;
    sfx.bonus();
  }
}

function addFloatText(text, x, y, color) {
  const layer = document.getElementById("fx-layer");
  const el = document.createElement("div");
  el.className = "float-text";
  el.textContent = text;
  el.style.color = color;
  const rect = canvas.getBoundingClientRect();
  const scaleX = rect.width / canvas.width, scaleY = rect.height / canvas.height;
  el.style.left = (x * scaleX) + "px";
  el.style.top = (y * scaleY) + "px";
  layer.appendChild(el);
  setTimeout(() => el.remove(), 1000);
}
function spawnParticles(cx, cy, color, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 2.5;
    G.particles.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, color });
  }
}
function activeFxChips() {
  const wrap = document.getElementById("active-fx");
  wrap.innerHTML = "";
  const now = performance.now();
  if (G.slowUntil > now) {
    const chip = document.createElement("div"); chip.className = "fx-chip";
    chip.style.color = getVar("--blue");
    chip.textContent = "🐌 slow-mo " + Math.ceil((G.slowUntil - now) / 1000) + "s";
    wrap.appendChild(chip);
  }
  if (G.multiplierUntil > now) {
    const chip = document.createElement("div"); chip.className = "fx-chip";
    chip.style.color = getVar("--purple");
    chip.textContent = "×2 score " + Math.ceil((G.multiplierUntil - now) / 1000) + "s";
    wrap.appendChild(chip);
  }
}

function endGame() {
  G.running = false; G.over = true;
  sfx.crash();
  const coinsFromScore = Math.floor(G.score / 10);
  save.coins += coinsFromScore;
  const isNewHigh = G.score > save.highScore;
  if (isNewHigh) save.highScore = G.score;
  save.history.unshift({ score: G.score, coins: coinsFromScore, date: Date.now() });
  save.history = save.history.slice(0, 10);
  persist();
  document.getElementById("go-title").textContent = isNewHigh ? "NEW HIGH SCORE!" : "GAME OVER";
  document.getElementById("go-sub").textContent = `Score ${G.score} · +${coinsFromScore} ¢ earned`;
  document.getElementById("overlay-gameover").classList.add("show");
}

function step() {
  G.dir = G.nextDir;
  const head = G.snake[0];
  let nx = head.x + G.dir.x, ny = head.y + G.dir.y;

  if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) {
    if (save.settings.wrap) { nx = (nx + COLS) % COLS; ny = (ny + ROWS) % ROWS; }
    else { endGame(); return; }
  }
  if (G.snake.some(s => s.x === nx && s.y === ny)) { endGame(); return; }

  const newHead = { x: nx, y: ny };
  G.snake.unshift(newHead);

  let grew = false;
  const mult = (G.multiplierUntil > performance.now()) ? 2 : 1;

  if (G.food && nx === G.food.x && ny === G.food.y) {
    const pts = 10 * mult;
    G.score += pts;
    G.foodStreak++;
    grew = true;
    sfx.eat();
    spawnParticles(nx * CELL + CELL / 2, ny * CELL + CELL / 2, getVar("--green"), 10);
    addFloatText("+" + pts, nx * CELL, ny * CELL, getVar("--green"));
    G.food = randCell([...G.snake, ...(G.bonus ? [G.bonus] : [])]);
    maybeSpawnBonus();
  }

  if (G.bonus && nx === G.bonus.x && ny === G.bonus.y) {
    const b = G.bonus;
    const pts = Math.round(b.pts * mult);
    G.score += pts;
    grew = grew || pts > 0;
    sfx.coin();
    spawnParticles(nx * CELL + CELL / 2, ny * CELL + CELL / 2, b.color, 18);
    if (pts > 0) addFloatText("+" + pts, nx * CELL, ny * CELL - 14, b.color);
    if (b.kind === "score+coin" || b.kind === "coin") {
      save.coins += b.coins;
      addFloatText("+" + b.coins + "¢", nx * CELL, ny * CELL + 2, getVar("--gold"));
      persist();
    }
    if (b.kind === "slowmo") G.slowUntil = performance.now() + b.fxMs;
    if (b.kind === "multiplier") G.multiplierUntil = performance.now() + b.fxMs;
    if (save.settings.shake) G.shakeUntil = performance.now() + 220;
    G.bonus = null;
    if (!grew) G.snake.pop();
  } else if (!grew) {
    G.snake.pop();
  }

  G.tickMs = (G.slowUntil > performance.now()) ? G.baseTickMs * 1.9 : G.baseTickMs;
  updateHud();
  activeFxChips();
}

function drawGrid() {
  ctx.fillStyle = "#04070d";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "rgba(255,255,255,0.025)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= COLS; i++) { ctx.beginPath(); ctx.moveTo(i * CELL, 0); ctx.lineTo(i * CELL, canvas.height); ctx.stroke(); }
  for (let j = 0; j <= ROWS; j++) { ctx.beginPath(); ctx.moveTo(0, j * CELL); ctx.lineTo(canvas.width, j * CELL); ctx.stroke(); }
}
function drawFoodDot(cell, color, pulse) {
  const cx = cell.x * CELL + CELL / 2, cy = cell.y * CELL + CELL / 2;
  const r = CELL * 0.32 + (pulse ? Math.sin(performance.now() / 120) * 1.5 : 0);
  ctx.save();
  ctx.shadowColor = color; ctx.shadowBlur = 16;
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
function drawSnake() {
  const skin = skinById(save.selectedSkin);
  G.snake.forEach((s, i) => {
    const isHead = i === 0;
    let color;
    if (skin.body === "rainbow") color = isHead ? skin.head : `hsl(${(performance.now() / 12 + i * 24) % 360} 90% 65%)`;
    else color = isHead ? skin.head : skin.body;
    ctx.save();
    ctx.shadowColor = skin.glow; ctx.shadowBlur = isHead ? 14 : 8;
    ctx.fillStyle = color;
    const pad = isHead ? 1 : 2;
    const x = s.x * CELL + pad, y = s.y * CELL + pad, w = CELL - pad * 2;
    const r = w * 0.32;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, w, r); else ctx.rect(x, y, w, w);
    ctx.fill();
    ctx.restore();
    if (isHead) {
      ctx.fillStyle = "#04150f";
      const ex = G.dir.x * 3, ey = G.dir.y * 3;
      const cx = s.x * CELL + CELL / 2, cy = s.y * CELL + CELL / 2;
      ctx.beginPath(); ctx.arc(cx - 4 + ex * 0.4, cy - 2 + ey * 0.4, 1.6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 4 + ex * 0.4, cy - 2 + ey * 0.4, 1.6, 0, Math.PI * 2); ctx.fill();
    }
  });
}
function drawParticles(dt) {
  ctx.save();
  G.particles.forEach(p => {
    p.x += p.vx; p.y += p.vy; p.life -= dt / 400;
    ctx.globalAlpha = Math.max(p.life, 0);
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2); ctx.fill();
  });
  ctx.restore();
  G.particles = G.particles.filter(p => p.life > 0);
}
function render(dt) {
  ctx.save();
  if (G.shakeUntil > performance.now()) ctx.translate((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
  drawGrid();
  if (G.food) drawFoodDot(G.food, getVar("--green"), false);
  if (G.bonus) drawFoodDot(G.bonus, G.bonus.color, true);
  drawSnake();
  drawParticles(dt);
  ctx.restore();
}
function updateBonusBanner() {
  const banner = document.getElementById("bonus-banner");
  if (G.bonus) {
    const remaining = Math.max(0, (G.bonusExpireAt - performance.now()) / 1000);
    banner.classList.add("show");
    banner.style.color = G.bonus.color;
    document.getElementById("bonus-text").textContent = `Bonus ${remaining.toFixed(1)}s`;
    if (remaining <= 0) { G.bonus = null; banner.classList.remove("show"); }
  } else {
    banner.classList.remove("show");
  }
}
function loop(ts) {
  if (!G || G.over) return;
  if (!G.lastTick) G.lastTick = ts;
  const dt = ts - G.lastTick;
  G.lastTick = ts;
  if (!G.paused) {
    G.acc += dt;
    while (G.acc >= G.tickMs) {
      step();
      G.acc -= G.tickMs;
      if (G.over) break;
    }
    updateBonusBanner();
  }
  render(dt);
  requestAnimationFrame(loop);
}

startGame();
})();
