(function () {
"use strict";

const COLS = 24, ROWS = 24;
const canvas = document.getElementById("stage");
const ctx = canvas.getContext("2d");
let CELL = canvas.width / COLS;

const SPEED_MS = { slow: 150, normal: 105, fast: 72 };
const LEVEL_SCORE_STEP = 150;
const COMBO_WINDOW_MS = 2600;

const BONUS_TYPES = [
  { id: "ember",   color: getVar("--red"),     pts: 50,  life: 5000, kind: "score",       weight: 26 },
  { id: "sunstone",color: getVar("--sun"),     pts: 80,  life: 4000, kind: "score+coin",  coins: 8,  weight: 22 },
  { id: "frost",   color: getVar("--blue"),    pts: 40,  life: 5000, kind: "slowmo",      fxMs: 4000, weight: 18 },
  { id: "nebula",  color: getVar("--purple"),  pts: 40,  life: 5000, kind: "multiplier",  fxMs: 8000, weight: 18 },
  { id: "coin",    color: getVar("--silver"),  pts: 0,   life: 6000, kind: "coin",        coins: 15, weight: 20 },
  { id: "shield",  color: getVar("--shield"),  pts: 20,  life: 4500, kind: "shield",      fxMs: 6000, weight: 12 },
  { id: "diamond", color: getVar("--diamond"), pts: 150, life: 3500, kind: "score+coin",  coins: 40, weight: 6 },
];
function weightedBonusPick() {
  const total = BONUS_TYPES.reduce((s, b) => s + b.weight, 0);
  let r = Math.random() * total;
  for (const b of BONUS_TYPES) { r -= b.weight; if (r <= 0) return b; }
  return BONUS_TYPES[0];
}

/* ---- horizon backdrop (precomputed once) ---- */
const STARS = Array.from({ length: 70 }, () => ({
  x: Math.random() * canvas.width, y: Math.random() * canvas.height * 0.62,
  r: Math.random() * 1.3 + 0.3, phase: Math.random() * Math.PI * 2, speed: 0.5 + Math.random() * 1.2
}));

let G = null;

function freshState() {
  const startX = Math.floor(COLS / 2), startY = Math.floor(ROWS / 2);
  const snake = [{ x: startX - 1, y: startY }, { x: startX - 2, y: startY }, { x: startX - 3, y: startY }];
  return {
    snake, prevSnake: snake.map(s => ({ ...s })),
    dir: { x: 1, y: 0 }, nextDir: { x: 1, y: 0 },
    food: null,
    bonus: null, bonusExpireAt: 0,
    foodStreak: 0,
    score: 0,
    level: 1,
    tickMs: SPEED_MS[save.settings.speed],
    baseTickMs: SPEED_MS[save.settings.speed],
    running: true, paused: false, over: false,
    multiplierUntil: 0, slowUntil: 0, shieldUntil: 0,
    combo: 1, comboExpireAt: 0, bestComboThisRun: 1,
    lastTick: 0, acc: 0,
    particles: [],
    shakeUntil: 0, flashUntil: 0, flashColor: "255,180,84",
    obstacles: [],
    startedAt: performance.now(),
    everAte: false,
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
  document.getElementById("toast-layer").innerHTML = "";
  document.getElementById("combo-badge").classList.remove("show");
  document.getElementById("hud-best").textContent = save.highScore;
  updateHud();
  requestAnimationFrame(loop);
}
function updateHud() {
  document.getElementById("hud-score").textContent = G.score;
  document.getElementById("hud-level").textContent = G.level;
}

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

/* ---- toasts / achievements ---- */
function toast(title, subtitle, colorVar) {
  showToast(document.getElementById("toast-layer"), title, subtitle, colorVar);
}
function tryUnlock(id) {
  const a = unlockAchievement(id);
  if (a) {
    sfx.achievement();
    toast(a.icon + " " + a.name, a.desc, "--shield");
  }
}

/* ---- bonus spawn ---- */
function maybeSpawnBonus() {
  if (G.bonus) return;
  if (G.foodStreak > 0 && G.foodStreak % 5 === 0) {
    const type = G.foodStreak === 5 ? BONUS_TYPES[0] : weightedBonusPick();
    const cell = randCell([...G.snake, G.food, ...G.obstacles]);
    G.bonus = { ...type, x: cell.x, y: cell.y };
    G.bonusExpireAt = performance.now() + type.life;
    sfx.bonus();
  }
}

/* ---- hazards ---- */
function maybeAddHazard() {
  if (!save.settings.hazards) return;
  if (G.level < 3) return;
  const cap = Math.min(G.level - 2, 8);
  if (G.obstacles.length >= cap) return;
  const cell = randCell([...G.snake, G.food, ...(G.bonus ? [G.bonus] : []), ...G.obstacles]);
  G.obstacles.push(cell);
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
  if (G.shieldUntil > now) {
    const chip = document.createElement("div"); chip.className = "fx-chip";
    chip.style.color = getVar("--shield");
    chip.textContent = "🛡 shield " + Math.ceil((G.shieldUntil - now) / 1000) + "s";
    wrap.appendChild(chip);
  }
  const badge = document.getElementById("combo-badge");
  if (G.combo >= 2 && G.comboExpireAt > now) {
    badge.textContent = "COMBO ×" + G.combo;
    badge.classList.add("show");
  } else {
    badge.classList.remove("show");
  }
}

function endGame() {
  G.running = false; G.over = true;
  sfx.crash();
  const coinsFromScore = Math.floor(G.score / 10);
  addCoins(coinsFromScore);
  const isNewHigh = G.score > save.highScore;
  if (isNewHigh) save.highScore = G.score;
  save.gamesPlayed = (save.gamesPlayed || 0) + 1;
  if (G.bestComboThisRun > (save.bestCombo || 0)) save.bestCombo = G.bestComboThisRun;
  save.history.unshift({ score: G.score, coins: coinsFromScore, date: Date.now() });
  save.history = save.history.slice(0, 10);
  persist();

  // achievement checks
  const unlocked = [];
  const check = (id) => { const a = unlockAchievement(id); if (a) unlocked.push(a); };
  if (G.everAte) check("first_bite");
  if (G.score >= 100) check("half_century");
  if (G.score >= 250) check("centurion");
  if (G.score >= 500) check("legend");
  if (G.score >= 1000) check("horizon_master");
  if (G.bestComboThisRun >= 5) check("combo_king");
  if (performance.now() - G.startedAt >= 120000) check("survivor");
  if (G.level >= 8) check("grand_master");
  if ((save.lifetimeCoins || 0) >= 500) check("collector");
  if (unlocked.length) { sfx.achievement(); persist(); }

  document.getElementById("go-title").textContent = isNewHigh ? "NEW HIGH SCORE!" : "GAME OVER";
  document.getElementById("go-sub").textContent = `Score ${G.score} · +${coinsFromScore} ¢ earned`;
  document.getElementById("go-achievements").textContent = unlocked.length
    ? unlocked.map(a => a.icon + " " + a.name).join("   ")
    : "";
  document.getElementById("overlay-gameover").classList.add("show");
}

function checkLevelUp() {
  const newLevel = 1 + Math.floor(G.score / LEVEL_SCORE_STEP);
  if (newLevel > G.level) {
    G.level = newLevel;
    G.baseTickMs = Math.max(52, SPEED_MS[save.settings.speed] - (G.level - 1) * 4);
    G.flashUntil = performance.now() + 320;
    G.flashColor = "255,180,84";
    sfx.levelup();
    toast("LEVEL " + G.level, "speed rising…", "--gold");
    maybeAddHazard();
  }
}

function step() {
  G.prevSnake = G.snake.map(s => ({ x: s.x, y: s.y }));
  G.dir = G.nextDir;
  const head = G.snake[0];
  let nx = head.x + G.dir.x, ny = head.y + G.dir.y;
  let wrapped = false;

  if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) {
    if (save.settings.wrap) { nx = (nx + COLS) % COLS; ny = (ny + ROWS) % ROWS; wrapped = true; }
    else if (G.shieldUntil > performance.now()) { breakShield(); nx = (nx + COLS) % COLS; ny = (ny + ROWS) % ROWS; wrapped = true; }
    else { endGame(); return; }
  }
  const hitsSelf = G.snake.some(s => s.x === nx && s.y === ny);
  const hitsObstacle = G.obstacles.some(o => o.x === nx && o.y === ny);
  if (hitsSelf || hitsObstacle) {
    if (G.shieldUntil > performance.now()) {
      breakShield();
      if (hitsObstacle) G.obstacles = G.obstacles.filter(o => !(o.x === nx && o.y === ny));
    } else { endGame(); return; }
  }
  if (wrapped) G.prevSnake = G.snake.map(s => ({ x: s.x, y: s.y })); // avoid diagonal-across-map lerp

  const newHead = { x: nx, y: ny };
  G.snake.unshift(newHead);

  let grew = false;
  const mult = (G.multiplierUntil > performance.now()) ? 2 : 1;

  if (G.food && nx === G.food.x && ny === G.food.y) {
    const now = performance.now();
    if (G.comboExpireAt > now) { G.combo = Math.min(G.combo + 1, 20); } else { G.combo = 1; }
    G.comboExpireAt = now + COMBO_WINDOW_MS;
    if (G.combo > G.bestComboThisRun) G.bestComboThisRun = G.combo;
    if (G.combo >= 2) sfx.combo(G.combo);

    const comboMult = 1 + (G.combo - 1) * 0.15;
    const pts = Math.round(10 * mult * comboMult);
    G.score += pts;
    G.foodStreak++;
    G.everAte = true;
    grew = true;
    sfx.eat();
    spawnParticles(nx * CELL + CELL / 2, ny * CELL + CELL / 2, getVar("--gold"), 10);
    addFloatText("+" + pts, nx * CELL, ny * CELL, getVar("--gold"));
    G.food = randCell([...G.snake, ...(G.bonus ? [G.bonus] : []), ...G.obstacles]);
    maybeSpawnBonus();
    checkLevelUp();
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
      addCoins(b.coins);
      addFloatText("+" + b.coins + "¢", nx * CELL, ny * CELL + 2, getVar("--sun"));
      persist();
    }
    if (b.kind === "slowmo") G.slowUntil = performance.now() + b.fxMs;
    if (b.kind === "multiplier") G.multiplierUntil = performance.now() + b.fxMs;
    if (b.kind === "shield") { G.shieldUntil = performance.now() + b.fxMs; sfx.shield(); tryUnlock("shield_bearer"); }
    if (save.settings.shake) G.shakeUntil = performance.now() + 220;
    G.bonus = null;
    checkLevelUp();
    if (!grew) G.snake.pop();
  } else if (!grew) {
    G.snake.pop();
  }

  G.tickMs = (G.slowUntil > performance.now()) ? G.baseTickMs * 1.9 : G.baseTickMs;
  updateHud();
  activeFxChips();
}

function breakShield() {
  G.shieldUntil = 0;
  G.flashUntil = performance.now() + 260;
  G.flashColor = "93,242,199";
  spawnParticles(G.snake[0].x * CELL + CELL / 2, G.snake[0].y * CELL + CELL / 2, getVar("--shield"), 22);
  sfx.shield();
  toast("🛡 SHIELD BROKEN", "one hit absorbed", "--shield");
}

/* ---- rendering ---- */
function drawBackdrop() {
  const w = canvas.width, h = canvas.height;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#05040a");
  g.addColorStop(0.45, "#130a24");
  g.addColorStop(0.62, "#2a0f2e");
  g.addColorStop(0.78, "#170a1e");
  g.addColorStop(1, "#050309");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // stars
  const now = performance.now();
  ctx.save();
  STARS.forEach(s => {
    const tw = 0.5 + 0.5 * Math.sin(now / 600 * s.speed + s.phase);
    ctx.globalAlpha = 0.25 + tw * 0.55;
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
  });
  ctx.restore();

  // sun
  const sunX = w / 2, sunY = h * 0.6, sunR = 95;
  const sg = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR);
  sg.addColorStop(0, "rgba(255,225,170,0.55)");
  sg.addColorStop(0.4, "rgba(255,150,90,0.28)");
  sg.addColorStop(1, "rgba(255,80,120,0)");
  ctx.fillStyle = sg;
  ctx.beginPath(); ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2); ctx.fill();

  // horizon line glow
  ctx.save();
  ctx.shadowColor = "rgba(255,180,84,0.6)"; ctx.shadowBlur = 12;
  ctx.strokeStyle = "rgba(255,200,140,0.35)";
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(0, h * 0.6); ctx.lineTo(w, h * 0.6); ctx.stroke();
  ctx.restore();

  // faint grid for cell alignment
  ctx.strokeStyle = "rgba(255,255,255,0.028)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= COLS; i++) { ctx.beginPath(); ctx.moveTo(i * CELL, 0); ctx.lineTo(i * CELL, h); ctx.stroke(); }
  for (let j = 0; j <= ROWS; j++) { ctx.beginPath(); ctx.moveTo(0, j * CELL); ctx.lineTo(w, j * CELL); ctx.stroke(); }
}
function drawFoodDot(cell, color, pulse) {
  const cx = cell.x * CELL + CELL / 2, cy = cell.y * CELL + CELL / 2;
  const r = CELL * 0.32 + (pulse ? Math.sin(performance.now() / 120) * 1.5 : 0);
  ctx.save();
  ctx.shadowColor = color; ctx.shadowBlur = 16;
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  if (pulse) {
    ctx.strokeStyle = color; ctx.globalAlpha = 0.5; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, r + 5 + Math.sin(performance.now() / 90) * 2, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}
function drawObstacles() {
  G.obstacles.forEach(o => {
    const x = o.x * CELL, y = o.y * CELL;
    ctx.save();
    ctx.shadowColor = "rgba(150,60,255,0.5)"; ctx.shadowBlur = 8;
    ctx.fillStyle = "#241a3a";
    ctx.strokeStyle = "rgba(190,140,255,0.6)"; ctx.lineWidth = 1.5;
    const pad = 2, w = CELL - pad * 2;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x + pad, y + pad, w, w, 4); else ctx.rect(x + pad, y + pad, w, w);
    ctx.fill(); ctx.stroke();
    ctx.restore();
  });
}
function lerp(a, b, t) { return a + (b - a) * t; }
function drawSnake(t) {
  const skin = skinById(save.selectedSkin);
  const n = G.snake.length;
  const shielded = G.shieldUntil > performance.now();
  G.snake.forEach((s, i) => {
    const isHead = i === 0;
    const prev = G.prevSnake[i];
    let px = s.x, py = s.y;
    if (prev && Math.abs(s.x - prev.x) <= 1 && Math.abs(s.y - prev.y) <= 1) {
      px = lerp(prev.x, s.x, t); py = lerp(prev.y, s.y, t);
    }
    const color = isHead ? skin.head : skinBodyColor(skin, i, n - 1);
    ctx.save();
    ctx.shadowColor = shielded ? getVar("--shield") : skin.glow;
    ctx.shadowBlur = isHead ? 16 : (shielded ? 12 : 8);
    ctx.fillStyle = color;
    const pad = isHead ? 1 : 2;
    const x = px * CELL + pad, y = py * CELL + pad, w = CELL - pad * 2;
    const r = w * 0.32;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, w, r); else ctx.rect(x, y, w, w);
    ctx.fill();
    ctx.restore();
    if (isHead) {
      ctx.fillStyle = "#1a1006";
      const ex = G.dir.x * 3, ey = G.dir.y * 3;
      const cx = px * CELL + CELL / 2, cy = py * CELL + CELL / 2;
      ctx.beginPath(); ctx.arc(cx - 4 + ex * 0.4, cy - 2 + ey * 0.4, 1.6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 4 + ex * 0.4, cy - 2 + ey * 0.4, 1.6, 0, Math.PI * 2); ctx.fill();
    }
  });
  if (shielded) {
    const head = G.snake[0], prev = G.prevSnake[0];
    let px = head.x, py = head.y;
    if (prev && Math.abs(head.x - prev.x) <= 1 && Math.abs(head.y - prev.y) <= 1) { px = lerp(prev.x, head.x, t); py = lerp(prev.y, head.y, t); }
    const cx = px * CELL + CELL / 2, cy = py * CELL + CELL / 2;
    ctx.save();
    ctx.strokeStyle = getVar("--shield"); ctx.globalAlpha = 0.55; ctx.lineWidth = 2;
    ctx.shadowColor = getVar("--shield"); ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.arc(cx, cy, CELL * 0.9, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
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
  const t = G.tickMs > 0 ? Math.min(G.acc / G.tickMs, 1) : 1;
  ctx.save();
  if (G.shakeUntil > performance.now()) ctx.translate((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
  drawBackdrop();
  drawObstacles();
  if (G.food) drawFoodDot(G.food, getVar("--gold"), false);
  if (G.bonus) drawFoodDot(G.bonus, G.bonus.color, true);
  drawSnake(t);
  drawParticles(dt);
  if (G.flashUntil > performance.now()) {
    const alpha = (G.flashUntil - performance.now()) / 320 * 0.35;
    ctx.fillStyle = `rgba(${G.flashColor},${Math.max(alpha, 0)})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
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
    activeFxChips();
  }
  render(dt);
  requestAnimationFrame(loop);
}

startGame();
})();
