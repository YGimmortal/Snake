/* ======================= SAVE DATA (localStorage) ======================= */
const SAVE_KEY = "horizon_snake_save_v2";
const LEGACY_SAVE_KEY = "horizon_snake_save_v1";
const DEFAULT_SAVE = {
  highScore: 0,
  coins: 0,
  lifetimeCoins: 0,
  gamesPlayed: 0,
  bestCombo: 0,
  ownedSkins: ["horizon"],
  selectedSkin: "horizon",
  ownedBackgrounds: ["default"],
  selectedBackground: "default",
  customBackgroundImage: null,
  ownedTrails: ["none"],
  selectedTrail: "none",
  ownedFoods: ["apple"],
  selectedFood: "apple",
  achievements: [],
  claimedAdvancements: [],
  stats: { powerOrbs: 0, multiplierOrbs: 0, mapsPlayed: [] },
  settings: {
    speed: "normal",
    wrap: false,
    sound: true,
    volume: 80,
    shake: true,
    hazards: false,
    difficulty: "low",
    controls: "swipe",
    mapId: "open"
  },
  history: []
};

function loadSave() {
  let save = JSON.parse(JSON.stringify(DEFAULT_SAVE));
  try {
    let raw = localStorage.getItem(SAVE_KEY);
    if (!raw) raw = localStorage.getItem(LEGACY_SAVE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      save = Object.assign(JSON.parse(JSON.stringify(DEFAULT_SAVE)), parsed);
      save.settings = Object.assign({}, DEFAULT_SAVE.settings, parsed.settings || {});
      save.stats = Object.assign({ powerOrbs: 0, multiplierOrbs: 0, mapsPlayed: [] }, parsed.stats || {});
      if (!Array.isArray(save.ownedSkins) || !save.ownedSkins.includes("horizon")) {
        save.ownedSkins = ["horizon", ...(save.ownedSkins || []).filter(s => s !== "classic")];
      }
      if (!Array.isArray(save.ownedBackgrounds) || !save.ownedBackgrounds.includes("default")) {
        save.ownedBackgrounds = ["default", ...(save.ownedBackgrounds || [])];
      }
      if (!Array.isArray(save.ownedTrails) || !save.ownedTrails.includes("none")) {
        save.ownedTrails = ["none", ...(save.ownedTrails || [])];
      }
      if (!Array.isArray(save.ownedFoods) || !save.ownedFoods.includes("apple")) {
        save.ownedFoods = ["apple", ...(save.ownedFoods || []).filter(f => f !== "apple")];
      }
      if (save.selectedSkin === "classic") save.selectedSkin = "horizon";
      if (!Array.isArray(save.history)) save.history = [];
      if (!Array.isArray(save.achievements)) save.achievements = [];
      if (!Array.isArray(save.claimedAdvancements)) save.claimedAdvancements = [];
      if (typeof save.lifetimeCoins !== "number") save.lifetimeCoins = save.coins || 0;
      if (typeof save.gamesPlayed !== "number") save.gamesPlayed = save.history.length || 0;
      if (typeof save.bestCombo !== "number") save.bestCombo = 0;
      if (typeof save.selectedBackground !== "string") save.selectedBackground = "default";
      if (typeof save.selectedTrail !== "string") save.selectedTrail = "none";
      if (typeof save.selectedFood !== "string") save.selectedFood = "apple";
    }
  } catch (e) { /* first run / storage blocked, use defaults */ }
  return save;
}

function persistSave(save) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); }
  catch (e) { /* storage unavailable / quota exceeded — game still works this session */ }
}

let save = loadSave();
function persist() { persistSave(save); }

function addCoins(n) {
  if (!n) return;
  save.coins += n;
  save.lifetimeCoins = (save.lifetimeCoins || 0) + n;
}

/* ======================= COLOR HELPERS ======================= */
function hsl2hex(h, s, l) {
  h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = x => Math.round(255 * x).toString(16).padStart(2, "0");
  return "#" + toHex(f(0)) + toHex(f(8)) + toHex(f(4));
}
/* keeps every generated hue inside the cyan -> purple/magenta band (172°-322°) */
function bandHue(n) { return 172 + (((n % 150) + 150) % 150); }

function getVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

function hexToRgb(hex) {
  hex = hex.replace("#", "");
  if (hex.length === 3) hex = hex.split("").map(c => c + c).join("");
  const num = parseInt(hex, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}
function hexToRgbStr(hex) { const c = hexToRgb(hex); return `${c.r},${c.g},${c.b}`; }
function lerpColor(a, b, t) {
  const pa = hexToRgb(a), pb = hexToRgb(b);
  const r = Math.round(pa.r + (pb.r - pa.r) * t);
  const g = Math.round(pa.g + (pb.g - pa.g) * t);
  const bl = Math.round(pa.b + (pb.b - pa.b) * t);
  return `rgb(${r},${g},${bl})`;
}

/* ======================= ACHIEVEMENTS / ADVANCEMENTS ======================= */
const ACHIEVEMENTS = [
  { id: "first_bite",     name: "First Bite",       desc: "Eat your first bite of food",          icon: "🍎", reward: 30 },
  { id: "half_century",   name: "Half Century",     desc: "Score 100+ in a single run",            icon: "⭐", reward: 60 },
  { id: "centurion",      name: "Double Century",   desc: "Score 250+ in a single run",            icon: "🏆", reward: 100 },
  { id: "legend",         name: "Legend",           desc: "Score 500+ in a single run",            icon: "👑", reward: 180 },
  { id: "horizon_master", name: "Horizon Master",   desc: "Score 1000+ in a single run",           icon: "🌌", reward: 350 },
  { id: "combo_king",     name: "Combo King",       desc: "Reach a ×5 combo streak",                icon: "🔥", reward: 120 },
  { id: "survivor",       name: "Survivor",         desc: "Survive 2 minutes in one run",           icon: "⏱️", reward: 150 },
  { id: "shield_bearer",  name: "Shield Bearer",    desc: "Pick up a shield orb",                   icon: "🛡️", reward: 60 },
  { id: "collector",      name: "Coin Collector",   desc: "Earn 500 coins lifetime",                icon: "🪙", reward: 100 },
  { id: "grand_master",   name: "Grand Master",     desc: "Reach level 8 in a single run",          icon: "🌠", reward: 200 },
  { id: "power_house",    name: "Power House",      desc: "Collect 25 Power Cell orbs",             icon: "⚡", reward: 250 },
  { id: "multiplier_master", name: "Multiplier Master", desc: "Trigger 25 food multipliers",       icon: "✖️", reward: 250 },
  { id: "skin_collector5",name: "Style Starter",    desc: "Own 5 skins",                            icon: "🎨", reward: 150 },
  { id: "skin_collector20",name: "Wardrobe",        desc: "Own 20 skins",                           icon: "🧥", reward: 400 },
  { id: "skin_collector50",name: "Fashionista",     desc: "Own 50 skins",                           icon: "👗", reward: 900 },
  { id: "bg_owner",       name: "New Scenery",      desc: "Own a purchased background",             icon: "🖼️", reward: 150 },
  { id: "custom_bg",      name: "Personal Touch",   desc: "Upload your own background",             icon: "📤", reward: 300 },
  { id: "map_explorer",   name: "Cartographer",     desc: "Play on 10 different maps",              icon: "🗺️", reward: 400 },
  { id: "map_master",     name: "World Traveler",   desc: "Play on 25 different maps",              icon: "🧭", reward: 800 },
  { id: "trailblazer",    name: "Trailblazer",      desc: "Equip a purchased trail",                icon: "💫", reward: 100 },
  { id: "wealthy",        name: "Wealthy",          desc: "Earn 5000 coins lifetime",               icon: "💰", reward: 500 },
  { id: "rich",           name: "Tycoon",           desc: "Earn 20000 coins lifetime",              icon: "🏦", reward: 1500 },
  { id: "speed_demon",    name: "Speed Demon",      desc: "Score 300+ on Extreme speed",            icon: "🚀", reward: 600 },
  { id: "obstacle_dodger",name: "Obstacle Dodger",  desc: "Score 200+ with High difficulty obstacles", icon: "🧱", reward: 500 },
];
function achievementById(id) { return ACHIEVEMENTS.find(a => a.id === id); }
function unlockAchievement(id) {
  if (save.achievements.includes(id)) return null;
  save.achievements.push(id);
  persist();
  return achievementById(id) || null;
}
function claimAdvancement(id) {
  if (!save.achievements.includes(id)) return null;
  if (save.claimedAdvancements.includes(id)) return null;
  const a = achievementById(id);
  if (!a) return null;
  save.claimedAdvancements.push(id);
  addCoins(a.reward);
  persist();
  return a;
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
  const master = (typeof save.settings.volume === "number" ? save.settings.volume : 80) / 100;
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type || "square"; o.frequency.value = freq;
  g.gain.value = (vol !== undefined ? vol : 0.05) * master;
  o.connect(g); g.connect(actx.destination);
  o.start();
  g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
  o.stop(actx.currentTime + dur);
}
const sfx = {
  eat: () => beep(520, .08, "square", .05),
  bonus: () => beep(760, .12, "triangle", .06),
  coin: () => beep(980, .1, "triangle", .05),
  power: () => { beep(300, .05, "sawtooth", .05); setTimeout(() => beep(700, .12, "sawtooth", .06), 60); },
  crash: () => { beep(160, .3, "sawtooth", .07); setTimeout(() => beep(90, .35, "sawtooth", .06), 90); },
  select: () => beep(360, .05, "square", .03),
  levelup: () => { beep(660, .09, "triangle", .06); setTimeout(() => beep(880, .12, "triangle", .06), 80); setTimeout(() => beep(1100, .16, "triangle", .07), 160); },
  achievement: () => { beep(880, .08, "sine", .05); setTimeout(() => beep(1320, .18, "sine", .06), 90); },
  shield: () => beep(1200, .18, "sine", .06),
  combo: (n) => beep(500 + Math.min(n, 10) * 55, .06, "square", .035),
  claim: () => { beep(700, .07, "sine", .05); setTimeout(() => beep(1050, .1, "sine", .06), 70); setTimeout(() => beep(1400, .14, "sine", .06), 150); },
};

/* ======================= SKINS (80+, tiered, powers scale with price) ======================= */
const SKIN_NAME_A = ["Cyan","Violet","Neon","Plasma","Photon","Quantum","Volt","Prism","Nova","Pulse","Aurora","Spectra","Glitch","Vapor","Ion","Laser","Chrome","Astro","Lunar","Solar","Void","Comet","Nebula","Pixel","Circuit","Binary","Cobalt","Crystal","Electric","Frost","Indigo","Magenta","Orchid","Radiant","Static"];
const SKIN_NAME_B = ["Wave","Fang","Core","Drift","Flux","Shard","Byte","Surge","Rift","Fusion","Serpent","Coil","Viper","Racer","Streak","Blade","Spiral","Storm","Echo","Signal","Matrix","Beam","Orbit","Vortex","Ray","Grid","Cell","Spark","Zenith","Phantom"];
const SKIN_TIERS = [
  { key: "common",    label: "Common",    count: 24, price: [20, 190],     power: null },
  { key: "rare",      label: "Rare",      count: 20, price: [220, 560],    power: { type: "coin",  value: 0.10 } },
  { key: "epic",      label: "Epic",      count: 15, price: [600, 1150],   power: { type: "score", value: 0.15 } },
  { key: "legendary", label: "Legendary", count: 12, price: [1250, 2450],  power: { type: "combo", value: 900 } },
  { key: "mythic",    label: "Mythic",    count: 8,  price: [2600, 5200],  power: { type: "score", value: 0.30 } },
  { key: "cosmic",    label: "Cosmic",    count: 8,  price: [5500, 9000],  power: { type: "score", value: 0.40 } },
];
/* visual pattern applied on top of the base gradient — this is what makes skins look
   like distinct "cool" designs instead of a plain colour ramp */
const SKIN_PATTERNS = ["scales", "stripes", "studs", "diamond", "hex"];
function buildSkins() {
  const list = [{
    id: "horizon", name: "Cyan Horizon", price: 0, tier: "Starter", pattern: "scales",
    head: "#eafcff", body: ["#35e7ff", "#8b5cf6"], glow: "rgba(53,231,255,0.6)", power: { type: "score", value: 0.02 }
  }];
  let idx = 0;
  SKIN_TIERS.forEach(tier => {
    for (let i = 0; i < tier.count; i++) {
      idx++;
      const h1 = bandHue(idx * 13), h2 = bandHue(idx * 13 + 55);
      const head = hsl2hex(h1, 70, 86);
      const c1 = hsl2hex(h1, 92, 60);
      const c2 = hsl2hex(h2, 92, 56);
      const price = Math.round(tier.price[0] + (tier.price[1] - tier.price[0]) * (tier.count > 1 ? i / (tier.count - 1) : 0));
      const name = SKIN_NAME_A[idx % SKIN_NAME_A.length] + " " + SKIN_NAME_B[(idx * 3) % SKIN_NAME_B.length];
      list.push({
        id: tier.key + "_" + i, name, price, tier: tier.label,
        head, body: [c1, c2], glow: `rgba(${hexToRgbStr(c1)},0.65)`, power: tier.power,
        pattern: SKIN_PATTERNS[idx % SKIN_PATTERNS.length]
      });
    }
  });
  return list;
}
const SKINS = buildSkins();
function skinById(id) { return SKINS.find(s => s.id === id) || SKINS[0]; }
function skinBodyColor(skin, i, total) {
  if (skin.body === "rainbow") return `hsl(${(performance.now() / 12 + i * 24) % 360} 90% 65%)`;
  if (Array.isArray(skin.body)) return lerpColor(skin.body[0], skin.body[1], total > 1 ? i / (total - 1) : 0);
  return skin.body;
}
/* draws a decorative overlay pattern on a single body/head cell so skins read as
   distinct textured designs (scales, stripes, studs, diamonds, hex-plates)
   instead of a flat colour swatch. x,y,w describe the square cell in canvas px. */
function drawSkinCellPattern(ctx, x, y, w, pattern, accent) {
  ctx.save();
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, w, w * 0.32); else ctx.rect(x, y, w, w);
  ctx.clip();
  ctx.globalAlpha = 0.4;
  ctx.strokeStyle = accent; ctx.fillStyle = accent;
  ctx.lineWidth = Math.max(1, w * 0.05);
  const cx = x + w / 2, cy = y + w / 2;
  switch (pattern) {
    case "scales":
      ctx.beginPath(); ctx.arc(cx, y + w * 0.15, w * 0.42, 0, Math.PI, false); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, y + w * 0.85, w * 0.42, Math.PI, 0, false); ctx.stroke();
      break;
    case "stripes":
      for (let d = -w; d < w * 2; d += w * 0.4) {
        ctx.beginPath(); ctx.moveTo(x + d, y); ctx.lineTo(x + d - w, y + w); ctx.stroke();
      }
      break;
    case "studs":
      ctx.globalAlpha = 0.55;
      [[0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7], [0.5, 0.5]].forEach(([px, py]) => {
        ctx.beginPath(); ctx.arc(x + w * px, y + w * py, w * 0.08, 0, Math.PI * 2); ctx.fill();
      });
      break;
    case "diamond":
      ctx.beginPath();
      ctx.moveTo(cx, y + w * 0.1); ctx.lineTo(x + w * 0.9, cy); ctx.lineTo(cx, y + w * 0.9); ctx.lineTo(x + w * 0.1, cy);
      ctx.closePath(); ctx.stroke();
      break;
    case "hex":
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (Math.PI / 3) * k - Math.PI / 6;
        const px = cx + Math.cos(a) * w * 0.4, py = cy + Math.sin(a) * w * 0.4;
        k === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.stroke();
      break;
  }
  ctx.restore();
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
    ctx.shadowBlur = 0;
    if (skin.pattern && i !== n - 1) drawSkinCellPattern(ctx, x - r, y - r, r * 2, skin.pattern, skin.head);
  }
}

/* ======================= BACKGROUNDS (40+, incl. custom upload) ======================= */
const BG_NAME_A = ["Dusk","Nebula","Cyber","Aurora","Quantum","Deep","Neon","Astral","Nova","Static","Violet","Cobalt","Electric","Lunar","Rift"];
const BG_NAME_B = ["Horizon","Skyline","Grid","Field","Void","Expanse","Drift","Waves","Circuit","Bloom","Haze","Prism","Zone","Signal"];
const BG_TIERS = [
  { key: "common",    count: 14, price: [50, 380],    power: null },
  { key: "rare",      count: 12, price: [420, 1150],  power: { type: "coin",  value: 0.05 } },
  { key: "epic",      count: 8,  price: [1250, 2500],  power: { type: "score", value: 0.08 } },
  { key: "legendary", count: 4,  price: [2700, 3800],  power: { type: "score", value: 0.12 } },
  { key: "cosmic",    count: 6,  price: [4000, 6500],  power: { type: "score", value: 0.16 } },
];
/* decorative motif drawn on top of the gradient so backgrounds read as designed
   scenes (grid, orbits, auroras, scan-lines, hex-field) rather than a plain colour wash */
const BG_PATTERNS = ["grid", "orbits", "aurora", "scan", "hexfield"];
function buildBackgrounds() {
  const list = [{ id: "default", name: "Dusk Horizon", price: 0, tier: "Free", type: "gradient", pattern: "aurora", stops: ["#05040a", "#130a24", "#20122e"], power: { type: "coin", value: 0.03 } }];
  let idx = 0;
  BG_TIERS.forEach(tier => {
    for (let i = 0; i < tier.count; i++) {
      idx++;
      const h1 = bandHue(idx * 17), h2 = bandHue(idx * 17 + 60), h3 = bandHue(idx * 17 + 110);
      const price = Math.round(tier.price[0] + (tier.price[1] - tier.price[0]) * (tier.count > 1 ? i / (tier.count - 1) : 0));
      list.push({
        id: "bg_" + tier.key + "_" + i,
        name: BG_NAME_A[idx % BG_NAME_A.length] + " " + BG_NAME_B[(idx * 5) % BG_NAME_B.length],
        price, tier: tier.key, type: "gradient",
        stops: [hsl2hex(h1, 55, 7), hsl2hex(h2, 65, 13), hsl2hex(h3, 70, 10)],
        accent: hsl2hex(h1, 85, 55),
        pattern: BG_PATTERNS[idx % BG_PATTERNS.length],
        power: tier.power
      });
    }
  });
  list.push({ id: "custom", name: "Upload Your Own", price: 4000, tier: "Custom", type: "upload", power: { type: "score", value: 0.05 } });
  return list;
}
const BACKGROUNDS = buildBackgrounds();
function backgroundById(id) { return BACKGROUNDS.find(b => b.id === id) || BACKGROUNDS[0]; }
/* shared canvas renderer for a background's gradient + motif — used by both the
   in-game backdrop and the shop preview swatch so they match exactly */
function paintBackgroundMotif(ctx, w, h, bg) {
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = bg.accent || "#35e7ff";
  ctx.fillStyle = bg.accent || "#35e7ff";
  ctx.lineWidth = 1;
  switch (bg.pattern) {
    case "grid":
      ctx.globalAlpha = 0.22;
      for (let x = 0; x < w; x += w / 10) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
      for (let y = 0; y < h; y += h / 10) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
      break;
    case "orbits":
      ctx.globalAlpha = 0.28;
      for (let r = Math.min(w, h) * 0.12; r < Math.max(w, h) * 0.7; r += Math.min(w, h) * 0.14) {
        ctx.beginPath(); ctx.arc(w * 0.5, h * 0.5, r, 0, Math.PI * 2); ctx.stroke();
      }
      break;
    case "aurora":
      ctx.globalAlpha = 0.25;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(0, h * (0.25 + i * 0.2));
        ctx.bezierCurveTo(w * 0.3, h * (0.1 + i * 0.2), w * 0.7, h * (0.4 + i * 0.2), w, h * (0.2 + i * 0.2));
        ctx.lineWidth = h * 0.05;
        ctx.stroke();
      }
      break;
    case "scan":
      ctx.globalAlpha = 0.2;
      for (let y = 0; y < h; y += 6) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
      break;
    case "hexfield":
      ctx.globalAlpha = 0.24;
      const size = Math.min(w, h) / 6;
      for (let row = 0; row < h / size + 2; row++) {
        for (let col = 0; col < w / size + 2; col++) {
          const cx = col * size * 1.5, cy = row * size * 1.7 + (col % 2 ? size * 0.85 : 0);
          ctx.beginPath();
          for (let k = 0; k < 6; k++) {
            const a = (Math.PI / 3) * k;
            const px = cx + Math.cos(a) * size * 0.5, py = cy + Math.sin(a) * size * 0.5;
            k === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
          }
          ctx.closePath(); ctx.stroke();
        }
      }
      break;
  }
  ctx.restore();
}

/* ======================= TRAILS (cosmetic shop #3) ======================= */
const TRAILS = [
  { id: "none",         name: "No Trail",      price: 0,    color: null,      power: { type: "coin", value: 0.01 } },
  { id: "trail_cyan",   name: "Cyan Trail",    price: 120,  color: "#35e7ff",  power: { type: "coin",  value: 0.03 } },
  { id: "trail_purple", name: "Violet Trail",  price: 120,  color: "#8b5cf6",  power: { type: "score", value: 0.03 } },
  { id: "trail_pink",   name: "Magenta Trail", price: 300,  color: "#ff5fa2",  power: { type: "combo", value: 200 } },
  { id: "trail_ice",    name: "Ice Trail",     price: 300,  color: "#8fd3ff",  power: { type: "score", value: 0.05 } },
  { id: "trail_toxic",  name: "Toxic Trail",   price: 450,  color: "#7CFF6B",  power: { type: "coin",  value: 0.06 } },
  { id: "trail_ember",  name: "Ember Trail",   price: 450,  color: "#ff9d3d",  power: { type: "score", value: 0.06 } },
  { id: "trail_gold",   name: "Aurum Trail",   price: 700,  color: "#ffd166",  power: { type: "coin",  value: 0.08 } },
  { id: "trail_shadow", name: "Shadow Trail",  price: 900,  color: "#c9a6ff",  power: { type: "combo", value: 400 } },
  { id: "trail_plasma", name: "Plasma Trail",  price: 1500, color: "#ff2fd6",  power: { type: "score", value: 0.10 } },
  { id: "trail_prism",  name: "Prism Trail",   price: 2200, color: "rainbow",  power: { type: "score", value: 0.12 } },
  { id: "trail_void",   name: "Void Trail",    price: 2800, color: "#6b5bff",  power: { type: "coin",  value: 0.12 } },
  { id: "trail_solar",  name: "Solar Trail",   price: 3200, color: "#ffb347",  power: { type: "combo", value: 600 } },
  { id: "trail_neon",   name: "Neon Streak",   price: 3800, color: "#39ff14",  power: { type: "score", value: 0.15 } },
  { id: "trail_comet",  name: "Comet Trail",   price: 4600, color: "#ff5fa2",  power: { type: "combo", value: 800 } },
  { id: "trail_aurora", name: "Aurora Trail",  price: 5400, color: "#7CFF6B",  power: { type: "score", value: 0.18 } },
  { id: "trail_cosmic", name: "Cosmic Trail",  price: 6200, color: "rainbow",  power: { type: "coin",  value: 0.16 } },
];
function trailById(id) { return TRAILS.find(t => t.id === id) || TRAILS[0]; }

/* ======================= FOODS (shop #4 — score per bite) ======================= */
const FOODS = [
  { id: "apple",      name: "Apple",       emoji: "🍎", price: 0,    pts: 1,  color: "#ff5d6c", power: { type: "score", value: 0.01 } },
  { id: "banana",     name: "Banana",      emoji: "🍌", price: 80,   pts: 5,  color: "#ffd166", power: { type: "score", value: 0.02 } },
  { id: "mango",      name: "Mango",       emoji: "🥭", price: 150,  pts: 8,  color: "#ff9d3d", power: { type: "coin",  value: 0.03 } },
  { id: "grape",      name: "Grape",       emoji: "🍇", price: 200,  pts: 10, color: "#8b5cf6", power: { type: "combo", value: 150 } },
  { id: "strawberry", name: "Strawberry",  emoji: "🍓", price: 250,  pts: 12, color: "#ff2f6d", power: { type: "score", value: 0.04 } },
  { id: "watermelon", name: "Watermelon",  emoji: "🍉", price: 320,  pts: 15, color: "#7CFF6B", power: { type: "coin",  value: 0.04 } },
  { id: "cherry",     name: "Cherry",      emoji: "🍒", price: 400,  pts: 18, color: "#ff3d5a", power: { type: "score", value: 0.05 } },
  { id: "peach",      name: "Peach",       emoji: "🍑", price: 480,  pts: 20, color: "#ffb3a0", power: { type: "combo", value: 250 } },
  { id: "pineapple",  name: "Pineapple",   emoji: "🍍", price: 550,  pts: 22, color: "#ffd166", power: { type: "score", value: 0.06 } },
  { id: "kiwi",       name: "Kiwi",        emoji: "🥝", price: 620,  pts: 25, color: "#8fd3a0", power: { type: "coin",  value: 0.05 } },
  { id: "blueberry",  name: "Blueberry",   emoji: "🫐", price: 700,  pts: 28, color: "#4d7cff", power: { type: "score", value: 0.07 } },
  { id: "orange",     name: "Orange",      emoji: "🍊", price: 780,  pts: 30, color: "#ff9d3d", power: { type: "combo", value: 300 } },
  { id: "lemon",      name: "Lemon",       emoji: "🍋", price: 860,  pts: 32, color: "#fff06b", power: { type: "coin",  value: 0.06 } },
  { id: "coconut",    name: "Coconut",     emoji: "🥥", price: 950,  pts: 35, color: "#e8d5b7", power: { type: "score", value: 0.08 } },
  { id: "avocado",    name: "Avocado",     emoji: "🥑", price: 1100, pts: 40, color: "#5a9e4b", power: { type: "coin",  value: 0.07 } },
  { id: "dragonfruit",name: "Dragonfruit", emoji: "🐉", price: 1300, pts: 45, color: "#ff5fa2", power: { type: "score", value: 0.09 } },
  { id: "starfruit",  name: "Starfruit",   emoji: "⭐", price: 1500, pts: 50, color: "#ffe66d", power: { type: "combo", value: 400 } },
  { id: "pomegranate",name: "Pomegranate", emoji: "🔴", price: 1800, pts: 55, color: "#c41e3a", power: { type: "score", value: 0.10 } },
  { id: "lychee",     name: "Lychee",      emoji: "⚪", price: 2100, pts: 60, color: "#f5e6e0", power: { type: "coin",  value: 0.08 } },
  { id: "golden_apple",name: "Golden Apple",emoji: "✨", price: 2800, pts: 80, color: "#ffd700", power: { type: "score", value: 0.12 } },
  { id: "crystal_berry",name: "Crystal Berry",emoji: "💎", price: 3500, pts: 100,color: "#bdf4ff", power: { type: "score", value: 0.15 } },
  { id: "void_fruit", name: "Void Fruit",  emoji: "🌑", price: 4200, pts: 120,color: "#6b5bff", power: { type: "combo", value: 700 } },
  { id: "neon_melon", name: "Neon Melon",  emoji: "🟢", price: 5000, pts: 150,color: "#39ff14", power: { type: "score", value: 0.18 } },
  { id: "phoenix_fruit",name: "Phoenix Fruit",emoji: "🔥", price: 6000, pts: 180,color: "#ff6b3d", power: { type: "combo", value: 900 } },
  { id: "cosmic_pear",name: "Cosmic Pear", emoji: "🍐", price: 7200, pts: 210,color: "#c9a6ff", power: { type: "score", value: 0.22 } },
];
function foodById(id) { return FOODS.find(f => f.id === id) || FOODS[0]; }

/* ======================= MAPS (30+, procedurally laid out) ======================= */
const GRID_COLS = 24, GRID_ROWS = 24;
function inSafeZone(x, y) { return Math.abs(x - 12) <= 6 && Math.abs(y - 12) <= 3; }
function filterSafe(cells) {
  const seen = new Set(), out = [];
  cells.forEach(c => {
    if (c.x < 0 || c.x >= GRID_COLS || c.y < 0 || c.y >= GRID_ROWS) return;
    if (inSafeZone(c.x, c.y)) return;
    const k = c.x + "," + c.y;
    if (!seen.has(k)) { seen.add(k); out.push(c); }
  });
  return out.slice(0, 130);
}
function mapBorder(gap) {
  const c = [];
  for (let x = 0; x < GRID_COLS; x++) { if (x % gap !== 0) { c.push({ x, y: 0 }); c.push({ x, y: GRID_ROWS - 1 }); } }
  for (let y = 0; y < GRID_ROWS; y++) { if (y % gap !== 0) { c.push({ x: 0, y }); c.push({ x: GRID_COLS - 1, y }); } }
  return c;
}
function mapPillars(spacing) {
  const c = [];
  for (let x = spacing; x < GRID_COLS; x += spacing) for (let y = spacing; y < GRID_ROWS; y += spacing) c.push({ x, y });
  return c;
}
function mapCheckerboard(step) {
  const c = [];
  for (let x = 0; x < GRID_COLS; x += step) for (let y = 0; y < GRID_ROWS; y += step) if (((x / step) + (y / step)) % 2 === 0) c.push({ x, y });
  return c;
}
function mapRings(count) {
  const c = [];
  for (let r = 4; r <= 4 + count * 3; r += 3) for (let a = 0; a < 360; a += 15) {
    const rad = a * Math.PI / 180;
    c.push({ x: Math.round(12 + Math.cos(rad) * r), y: Math.round(12 + Math.sin(rad) * r) });
  }
  return c;
}
function mapCross(thick) {
  const c = [];
  for (let x = 0; x < GRID_COLS; x++) for (let t = 0; t < thick; t++) c.push({ x, y: 11 + t });
  for (let y = 0; y < GRID_ROWS; y++) for (let t = 0; t < thick; t++) c.push({ x: 11 + t, y });
  return c;
}
function mapDiagonal(step) {
  const c = [];
  for (let i = 0; i < GRID_COLS; i += step) { c.push({ x: i, y: i }); c.push({ x: GRID_COLS - 1 - i, y: i }); }
  return c;
}
function mapZigzag(gap) {
  const c = [];
  for (let y = 2; y < GRID_ROWS; y += gap) for (let x = 0; x < GRID_COLS; x++) if ((x + y) % 5 === 0) c.push({ x, y });
  return c;
}
function seededRand(seed) { let s = seed; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; }
function mapScatter(seed, count) {
  const rnd = seededRand(seed), c = [];
  for (let i = 0; i < count; i++) c.push({ x: Math.floor(rnd() * GRID_COLS), y: Math.floor(rnd() * GRID_ROWS) });
  return c;
}
function mapCorners(size) {
  const c = [];
  for (let x = 0; x < size; x++) for (let y = 0; y < size; y++) {
    c.push({ x, y }); c.push({ x: GRID_COLS - 1 - x, y }); c.push({ x, y: GRID_ROWS - 1 - y }); c.push({ x: GRID_COLS - 1 - x, y: GRID_ROWS - 1 - y });
  }
  return c;
}
function mapSideWalls(gap) {
  const c = [];
  for (let y = 0; y < GRID_ROWS; y++) if (y % gap !== 0) { c.push({ x: 3, y }); c.push({ x: GRID_COLS - 4, y }); }
  return c;
}
const MAP_DEFS = [
  { id: "open",       name: "Open Field",         build: () => [] },
  { id: "border1",    name: "Ringwalls I",        build: () => mapBorder(2) },
  { id: "border2",    name: "Ringwalls II",       build: () => mapBorder(3) },
  { id: "border3",    name: "Ringwalls III",      build: () => mapBorder(4) },
  { id: "pillars1",   name: "Pillars Sparse",     build: () => mapPillars(6) },
  { id: "pillars2",   name: "Pillars Medium",     build: () => mapPillars(5) },
  { id: "pillars3",   name: "Pillars Dense",      build: () => mapPillars(4) },
  { id: "pillars4",   name: "Pillars Tight",      build: () => mapPillars(3) },
  { id: "checker1",   name: "Checkerboard I",     build: () => mapCheckerboard(4) },
  { id: "checker2",   name: "Checkerboard II",    build: () => mapCheckerboard(3) },
  { id: "checker3",   name: "Checkerboard III",   build: () => mapCheckerboard(2) },
  { id: "rings1",     name: "Nebula Rings I",     build: () => mapRings(2) },
  { id: "rings2",     name: "Nebula Rings II",    build: () => mapRings(3) },
  { id: "rings3",     name: "Nebula Rings III",   build: () => mapRings(4) },
  { id: "cross1",     name: "Crosshair Thin",     build: () => mapCross(1) },
  { id: "cross2",     name: "Crosshair Thick",    build: () => mapCross(2) },
  { id: "diag1",      name: "Diagonal Rift I",    build: () => mapDiagonal(3) },
  { id: "diag2",      name: "Diagonal Rift II",   build: () => mapDiagonal(2) },
  { id: "zigzag1",    name: "Zigzag Circuit I",   build: () => mapZigzag(4) },
  { id: "zigzag2",    name: "Zigzag Circuit II",  build: () => mapZigzag(3) },
  { id: "corners1",   name: "Corner Blocks I",    build: () => mapCorners(2) },
  { id: "corners2",   name: "Corner Blocks II",   build: () => mapCorners(3) },
  { id: "corners3",   name: "Corner Blocks III",  build: () => mapCorners(4) },
  { id: "sidewalls1", name: "Twin Channels I",    build: () => mapSideWalls(3) },
  { id: "sidewalls2", name: "Twin Channels II",   build: () => mapSideWalls(2) },
  { id: "scatter1",   name: "Asteroid Field I",   build: () => mapScatter(11, 18) },
  { id: "scatter2",   name: "Asteroid Field II",  build: () => mapScatter(42, 26) },
  { id: "scatter3",   name: "Asteroid Field III", build: () => mapScatter(77, 34) },
  { id: "scatter4",   name: "Asteroid Field IV",  build: () => mapScatter(103, 42) },
  { id: "scatter5",   name: "Asteroid Field V",   build: () => mapScatter(158, 50) },
  { id: "combo1",     name: "Fractured Grid I",   build: () => [...mapPillars(6), ...mapScatter(23, 10)] },
  { id: "combo2",     name: "Fractured Grid II",  build: () => [...mapCross(1), ...mapCorners(2)] },
  { id: "combo3",     name: "Fractured Grid III", build: () => [...mapRings(2), ...mapScatter(64, 12)] },
  { id: "combo4",     name: "Chaos Chamber",      build: () => [...mapCheckerboard(3), ...mapDiagonal(4)] },
];
function mapObstacles(id) {
  const def = MAP_DEFS.find(m => m.id === id) || MAP_DEFS[0];
  return filterSafe(def.build());
}

/* ======================= DIFFICULTY ======================= */
const SPEED_MS = { slow: 150, normal: 105, fast: 72, extreme: 50 };
const DIFFICULTY_EXTRA_OBSTACLES = { none: 0, low: 4, medium: 10, high: 18 };

/* ======================= POWERS (skin + background + trail + food) ======================= */
function activePowerBoosts() {
  const skin = skinById(save.selectedSkin);
  const bg = backgroundById(save.selectedBackground);
  const trail = trailById(save.selectedTrail);
  const food = foodById(save.selectedFood);
  let scoreBoost = 0, coinBoost = 0, comboExtendMs = 0;
  [skin && skin.power, bg && bg.power, trail && trail.power, food && food.power].forEach(p => {
    if (!p) return;
    if (p.type === "score") scoreBoost += p.value;
    if (p.type === "coin") coinBoost += p.value;
    if (p.type === "combo") comboExtendMs += p.value;
  });
  return { scoreBoost, coinBoost, comboExtendMs };
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
  el.innerHTML = `<b style="color:var(${colorVar || "--gold"})">${title}</b><span>${subtitle || ""}</span>`;
  layerEl.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

/* ======================= background image upload (resize + compress) ======================= */
function readImageFileAsBackground(file, maxSize, cb) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      const cx = c.getContext("2d");
      cx.drawImage(img, 0, 0, c.width, c.height);
      try {
        const dataUrl = c.toDataURL("image/jpeg", 0.72);
        cb(null, dataUrl);
      } catch (err) { cb(err); }
    };
    img.onerror = () => cb(new Error("Could not read image"));
    img.src = e.target.result;
  };
  reader.onerror = () => cb(new Error("Could not read file"));
  reader.readAsDataURL(file);
}
