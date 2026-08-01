import { COLS, ROWS } from './config.js';

/* ============================================================
   Konstlager.
   Allt ritas procedurellt — det finns inga bildfiler. Poängen här är
   att sluta rita "tunna neonstreck på svart" och i stället bygga
   ytor med volym: mark med struktur, torn med kropp och skugga,
   creeps med ljus uppifrån. Samma canvas, helt annan känsla.

   Marken byggs EN gång till en offscreen-canvas och blittas sedan
   varje bildruta. Att rita tusen grässtrån per frame vore vansinne.
   ============================================================ */

/* Enkel deterministisk slump så marken ser likadan ut varje bildruta
   men olika ut på varje bana. */
function mulberry(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const cache = new Map();

export function terrainFor(board, cell, seed, hostile) {
  const key = `${seed}|${Math.round(cell)}|${hostile ? 1 : 0}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const cv = buildTerrain(board, cell, seed, hostile);
  cache.set(key, cv);
  if (cache.size > 6) cache.delete(cache.keys().next().value);
  return cv;
}

function buildTerrain(board, cell, seed, hostile) {
  const W = Math.ceil(COLS * cell), H = Math.ceil(ROWS * cell);
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const rnd = mulberry(seed * 7919 + (hostile ? 31 : 17));

  // Grundton: varm sand hos dig, kall aska hos fienden.
  const base = g.createLinearGradient(0, 0, W * 0.3, H);
  if (hostile) { base.addColorStop(0, '#3a2440'); base.addColorStop(1, '#231532'); }
  else { base.addColorStop(0, '#6b4a2e'); base.addColorStop(1, '#432c1e'); }
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);

  // Fläckar av ljusare och mörkare jord — det som gör ytan levande.
  for (let i = 0; i < 130; i++) {
    const x = rnd() * W, y = rnd() * H;
    const r = cell * (0.4 + rnd() * 1.6);
    const light = rnd() > 0.5;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    const c = hostile
      ? (light ? '90,60,110' : '30,18,44')
      : (light ? '150,110,66' : '52,34,22');
    grd.addColorStop(0, `rgba(${c},${0.16 + rnd() * 0.2})`);
    grd.addColorStop(1, `rgba(${c},0)`);
    g.fillStyle = grd;
    g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }

  // Mossa/vegetation i klasar, mest längs kanterna.
  const mossA = hostile ? '#3d6b52' : '#4e7a3a';
  const mossB = hostile ? '#2b8f7a' : '#7aa84a';
  for (let i = 0; i < 60; i++) {
    const edge = rnd();
    const x = edge < 0.5 ? rnd() * W * 0.28 : W - rnd() * W * 0.28;
    const y = rnd() * H;
    blob(g, x, y, cell * (0.5 + rnd() * 1.1), mossA, 0.5, rnd);
    if (rnd() > 0.5) blob(g, x + cell * 0.2, y - cell * 0.15, cell * 0.4, mossB, 0.35, rnd);
  }
  for (let i = 0; i < 26; i++) {
    blob(g, rnd() * W, rnd() * H, cell * (0.35 + rnd() * 0.7), mossA, 0.32, rnd);
  }

  // Småsten med ljus ovansida — ger ytan korn och riktning på ljuset.
  for (let i = 0; i < 90; i++) {
    const x = rnd() * W, y = rnd() * H;
    const r = cell * (0.05 + rnd() * 0.09);
    g.fillStyle = 'rgba(20,12,8,.35)';
    g.beginPath(); g.ellipse(x, y + r * 0.5, r * 1.1, r * 0.7, 0, 0, 7); g.fill();
    g.fillStyle = hostile ? 'rgba(150,130,175,.5)' : 'rgba(205,180,140,.55)';
    g.beginPath(); g.ellipse(x, y, r, r * 0.75, 0, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,245,225,.35)';
    g.beginPath(); g.ellipse(x - r * 0.25, y - r * 0.25, r * 0.42, r * 0.3, 0, 0, 7); g.fill();
  }

  // Sprickor
  g.strokeStyle = 'rgba(25,15,10,.28)';
  g.lineWidth = Math.max(1, cell * 0.035);
  for (let i = 0; i < 14; i++) {
    let x = rnd() * W, y = rnd() * H;
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 4; k++) {
      x += (rnd() - 0.5) * cell * 2.2;
      y += (rnd() - 0.5) * cell * 2.2;
      g.lineTo(x, y);
    }
    g.stroke();
  }

  // Vinjett mot kanterna så fältet får en tydlig avgränsning.
  const vig = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.72);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,.45)');
  g.fillStyle = vig;
  g.fillRect(0, 0, W, H);

  return cv;
}

function blob(g, x, y, r, color, alpha, rnd) {
  g.save();
  g.globalAlpha = alpha;
  g.fillStyle = color;
  g.beginPath();
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 / n) * i;
    const rr = r * (0.65 + rnd() * 0.6);
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr * 0.72;
    i ? g.lineTo(px, py) : g.moveTo(px, py);
  }
  g.closePath();
  g.fill();
  g.restore();
}

/* ---------- delade ritverktyg för volym ---------- */

/* Mjuk markskugga under allt som står på banan. */
export function dropShadow(cx, ctx2d, x, y, rx, ry) {
  ctx2d.save();
  ctx2d.globalAlpha = 0.38;
  ctx2d.fillStyle = '#000';
  ctx2d.beginPath();
  ctx2d.ellipse(x, y, rx, ry, 0, 0, 7);
  ctx2d.fill();
  ctx2d.restore();
}

/* Ljusare topp, mörkare botten — det enda som egentligen krävs för att
   en platt form ska läsa som ett föremål. */
export function bodyGradient(ctx2d, x, y, h, top, bottom) {
  const g = ctx2d.createLinearGradient(x, y - h / 2, x, y + h / 2);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  return g;
}

export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return `rgb(${r},${g},${b})`;
}
