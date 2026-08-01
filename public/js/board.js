import { COLS, ROWS, ECON } from './config.js';

/* ============================================================
   Banan är ett öppet fält. Creepsen går från ingången till utgången
   och söker sig runt allt du bygger — det är DU som ritar vägen.

   Vi använder ett flödesfält i stället för att spara en väg per creep:
   en bredden-först-sökning från utgången ger varje ruta ett avstånd,
   och creepsen går helt enkelt nedför den lutningen. Bygger du ett torn
   räknas fältet om och alla creeps hittar automatiskt en ny väg — utan
   att någon behöver spara eller uppdatera en enda vägbeskrivning.
   ============================================================ */

const idx = (x, y) => y * COLS + x;
const INF = 0x7fffffff;

export function makeBoard(map) {
  const b = {
    entry: map.entry, exit: map.exit,
    rock: new Set((map.rock || []).map(([x, y]) => x + ',' + y)),
    towers: [], creeps: [], shots: [], bolts: [], fx: [], floats: [], parts: [],
    lives: ECON.lives, maxLives: ECON.lives,
    shake: 0, hurt: 0, remote: false,
    dist: new Int32Array(COLS * ROWS),
    solid: new Set(),
  };
  b.solid = new Set(b.rock);
  computeField(b);
  b.air = {
    x0: map.entry[0], y0: map.entry[1],
    x1: map.exit[0], y1: map.exit[1],
    len: Math.hypot(map.exit[0] - map.entry[0], map.exit[1] - map.entry[1]),
  };
  return b;
}

export function rebuildSolid(b) {
  b.solid = new Set(b.rock);
  for (const t of b.towers) b.solid.add(t.cx + ',' + t.cy);
  computeField(b);
}

/* BFS från utgången. dist[cell] = antal steg till mål, INF = oåtkomlig. */
export function computeField(b) {
  const d = b.dist;
  d.fill(INF);
  const [ex, ey] = b.exit;
  d[idx(ex, ey)] = 0;
  const q = [ex, ey];
  let head = 0;
  while (head < q.length) {
    const x = q[head++], y = q[head++];
    const nd = d[idx(x, y)] + 1;
    for (let k = 0; k < 4; k++) {
      const nx = x + (k === 0 ? 1 : k === 1 ? -1 : 0);
      const ny = y + (k === 2 ? 1 : k === 3 ? -1 : 0);
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      const i = idx(nx, ny);
      if (d[i] <= nd) continue;
      if (b.solid.has(nx + ',' + ny)) continue;
      d[i] = nd;
      q.push(nx, ny);
    }
  }
  b.pathLen = d[idx(b.entry[0], b.entry[1])];
  return b.pathLen < INF;
}

export const distAt = (b, x, y) => {
  if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return INF;
  return b.dist[idx(x, y)];
};

/* Nästa ruta på väg mot utgången: grannen med lägst avstånd. */
export function nextStep(b, x, y) {
  let best = null, bd = distAt(b, x, y);
  for (let k = 0; k < 4; k++) {
    const nx = x + (k === 0 ? 1 : k === 1 ? -1 : 0);
    const ny = y + (k === 2 ? 1 : k === 3 ? -1 : 0);
    const d = distAt(b, nx, ny);
    if (d < bd) { bd = d; best = { x: nx, y: ny }; }
  }
  return best;
}

/* Får man bygga här? Reglerna är LTW:s: aldrig helt blockera.
   Vi låter dig inte ens göra det i stället för att riva tornen efteråt. */
export function canBuild(b, x, y) {
  if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return { ok: false, why: 'Utanför fältet' };
  const key = x + ',' + y;
  if (b.solid.has(key)) return { ok: false, why: 'Upptaget' };
  if (x === b.entry[0] && y === b.entry[1]) return { ok: false, why: 'Ingången' };
  if (x === b.exit[0] && y === b.exit[1]) return { ok: false, why: 'Utgången' };
  // Ingen creep får stå i rutan.
  for (const c of b.creeps) {
    if (!c.fly && Math.floor(c.x) === x && Math.floor(c.y) === y) {
      return { ok: false, why: 'En creep står där' };
    }
  }
  // Provbygg och kolla att både ingången och varje creep fortfarande har väg ut.
  b.solid.add(key);
  const ok = computeField(b);
  const stranded = ok && b.creeps.some(c =>
    !c.fly && distAt(b, Math.floor(c.x), Math.floor(c.y)) >= INF);
  b.solid.delete(key);
  computeField(b);
  if (!ok || stranded) return { ok: false, why: 'Du får inte stänga vägen helt' };
  return { ok: true };
}

/* Hur mycket längre blir vägen om vi bygger här? AI:n använder detta för
   att faktiskt bygga labyrint i stället för att klumpa ihop torn. */
export function lengthIfBuilt(b, x, y) {
  const key = x + ',' + y;
  if (b.solid.has(key)) return -1;
  b.solid.add(key);
  const ok = computeField(b);
  const len = ok ? b.pathLen : -1;
  b.solid.delete(key);
  computeField(b);
  return len;
}

/* Position för en creep. Marktrupper har egna koordinater som redan är
   uppdaterade av simuleringen; flygande interpoleras rakt över fältet. */
export function cPos(b, c) {
  if (c.fly) {
    const f = Math.max(0, Math.min(1, c.t / b.air.len));
    return {
      x: b.air.x0 + (b.air.x1 - b.air.x0) * f,
      y: b.air.y0 + (b.air.y1 - b.air.y0) * f,
    };
  }
  return { x: c.x, y: c.y };
}

/* "Hur långt har den kommit" — lägre avstånd till mål = farligare. */
export function progress(b, c) {
  if (c.fly) return c.t / b.air.len;
  const d = distAt(b, Math.floor(c.x), Math.floor(c.y));
  return d >= INF ? 0 : 1 - d / Math.max(1, b.pathLen);
}

export function towerAt(b, cx, cy) {
  return b.towers.find(t => t.cx === cx && t.cy === cy) || null;
}

/* Rutorna som vägen faktiskt går igenom just nu — ritas som en linje så
   spelaren ser sin egen labyrint. */
export function routeCells(b) {
  const out = [];
  let x = b.entry[0], y = b.entry[1];
  let guard = 0;
  out.push([x, y]);
  while (!(x === b.exit[0] && y === b.exit[1]) && guard++ < COLS * ROWS) {
    const n = nextStep(b, x, y);
    if (!n) break;
    x = n.x; y = n.y;
    out.push([x, y]);
  }
  return out;
}

/* Serpentinmallen: rader med en lucka omväxlande i vänster och höger kant.
   Att bygga ruta för ruta girigt fastnar direkt — efter första väggen finns
   ingen enskild ruta som förlänger vägen, för creepsen går bara runt. Det är
   RADEN som är draget, precis som en människa bygger. */
export function serpentinePlan(b) {
  const out = [];
  for (let y = 2; y < ROWS - 2; y += 2) {
    const gapRight = ((y / 2) % 2) === 1;
    for (let x = 0; x < COLS; x++) {
      if (gapRight && x === COLS - 1) continue;
      if (!gapRight && x === 0) continue;
      if (x === b.entry[0] && y === b.entry[1]) continue;
      if (x === b.exit[0] && y === b.exit[1]) continue;
      out.push([x, y]);
    }
  }
  return out;
}

/* Nästa ruta i mallen som faktiskt går att bygga på. */
export function nextPlanSpot(b) {
  if (!b._plan) b._plan = serpentinePlan(b);
  for (const [x, y] of b._plan) {
    if (b.solid.has(x + ',' + y)) continue;
    if (canBuild(b, x, y).ok) return [x, y];
  }
  return null;
}

export const INFINITY = INF;
