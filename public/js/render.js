import { COLS, ROWS, TOWERS, CREEPS } from './config.js';
import { pPos } from './board.js';

/* ============================================================
   Rendering.
   Layout: 'dual' på breda skärmar (båda banorna samtidigt, som i
   WC3 där man ser motståndaren) och 'single' på mobil där man
   växlar vy. Samma ritkod, olika origo och rutstorlek.
   ============================================================ */

let CV, CX, DPR = 1;
export const L = { mode: 'single', w: 0, h: 0, me: null, foe: null };
let stars = [];

export function initRender(canvas) {
  CV = canvas;
  CX = canvas.getContext('2d');
  resize();
}

function makeSlot(ox, oy, cell) { return { ox, oy, cell }; }

export function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2.5);
  const host = CV.parentElement;
  const w = host.clientWidth, h = host.clientHeight;
  CV.width = Math.round(w * DPR);
  CV.height = Math.round(h * DPR);
  CV.style.width = w + 'px';
  CV.style.height = h + 'px';
  L.w = w; L.h = h;

  const dual = w >= 880 && w / h > 1.15;
  L.mode = dual ? 'dual' : 'single';

  if (dual) {
    const gap = 28;
    const half = (w - gap) / 2;
    const cell = Math.min((half - 16) / COLS, (h - 34) / ROWS);
    const bw = cell * COLS, bh = cell * ROWS;
    const oy = (h - bh) / 2 + 8;
    L.me = makeSlot((half - bw) / 2, oy, cell);
    L.foe = makeSlot(half + gap + (half - bw) / 2, oy, cell);
  } else {
    const cell = Math.min(w / COLS, (h - 22) / ROWS);
    const ox = (w - cell * COLS) / 2, oy = (h - cell * ROWS) / 2;
    L.me = makeSlot(ox, oy, cell);
    L.foe = L.me;
  }

  if (!stars.length) {
    for (let i = 0; i < 90; i++) {
      stars.push({ x: Math.random(), y: Math.random(), r: Math.random() * 1.3 + 0.3, a: Math.random() * 0.5 + 0.1 });
    }
  }
}

const gx = (s, x) => s.ox + (x + 0.5) * s.cell;
const gy = (s, y) => s.oy + (y + 0.5) * s.cell;

/* Vilken ruta pekar skärmkoordinaten på? Returnerar null utanför. */
export function pickCell(slot, px, py) {
  const cx = Math.floor((px - slot.ox) / slot.cell);
  const cy = Math.floor((py - slot.oy) / slot.cell);
  if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) return null;
  return { cx, cy };
}

export function slotFor(who) { return who === 'me' ? L.me : L.foe; }

/* ---------- huvudrit ---------- */
export function drawFrame(G) {
  CX.setTransform(DPR, 0, 0, DPR, 0, 0);
  drawBackdrop(G ? G.time : 0);
  if (!G) return;

  if (L.mode === 'dual') {
    drawBoard(G, G.me.board, L.me, false, G);
    drawBoard(G, G.foe.board, L.foe, true, G);
    drawSlotLabel(L.me, '🛡 ' + G.me.name, '#4fd8eb', G.me.board);
    drawSlotLabel(L.foe, '⚔ ' + G.foe.name, '#ff5d73', G.foe.board);
    drawDivider();
  } else {
    const hostile = G.view === 'atk';
    drawBoard(G, hostile ? G.foe.board : G.me.board, L.me, hostile, G);
    drawSlotLabel(L.me,
      hostile ? '⚔ ' + G.foe.name + ' — dina creeps anfaller här' : '🛡 DIN BANA — bygg försvar här',
      hostile ? '#ff5d73' : '#4fd8eb', hostile ? G.foe.board : G.me.board);
  }
}

function drawBackdrop(time) {
  const { w, h } = L;
  const g = CX.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#0e1226');
  g.addColorStop(1, '#080a16');
  CX.fillStyle = g;
  CX.fillRect(0, 0, w, h);
  CX.fillStyle = '#ffffff';
  for (const s of stars) {
    CX.globalAlpha = s.a * (0.6 + 0.4 * Math.sin(time * 0.8 + s.x * 40));
    CX.beginPath();
    CX.arc(s.x * w, s.y * h, s.r, 0, 7);
    CX.fill();
  }
  CX.globalAlpha = 1;
}

function drawDivider() {
  const x = L.w / 2;
  const g = CX.createLinearGradient(0, 0, 0, L.h);
  g.addColorStop(0, 'rgba(80,95,150,0)');
  g.addColorStop(0.5, 'rgba(80,95,150,.35)');
  g.addColorStop(1, 'rgba(80,95,150,0)');
  CX.strokeStyle = g;
  CX.lineWidth = 1;
  CX.beginPath(); CX.moveTo(x, 10); CX.lineTo(x, L.h - 10); CX.stroke();
}

function drawSlotLabel(s, text, color, board) {
  CX.font = '600 10px "Chakra Petch",sans-serif';
  CX.fillStyle = color;
  CX.globalAlpha = 0.75;
  // Ligger etiketten för nära kanten hamnar den under banan i stället.
  const y = s.oy > 14 ? s.oy - 6 : s.oy + ROWS * s.cell + (L.mode === 'dual' ? 22 : 12);
  CX.fillText(text, s.ox + 2, Math.min(y, L.h - 4));
  CX.globalAlpha = 1;
  if (L.mode === 'dual' && board) {
    const pct = board.lives / board.maxLives;
    const bw = s.cell * COLS;
    CX.fillStyle = 'rgba(255,255,255,.08)';
    CX.fillRect(s.ox, s.oy + ROWS * s.cell + 6, bw, 4);
    CX.fillStyle = pct > 0.5 ? '#3ddc97' : pct > 0.25 ? '#ffd166' : '#ff5d73';
    CX.fillRect(s.ox, s.oy + ROWS * s.cell + 6, bw * Math.max(0, pct), 4);
  }
}

function drawBoard(G, b, s, hostile, ctx) {
  CX.save();
  if (b.shake > 0) {
    CX.translate((Math.random() - 0.5) * b.shake * 7, (Math.random() - 0.5) * b.shake * 7);
  }

  drawGrid(b, s, hostile ? null : ctx);
  drawPath(b, s, hostile, ctx.time);

  if (!hostile && G.sel) drawSelection(G, b, s);

  for (const tw of b.towers) drawTower(tw, s, hostile, ctx.time);
  cacheCreepPositions(b, s);
  for (const c of b.creeps) { if (c.t >= 0) drawCreep(c, s, ctx.time); }
  for (const sh of b.shots) drawShot(sh, s);
  for (const bo of b.bolts) drawBolt(bo, s);
  for (const f of b.fx) drawFx(f, s);
  for (const f of b.floats) drawFloat(f, s);

  if (b.hurt > 0) {
    CX.fillStyle = `rgba(255,60,90,${b.hurt * 0.18})`;
    CX.fillRect(s.ox - 4, s.oy - 4, s.cell * COLS + 8, s.cell * ROWS + 8);
  }
  CX.restore();
}

function drawGrid(b, s, G) {
  const { cell, ox, oy } = s;
  CX.strokeStyle = 'rgba(70,84,140,.10)';
  CX.lineWidth = 1;
  CX.beginPath();
  for (let x = 0; x <= COLS; x++) { CX.moveTo(ox + x * cell, oy); CX.lineTo(ox + x * cell, oy + ROWS * cell); }
  for (let y = 0; y <= ROWS; y++) { CX.moveTo(ox, oy + y * cell); CX.lineTo(ox + COLS * cell, oy + y * cell); }
  CX.stroke();

  // Byggbara rutor markeras — extra tydligt när byggmenyn är öppen.
  const hi = G && G.buildHint;
  for (const key of b.buildable) {
    const [x, y] = key.split(',').map(Number);
    if (hi) {
      CX.fillStyle = 'rgba(79,216,235,.07)';
      const p = cell * 0.1;
      roundRect(ox + x * cell + p, oy + y * cell + p, cell - 2 * p, cell - 2 * p, cell * 0.16);
      CX.fill();
    }
    CX.fillStyle = hi ? 'rgba(160,190,255,.35)' : 'rgba(120,135,200,.20)';
    CX.beginPath(); CX.arc(gx(s, x), gy(s, y), cell * 0.045, 0, 7); CX.fill();
  }
}

function drawPath(b, s, hostile, time) {
  const { cell } = s;
  const rgb = hostile ? '255,93,115' : '255,180,84';
  CX.lineJoin = 'round'; CX.lineCap = 'round';
  const trace = () => {
    CX.beginPath();
    CX.moveTo(gx(s, b.wp[0][0]), gy(s, b.wp[0][1]));
    for (let i = 1; i < b.wp.length; i++) CX.lineTo(gx(s, b.wp[i][0]), gy(s, b.wp[i][1]));
  };
  trace(); CX.strokeStyle = `rgba(${rgb},.05)`; CX.lineWidth = cell * 0.95; CX.stroke();
  trace(); CX.strokeStyle = `rgba(${rgb},.10)`; CX.lineWidth = cell * 0.66; CX.stroke();
  trace(); CX.strokeStyle = `rgba(10,12,26,.55)`; CX.lineWidth = cell * 0.5; CX.stroke();
  trace(); CX.strokeStyle = `rgba(${rgb},.45)`; CX.lineWidth = 2; CX.stroke();

  trace();
  CX.strokeStyle = `rgba(${rgb},.85)`;
  CX.lineWidth = 2;
  CX.setLineDash([cell * 0.2, cell * 0.55]);
  CX.lineDashOffset = -time * cell * 1.6;
  CX.stroke();
  CX.setLineDash([]);

  const en = pPos(b, 0), ex = pPos(b, b.len);
  portal(gx(s, en.x), gy(s, en.y), hostile ? '#ff5d73' : '#ffb454', cell, time, false);
  portal(gx(s, ex.x), gy(s, ex.y), hostile ? '#4fd8eb' : '#ff5d73', cell, time, true);
}

function portal(x, y, color, cell, time, isCore) {
  for (let i = 0; i < 3; i++) {
    const r = cell * (0.24 + i * 0.12) + Math.sin(time * 2.2 + i * 1.7) * cell * 0.03;
    CX.beginPath();
    CX.arc(x, y, r, 0, 7);
    CX.strokeStyle = color;
    CX.globalAlpha = 0.45 - i * 0.13;
    CX.lineWidth = 2;
    CX.stroke();
  }
  CX.globalAlpha = 1;
  if (isCore) {
    CX.save();
    CX.translate(x, y);
    CX.rotate(time * 0.6);
    CX.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 3 * i, r = cell * 0.17;
      i ? CX.lineTo(r * Math.cos(a), r * Math.sin(a)) : CX.moveTo(r * Math.cos(a), r * Math.sin(a));
    }
    CX.closePath();
    CX.fillStyle = color; CX.globalAlpha = 0.35; CX.fill();
    CX.globalAlpha = 1; CX.strokeStyle = color; CX.lineWidth = 1.5; CX.stroke();
    CX.restore();
  }
}

function drawSelection(G, b, s) {
  const { cell, ox, oy } = s;
  const sx = gx(s, G.sel.cx), sy = gy(s, G.sel.cy);
  if (G.sel.tower) {
    const st = TOWERS[G.sel.tower.type].lv[G.sel.tower.lv];
    ring(sx, sy, st.range * cell, 'rgba(79,216,235,.06)', 'rgba(79,216,235,.45)');
  } else {
    if (G.previewRange) ring(sx, sy, G.previewRange * cell, 'rgba(255,180,84,.05)', 'rgba(255,180,84,.4)');
    CX.strokeStyle = 'rgba(255,255,255,.6)';
    CX.lineWidth = 2;
    const p = cell * 0.08;
    roundRect(ox + G.sel.cx * cell + p, oy + G.sel.cy * cell + p, cell - 2 * p, cell - 2 * p, cell * 0.18);
    CX.stroke();
  }
}

function ring(x, y, r, fill, stroke) {
  CX.beginPath(); CX.arc(x, y, r, 0, 7);
  CX.fillStyle = fill; CX.fill();
  CX.strokeStyle = stroke; CX.lineWidth = 1.5;
  CX.setLineDash([6, 6]); CX.stroke(); CX.setLineDash([]);
}

function drawTower(tw, s, hostile, time) {
  const def = TOWERS[tw.type];
  const { cell } = s;
  const x = gx(s, tw.cx), y = gy(s, tw.cy), size = cell * 0.76;

  // sockel
  const g = CX.createLinearGradient(x, y - size / 2, x, y + size / 2);
  if (hostile) { g.addColorStop(0, '#2a1830'); g.addColorStop(1, '#180d1c'); }
  else { g.addColorStop(0, '#1e2648'); g.addColorStop(1, '#141a33'); }
  CX.fillStyle = g;
  CX.strokeStyle = hostile ? 'rgba(255,93,115,.28)' : 'rgba(120,140,220,.3)';
  CX.lineWidth = 1.2;
  roundRect(x - size / 2, y - size / 2, size, size, size * 0.24);
  CX.fill(); CX.stroke();

  // nivåring
  if (tw.lv > 0) {
    CX.beginPath();
    CX.arc(x, y, size * 0.52, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * tw.lv) / 5);
    CX.strokeStyle = def.color;
    CX.globalAlpha = 0.75;
    CX.lineWidth = 2;
    CX.stroke();
    CX.globalAlpha = 1;
  }

  CX.save();
  CX.translate(x, y);
  CX.rotate(tw.angle + Math.PI / 2);
  const hg = size * 0.31;
  CX.strokeStyle = def.color;
  CX.lineWidth = Math.max(1.6, cell * 0.055);
  CX.lineJoin = 'round';
  if (tw.flash > 0) { CX.shadowColor = def.color; CX.shadowBlur = 16 * tw.flash; }
  CX.beginPath();
  shapePath(def.shape, hg);
  CX.stroke();
  CX.shadowBlur = 0;
  CX.beginPath();
  CX.arc(0, 0, Math.max(1.8, cell * 0.055), 0, 7);
  CX.fillStyle = def.color;
  CX.fill();
  if (tw.flash > 0.4) {
    CX.beginPath();
    CX.moveTo(0, -hg);
    CX.lineTo(0, -hg - cell * 0.22 * tw.flash);
    CX.strokeStyle = '#fff';
    CX.globalAlpha = tw.flash;
    CX.lineWidth = 2;
    CX.stroke();
    CX.globalAlpha = 1;
  }
  CX.restore();
}

function shapePath(shape, hg) {
  if (shape === 'tri') { CX.moveTo(0, -hg); CX.lineTo(hg * 0.92, hg * 0.78); CX.lineTo(-hg * 0.92, hg * 0.78); CX.closePath(); }
  else if (shape === 'hex') { for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i - Math.PI / 2; const px = hg * 0.9 * Math.cos(a), py = hg * 0.9 * Math.sin(a); i ? CX.lineTo(px, py) : CX.moveTo(px, py); } CX.closePath(); }
  else if (shape === 'dia') { CX.moveTo(0, -hg); CX.lineTo(hg, 0); CX.lineTo(0, hg); CX.lineTo(-hg, 0); CX.closePath(); }
  else if (shape === 'star') { for (let i = 0; i < 8; i++) { const a = Math.PI / 4 * i - Math.PI / 2, r = i % 2 ? hg * 0.42 : hg * 0.95; const px = r * Math.cos(a), py = r * Math.sin(a); i ? CX.lineTo(px, py) : CX.moveTo(px, py); } CX.closePath(); }
  else if (shape === 'cross') { CX.moveTo(0, -hg); CX.lineTo(0, hg * 0.55); CX.moveTo(-hg * 0.62, hg * 0.1); CX.lineTo(hg * 0.62, hg * 0.1); }
}

function drawCreep(c, s, time) {
  const d = CREEPS[c.type];
  const { cell } = s;
  const x = c._sx, y = c._sy;
  const r = c.r * cell;
  const wob = Math.sin(c.wob) * r * 0.12;

  CX.save();
  CX.translate(x, y + wob);

  if (c.slow > 0) {
    CX.beginPath(); CX.arc(0, 0, r + 3, 0, 7);
    CX.strokeStyle = 'rgba(155,216,255,.75)'; CX.lineWidth = 1.5; CX.stroke();
  }
  if (c.armor > 0) {
    CX.beginPath(); CX.arc(0, 0, r + 1.5, 0, 7);
    CX.strokeStyle = 'rgba(220,225,255,.35)'; CX.lineWidth = 2; CX.stroke();
  }

  CX.fillStyle = c.flash > 0 ? '#ffffff' : d.color;
  CX.shadowColor = d.color;
  CX.shadowBlur = 10;
  CX.beginPath();
  if (d.shape === 'dart') { CX.moveTo(r, 0); CX.lineTo(-r * 0.7, r * 0.7); CX.lineTo(-r * 0.3, 0); CX.lineTo(-r * 0.7, -r * 0.7); CX.closePath(); }
  else if (d.shape === 'tank') { roundRectPath(-r, -r * 0.8, r * 2, r * 1.6, r * 0.35); }
  else if (d.shape === 'boss') { for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i + time * 1.1; const px = r * Math.cos(a), py = r * Math.sin(a); i ? CX.lineTo(px, py) : CX.moveTo(px, py); } CX.closePath(); }
  else CX.arc(0, 0, r, 0, 7);
  CX.fill();
  CX.shadowBlur = 0;
  CX.strokeStyle = 'rgba(6,8,18,.85)';
  CX.lineWidth = 1.4;
  CX.stroke();
  CX.fillStyle = 'rgba(8,10,22,.75)';
  CX.beginPath(); CX.arc(0, 0, r * 0.36, 0, 7); CX.fill();
  CX.restore();

  const frac = Math.max(0, c.hp / c.maxHp);
  if (frac < 0.999) {
    const bw = r * 2.4, bh = Math.max(2.5, cell * 0.055);
    CX.fillStyle = 'rgba(0,0,0,.6)';
    CX.fillRect(x - bw / 2, y - r - bh * 2.6, bw, bh);
    CX.fillStyle = frac > 0.5 ? '#3ddc97' : frac > 0.25 ? '#ffd166' : '#ff5d73';
    CX.fillRect(x - bw / 2, y - r - bh * 2.6, bw * frac, bh);
  }
  if (c.lv > 0) {
    CX.fillStyle = '#ffd166';
    for (let i = 0; i < c.lv; i++) {
      CX.beginPath();
      CX.arc(x - r + i * (cell * 0.075), y - r - cell * 0.16, cell * 0.026, 0, 7);
      CX.fill();
    }
  }
}

/* Position beräknas i drawBoard-loopen — vi cachar den på creepen. */
export function cacheCreepPositions(b, s) {
  for (const c of b.creeps) {
    if (c.t < 0) continue;
    const p = pPos(b, c.t);
    c._sx = gx(s, p.x);
    c._sy = gy(s, p.y);
  }
}

function drawShot(sh, s) {
  const x = gx(s, sh.x), y = gy(s, sh.y);
  if (sh.trail && sh.trail.length) {
    CX.strokeStyle = sh.color;
    CX.globalAlpha = 0.35;
    CX.lineWidth = 2;
    CX.beginPath();
    CX.moveTo(gx(s, sh.trail[0].x), gy(s, sh.trail[0].y));
    for (const t of sh.trail) CX.lineTo(gx(s, t.x), gy(s, t.y));
    CX.lineTo(x, y);
    CX.stroke();
    CX.globalAlpha = 1;
  }
  CX.beginPath();
  CX.arc(x, y, sh.type === 'blast' ? s.cell * 0.11 : s.cell * 0.07, 0, 7);
  CX.fillStyle = sh.color;
  CX.shadowColor = sh.color; CX.shadowBlur = 10;
  CX.fill();
  CX.shadowBlur = 0;
}

function drawBolt(bo, s) {
  CX.strokeStyle = bo.color;
  CX.globalAlpha = bo.life / 0.2;
  CX.lineWidth = 2.5;
  CX.shadowColor = bo.color; CX.shadowBlur = 12;
  CX.beginPath();
  bo.pts.forEach((p, i) => {
    const jx = i ? (Math.random() - 0.5) * 6 : 0, jy = i ? (Math.random() - 0.5) * 6 : 0;
    const px = gx(s, p.x) + jx, py = gy(s, p.y) + jy;
    i ? CX.lineTo(px, py) : CX.moveTo(px, py);
  });
  CX.stroke();
  CX.shadowBlur = 0;
  CX.globalAlpha = 1;
}

function drawFx(f, s) {
  const k = f.life / f.max;
  const x = gx(s, f.x), y = gy(s, f.y);
  if (f.k === 'ring') {
    CX.beginPath(); CX.arc(x, y, (1 - k) * f.r * s.cell, 0, 7);
    CX.strokeStyle = f.color; CX.globalAlpha = k; CX.lineWidth = 2.5; CX.stroke();
  } else if (f.k === 'boom') {
    CX.beginPath(); CX.arc(x, y, (1 - k) * f.r * s.cell, 0, 7);
    CX.fillStyle = f.color; CX.globalAlpha = k * 0.45; CX.fill();
    CX.globalAlpha = k; CX.strokeStyle = f.color; CX.lineWidth = 1.5; CX.stroke();
  } else {
    CX.beginPath(); CX.arc(x, y, s.cell * 0.06 + (1 - k) * s.cell * 0.14, 0, 7);
    CX.strokeStyle = f.color; CX.globalAlpha = k; CX.lineWidth = 1.5; CX.stroke();
  }
  CX.globalAlpha = 1;
}

function drawFloat(f, s) {
  CX.font = '600 11px "IBM Plex Mono",monospace';
  CX.globalAlpha = Math.min(1, f.life / f.max * 1.6);
  CX.fillStyle = f.color;
  CX.textAlign = 'center';
  CX.fillText(f.text, gx(s, f.x), gy(s, f.y));
  CX.textAlign = 'left';
  CX.globalAlpha = 1;
}

function roundRect(x, y, w, h, r) { CX.beginPath(); roundRectPath(x, y, w, h, r); }
function roundRectPath(x, y, w, h, r) {
  CX.moveTo(x + r, y);
  CX.arcTo(x + w, y, x + w, y + h, r);
  CX.arcTo(x + w, y + h, x, y + h, r);
  CX.arcTo(x, y + h, x, y, r);
  CX.arcTo(x, y, x + w, y, r);
  CX.closePath();
}

export { CX };
