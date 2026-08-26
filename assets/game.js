(function () {
"use strict";

const COLS = 24, ROWS = 24;
const canvas = document.getElementById("stage");
const ctx = canvas.getContext("2d");
let CELL = canvas.width / COLS;

const LEVEL_SCORE_STEP = 150;
const COMBO_WINDOW_MS = 2600;

const BONUS_TYPES = [
  { id: "ember",    color: getVar("--red"),     pts: 50,  life: 5000, kind: "score",       weight: 24 },
  { id: "sunstone", color: getVar("--sun"),     pts: 80,  life: 4000, kind: "score+coin",  coins: 8,  weight: 20 },
  { id: "frost",    color: getVar("--blue"),    pts: 40,  life: 5000, kind: "slowmo",      fxMs: 4000, weight: 16 },
  { id: "nebula",   color: getVar("--purple"),  pts: 40,  life: 5000, kind: "multiplier",  fxMs: 8000, weight: 16 },
  { id: "coin",     color: getVar("--silver"),  pts: 0,   life: 6000, kind: "coin",        coins: 15, weight: 18 },
  { id: "shield",   color: getVar("--shield"),  pts: 20,  life: 4500, kind: "shield",      fxMs: 6000, weight: 12 },
  { id: "power",    color: getVar("--gold"),    pts: 0,   life: 4200, kind: "power",       weight: 14 },
  { id: "megamult", color: getVar("--magenta"), pts: 20,  life: 3800, kind: "megamult",    fxMs: 5000, weight: 8 },
  { id: "diamond",  color: getVar("--diamond"), pts: 150, life: 3500, kind: "score+coin",  coins: 40, weight: 6 },
  { id: "star",     color: "#ffe66d",           pts: 100, life: 3200, kind: "score+coin",  coins: 25, weight: 5 },
  { id: "magnet",   color: "#5df2c7",           pts: 30,  life: 4500, kind: "magnet",      fxMs: 5000, weight: 7 },
];
function weightedBonusPick() {
  const total = BONUS_TYPES.reduce((s, b) => s + b.weight, 0);
  let r = Math.random() * total;
  for (const b of BONUS_TYPES) { r -= b.weight; if (r <= 0) return b; }
  return BONUS_TYPES[0];
}

const STARS = Array.from({ length: 80 }, () => ({
  x: Math.random() * canvas.width, y: Math.random() * canvas.height,
  r: Math.random() * 1.3 + 0.3, phase: Math.random() * Math.PI * 2, speed: 0.5 + Math.random() * 1.2
}));

let customBgImg = null, customBgSrc = null;
function ensureCustomBgImage() {
  if (save.selectedBackground === "custom" && save.customBackgroundImage) {
    if (customBgSrc !== save.customBackgroundImage) {
      customBgImg = new Image();
      customBgImg.src = save.customBackgroundImage;
      customBgSrc = save.customBackgroundImage;
    }
  }
}
ensureCustomBgImage();

let G = null;

function freshState() {
  const startX = Math.floor(COLS / 2), startY = Math.floor(ROWS / 2);
  const snake = [{ x: startX - 1, y: startY }, { x: startX - 2, y: startY }, { x: startX - 3, y: startY }];
  const baseSpeed = SPEED_MS[save.settings.speed] || SPEED_MS.normal;
  return {
    snake, prevSnake: snake.map(s => ({ ...s })),
    dir: { x: 1, y: 0 }, nextDir: { x: 1, y: 0 },
    food: null,
    bonus: null, bonusExpireAt: 0,
    foodStreak: 0,
    score: 0,
    level: 1,
    tickMs: baseSpeed,
    baseTickMs: baseSpeed,
    running: true, paused: false, over: false,
    multiplierUntil: 0, megaUntil: 0, slowUntil: 0, shieldUntil: 0, magnetUntil: 0,
    combo: 1, comboExpireAt: 0, bestComboThisRun: 1,
    lastTick: 0, acc: 0,
    particles: [],
    trailTick: 0,
    shakeUntil: 0, flashUntil: 0, flashColor: "53,231,255",
    obstacles: [],
    startedAt: performance.now(),
    everAte: false,
  };
}

function randCell(exclude) {
  let p, tries = 0;
  do { p = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) }; tries++; }
  while (exclude.some(e => e.x === p.x && e.y === p.y) && tries < 500);
  return p;
}

function buildObstacles() {
  const base = mapObstacles(save.settings.mapId);
  const extra = DIFFICULTY_EXTRA_OBSTACLES[save.settings.difficulty] ?? 4;
  const list = base.slice();
  const exclude = [...list, { x: 12, y: 12 }];
  for (let i = 0; i < extra; i++) {
    const c = randCell(exclude);
    list.push(c); exclude.push(c);
  }
  return list;
}

function requestFullscreen() {
  // Prefer locking the game root; fall back to documentElement
  const candidates = [
    document.getElementById("app"),
    document.documentElement,
    document.body
  ];
  for (const el of candidates) {
    if (!el) continue;
    const req = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen || el.mozRequestFullScreen;
    if (req) {
      try {
        const p = req.call(el);
        if (p && typeof p.catch === "function") p.catch(() => {});
        break;
      } catch (e) { /* ignore */ }
    }
  }
}

function lockPageScroll() {
  document.documentElement.classList.add("game-lock");
  document.body.classList.add("game-page");
  // Extra safety for iOS Safari pull-to-refresh
  document.documentElement.style.overflow = "hidden";
  document.body.style.overflow = "hidden";
  document.body.style.position = "fixed";
  document.body.style.width = "100%";
  document.body.style.height = "100%";
  document.body.style.top = "0";
  document.body.style.left = "0";
}

function startGame() {
  ensureAudio();
  ensureCustomBgImage();
  lockPageScroll();
  G = freshState();
  G.obstacles = buildObstacles();
  _baseObstacleCount = G.obstacles.length;
  G.food = randCell([...G.snake, ...G.obstacles]);

  if (!save.stats.mapsPlayed.includes(save.settings.mapId)) {
    save.stats.mapsPlayed.push(save.settings.mapId);
    persist();
  }

  document.getElementById("overlay-gameover").classList.remove("show");
  document.getElementById("overlay-pause").classList.remove("show");
  document.getElementById("bonus-banner").classList.remove("show");
  document.getElementById("active-fx").innerHTML = "";
  document.getElementById("toast-layer").innerHTML = "";
  document.getElementById("combo-badge").classList.remove("show");
  document.getElementById("hud-best").textContent = save.highScore;
  updateHud();
  requestFullscreen();
  requestAnimationFrame(loop);
}
function updateHud() {
  document.getElementById("hud-score").textContent = G.score;
  document.getElementById("hud-level").textContent = G.level;
  const legendFood = document.getElementById("legend-food");
  if (legendFood) {
    const fd = foodById(save.selectedFood);
    legendFood.innerHTML = `<i style="background:${fd.color || "var(--gold)"}"></i>${fd.emoji || "🍎"} ${fd.name || "food"}`;
  }
  const chip = document.getElementById("power-chip");
  if (chip) {
    const b = activePowerBoosts();
    const parts = [];
    if (b.scoreBoost > 0) parts.push(`⚡+${Math.round(b.scoreBoost * 100)}%`);
    if (b.coinBoost > 0) parts.push(`🪙+${Math.round(b.coinBoost * 100)}%`);
    if (b.comboExtendMs > 0) parts.push(`🔥+${(b.comboExtendMs / 1000).toFixed(1)}s`);
    chip.textContent = parts.length ? "POWERS ACTIVE " + parts.join("  ") : "";
    chip.style.display = parts.length ? "flex" : "none";
  }
}

/* ---- input: keyboard + drag/swipe + tap to pause ---- */
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

/* Pointer / touch: smooth continuous drag steering + short tap to pause.
   Non-passive touch listeners + preventDefault stop pull-to-refresh / page scroll. */
let pointerDown = null;
let pointerMoved = false;
let lastDirApplied = null;
const DRAG_THRESHOLD = 12;       // lower = more responsive
const DIR_LOCK_MS = 90;          // brief lock after a dir change reduces jitter
let lastDirChangeAt = 0;

function getClientXY(e) {
  if (e.touches && e.touches.length) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
  if (e.changedTouches && e.changedTouches.length) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
  return { x: e.clientX, y: e.clientY };
}

function onPointerDown(e) {
  if (!G || G.over) return;
  if (e.target.closest && e.target.closest(".overlay")) return;
  const p = getClientXY(e);
  if (p.x == null) return;
  pointerDown = { x: p.x, y: p.y };
  pointerMoved = false;
  lastDirApplied = null;
}

function onPointerMove(e) {
  if (!pointerDown || !G || G.paused || G.over) return;
  // Always block scroll / pull-to-refresh while finger is down on the playfield
  if (e.cancelable) e.preventDefault();
  const p = getClientXY(e);
  if (p.x == null) return;
  const dx = p.x - pointerDown.x;
  const dy = p.y - pointerDown.y;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  if (Math.max(absDx, absDy) < DRAG_THRESHOLD) return;

  pointerMoved = true;
  const now = performance.now();
  // Prefer the dominant axis; require a clear lead so diagonals don't flicker
  let newDir = null;
  if (absDx > absDy * 1.15) {
    newDir = { x: dx > 0 ? 1 : -1, y: 0 };
  } else if (absDy > absDx * 1.15) {
    newDir = { x: 0, y: dy > 0 ? 1 : -1 };
  } else {
    // nearly diagonal — keep previous direction, just slide the origin so control stays smooth
    pointerDown = { x: p.x, y: p.y };
    return;
  }

  // Avoid rapid opposite / same-axis flips within a short window
  if (lastDirApplied &&
      lastDirApplied.x === newDir.x && lastDirApplied.y === newDir.y &&
      now - lastDirChangeAt < DIR_LOCK_MS) {
    pointerDown = { x: p.x, y: p.y };
    return;
  }

  trySetDir(newDir);
  lastDirApplied = newDir;
  lastDirChangeAt = now;
  // Reset origin after a committed turn so continuous dragging feels fluid
  pointerDown = { x: p.x, y: p.y };
}

function onPointerUp(e) {
  if (!pointerDown || !G) { pointerDown = null; return; }
  if (!pointerMoved && G.running && !G.over) {
    // short tap (not on a button) → pause / unpause
    if (!e.target.closest || !e.target.closest("button")) togglePause();
  }
  pointerDown = null;
  pointerMoved = false;
  lastDirApplied = null;
}

// Mouse
canvas.addEventListener("mousedown", onPointerDown);
window.addEventListener("mousemove", onPointerMove);
window.addEventListener("mouseup", onPointerUp);

// Touch — MUST be non-passive so we can preventDefault (kills pull-to-refresh)
const stageWrap = document.getElementById("stage-wrap") || canvas;
stageWrap.addEventListener("touchstart", (e) => {
  onPointerDown(e);
}, { passive: false });
stageWrap.addEventListener("touchmove", (e) => {
  onPointerMove(e);
}, { passive: false });
stageWrap.addEventListener("touchend", (e) => {
  onPointerUp(e);
}, { passive: false });
stageWrap.addEventListener("touchcancel", (e) => {
  onPointerUp(e);
}, { passive: false });

// Global safety net: while a game is running, never let the page scroll
document.addEventListener("touchmove", (e) => {
  if (G && G.running && !G.over && e.cancelable) e.preventDefault();
}, { passive: false });

// Block context menu / long-press zoom on the play area
stageWrap.addEventListener("contextmenu", (e) => e.preventDefault());
canvas.addEventListener("gesturestart", (e) => e.preventDefault()); // older iOS

function togglePause() {
  if (!G || G.over) return;
  G.paused = !G.paused;
  document.getElementById("overlay-pause").classList.toggle("show", G.paused);
}
document.getElementById("btn-resume").addEventListener("click", togglePause);
document.getElementById("btn-quit-pause").addEventListener("click", () => { window.location.href = "index.html"; });
document.getElementById("btn-quit-go").addEventListener("click", () => { window.location.href = "index.html"; });
document.getElementById("btn-again").addEventListener("click", () => { startGame(); });

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

function maybeAddHazard() {
  if (!save.settings.hazards) return;
  if (G.level < 3) return;
  const cap = Math.min(G.level - 2, 8);
  if (G.obstacles.length - buildObstaclesBaseCount() >= cap) return;
  const cell = randCell([...G.snake, G.food, ...(G.bonus ? [G.bonus] : []), ...G.obstacles]);
  G.obstacles.push(cell);
}
let _baseObstacleCount = null;
function buildObstaclesBaseCount() {
  if (_baseObstacleCount === null) _baseObstacleCount = G.obstacles.length;
  return _baseObstacleCount;
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
  if (G.megaUntil > now) {
    const chip = document.createElement("div"); chip.className = "fx-chip";
    chip.style.color = getVar("--magenta");
    chip.textContent = "×3 FOOD " + Math.ceil((G.megaUntil - now) / 1000) + "s";
    wrap.appendChild(chip);
  } else if (G.multiplierUntil > now) {
    const chip = document.createElement("div"); chip.className = "fx-chip";
    chip.style.color = getVar("--purple");
    chip.textContent = "×2 FOOD " + Math.ceil((G.multiplierUntil - now) / 1000) + "s";
    wrap.appendChild(chip);
  }
  if (G.shieldUntil > now) {
    const chip = document.createElement("div"); chip.className = "fx-chip";
    chip.style.color = getVar("--shield");
    chip.textContent = "🛡 shield " + Math.ceil((G.shieldUntil - now) / 1000) + "s";
    wrap.appendChild(chip);
  }
  if (G.magnetUntil > now) {
    const chip = document.createElement("div"); chip.className = "fx-chip";
    chip.style.color = "#5df2c7";
    chip.textContent = "🧲 magnet " + Math.ceil((G.magnetUntil - now) / 1000) + "s";
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
  const boosts = activePowerBoosts();
  const coinsFromScore = Math.round(Math.floor(G.score / 10) * (1 + boosts.coinBoost));
  addCoins(coinsFromScore);
  const isNewHigh = G.score > save.highScore;
  if (isNewHigh) save.highScore = G.score;
  save.gamesPlayed = (save.gamesPlayed || 0) + 1;
  if (G.bestComboThisRun > (save.bestCombo || 0)) save.bestCombo = G.bestComboThisRun;
  save.history.unshift({ score: G.score, coins: coinsFromScore, date: Date.now() });
  save.history = save.history.slice(0, 10);
  persist();

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
  if ((save.lifetimeCoins || 0) >= 5000) check("wealthy");
  if ((save.lifetimeCoins || 0) >= 20000) check("rich");
  if ((save.stats.powerOrbs || 0) >= 25) check("power_house");
  if ((save.stats.multiplierOrbs || 0) >= 25) check("multiplier_master");
  if ((save.ownedSkins || []).length >= 5) check("skin_collector5");
  if ((save.ownedSkins || []).length >= 20) check("skin_collector20");
  if ((save.ownedSkins || []).length >= 50) check("skin_collector50");
  if ((save.ownedBackgrounds || []).length >= 2) check("bg_owner");
  if (save.customBackgroundImage) check("custom_bg");
  if ((save.stats.mapsPlayed || []).length >= 10) check("map_explorer");
  if ((save.stats.mapsPlayed || []).length >= 25) check("map_master");
  if (save.selectedTrail && save.selectedTrail !== "none") check("trailblazer");
  if (save.settings.speed === "extreme" && G.score >= 300) check("speed_demon");
  if (save.settings.difficulty === "high" && G.score >= 200) check("obstacle_dodger");
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
    const baseSpeed = SPEED_MS[save.settings.speed] || SPEED_MS.normal;
    G.baseTickMs = Math.max(45, baseSpeed - (G.level - 1) * 4);
    G.flashUntil = performance.now() + 320;
    G.flashColor = "53,231,255";
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
  if (wrapped) G.prevSnake = G.snake.map(s => ({ x: s.x, y: s.y }));

  const newHead = { x: nx, y: ny };
  G.snake.unshift(newHead);

  let grew = false;
  const now0 = performance.now();
  const foodMult = (G.megaUntil > now0) ? 3 : (G.multiplierUntil > now0) ? 2 : 1;
  const boosts = activePowerBoosts();
  const foodDef = foodById(save.selectedFood);
  const baseFoodPts = foodDef.pts || 1;

  // magnet: gently pull food toward the head (Manhattan distance 1–3)
  if (G.magnetUntil > now0 && G.food) {
    const dx = G.food.x - nx, dy = G.food.y - ny;
    const dist = Math.abs(dx) + Math.abs(dy);
    if (dist >= 1 && dist <= 3) {
      if (Math.abs(dx) >= Math.abs(dy) && dx !== 0) G.food.x -= Math.sign(dx);
      else if (dy !== 0) G.food.y -= Math.sign(dy);
      // keep food inside bounds
      G.food.x = Math.max(0, Math.min(COLS - 1, G.food.x));
      G.food.y = Math.max(0, Math.min(ROWS - 1, G.food.y));
    }
  }

  if (G.food && nx === G.food.x && ny === G.food.y) {
    const now = performance.now();
    if (G.comboExpireAt > now) { G.combo = Math.min(G.combo + 1, 20); } else { G.combo = 1; }
    G.comboExpireAt = now + COMBO_WINDOW_MS + boosts.comboExtendMs;
    if (G.combo > G.bestComboThisRun) G.bestComboThisRun = G.combo;
    if (G.combo >= 2) sfx.combo(G.combo);

    const comboMult = 1 + (G.combo - 1) * 0.15;
    const pts = Math.round(baseFoodPts * 10 * foodMult * comboMult * (1 + boosts.scoreBoost));
    G.score += pts;
    G.foodStreak++;
    G.everAte = true;
    grew = true;
    sfx.eat();
    spawnParticles(nx * CELL + CELL / 2, ny * CELL + CELL / 2, foodDef.color || getVar("--gold"), 10);
    addFloatText("+" + pts, nx * CELL, ny * CELL, foodDef.color || getVar("--gold"));
    G.food = randCell([...G.snake, ...(G.bonus ? [G.bonus] : []), ...G.obstacles]);
    maybeSpawnBonus();
    checkLevelUp();
  }

  if (G.bonus && nx === G.bonus.x && ny === G.bonus.y) {
    const b = G.bonus;
    const pts = Math.round(b.pts * foodMult * (1 + boosts.scoreBoost));
    G.score += pts;
    grew = grew || pts > 0;
    sfx.coin();
    spawnParticles(nx * CELL + CELL / 2, ny * CELL + CELL / 2, b.color, 18);
    if (pts > 0) addFloatText("+" + pts, nx * CELL, ny * CELL - 14, b.color);
    if (b.kind === "score+coin" || b.kind === "coin") {
      const coins = Math.round(b.coins * (1 + boosts.coinBoost));
      addCoins(coins);
      addFloatText("+" + coins + "¢", nx * CELL, ny * CELL + 2, getVar("--sun"));
      persist();
    }
    if (b.kind === "slowmo") G.slowUntil = performance.now() + b.fxMs;
    if (b.kind === "multiplier") { G.multiplierUntil = performance.now() + b.fxMs; save.stats.multiplierOrbs = (save.stats.multiplierOrbs || 0) + 1; }
    if (b.kind === "megamult") { G.megaUntil = performance.now() + b.fxMs; save.stats.multiplierOrbs = (save.stats.multiplierOrbs || 0) + 1; }
    if (b.kind === "power") {
      const powerPts = Math.round((60 + G.level * 15) * (1 + boosts.scoreBoost));
      G.score += powerPts;
      save.stats.powerOrbs = (save.stats.powerOrbs || 0) + 1;
      sfx.power();
      addFloatText("+" + powerPts + " ⚡", nx * CELL, ny * CELL - 14, getVar("--gold"));
      toast("⚡ POWER SURGE", "+" + powerPts + " bonus points", "--gold");
      persist();
    }
    if (b.kind === "shield") { G.shieldUntil = performance.now() + b.fxMs; sfx.shield(); tryUnlock("shield_bearer"); }
    if (b.kind === "magnet") { G.magnetUntil = performance.now() + b.fxMs; toast("🧲 MAGNET", "food drifts closer", "--shield"); }
    if (save.settings.shake) G.shakeUntil = performance.now() + 220;
    G.bonus = null;
    checkLevelUp();
    if (!grew) G.snake.pop();
  } else if (!grew) {
    G.snake.pop();
  }

  if (save.selectedTrail && save.selectedTrail !== "none") {
    G.trailTick++;
    if (G.trailTick % 2 === 0) {
      const trail = trailById(save.selectedTrail);
      const tail = G.snake[G.snake.length - 1];
      const color = trail.color === "rainbow" ? `hsl(${(performance.now() / 8) % 360} 90% 65%)` : trail.color;
      spawnParticles(tail.x * CELL + CELL / 2, tail.y * CELL + CELL / 2, color, 1);
    }
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

function drawBackdrop() {
  const w = canvas.width, h = canvas.height;

  if (save.selectedBackground === "custom" && customBgImg && customBgImg.complete && customBgImg.naturalWidth) {
    const ir = customBgImg.naturalWidth / customBgImg.naturalHeight, cr = w / h;
    let dw, dh, dx, dy;
    if (ir > cr) { dh = h; dw = h * ir; dx = (w - dw) / 2; dy = 0; }
    else { dw = w; dh = w / ir; dx = 0; dy = (h - dh) / 2; }
    ctx.drawImage(customBgImg, dx, dy, dw, dh);
    ctx.fillStyle = "rgba(4,5,10,0.45)";
    ctx.fillRect(0, 0, w, h);
  } else {
    const bg = backgroundById(save.selectedBackground);
    const stops = (bg && bg.stops) || ["#04050a", "#0e0a20", "#1a0f2a"];
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, stops[0]);
    g.addColorStop(0.5, stops[1]);
    g.addColorStop(1, stops[2]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    if (bg && bg.pattern) paintBackgroundMotif(ctx, w, h, bg);

    const now = performance.now();
    const g1x = w * 0.32, g1y = h * 0.36, g1r = 110;
    const sg1 = ctx.createRadialGradient(g1x, g1y, 0, g1x, g1y, g1r);
    sg1.addColorStop(0, "rgba(53,231,255,0.30)");
    sg1.addColorStop(1, "rgba(53,231,255,0)");
    ctx.fillStyle = sg1; ctx.beginPath(); ctx.arc(g1x, g1y, g1r, 0, Math.PI * 2); ctx.fill();

    const g2x = w * 0.7, g2y = h * 0.62, g2r = 130;
    const sg2 = ctx.createRadialGradient(g2x, g2y, 0, g2x, g2y, g2r);
    sg2.addColorStop(0, "rgba(139,47,242,0.28)");
    sg2.addColorStop(1, "rgba(139,47,242,0)");
    ctx.fillStyle = sg2; ctx.beginPath(); ctx.arc(g2x, g2y, g2r, 0, Math.PI * 2); ctx.fill();
  }

  const now = performance.now();
  ctx.save();
  STARS.forEach(s => {
    const tw = 0.5 + 0.5 * Math.sin(now / 600 * s.speed + s.phase);
    ctx.globalAlpha = 0.2 + tw * 0.45;
    ctx.fillStyle = "#dff";
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
  });
  ctx.restore();

  ctx.strokeStyle = "rgba(200,230,255,0.03)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= COLS; i++) { ctx.beginPath(); ctx.moveTo(i * CELL, 0); ctx.lineTo(i * CELL, h); ctx.stroke(); }
  for (let j = 0; j <= ROWS; j++) { ctx.beginPath(); ctx.moveTo(0, j * CELL); ctx.lineTo(w, j * CELL); ctx.stroke(); }
}
function drawFoodDot(cell, color, pulse, emoji) {
  const cx = cell.x * CELL + CELL / 2, cy = cell.y * CELL + CELL / 2;
  const r = CELL * 0.34 + (pulse ? Math.sin(performance.now() / 120) * 1.6 : 0);
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = pulse ? 20 : 14;
  // soft glow disc
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  if (pulse) {
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 5 + Math.sin(performance.now() / 90) * 2.2, 0, Math.PI * 2);
    ctx.stroke();
  }
  // equipped food emoji (or a simple shape for bonuses)
  if (emoji) {
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.font = `${Math.floor(CELL * 0.72)}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(emoji, cx, cy + 1);
  }
  ctx.restore();
}
function drawObstacles() {
  G.obstacles.forEach(o => {
    const x = o.x * CELL, y = o.y * CELL;
    ctx.save();
    ctx.shadowColor = "rgba(139,47,242,0.55)"; ctx.shadowBlur = 8;
    ctx.fillStyle = "#181430";
    ctx.strokeStyle = "rgba(139,47,242,0.6)"; ctx.lineWidth = 1.5;
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
    if (!isHead && skin.pattern) drawSkinCellPattern(ctx, x, y, w, skin.pattern, skin.head);
    if (isHead) {
      ctx.fillStyle = "#04121a";
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
  if (G.food) {
    const fd = foodById(save.selectedFood);
    drawFoodDot(G.food, fd.color || getVar("--gold"), false, fd.emoji || "🍎");
  }
  if (G.bonus) drawFoodDot(G.bonus, G.bonus.color, true, null);
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

// Lock the page as soon as the game script loads (before first frame)
if (document.body) {
  document.documentElement.classList.add("game-lock");
  document.body.classList.add("game-page");
}
startGame();
})();
