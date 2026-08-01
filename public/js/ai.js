import {
  TOWERS, TOWER_KEYS, CREEPS, CREEP_KEYS, ECON, BRANCH_KEYS, BASE_LEVELS, MAX_TOWER_LV,
  buildCost, sendUpCost, creepIncome, towerStat, needsBranch,
  RESEARCH, researchCost, requiredResearch, creepUnlocked,
} from './config.js';
import { towerDps, towerDpsVs } from './sim.js';
import { canBuild, rebuildSolid, routeCells, nextPlanSpot } from './board.js';
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
  side.research = Object.fromEntries(BRANCH_KEYS.map(k => [k, 0]));
  side.mainEl = null;
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
  A.time = G.time || 0;
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

  if (G.prep > 0 || Math.random() < defWeight) spendOnDefense(A, G.wave, prof);
  else spendOnOffense(A);
}

function spendOnDefense(A, wave, prof) {
  const b = A.board;
  const cfg = A.cfg;
  const wallCost = buildCost('wall', b.towers.length);

  /* 1) Bygg labyrint. Så länge vägen är kortare än måttet är det alltid
     bättre att förlänga den än att köpa mer eldkraft — creepsen hinner
     helt enkelt inte bli beskjutna nog. */
  /* Muren har ett tak. Utan det bygger AI:n palisader i all evighet och
     kommer aldrig till forskningen — den stod med tjugo trästockar och
     ingen eldkraft alls. */
  const walls = b.towers.filter(t => !t.branch).length;
  if (b.pathLen < cfg.mazeTarget && walls < 34 && A.gold >= wallCost) {
    const spot = nextPlanSpot(b);
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

  /* 2) Forska. AI:n väljer ETT huvudelement efter hotbilden och håller sig
     till det — samma tvång som spelaren har, den har inte råd med alla. */
  if (!A.mainEl) {
    A.mainEl = BRANCH_KEYS
      .map(br => ({ br, v: valueAgainst('wall', 3, br, prof) }))
      .sort((x, z) => z.v - x.v)[Math.random() < cfg.iq ? 0 : Math.floor(Math.random() * BRANCH_KEYS.length)].br;
  }
  const maxTowerLv = b.towers.reduce((m, t) => (t.branch === A.mainEl ? Math.max(m, t.lv) : m), -1);
  const resLv = A.research[A.mainEl] || 0;
  const nextLv = Math.min(MAX_TOWER_LV - 1, Math.max(BASE_LEVELS, maxTowerLv + 1));
  const wantRes = requiredResearch(nextLv);
  if (resLv < wantRes && resLv < RESEARCH.maxLevel && A.gold >= researchCost(resLv)) {
    A.gold -= researchCost(resLv);
    A.research[A.mainEl] = resLv + 1;
    return;
  }

  /* 3) Uppgradera det som ger mest mot den faktiska hotbilden. */
  const cands = [];
  for (const t of b.towers) {
    if (t.lv + 1 >= MAX_TOWER_LV) continue;
    const branches = needsBranch(t) ? [A.mainEl] : [t.branch];
    for (const br of branches) {
      if ((A.research[br] || 0) < requiredResearch(t.lv + 1)) continue;
      const st = towerStat(t.type, t.lv + 1, br);
      if (A.gold < st.cost) continue;
      const gain = valueAgainst(t.type, t.lv + 1, br, prof) - valueAgainst(t.type, t.lv, t.branch, prof);
      cands.push({ t, br, cost: st.cost, value: gain / st.cost });
    }
  }
  cands.sort((a, z) => z.value - a.value);

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
    const keys = CREEP_KEYS.filter(k => A.sendLv[k] < ECON.maxSendLv && creepUnlocked(k, A.time || 0));
    if (keys.length) {
      const k = keys[Math.floor(Math.random() * keys.length)];
      const c = sendUpCost(k, A.sendLv[k]);
      if (A.gold - c > reserve) { A.gold -= c; A.sendLv[k]++; return; }
    }
  }

  const affordable = CREEP_KEYS
    .filter(k => creepUnlocked(k, A.time || 0))
    .filter(k => A.gold - CREEPS[k].cost > reserve)
    .sort((a, b) => CREEPS[b].cost - CREEPS[a].cost);
  if (!affordable.length) return;

  const pick = Math.random() < cfg.aggr ? affordable[0] : affordable[Math.floor(Math.random() * affordable.length)];
  A.gold -= CREEPS[pick].cost;
  A.income += creepIncome(pick);
  A.pendingSend.push({ key: pick, lv: A.sendLv[pick] });
}
