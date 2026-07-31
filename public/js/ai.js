import { TOWERS, CREEPS, CREEP_KEYS, ECON, buildCost, sendUpCost, creepIncome } from './config.js';
import { towerDps } from './sim.js';
import { scoreSpots } from './board.js';

/* ============================================================
   WARDEN — datormotståndaren.
   Spelar med exakt samma regler som spelaren: samma priser, samma
   inkomstformel, samma byggskatt. Skillnaden mellan svårighetsgrader
   är hur bra den prioriterar, inte hur mycket den fuskar.
   ============================================================ */

export function initAI(side, cfg, board) {
  side.cfg = cfg;
  side.think = 1.5;
  side.spots = scoreSpots(board);
  side.pref = pickBuildOrder(cfg);
}

// Varje motståndare får en egen "smak" så matcherna känns olika.
function pickBuildOrder(cfg) {
  const pools = [
    ['pulse', 'pulse', 'blast', 'cryo', 'arc', 'rail'],
    ['blast', 'cryo', 'pulse', 'arc', 'rail', 'blast'],
    ['pulse', 'cryo', 'arc', 'rail', 'blast', 'pulse'],
  ];
  return pools[Math.floor(cfg.iq * pools.length) % pools.length];
}

export function aiThink(G, dt) {
  const A = G.foe;
  if (!A.cfg) return;
  A.think -= dt;
  if (A.think > 0) return;
  A.think = A.cfg.tick;

  const b = A.board;
  const cfg = A.cfg;

  const dps = b.towers.reduce((s, t) => s + towerDps(t.type, t.lv), 0);
  const incoming = b.creeps.reduce((s, c) => s + c.hp, 0);
  const hurt = 1 - b.lives / b.maxLives;

  // Hur mycket av kassan som ska gå till försvar just nu.
  let defWeight = 0.35 + hurt * 0.5;
  if (incoming > dps * 2.2) defWeight = 0.9;
  if (incoming === 0 && hurt < 0.15) defWeight = 0.22;
  defWeight = Math.min(1, defWeight * (0.7 + cfg.iq * 0.5));

  if (Math.random() < defWeight) spendOnDefense(G, A);
  else spendOnOffense(G, A);
}

function spendOnDefense(G, A) {
  const b = A.board;
  const cfg = A.cfg;
  // Måltal för antal torn — resten av guldet går till uppgraderingar.
  const targetCount = Math.min(13, 3 + Math.floor(G.wave * 0.8));

  // Uppgradera hellre än att bygga brett: bäst DPS per guld först.
  const cands = b.towers
    .map(t => {
      const nx = TOWERS[t.type].lv[t.lv + 1];
      if (!nx) return null;
      const gain = towerDps(t.type, t.lv + 1) - towerDps(t.type, t.lv);
      return { t, cost: nx.cost, value: gain / nx.cost };
    })
    .filter(Boolean)
    .filter(c => A.gold >= c.cost)
    .sort((a, c) => c.value - a.value);

  const wantsMore = b.towers.length < targetCount;
  const nextType = A.pref[b.towers.length % A.pref.length];
  const cost = buildCost(nextType, b.towers.length);

  if (wantsMore && A.gold >= cost && (!cands.length || Math.random() < 0.55)) {
    const spot = A.spots.find(s => !b.towers.some(t => t.cx === s.x && t.cy === s.y));
    if (spot) {
      A.gold -= cost;
      b.towers.push({ type: nextType, cx: spot.x, cy: spot.y, lv: 0, cd: 0, invested: cost, angle: -1.57, flash: 0 });
      return;
    }
  }
  if (cands.length) {
    // Sämre AI väljer inte alltid bästa uppgraderingen.
    const idx = Math.random() < cfg.iq ? 0 : Math.floor(Math.random() * cands.length);
    const c = cands[idx];
    const nx = TOWERS[c.t.type].lv[c.t.lv + 1];
    A.gold -= nx.cost;
    c.t.lv++;
    c.t.invested += nx.cost;
  }
}

function spendOnOffense(G, A) {
  const cfg = A.cfg;
  const reserve = A.gold * cfg.bank; // sparas till försvar

  // Ibland: höj HP på en creeptyp i stället för att skicka fler.
  if (Math.random() < 0.28 * cfg.iq) {
    const keys = CREEP_KEYS.filter(k => A.sendLv[k] < ECON.maxSendLv && A.income >= CREEPS[k].unlock);
    if (keys.length) {
      const k = keys[Math.floor(Math.random() * keys.length)];
      const c = sendUpCost(k, A.sendLv[k]);
      if (A.gold - c > reserve) { A.gold -= c; A.sendLv[k]++; return; }
    }
  }

  // Skicka den dyraste creep den har råd med och har låst upp.
  const affordable = CREEP_KEYS
    .filter(k => A.income >= CREEPS[k].unlock)
    .filter(k => A.gold - CREEPS[k].cost > reserve)
    .sort((a, b) => CREEPS[b].cost - CREEPS[a].cost);
  if (!affordable.length) return;

  // Aggressiv AI går på tunga creeps, försiktig blandar in billiga.
  const pick = Math.random() < cfg.aggr ? affordable[0] : affordable[Math.floor(Math.random() * affordable.length)];
  A.gold -= CREEPS[pick].cost;
  A.income += creepIncome(pick);
  A.pendingSend.push({ key: pick, lv: A.sendLv[pick] });
}
