import { COLS, ROWS, ECON } from './config.js';

/* En bana: rutnät, väg, torn, creeps och effekter.
   Allt lever i rutkoordinater (0..COLS, 0..ROWS) — rendering
   översätter till pixlar. Det gör simuleringen upplösningsoberoende. */

/* wp = mittlinjen genom korridoren, width = hur många rutor bred den är.
   Skillnaden mot v2: creepsen går i en BRED korridor och sprider ut sig i
   sidled, och allt utanför korridoren går att bygga på. Det är därför
   fältet fylls med torn i stället för att ha en tunn stig med några
   byggplatser bredvid. */
export function makeBoard(wp, width = 3) {
  const cells = new Set();
  const pts = [];
  let [cx, cy] = wp[0];
  pts.push([cx, cy]);
  for (let i = 1; i < wp.length; i++) {
    const [tx, ty] = wp[i];
    const dx = Math.sign(tx - cx), dy = Math.sign(ty - cy);
    while (cx !== tx) { cx += dx; pts.push([cx, cy]); }
    while (cy !== ty) { cy += dy; pts.push([cx, cy]); }
  }
  // Korridorens bredd: alla rutor inom halva bredden från mittlinjen.
  const r = (width - 1) / 2;
  for (const [px, py] of pts) {
    for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) {
      for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
        if (dx * dx + dy * dy > r * r + 0.1) continue;
        const x = px + dx, y = py + dy;
        if (x < 0 || y < 0 || x >= COLS || y >= ROWS) continue;
        cells.add(x + ',' + y);
      }
    }
  }
  const b = {
    wp, cells, pts, width, len: pts.length - 1,
    towers: [], creeps: [], shots: [], bolts: [], fx: [], floats: [], parts: [],
    lives: ECON.lives, maxLives: ECON.lives,
    shake: 0, hurt: 0, remote: false,
  };
  b.buildable = buildableCells(b);
  /* Flygande creeps struntar i vägen och går rakt från in- till utgång.
     Sträckan är mycket kortare, vilket är hela poängen med FLYG. */
  const a = pts[0], z = pts[pts.length - 1];
  b.air = { x0: a[0], y0: a[1], x1: z[0], y1: z[1], len: Math.hypot(z[0] - a[0], z[1] - a[1]) };
  return b;
}

/* Riktningen längs mittlinjen vid parametern t (normerad). */
function pDir(b, t) {
  const i = Math.max(0, Math.min(b.len - 1, Math.floor(t)));
  const a = b.pts[i], z = b.pts[i + 1] || a;
  const dx = z[0] - a[0], dy = z[1] - a[1];
  const m = Math.hypot(dx, dy) || 1;
  return { x: dx / m, y: dy / m };
}

/* Position för en creep. Marktrupper går i korridoren med en egen sidled
   så de sprider ut sig över hela bredden i stället för att gå på ett led.
   Flygande går rakt från in- till utgång och struntar i korridoren. */
export function cPos(b, c) {
  if (c.fly) {
    const f = Math.max(0, Math.min(1, c.t / b.air.len));
    return {
      x: b.air.x0 + (b.air.x1 - b.air.x0) * f,
      y: b.air.y0 + (b.air.y1 - b.air.y0) * f,
    };
  }
  const p = pPos(b, c.t);
  if (!c.off) return p;
  const d = pDir(b, c.t);
  return { x: p.x - d.y * c.off, y: p.y + d.x * c.off };
}

/* Hur långt ut i sidled en creep får ligga utan att hamna i en tornruta. */
export const laneSpread = (b, r) => Math.max(0, (b.width - 1) / 2 - r - 0.1);

export const routeLen = (b, c) => (c.fly ? b.air.len : b.len);

/* Allt utanför korridoren går att bygga på. Tidigare krävdes närhet till
   banan, vilket gjorde fältet glest och placeringen till ett litet beslut. */
function buildableCells(b) {
  const set = new Set();
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (!b.cells.has(x + ',' + y)) set.add(x + ',' + y);
    }
  }
  return set;
}

export function pPos(b, t) {
  if (t <= 0) return { x: b.pts[0][0], y: b.pts[0][1] };
  if (t >= b.len) return { x: b.pts[b.len][0], y: b.pts[b.len][1] };
  const i = Math.floor(t), f = t - i;
  return {
    x: b.pts[i][0] + (b.pts[i + 1][0] - b.pts[i][0]) * f,
    y: b.pts[i][1] + (b.pts[i + 1][1] - b.pts[i][1]) * f,
  };
}

/* Poängsätter byggplatser efter hur mycket väg de täcker.
   AI:n bygger uppifrån och ner i listan. */
export function scoreSpots(b) {
  const out = [];
  for (const key of b.buildable) {
    const [x, y] = key.split(',').map(Number);
    let sc = 0;
    for (const p of b.pts) {
      const dx = p[0] - x, dy = p[1] - y;
      const d2 = dx * dx + dy * dy;
      if (d2 <= 2.4 * 2.4) sc += 1 / (1 + d2 * 0.25);
    }
    out.push({ x, y, sc });
  }
  out.sort((a, c) => c.sc - a.sc);
  return out;
}

export function towerAt(b, cx, cy) {
  return b.towers.find(t => t.cx === cx && t.cy === cy) || null;
}
