import {
  TOWERS, TOWER_KEYS, CREEPS, CREEP_KEYS, ECON, BRANCH_KEYS, BASE_LEVELS, MAX_TOWER_LV,
  buildCost, sendUpCost, creepIncome, towerStat, needsBranch,
} from './config.js';
import { towerDps, towerDpsVs } from './sim.js';
import { canBuild, lengthIfBuilt, rebuildSolid, routeCells, distAt } from './board.js';
import { COLS, ROWS } from './config.js';

/* ============================================================
   WARDEN — datormotståndaren.
   Spelar med exakt samma regler som spelaren: samma priser, samma
   inkomstformel, samma byggskatt, samma grenval. Skillnaden mellan
   svårighetsgrader är hur bra den läser hotbilden — inte fusk.
   ============================================================ */

export function initAI(side, cfg, board) {
  side.cfg = cfg;
  side.think = 1.5;
  side.pref = pickBuildOrder(cfg);
  side.seen = { latt: 0, tung: 0, pans: 0, flyg: 0 };
}

function pickBuildOrder(cfg) {
  const pools = [
    ['pulse', 'pulse', 'blast', 'cryo', 'arc', 'rail'],
    ['blast', 'cryo', 'pulse', 'arc', 'rail', 'blast'],
    ['pulse', 'cryo', 'arc', 'rail', 'blast', 'pulse'],
  ];
  return pools[Math.floor(cfg.iq * pools.length) % pools.length];
}

/* Vad är det egentligen som kommer? Vikta efter HP, inte antal —
   en BOSS är ett större problem än fyra SVÄRM. */
function threatProfile(A) {
  const now = { latt: 0, tung: 0, pans: 0, flyg: 0 };
  for (const c of A.board.creeps) if (!c.dead) now[c.cls] += c.hp;
  const p = { latt: 0, tung: 0, pans: 0, flyg: 0 };
  let sum = 0;
  for (const k of Object.keys(p)) {
    p[k] = now[k] * 2 + A.seen[k];   // det som är på banan väger tyngst
    sum += p[k];
  }
  if (sum <= 0) return { latt: 0.4, tung: 0.3, pans: 0.2, flyg: 0.1 };
  for (const k of Object.keys(p)) p[k] /= sum;
  return p;
}

/* Registrera vad som skickas mot AI:n så den kan anpassa sig. */
export function aiNoteIncoming(A, key) {
  if (!A.seen) return;
  const d = CREEPS[key];
  A.seen[d.cls] += d.hp * (d.count || 1);
}

/* Viktad DPS mot den faktiska hotbilden. */
function valueAgainst(type, lv, branch, prof) {
  let v = 0;
  for (const cls of Object.keys(prof)) v += towerDpsVs(type, lv, branch, cls) * prof[cls];
  return v;
}

export function aiThink(G, dt) {
  const A = G.foe;
  if (!A.cfg) return;
  A.think -= dt;
  if (A.think > 0) return;
  A.think = A.cfg.tick;

  const b = A.board;
  const cfg = A.cfg;
  const prof = threatProfile(A);

  const dps = b.towers.reduce((s, t) => s + towerDps(t.type, t.lv, t.branch), 0);
  const incoming = b.creeps.reduce((s, c) => s + c.hp, 0);
  const hurt = 1 - b.lives / b.maxLives;

  let defWeight = 0.35 + hurt * 0.5;
  if (incoming > dps * 2.2) defWeight = 0.9;
  if (incoming === 0 && hurt < 0.15) defWeight = 0.22;
  defWeight = Math.min(1, defWeight * (0.7 + cfg.iq * 0.5));

  if (Math.random() < defWeight) spendOnDefense(A, G.wave, prof);
  else spendOnOffense(A);
}

/* Hitta rutan som förlänger creepsens väg mest utan att stänga den.
   Bara rutor intill den nuvarande rutten kan påverka den, så vi slipper
   testa hela fältet. */
function bestMazeSpot(b, iq) {
  const route = routeCells(b);
  const seen = new Set();
  const cands = [];
  for (const [rx, ry] of route) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = rx + dx, y = ry + dy;
        const key = x + ',' + y;
        if (x < 0 || y < 0 || x >= COLS || y >= ROWS || seen.has(key)) continue;
        seen.add(key);
        if (b.solid.has(key)) continue;
        if (x === b.entry[0] && y === b.entry[1]) continue;
        if (x === b.exit[0] && y === b.exit[1]) continue;
        cands.push([x, y]);
      }
    }
  }
  let best = null, bestLen = b.pathLen;
  for (const [x, y] of cands) {
    const len = lengthIfBuilt(b, x, y);
    if (len > bestLen) { bestLen = len; best = [x, y]; }
  }
  // Sämre AI tar inte alltid det bästa draget.
  if (best && Math.random() > iq * 0.7 + 0.3 && cands.length) {
    const alt = cands[Math.floor(Math.random() * cands.length)];
    if (lengthIfBuilt(b, alt[0], alt[1]) > b.pathLen) return alt;
  }
  return best;
}

function spendOnDefense(A, wave, prof) {
  const b = A.board;
  const cfg = A.cfg;
  const wallCost = buildCost('wall', b.towers.length);

  /* 1) Bygg labyrint. Så länge vägen är kortare än måttet är det alltid
     bättre att förlänga den än att köpa mer eldkraft — creepsen hinner
     helt enkelt inte bli beskjutna nog. */
  if (b.pathLen < cfg.mazeTarget && A.gold >= wallCost) {
    const spot = bestMazeSpot(b, cfg.iq);
    if (spot && canBuild(b, spot[0], spot[1]).ok) {
      A.gold -= wallCost;
      b.towers.push({
        type: 'wall', cx: spot[0], cy: spot[1], lv: 0, branch: null,
        cd: 0, recoil: 0, invested: wallCost, angle: -1.57, flash: 0,
      });
      rebuildSolid(b);
      return;
    }
  }

  /* 2) Uppgradera det som ger mest mot den faktiska hotbilden. */
  const cands = [];
  for (const t of b.towers) {
    if (t.lv + 1 >= MAX_TOWER_LV) continue;
    const branches = needsBranch(t) ? BRANCH_KEYS : [t.branch];
    for (const br of branches) {
      const st = towerStat(t.type, t.lv + 1, br);
      if (A.gold < st.cost) continue;
      const gain = valueAgainst(t.type, t.lv + 1, br, prof) - valueAgainst(t.type, t.lv, t.branch, prof);
      cands.push({ t, br, cost: st.cost, value: gain / st.cost });
    }
  }
  cands.sort((a, z) => z.value - a.value);

  /* 3) Nya skadetorn — helst nära rutten där de faktiskt får skjuta. */
  const wantsMore = b.towers.filter(t => t.type !== 'wall').length < Math.min(14, 3 + Math.floor(wave * 0.8));
  if (wantsMore && (!cands.length || Math.random() < 0.5)) {
    const options = TOWER_KEYS.filter(k => k !== 'wall')
      .map(k => ({ k, cost: buildCost(k, b.towers.length), v: valueAgainst(k, 0, null, prof) }))
      .filter(o => A.gold >= o.cost)
      .sort((a, z) => z.v / z.cost - a.v / a.cost);
    if (options.length) {
      const pick = Math.random() < cfg.iq ? options[0] : options[Math.floor(Math.random() * options.length)];
      const route = routeCells(b);
      for (let tries = 0; tries < 24; tries++) {
        const [rx, ry] = route[Math.floor(Math.random() * route.length)];
        const x = rx + Math.round(Math.random() * 2 - 1);
        const y = ry + Math.round(Math.random() * 2 - 1);
        if (!canBuild(b, x, y).ok) continue;
        A.gold -= pick.cost;
        b.towers.push({
          type: pick.k, cx: x, cy: y, lv: 0, branch: null,
          cd: 0, recoil: 0, invested: pick.cost, angle: -1.57, flash: 0,
        });
        rebuildSolid(b);
        return;
      }
    }
  }

  if (cands.length) {
    const idx = Math.random() < cfg.iq ? 0 : Math.floor(Math.random() * cands.length);
    const c = cands[idx];
    A.gold -= c.cost;
    c.t.lv++;
    if (c.t.lv >= BASE_LEVELS) c.t.branch = c.br || c.t.branch || 'a';
    c.t.invested += c.cost;
  }
}

function spendOnOffense(A) {
  const cfg = A.cfg;
  const reserve = A.gold * cfg.bank;

  if (Math.random() < 0.28 * cfg.iq) {
    const keys = CREEP_KEYS.filter(k => A.sendLv[k] < ECON.maxSendLv && A.income >= CREEPS[k].unlock);
    if (keys.length) {
      const k = keys[Math.floor(Math.random() * keys.length)];
      const c = sendUpCost(k, A.sendLv[k]);
      if (A.gold - c > reserve) { A.gold -= c; A.sendLv[k]++; return; }
    }
  }

  const affordable = CREEP_KEYS
    .filter(k => A.income >= CREEPS[k].unlock)
    .filter(k => A.gold - CREEPS[k].cost > reserve)
    .sort((a, b) => CREEPS[b].cost - CREEPS[a].cost);
  if (!affordable.length) return;

  const pick = Math.random() < cfg.aggr ? affordable[0] : affordable[Math.floor(Math.random() * affordable.length)];
  A.gold -= CREEPS[pick].cost;
  A.income += creepIncome(pick);
  A.pendingSend.push({ key: pick, lv: A.sendLv[pick] });
}
