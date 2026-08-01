import { COLS, ROWS, CREEPS, ARMOR, towerFace, towerStat } from './config.js';
import { cPos, routeCells } from './board.js';
import { terrainFor, dropShadow, shade } from './art.js';

/* ============================================================
   Rendering.
   Layout: 'dual' på breda skärmar (båda banorna samtidigt, som i
   WC3 där man ser motståndaren) och 'single' på mobil där man
   växlar vy. Samma ritkod, olika origo och rutstorlek.
   ============================================================ */

let CV, CX, DPR = 1;
export const L = { mode: 'single', w: 0, h: 0, me: null, foe: null };
let stars = [];
let nebulae = [];

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
  vignette = null;   // byggs om vid nästa bildruta i den nya storleken

  /* Alltid EN bana i taget, även på desktop. Man behöver ytan till sin egen
     labyrint — motståndaren kikar man på med VÄXLA VY när man vill. */
  L.mode = 'single';
  const cell = Math.min((w - 24) / COLS, (h - 26) / ROWS);
  const ox = (w - cell * COLS) / 2, oy = (h - cell * ROWS) / 2;
  L.me = makeSlot(ox, oy, cell);
  L.foe = L.me;

  if (!stars.length) {
    // Två lager: det bakre driver långsammare och ger djup.
    for (let i = 0; i < 70; i++) {
      stars.push({ x: Math.random(), y: Math.random(), r: Math.random() * 0.9 + 0.25, a: Math.random() * 0.28 + 0.06, layer: 0 });
    }
    for (let i = 0; i < 34; i++) {
      stars.push({ x: Math.random(), y: Math.random(), r: Math.random() * 1.5 + 0.7, a: Math.random() * 0.45 + 0.2, layer: 1 });
    }
    for (let i = 0; i < 3; i++) {
      nebulae.push({
        x: Math.random(), y: Math.random(),
        r: 0.35 + Math.random() * 0.3,
        c: ['79,216,235', '167,139,250', '255,93,115'][i],
      });
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

  const hostile = G.view === 'atk';
  drawBoard(G, hostile ? G.foe.board : G.me.board, L.me, hostile, G);
  drawSlotLabel(L.me,
    hostile ? '⚔ ' + G.foe.name + ' — dina creeps anfaller här'
            : '🛡 DIN BANA — dra för att bygga en rad',
    hostile ? '#ff5d73' : '#4fd8eb', hostile ? G.foe.board : G.me.board);
  drawPost();
}

function drawBackdrop(time) {
  const { w, h } = L;
  const g = CX.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#0e1226');
  g.addColorStop(1, '#070914');
  CX.fillStyle = g;
  CX.fillRect(0, 0, w, h);

  // Mjuka färgmoln som andas — ger djup utan att stjäla uppmärksamhet.
  for (let i = 0; i < nebulae.length; i++) {
    const n = nebulae[i];
    const pulse = 0.85 + 0.15 * Math.sin(time * 0.22 + i * 2.1);
    const R = n.r * Math.max(w, h) * pulse;
    const grd = CX.createRadialGradient(n.x * w, n.y * h, 0, n.x * w, n.y * h, R);
    grd.addColorStop(0, `rgba(${n.c},0.055)`);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    CX.fillStyle = grd;
    CX.fillRect(0, 0, w, h);
  }

  CX.fillStyle = '#ffffff';
  for (const s of stars) {
    // Parallax: främre lagret driver dubbelt så fort.
    const drift = (time * (s.layer ? 5.5 : 2.2)) % (h + 40);
    const y = ((s.y * h + drift) % (h + 40)) - 20;
    CX.globalAlpha = s.a * (0.65 + 0.35 * Math.sin(time * 0.9 + s.x * 40));
    CX.beginPath();
    CX.arc(s.x * w, y, s.r, 0, 7);
    CX.fill();
  }
  CX.globalAlpha = 1;
}

/* Vinjett + fina scanlines. Läggs sist och gör bilden mindre "webbsida".
   Både gradienten och linjemönstret cachas — annars blev det 270 fillRect
   per bildruta, vilket märks på en billig telefon. */
let vignette = null, scanPattern = null;

function buildPost() {
  const { w, h } = L;
  vignette = CX.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.78);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.42)');

  const tile = document.createElement('canvas');
  tile.width = 1; tile.height = 3;
  const tc = tile.getContext('2d');
  tc.fillStyle = 'rgba(143,166,255,0.05)';
  tc.fillRect(0, 0, 1, 1);
  scanPattern = CX.createPattern(tile, 'repeat');
}

function drawPost() {
  const { w, h } = L;
  if (!vignette) buildPost();
  CX.fillStyle = vignette;
  CX.fillRect(0, 0, w, h);
  CX.fillStyle = scanPattern;
  CX.fillRect(0, 0, w, h);
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
  // Additivt lager: skott, blixtar, gnistor och spillror lyser upp varandra
  // i stället för att måla över. Det är det som ger "bloom"-känslan.
  CX.globalCompositeOperation = 'lighter';
  for (const sh of b.shots) drawShot(sh, s);
  for (const bo of b.bolts) drawBolt(bo, s);
  for (const p of b.parts) drawPart(p, s);
  for (const f of b.fx) drawFx(f, s);
  CX.globalCompositeOperation = 'source-over';
  for (const f of b.floats) drawFloat(f, s);

  if (b.hurt > 0) {
    CX.fillStyle = `rgba(255,60,90,${b.hurt * 0.18})`;
    CX.fillRect(s.ox - 4, s.oy - 4, s.cell * COLS + 8, s.cell * ROWS + 8);
  }
  CX.restore();
}

function drawGrid(b, s, G) {
  const { cell, ox, oy } = s;

  /* Marken. Byggs en gång per bana och storlek och blittas sedan — den
     består av hundratals fläckar, stenar och mossklasar som det vore
     vansinne att rita om varje bildruta. */
  const W = COLS * cell, H = ROWS * cell;
  const hostile = !G;
  CX.drawImage(terrainFor(b, cell, b.entry[0] * 31 + b.exit[1] * 7 + b.rock.size, hostile), ox, oy, W, H);
  CX.strokeStyle = hostile ? 'rgba(255,120,150,.35)' : 'rgba(255,210,150,.35)';
  CX.lineWidth = 2;
  CX.strokeRect(ox, oy, W, H);

  CX.strokeStyle = 'rgba(255,255,255,.05)';
  CX.lineWidth = 1;
  CX.beginPath();
  for (let x = 0; x <= COLS; x++) { CX.moveTo(ox + x * cell, oy); CX.lineTo(ox + x * cell, oy + ROWS * cell); }
  for (let y = 0; y <= ROWS; y++) { CX.moveTo(ox, oy + y * cell); CX.lineTo(ox + COLS * cell, oy + y * cell); }
  CX.stroke();

  // Klippor: fasta hinder man varken kan bygga på eller gå igenom.
  for (const key of b.rock) {
    const [x, y] = key.split(',').map(Number);
    const px = gx(s, x), py = gy(s, y), r = cell * 0.42;
    dropShadow(CX, CX, px, py + r * 0.5, r * 1.0, r * 0.42);
    const grd = CX.createLinearGradient(px, py - r, px, py + r);
    grd.addColorStop(0, '#9aa3b8');
    grd.addColorStop(0.55, '#6a7186');
    grd.addColorStop(1, '#3d4254');
    CX.fillStyle = grd;
    CX.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 3 * i + 0.4;
      const rr = r * (0.82 + ((x * 7 + y * 13 + i * 5) % 5) * 0.05);
      const qx = px + Math.cos(a) * rr, qy = py + Math.sin(a) * rr * 0.85;
      i ? CX.lineTo(qx, qy) : CX.moveTo(qx, qy);
    }
    CX.closePath();
    CX.fill();
    CX.strokeStyle = 'rgba(20,16,26,.6)';
    CX.lineWidth = 1.4;
    CX.stroke();
    CX.fillStyle = 'rgba(255,255,255,.22)';
    CX.beginPath();
    CX.ellipse(px - r * 0.2, py - r * 0.35, r * 0.4, r * 0.2, -0.4, 0, 7);
    CX.fill();
  }

  // Lediga rutor. Under bygge lyser de upp så man ser var labyrinten kan växa.
  const hi = G && G.buildHint;
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (b.solid.has(x + ',' + y)) continue;
      if (hi) {
        CX.fillStyle = 'rgba(79,216,235,.06)';
        const p = cell * 0.1;
        roundRect(ox + x * cell + p, oy + y * cell + p, cell - 2 * p, cell - 2 * p, cell * 0.16);
        CX.fill();
      }
      CX.fillStyle = hi ? 'rgba(160,190,255,.3)' : 'rgba(120,135,200,.16)';
      CX.beginPath(); CX.arc(gx(s, x), gy(s, y), cell * 0.04, 0, 7); CX.fill();
    }
  }
}

/* Rutten creepsen faktiskt tar just nu. Det är den man bygger om — utan
   den syns inte labyrinten man skapat. */
function drawPath(b, s, hostile, time) {
  const { cell } = s;
  const rgb = hostile ? '255,93,115' : '255,180,84';
  const route = routeCells(b);

  if (route.length > 1) {
    CX.lineJoin = 'round'; CX.lineCap = 'round';
    const trace = () => {
      CX.beginPath();
      CX.moveTo(gx(s, route[0][0]), gy(s, route[0][1]));
      for (let i = 1; i < route.length; i++) CX.lineTo(gx(s, route[i][0]), gy(s, route[i][1]));
    };
    trace(); CX.strokeStyle = `rgba(${rgb},.07)`; CX.lineWidth = cell * 0.7; CX.stroke();
    trace(); CX.strokeStyle = `rgba(${rgb},.22)`; CX.lineWidth = 2.5; CX.stroke();
    trace();
    CX.strokeStyle = `rgba(${rgb},.75)`;
    CX.lineWidth = 2;
    CX.setLineDash([cell * 0.16, cell * 0.42]);
    CX.lineDashOffset = -time * cell * 2.2;
    CX.stroke();
    CX.setLineDash([]);
  }

  // Luftkorridoren visas bara när det faktiskt flyger något där.
  if (b.creeps.some(c => c.fly && c.t >= 0)) {
    CX.save();
    CX.setLineDash([cell * 0.14, cell * 0.3]);
    CX.lineDashOffset = -time * cell * 2.2;
    CX.strokeStyle = 'rgba(102,224,255,.35)';
    CX.lineWidth = 1.5;
    CX.beginPath();
    CX.moveTo(gx(s, b.air.x0), gy(s, b.air.y0));
    CX.lineTo(gx(s, b.air.x1), gy(s, b.air.y1));
    CX.stroke();
    CX.restore();
  }

  portal(gx(s, b.entry[0]), gy(s, b.entry[1]), hostile ? '#ff5d73' : '#ffb454', cell, time, false);
  portal(gx(s, b.exit[0]), gy(s, b.exit[1]), hostile ? '#4fd8eb' : '#ff5d73', cell, time, true);
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
    const tw = G.sel.tower;
    const st = towerStat(tw.type, tw.lv, tw.branch);
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

/* Tornen ritas som föremål med volym: markskugga, en stenkropp med
   ljus ovansida och mörk fot, och elementet som en lysande kristall på
   toppen. Tidigare var de tunna konturer utan tyngd — det var därför
   allt såg platt ut oavsett hur många partiklar som flög omkring. */
function drawTower(tw, s, hostile, time) {
  const face = towerFace(tw.type, tw.lv, tw.branch);
  const { cell } = s;
  const x = gx(s, tw.cx), y = gy(s, tw.cy);
  const size = cell * 0.86;
  const maxed = tw.lv >= 5;
  const tier = Math.min(2, Math.floor(tw.lv / 2));      // 0 trä, 1 sten, 2 element

  dropShadow(CX, CX, x, y + size * 0.34, size * 0.44, size * 0.19);

  // --- sockel ---
  const stone = [
    ['#8a7a5e', '#5b4c36', '#332a1e'],   // trä
    ['#a9b0c4', '#6f7789', '#3b4050'],   // sten
    ['#c3c9dc', '#848ca4', '#464c60'],   // förädlad
  ][tier];
  const bh = size * 0.62, bw = size * 0.78;
  const g = CX.createLinearGradient(x, y - bh * 0.55, x, y + bh * 0.5);
  g.addColorStop(0, stone[0]);
  g.addColorStop(0.5, stone[1]);
  g.addColorStop(1, stone[2]);
  CX.fillStyle = g;
  roundRect(x - bw / 2, y - bh * 0.5, bw, bh, size * 0.16);
  CX.fill();
  CX.strokeStyle = 'rgba(15,12,20,.55)';
  CX.lineWidth = 1.5;
  CX.stroke();

  // ljuskant uppe till vänster
  CX.strokeStyle = 'rgba(255,255,255,.30)';
  CX.lineWidth = 1.6;
  CX.beginPath();
  CX.moveTo(x - bw / 2 + size * 0.16, y - bh * 0.5 + 1);
  CX.lineTo(x + bw / 2 - size * 0.16, y - bh * 0.5 + 1);
  CX.stroke();

  // ovansida som ger djup
  CX.fillStyle = shade(stone[0], 22);
  roundRect(x - bw * 0.42, y - bh * 0.5 - size * 0.06, bw * 0.84, size * 0.2, size * 0.08);
  CX.fill();
  CX.strokeStyle = 'rgba(15,12,20,.4)';
  CX.lineWidth = 1;
  CX.stroke();

  // nivåstreck på sockeln
  for (let i = 0; i < Math.min(tw.lv, 5); i++) {
    CX.fillStyle = i < 2 ? 'rgba(255,255,255,.35)' : face.color;
    CX.fillRect(x - bw / 2 + 3 + i * (cell * 0.075), y + bh * 0.34, cell * 0.05, cell * 0.05);
  }

  // --- elementkristall / pjäs på toppen ---
  CX.save();
  CX.translate(x, y - size * 0.12);
  CX.rotate(tw.angle + Math.PI / 2);
  CX.translate(0, (tw.recoil || 0) * size * 0.1);
  const hg = size * 0.26;

  // glödgloria bakom pjäsen
  const halo = CX.createRadialGradient(0, 0, 0, 0, 0, hg * 2.1);
  halo.addColorStop(0, face.color + (maxed ? '80' : '55'));
  halo.addColorStop(1, 'rgba(0,0,0,0)');
  CX.fillStyle = halo;
  CX.beginPath(); CX.arc(0, 0, hg * 2.1, 0, 7); CX.fill();

  // fylld kropp med kontur — inte bara ett streck
  CX.beginPath();
  shapePath(face.shape, hg);
  const cg = CX.createLinearGradient(0, -hg, 0, hg);
  cg.addColorStop(0, shade(face.color, 60));
  cg.addColorStop(1, shade(face.color, -50));
  CX.fillStyle = cg;
  CX.fill();
  CX.strokeStyle = 'rgba(12,10,20,.75)';
  CX.lineWidth = Math.max(1.4, cell * 0.04);
  CX.lineJoin = 'round';
  CX.lineCap = 'round';
  CX.stroke();

  // liten spegling
  CX.globalAlpha = 0.5;
  CX.fillStyle = '#ffffff';
  CX.beginPath();
  CX.ellipse(-hg * 0.28, -hg * 0.38, hg * 0.26, hg * 0.16, -0.5, 0, 7);
  CX.fill();
  CX.globalAlpha = 1;

  if (tw.flash > 0.35) {
    const f = tw.flash;
    CX.globalCompositeOperation = 'lighter';
    CX.globalAlpha = f;
    CX.fillStyle = face.color;
    CX.beginPath();
    CX.moveTo(0, -hg - cell * 0.28 * f);
    CX.lineTo(cell * 0.09 * f, -hg + cell * 0.02);
    CX.lineTo(-cell * 0.09 * f, -hg + cell * 0.02);
    CX.closePath();
    CX.fill();
    CX.globalAlpha = 1;
    CX.globalCompositeOperation = 'source-over';
  }
  CX.restore();

  if (maxed) {
    CX.globalCompositeOperation = 'lighter';
    CX.globalAlpha = 0.10 + 0.05 * Math.sin(time * 2.5 + tw.cx);
    CX.fillStyle = face.color;
    CX.beginPath(); CX.arc(x, y - size * 0.12, size * 0.5, 0, 7); CX.fill();
    CX.globalAlpha = 1;
    CX.globalCompositeOperation = 'source-over';
  }
}

function shapePath(shape, hg) {
  const poly = (n, rot, rIn) => {
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 / n) * i + rot;
      const r = rIn && i % 2 ? hg * rIn : hg * 0.92;
      const px = r * Math.cos(a), py = r * Math.sin(a);
      i ? CX.lineTo(px, py) : CX.moveTo(px, py);
    }
    CX.closePath();
  };
  switch (shape) {
    case 'tri':
      CX.moveTo(0, -hg); CX.lineTo(hg * 0.92, hg * 0.78); CX.lineTo(-hg * 0.92, hg * 0.78); CX.closePath();
      break;
    case 'hex': poly(6, -Math.PI / 2); break;
    case 'dia': CX.moveTo(0, -hg); CX.lineTo(hg, 0); CX.lineTo(0, hg); CX.lineTo(-hg, 0); CX.closePath(); break;
    case 'star': poly(8, -Math.PI / 2, 0.42); break;
    case 'shard':                       // tre spetsar utåt
      for (let i = 0; i < 3; i++) {
        const a = -Math.PI / 2 + (Math.PI * 2 / 3) * i;
        CX.moveTo(0, 0);
        CX.lineTo(hg * Math.cos(a), hg * Math.sin(a));
      }
      poly(3, Math.PI / 2, 0);
      break;
    case 'flame':                       // droppe med veck
      CX.moveTo(0, -hg);
      CX.quadraticCurveTo(hg * 0.85, -hg * 0.1, 0, hg * 0.85);
      CX.quadraticCurveTo(-hg * 0.85, -hg * 0.1, 0, -hg);
      break;
    case 'bolt':                        // blixt
      CX.moveTo(hg * 0.25, -hg);
      CX.lineTo(-hg * 0.45, hg * 0.1);
      CX.lineTo(hg * 0.1, hg * 0.1);
      CX.lineTo(-hg * 0.3, hg);
      break;
    case 'aa':                          // dubbelpipa mot skyn
      CX.moveTo(-hg * 0.28, -hg); CX.lineTo(-hg * 0.28, hg * 0.5);
      CX.moveTo(hg * 0.28, -hg); CX.lineTo(hg * 0.28, hg * 0.5);
      CX.moveTo(-hg * 0.7, hg * 0.55); CX.lineTo(hg * 0.7, hg * 0.55);
      break;
    case 'block':
      CX.moveTo(-hg * 0.8, -hg * 0.5); CX.lineTo(hg * 0.8, -hg * 0.5);
      CX.lineTo(hg * 0.8, hg * 0.5); CX.lineTo(-hg * 0.8, hg * 0.5); CX.closePath();
      CX.moveTo(-hg * 0.8, 0); CX.lineTo(hg * 0.8, 0);
      break;
    case 'cross':
    default:
      CX.moveTo(0, -hg); CX.lineTo(0, hg * 0.55);
      CX.moveTo(-hg * 0.62, hg * 0.1); CX.lineTo(hg * 0.62, hg * 0.1);
  }
}

function drawCreep(c, s, time) {
  const d = CREEPS[c.type];
  const { cell } = s;
  const x = c._sx;
  // Ritstorleken är större än träffradien — creepsen ska synas tydligt i
  // korridoren utan att sidledsspridningen eller splashträffarna ändras.
  const r = c.r * cell * 1.3;
  // Flygande creeps ritas med höjd: skugga på marken, kropp ovanför.
  const alt = c.fly ? cell * 0.34 + Math.sin(c.bob) * cell * 0.05 : 0;
  const y = c._sy - alt;
  const wob = c.fly ? 0 : Math.sin(c.wob) * r * 0.12;

  // Alla creeps får markskugga; flygande får en tydligare och lägre.
  dropShadow(CX, CX, x, c._sy + (c.fly ? cell * 0.08 : r * 0.55),
             r * (c.fly ? 0.8 : 0.95), r * (c.fly ? 0.32 : 0.4));

  CX.save();
  CX.translate(x, y + wob);

  if (c.slow > 0) {
    CX.beginPath(); CX.arc(0, 0, r + 3.5, 0, 7);
    CX.strokeStyle = 'rgba(155,216,255,.8)'; CX.lineWidth = 1.5; CX.stroke();
  }
  if (c.burnT > 0) {
    CX.beginPath(); CX.arc(0, 0, r + 2.5, 0, 7);
    CX.strokeStyle = 'rgba(255,107,61,.85)'; CX.lineWidth = 2; CX.stroke();
  }
  // Pansarklassen syns direkt på creepen — annars är kontrasystemet osynligt.
  if (c.cls === 'pans') {
    CX.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 3 * i - Math.PI / 2, rr = r + 3;
      const px = rr * Math.cos(a), py = rr * Math.sin(a);
      i ? CX.lineTo(px, py) : CX.moveTo(px, py);
    }
    CX.closePath();
    CX.strokeStyle = 'rgba(230,225,255,.5)'; CX.lineWidth = 1.6; CX.stroke();
  } else if (c.cls === 'tung') {
    CX.beginPath(); CX.arc(0, 0, r + 2.5, 0, 7);
    CX.strokeStyle = 'rgba(220,230,255,.32)'; CX.lineWidth = 2.4; CX.stroke();
  }

  // Ljus uppifrån vänster ger kroppen rundning i stället för en platt klick.
  if (c.flash > 0) {
    CX.fillStyle = '#ffffff';
  } else {
    const bg = CX.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r * 1.15);
    bg.addColorStop(0, shade(d.color, 70));
    bg.addColorStop(0.55, d.color);
    bg.addColorStop(1, shade(d.color, -55));
    CX.fillStyle = bg;
  }
  CX.shadowColor = d.color;
  CX.shadowBlur = 8;
  CX.beginPath();
  switch (d.shape) {
    case 'dart':
      CX.moveTo(r, 0); CX.lineTo(-r * 0.7, r * 0.7); CX.lineTo(-r * 0.3, 0); CX.lineTo(-r * 0.7, -r * 0.7); CX.closePath();
      break;
    case 'tank':
      roundRectPath(-r, -r * 0.8, r * 2, r * 1.6, r * 0.35);
      break;
    case 'boss':
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 3 * i + time * 1.1;
        const px = r * Math.cos(a), py = r * Math.sin(a);
        i ? CX.lineTo(px, py) : CX.moveTo(px, py);
      }
      CX.closePath();
      break;
    case 'wing': {                       // drönare: kropp med två vingar
      const flap = Math.sin(time * 14 + c.bob) * r * 0.22;
      CX.moveTo(0, -r * 0.75);
      CX.lineTo(r * 0.42, 0);
      CX.lineTo(0, r * 0.75);
      CX.lineTo(-r * 0.42, 0);
      CX.closePath();
      CX.moveTo(r * 0.3, -r * 0.15); CX.lineTo(r * 1.25, -r * 0.5 + flap); CX.lineTo(r * 0.35, r * 0.2); CX.closePath();
      CX.moveTo(-r * 0.3, -r * 0.15); CX.lineTo(-r * 1.25, -r * 0.5 + flap); CX.lineTo(-r * 0.35, r * 0.2); CX.closePath();
      break;
    }
    default:
      CX.arc(0, 0, r, 0, 7);
  }
  CX.fill();
  CX.shadowBlur = 0;
  CX.strokeStyle = 'rgba(8,6,16,.9)';
  CX.lineWidth = Math.max(1.5, r * 0.16);
  CX.stroke();
  if (d.shape !== 'wing') {
    // mörk kärna + glansdager, som ett öga
    CX.fillStyle = 'rgba(10,8,20,.8)';
    CX.beginPath(); CX.arc(0, 0, r * 0.34, 0, 7); CX.fill();
    CX.fillStyle = 'rgba(255,255,255,.6)';
    CX.beginPath(); CX.arc(-r * 0.12, -r * 0.12, r * 0.11, 0, 7); CX.fill();
  }
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
    CX.fillStyle = ARMOR[c.cls] ? ARMOR[c.cls].color : '#ffd166';
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
    const p = cPos(b, c);
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
  CX.arc(x, y, sh.st && sh.st.splash ? s.cell * 0.11 : s.cell * 0.07, 0, 7);
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

function drawPart(p, s) {
  const k = Math.max(0, p.life / p.max);
  CX.globalAlpha = k;
  CX.fillStyle = p.color;
  const r = p.size * s.cell * 0.045 * (0.4 + k);
  CX.beginPath();
  CX.arc(gx(s, p.x), gy(s, p.y), r, 0, 7);
  CX.fill();
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
