/* ======================= SAVE DATA (localStorage) ======================= */
const SAVE_KEY = "horizon_snake_save_v1";
const LEGACY_SAVE_KEY = "viper_save_v1";
const DEFAULT_SAVE = {
  highScore: 0,
  coins: 0,
  lifetimeCoins: 0,
  gamesPlayed: 0,
  bestCombo: 0,
  ownedSkins: ["horizon"],
  selectedSkin: "horizon",
  achievements: [],
  settings: { speed: "normal", wrap: false, sound: true, shake: true, hazards: false },
  history: []
};

function loadSave() {
  let save = JSON.parse(JSON.stringify(DEFAULT_SAVE));
  try {
    let raw = localStorage.getItem(SAVE_KEY);
    if (!raw) raw = localStorage.getItem(LEGACY_SAVE_KEY); // one-time carry-over from the old VIPER save
    if (raw) {
      const parsed = JSON.parse(raw);
      save = Object.assign(JSON.parse(JSON.stringify(DEFAULT_SAVE)), parsed);
      save.settings = Object.assign({}, DEFAULT_SAVE.settings, parsed.settings || {});
      if (!Array.isArray(save.ownedSkins) || !save.ownedSkins.includes("horizon")) {
        save.ownedSkins = ["horizon", ...(save.ownedSkins || []).filter(s => s !== "classic")];
      }
      if (save.selectedSkin === "classic") save.selectedSkin = "horizon";
      if (!Array.isArray(save.history)) save.history = [];
      if (!Array.isArray(save.achievements)) save.achievements = [];
      if (typeof save.lifetimeCoins !== "number") save.lifetimeCoins = save.coins || 0;
      if (typeof save.gamesPlayed !== "number") save.gamesPlayed = save.history.length || 0;
      if (typeof save.bestCombo !== "number") save.bestCombo = 0;
    }
  } catch (e) { /* first run / storage blocked, use defaults */ }
  return save;
}

function persistSave(save) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); }
  catch (e) { /* storage unavailable (e.g. private mode) — game still works this session */ }
}

let save = loadSave();
function persist() { persistSave(save); }

function addCoins(n) {
  if (!n) return;
  save.coins += n;
  save.lifetimeCoins = (save.lifetimeCoins || 0) + n;
}

/* ======================= ACHIEVEMENTS ======================= */
const ACHIEVEMENTS = [
  { id: "first_bite",    name: "First Bite",      desc: "Eat your first bite of food",     icon: "🍎" },
  { id: "half_century",  name: "Half Century",    desc: "Score 100+ in a single run",       icon: "⭐" },
  { id: "centurion",     name: "Double Century",  desc: "Score 250+ in a single run",       icon: "🏆" },
  { id: "legend",        name: "Legend",          desc: "Score 500+ in a single run",       icon: "👑" },
  { id: "horizon_master",name: "Horizon Master",  desc: "Score 1000+ in a single run",      icon: "🌅" },
  { id: "combo_king",    name: "Combo King",      desc: "Reach a ×5 combo streak",          icon: "🔥" },
  { id: "survivor",      name: "Survivor",        desc: "Survive 2 minutes in one run",     icon: "⏱️" },
  { id: "shield_bearer", name: "Shield Bearer",   desc: "Pick up a shield orb",             icon: "🛡️" },
  { id: "collector",     name: "Coin Collector",  desc: "Earn 500 coins lifetime",          icon: "🪙" },
  { id: "grand_master",  name: "Grand Master",    desc: "Reach level 8 in a single run",    icon: "🌌" },
];
function achievementById(id) { return ACHIEVEMENTS.find(a => a.id === id); }
/* Unlocks an achievement if not already owned. Returns the achievement def if newly unlocked, else null. */
function unlockAchievement(id) {
  if (save.achievements.includes(id)) return null;
  save.achievements.push(id);
  persist();
  return achievementById(id) || null;
}

/* ======================= SOUND (WebAudio synth, no files) ======================= */
let actx = null;
function ensureAudio() {
  if (!actx) {
    try { actx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch (e) { /* audio unsupported */ }
  }
}
function beep(freq, dur, type, vol) {
  if (!save.settings.sound || !actx) return;
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type || "square"; o.frequency.value = freq;
  g.gain.value = vol !== undefined ? vol : 0.05;
  o.connect(g); g.connect(actx.destination);
  o.start();
  g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
  o.stop(actx.currentTime + dur);
}
const sfx = {
  eat: () => beep(520, .08, "square", .05),
  bonus: () => beep(760, .12, "triangle", .06),
  coin: () => beep(980, .1, "triangle", .05),
  crash: () => { beep(160, .3, "sawtooth", .07); setTimeout(() => beep(90, .35, "sawtooth", .06), 90); },
  select: () => beep(360, .05, "square", .03),
  levelup: () => { beep(660, .09, "triangle", .06); setTimeout(() => beep(880, .12, "triangle", .06), 80); setTimeout(() => beep(1100, .16, "triangle", .07), 160); },
  achievement: () => { beep(880, .08, "sine", .05); setTimeout(() => beep(1320, .18, "sine", .06), 90); },
  shield: () => beep(1200, .18, "sine", .06),
  combo: (n) => beep(500 + Math.min(n, 10) * 55, .06, "square", .035),
};

/* ======================= SKINS ======================= */
/* body: solid color string | [colorA, colorB] gradient across the body | "rainbow" */
const SKINS = [
  { id: "horizon", name: "Horizon Gold", price: 0,   head: "#ffe9c2", body: "#ffb454",              glow: "rgba(255,180,84,0.6)" },
  { id: "sunrise", name: "Sunrise",      price: 150, head: "#ffcf8a", body: ["#ff6a3d", "#ff3d7a"], glow: "rgba(255,110,90,0.6)" },
  { id: "aurora",  name: "Aurora",       price: 200, head: "#baffe0", body: ["#37e6ff", "#6effa0"], glow: "rgba(80,230,200,0.6)" },
  { id: "nebula",  name: "Nebula",       price: 300, head: "#e3c6ff", body: ["#7b2ff7", "#ff4d8d"], glow: "rgba(190,120,255,0.6)" },
  { id: "frost",   name: "Frost",        price: 250, head: "#ffffff", body: ["#eaf6ff", "#8fd3ff"], glow: "rgba(180,225,255,0.65)" },
  { id: "ember",   name: "Ember",        price: 300, head: "#ffcf8a", body: ["#ff3d3d", "#ff9d3d"], glow: "rgba(255,110,60,0.6)" },
  { id: "void",    name: "Void",         price: 450, head: "#c9a6ff", body: "#1c1830",              glow: "rgba(150,100,255,0.8)" },
  { id: "prism",   name: "Prism",        price: 700, head: "#ff8de0", body: "rainbow",              glow: "rgba(255,209,102,0.6)" },
];
function skinById(id) { return SKINS.find(s => s.id === id) || SKINS[0]; }

function getVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

function lerpColor(a, b, t) {
  const pa = hexToRgb(a), pb = hexToRgb(b);
  const r = Math.round(pa.r + (pb.r - pa.r) * t);
  const g = Math.round(pa.g + (pb.g - pa.g) * t);
  const bl = Math.round(pa.b + (pb.b - pa.b) * t);
  return `rgb(${r},${g},${bl})`;
}
function hexToRgb(hex) {
  hex = hex.replace("#", "");
  if (hex.length === 3) hex = hex.split("").map(c => c + c).join("");
  const num = parseInt(hex, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}
function skinBodyColor(skin, i, total) {
  if (skin.body === "rainbow") return `hsl(${(performance.now() / 12 + i * 24) % 360} 90% 65%)`;
  if (Array.isArray(skin.body)) return lerpColor(skin.body[0], skin.body[1], total > 1 ? i / (total - 1) : 0);
  return skin.body;
}

function drawSkinPreview(canvas, skin) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width = canvas.clientWidth * 2, h = canvas.height = canvas.clientHeight * 2;
  ctx.clearRect(0, 0, w, h);
  const n = 6, cell = Math.min(w, h) / 4.6;
  for (let i = 0; i < n; i++) {
    const x = w / 2 - (n - 1) * cell * 0.42 + i * cell * 0.84, y = h / 2 + Math.sin(i * 0.9) * cell * 0.25;
    const color = i === n - 1 ? skin.head : skinBodyColor(skin, i, n - 1);
    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.shadowColor = skin.glow; ctx.shadowBlur = 14;
    const r = cell * 0.4;
    if (ctx.roundRect) ctx.roundRect(x - r, y - r, r * 2, r * 2, r * 0.6);
    else ctx.rect(x - r, y - r, r * 2, r * 2);
    ctx.fill();
  }
}

/* polyfill roundRect just in case */
if (typeof CanvasRenderingContext2D !== "undefined" && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    this.moveTo(x + r, y);
    this.arcTo(x + w, y, x + w, y + h, r);
    this.arcTo(x + w, y + h, x, y + h, r);
    this.arcTo(x, y + h, x, y, r);
    this.arcTo(x, y, x + w, y, r);
    this.closePath();
  };
}

/* ======================= small shared UI helpers ======================= */
function fmtCoins(n) { return n + " ¢"; }

function showToast(layerEl, title, subtitle, colorVar) {
  if (!layerEl) return;
  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = `<span>${title.split(" ")[0].match(/\p{Emoji}/u) ? "" : ""}</span>`;
  el.innerHTML = `<b style="color:var(${colorVar || "--gold"})">${title}</b><span>${subtitle || ""}</span>`;
  layerEl.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}
