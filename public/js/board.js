import { COLS, ROWS, ECON } from './config.js';

/* En bana: rutnät, väg, torn, creeps och effekter.
   Allt lever i rutkoordinater (0..COLS, 0..ROWS) — rendering
   översätter till pixlar. Det gör simuleringen upplösningsoberoende. */

export function makeBoard(wp) {
  const cells = new Set();
  const pts = [];
  let [cx, cy] = wp[0];
  pts.push([cx, cy]);
  cells.add(cx + ',' + cy);
  for (let i = 1; i < wp.length; i++) {
    const [tx, ty] = wp[i];
    const dx = Math.sign(tx - cx), dy = Math.sign(ty - cy);
    while (cx !== tx) { cx += dx; pts.push([cx, cy]); cells.add(cx + ',' + cy); }
    while (cy !== ty) { cy += dy; pts.push([cx, cy]); cells.add(cx + ',' + cy); }
  }
  const b = {
    wp, cells, pts, len: pts.length - 1,
    towers: [], creeps: [], shots: [], bolts: [], fx: [], floats: [],
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

/* Position för en creep — följer vägen, eller flyger rakt. */
export function cPos(b, c) {
  if (!c.fly) return pPos(b, c.t);
  const f = Math.max(0, Math.min(1, c.t / b.air.len));
  return {
    x: b.air.x0 + (b.air.x1 - b.air.x0) * f,
    y: b.air.y0 + (b.air.y1 - b.air.y0) * f,
  };
}

export const routeLen = (b, c) => (c.fly ? b.air.len : b.len);

/* Rutor som är värda att bygga på: inte väg, och inom 2.6 rutor
   från banan. Resten dimmas ner så man ser var man faktiskt kan agera. */
function buildableCells(b) {
  const set = new Set();
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (b.cells.has(x + ',' + y)) continue;
      for (const p of b.pts) {
        const dx = p[0] - x, dy = p[1] - y;
        if (dx * dx + dy * dy <= 2.6 * 2.6) { set.add(x + ',' + y); break; }
      }
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
