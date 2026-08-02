/* Speltest ur en MÄNNISKAS perspektiv.
   balance.mjs kör AI mot AI, vilket bara visar att systemet är internt
   konsekvent. Det här skriptet spelar som en vettig men inte perfekt
   spelare gör: bygger ett par torn tidigt, uppgraderar djupt, väljer gren
   efter vad som faktiskt kommer, och skickar när det finns råg över.

   Kör: node scripts/playtest.mjs [bana] [strategi]
   strategier: balanced | rusher | turtle                                */

import {
  MAPS, ECON, CREEPS, CREEP_KEYS, TOWER_KEYS, BASE_LEVELS, MAX_TOWER_LV,
  buildCost, creepIncome, sendUpCost, towerStat, needsBranch, waveHpMul, BRANCH_KEYS, creepUnlocked,
  RESEARCH, researchCost, requiredResearch, applyDiff,
} from '../public/js/config.js';
import { makeBoard, canBuild, rebuildSolid, routeCells, nextPlanSpot } from '../public/js/board.js';
import { spawn, stepBoard, towerDps, towerDpsVs } from '../public/js/sim.js';
import { initAI, aiThink, aiNoteIncoming } from '../public/js/ai.js';

const mapIndex = Number(process.argv[2] ?? 0);
const style = process.argv[3] || 'balanced';
const M = MAPS[mapIndex];

const STYLES = {
  /* Trösklarna är i guld och måste följa ekonomins skala. Med startguld 100
     och 10 i inkomst per tick är 400 i reserv detsamma som att aldrig
     skicka något alls. */
  balanced: { sendShare: 0.5, towerTarget: 8, reserve: 80, mazeTarget: 40 },
  rusher:   { sendShare: 0.75, towerTarget: 5, reserve: 35, mazeTarget: 26 },
  turtle:   { sendShare: 0.25, towerTarget: 11, reserve: 200, mazeTarget: 55 },
};
const S = STYLES[style] || STYLES.balanced;

function makeSide(name) {
  return {
    name, gold: ECON.startGold, income: ECON.startIncome,
    sendLv: Object.fromEntries(CREEP_KEYS.map(k => [k, 0])),
    pendingSend: [], sent: 0, leaked: 0, board: makeBoard(M),
    research: Object.fromEntries(BRANCH_KEYS.map(k => [k, 0])), mainEl: null,
  };
}

const P = makeSide('SPELARE(' + style + ')');
P.seen = { latt: 0, tung: 0, pans: 0, flyg: 0 };
const A = makeSide('WARDEN(' + M.ai.nm + ')');
initAI(A, applyDiff(M.ai, process.env.NW_DIFF || 'normal'), A.board);

/* ---- spelarens "hjärna" ---- */
function profile() {
  const p = { latt: 0, tung: 0, pans: 0, flyg: 0 };
  let sum = 0;
  for (const c of P.board.creeps) if (!c.dead) { p[c.cls] += c.hp * 2; }
  for (const k of Object.keys(p)) { p[k] += P.seen[k]; sum += p[k]; }
  if (sum <= 0) return { latt: 0.5, tung: 0.3, pans: 0.15, flyg: 0.05 };
  for (const k of Object.keys(p)) p[k] /= sum;
  return p;
}

function valueOf(type, lv, branch, prof) {
  let v = 0;
  for (const cls of Object.keys(prof)) v += towerDpsVs(type, lv, branch, cls) * prof[cls];
  return v;
}

let playerTick = 0;
function playerTurn(dt, wave) {
  playerTick -= dt;
  if (playerTick > 0) return;
  playerTick = 1.0;
  const prof = profile();
  const b = P.board;

  // 1) Bygg labyrint tills vägen är lagom lång — det är öppningen i LTW.
  const wallCost = buildCost('wall', b.towers.length);
  const walls = b.towers.filter(t => !t.branch).length;
  if (b.pathLen < S.mazeTarget && walls < 34 && P.gold >= wallCost) {
    const spot = nextPlanSpot(b);
    if (spot) {
      P.gold -= wallCost;
      b.towers.push({ type: 'wall', cx: spot[0], cy: spot[1], lv: 0, branch: null,
        cd: 0, invested: wallCost, angle: -1.57, flash: 0 });
      rebuildSolid(b);
      return;
    }
  }

  // 2) Forska fram ett huvudelement — tornen kan inte gå förbi det.
  if (!P.mainEl) {
    P.mainEl = BRANCH_KEYS.map(br => ({ br, v: valueOf('wall', 3, br, prof) }))
      .sort((x, z) => z.v - x.v)[0].br;
  }
  const topLv = b.towers.reduce((m, t) => (t.branch === P.mainEl ? Math.max(m, t.lv) : m), -1);
  const rl = P.research[P.mainEl] || 0;
  const want = requiredResearch(Math.min(MAX_TOWER_LV - 1, Math.max(BASE_LEVELS, topLv + 1)));
  if (rl < want && rl < RESEARCH.maxLevel && P.gold >= researchCost(rl) + S.reserve * 0.3) {
    P.gold -= researchCost(rl);
    P.research[P.mainEl] = rl + 1;
    return;
  }

  // 3) Uppgradera det torn som ger mest mot det som faktiskt kommer.
  const cands = [];
  for (const t of b.towers) {
    if (t.lv + 1 >= MAX_TOWER_LV) continue;
    const brs = needsBranch(t) ? [P.mainEl] : [t.branch];
    for (const br of brs) {
      if ((P.research[br] || 0) < requiredResearch(t.lv + 1)) continue;
      const st = towerStat(t.type, t.lv + 1, br);
      if (P.gold < st.cost) continue;
      const gain = valueOf(t.type, t.lv + 1, br, prof) - valueOf(t.type, t.lv, t.branch, prof);
      cands.push({ t, br, cost: st.cost, value: gain / st.cost });
    }
  }
  cands.sort((x, z) => z.value - x.value);
  if (cands.length && P.gold > S.reserve) {
    const c = cands[0];
    P.gold -= c.cost;
    c.t.lv++;
    if (c.t.lv >= BASE_LEVELS) c.t.branch = c.br || c.t.branch || 'a';
    c.t.invested += c.cost;
    return;
  }

}

/* Sändandet går på egen klocka — en spelare växlar mellan att bygga och
   att skicka, den staplar inte allt i samma beslut. */
let sendTick = 3;
function playerSend(dt) {
  sendTick -= dt;
  if (sendTick > 0) return;
  sendTick = 1 / S.sendShare * 1.2;
  const opts = CREEP_KEYS
    .filter(k => creepUnlocked(k, time) && P.gold - CREEPS[k].cost >= 20)
    .sort((x, z) => CREEPS[z].cost - CREEPS[x].cost);
  if (opts.length) P.pendingSend.push({ key: opts[0], lv: P.sendLv[opts[0]] });
}

/* ---- körning ---- */
const STEP = 1 / 60;
let prep = ECON.prepTime;
let time = 0, wave = 0, waveT = ECON.waveInterval, incT = ECON.incInterval;
let sendCd = 0, winner = null;
const log = [];
const firstLeak = { P: null, A: null };
/* Mäter det användaren faktiskt frågade efter: hinner man bli fattig?
   "Pank" = har inte råd med det billigaste tornet (160 guld). */
let brokeTime = 0, richTime = 0;

while (time < 60 * 30 && !winner) {
  time += STEP;
  if (prep > 0) prep -= STEP;
  incT -= STEP;
  if (incT <= 0) { incT += ECON.incInterval; P.gold += P.income * (P.cfg?.eco || 1); A.gold += A.income * (A.cfg?.eco || 1); }
  waveT -= STEP;
  if (waveT <= 0) { waveT += ECON.waveInterval; wave++; }

  playerSend(STEP);
  playerTurn(STEP, wave);
  aiThink({ foe: A, wave, prep, time }, STEP);

  sendCd = Math.max(0, sendCd - STEP);
  if (prep <= 0 && sendCd <= 0 && P.pendingSend.length) {
    const s = P.pendingSend.shift();
    const d = CREEPS[s.key];
    if (P.gold >= d.cost) {
      P.gold -= d.cost; P.income += creepIncome(s.key); P.sent++;
      sendCd = ECON.sendCooldown;
      spawn(A.board, s.key, waveHpMul(wave), s.lv);
      aiNoteIncoming(A, s.key);
    }
  }
  while (prep <= 0 && A.pendingSend.length) {
    const s = A.pendingSend.shift();
    spawn(P.board, s.key, waveHpMul(wave), s.lv);
    P.seen[CREEPS[s.key].cls] += CREEPS[s.key].hp * (CREEPS[s.key].count || 1);
    A.sent++;
  }

  for (const [me, foe, tag] of [[P, A, 'P'], [A, P, 'A']]) {
    stepBoard(me.board, STEP, {
      onKill: c => { me.gold += c.bounty; },
      onLeak: n => {
        me.board.lives -= n;
        foe.board.lives = Math.min(ECON.maxLives, foe.board.lives + n);
        me.leaked += n;
        if (firstLeak[tag] === null) firstLeak[tag] = time;
        if (me.board.lives <= 0 && !winner) winner = foe.name;
      },
    });
  }

  if (P.gold < 50) brokeTime += STEP; else richTime += STEP;

  if (Math.abs(time % 60) < STEP / 2) {
    log.push({ t: Math.round(time), wave, P: snap(P), A: snap(A) });
  }
}

function snap(s) {
  const byType = {};
  for (const t of s.board.towers) {
    const k = t.type + (t.branch ? ':' + t.branch : '');
    byType[k] = (byType[k] || 0) + 1;
  }
  return {
    liv: s.board.lives, guld: Math.round(s.gold), ink: s.income,
    torn: s.board.towers.length,
    dps: s.board.towers.reduce((a, t) => a + towerDps(t.type, t.lv, t.branch), 0),
    mix: Object.entries(byType).map(([k, n]) => `${k}×${n}`).join(' '),
  };
}

const pad = (v, n) => String(v).padStart(n);
console.log(`Bana ${mapIndex + 1}: ${M.name} — ${P.name} mot ${A.name}\n`);
console.log('  tid  våg | DU: liv guld  ink torn    dps | AI: liv guld  ink torn    dps');
for (const r of log) {
  console.log(
    `${pad(Math.floor(r.t / 60) + ':' + String(r.t % 60).padStart(2, '0'), 5)} ${pad(r.wave + 1, 4)} |` +
    `  ${pad(r.P.liv, 4)} ${pad(r.P.guld, 5)} ${pad(r.P.ink, 4)} ${pad(r.P.torn, 4)} ${pad(r.P.dps, 6)} |` +
    `  ${pad(r.A.liv, 4)} ${pad(r.A.guld, 5)} ${pad(r.A.ink, 4)} ${pad(r.A.torn, 4)} ${pad(r.A.dps, 6)}`
  );
}
console.log('');
console.log('Din slutliga tornmix:', snap(P).mix || '(inga)');
console.log('AI:ns slutliga tornmix:', snap(A).mix || '(inga)');
console.log(`Första läckan: du ${firstLeak.P ? Math.round(firstLeak.P) + 's' : 'aldrig'}, AI ${firstLeak.A ? Math.round(firstLeak.A) + 's' : 'aldrig'}`);
console.log(winner ? `\nVINNARE: ${winner} efter ${Math.floor(time / 60)}:${String(Math.floor(time % 60)).padStart(2, '0')}`
                   : '\nOAVGJORT efter 30 min — matchen fastnar.');
console.log(`Du skickade ${P.sent}, läckte ${P.leaked}. AI skickade ${A.sent}, läckte ${A.leaked}.`);
console.log(`Pank (< 50 guld, kan inte ens lägga ett pilbågstorn): ${Math.round(100 * brokeTime / (brokeTime + richTime))} % av matchen`);
