/* ======================= SAVE DATA (localStorage) ======================= */
const SAVE_KEY = "viper_save_v1";
const DEFAULT_SAVE = {
  highScore: 0,
  coins: 0,
  ownedSkins: ["classic"],
  selectedSkin: "classic",
  settings: { speed: "normal", wrap: false, sound: true, shake: true },
  history: []
};

function loadSave() {
  let save = JSON.parse(JSON.stringify(DEFAULT_SAVE));
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      save = Object.assign(JSON.parse(JSON.stringify(DEFAULT_SAVE)), parsed);
      save.settings = Object.assign({}, DEFAULT_SAVE.settings, parsed.settings || {});
      if (!Array.isArray(save.ownedSkins) || !save.ownedSkins.includes("classic")) {
        save.ownedSkins = ["classic", ...(save.ownedSkins || [])];
      }
      if (!Array.isArray(save.history)) save.history = [];
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
};

/* ======================= SKINS ======================= */
const SKINS = [
  { id: "classic", name: "Classic",    price: 0,   head: "#6ee7b7", body: "#28ba8f", glow: "rgba(110,231,183,0.55)" },
  { id: "neon",    name: "Neon Volt",  price: 150, head: "#5dc8ff", body: "#2a7fbf", glow: "rgba(93,200,255,0.6)" },
  { id: "lava",    name: "Lava Coil",  price: 250, head: "#ffb454", body: "#c23b2c", glow: "rgba(255,93,60,0.55)" },
  { id: "royal",   name: "Royal Wyrm", price: 300, head: "#e8c76a", body: "#7a4fd6", glow: "rgba(193,155,255,0.6)" },
  { id: "ghost",   name: "Ghost",      price: 400, head: "#f4f9ff", body: "#8fa3c4", glow: "rgba(207,217,236,0.65)" },
  { id: "rainbow", name: "Prism",      price: 600, head: "#ff8de0", body: "rainbow", glow: "rgba(255,209,102,0.6)" },
];
function skinById(id) { return SKINS.find(s => s.id === id) || SKINS[0]; }

function getVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

function drawSkinPreview(canvas, skin) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width = canvas.clientWidth * 2, h = canvas.height = canvas.clientHeight * 2;
  ctx.clearRect(0, 0, w, h);
  const n = 6, cell = Math.min(w, h) / 4.6;
  for (let i = 0; i < n; i++) {
    const x = w / 2 - (n - 1) * cell * 0.42 + i * cell * 0.84, y = h / 2 + Math.sin(i * 0.9) * cell * 0.25;
    let color;
    if (skin.body === "rainbow") color = `hsl(${(i * 45) % 360} 90% 65%)`;
    else color = i === n - 1 ? skin.head : skin.body;
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
