import {
  TOWERS, TOWER_KEYS, CREEPS, CREEP_KEYS, ECON, BRANCH_KEYS, BASE_LEVELS, MAX_TOWER_LV,
  buildCost, sendUpCost, creepIncome, towerStat, needsBranch,
} from './config.js';
import { towerDps, towerDpsVs } from './sim.js';
import { scoreSpots } from './board.js';

/* ============================================================
   WARDEN — datormotståndaren.
   Spelar med exakt samma regler som spelaren: samma priser, samma
   inkomstformel, samma byggskatt, samma grenval. Skillnaden mellan
   svårighetsgrader är hur bra den läser hotbilden — inte fusk.
   ============================================================ */

export function initAI(side, cfg, board) {
  side.cfg = cfg;
  side.think = 1.5;
  side.spots = scoreSpots(board);
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

function spendOnDefense(A, wave, prof) {
  const b = A.board;
  const cfg = A.cfg;
  const targetCount = Math.min(13, 3 + Math.floor(wave * 0.8));

  // Uppgraderingar värderas mot hotbilden, inte mot rå DPS.
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

  const wantsMore = b.towers.length < targetCount;
  if (wantsMore && (!cands.length || Math.random() < 0.5)) {
    // Välj tornsort som passar hotbilden, med lite slump för smak.
    const options = TOWER_KEYS
      .map(k => ({ k, cost: buildCost(k, b.towers.length), v: valueAgainst(k, 0, null, prof) }))
      .filter(o => A.gold >= o.cost)
      .sort((a, z) => z.v / z.cost - a.v / a.cost);
    if (options.length) {
      const pick = Math.random() < cfg.iq ? options[0] : options[Math.floor(Math.random() * options.length)];
      const spot = A.spots.find(s => !b.towers.some(t => t.cx === s.x && t.cy === s.y));
      if (spot) {
        A.gold -= pick.cost;
        b.towers.push({
          type: pick.k, cx: spot.x, cy: spot.y, lv: 0, branch: null,
          cd: 0, invested: pick.cost, angle: -1.57, flash: 0,
        });
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
