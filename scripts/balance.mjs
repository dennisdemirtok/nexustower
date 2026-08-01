/* Balanstest: kör två WARDEN-AI mot varandra och rapporterar hur matchen
   utvecklas. Snabbaste sättet att se om ekonomin skenar eller om försvaret
   är gratis. Kör: node scripts/balance.mjs [banindex] [ai-a] [ai-b] */

import { MAPS, ECON, CREEP_KEYS, waveHpMul, creepUnlocked } from '../public/js/config.js';
import { makeBoard } from '../public/js/board.js';
import { spawn, stepBoard, towerDps } from '../public/js/sim.js';
import { initAI, aiThink, aiNoteIncoming } from '../public/js/ai.js';

const mapIndex = Number(process.argv[2] ?? 0);
const cfgA = MAPS[Number(process.argv[3] ?? mapIndex)].ai;
const cfgB = MAPS[Number(process.argv[4] ?? mapIndex)].ai;
const M = MAPS[mapIndex];

function makeSide(name, cfg) {
  const s = {
    name, gold: ECON.startGold, income: ECON.startIncome,
    sendLv: Object.fromEntries(CREEP_KEYS.map(k => [k, 0])),
    pendingSend: [], sent: 0, leaked: 0,
    board: makeBoard(M),
  };
  initAI(s, cfg, s.board);
  return s;
}

const A = makeSide('A(' + cfgA.nm + ')', cfgA);
const B = makeSide('B(' + cfgB.nm + ')', cfgB);

const STEP = 1 / 60;
let prep = ECON.prepTime;
let time = 0, wave = 0, waveT = ECON.waveInterval, incT = ECON.incInterval;
const log = [];
let winner = null;

while (time < 60 * 30 && !winner) {
  time += STEP;

  incT -= STEP;
  if (incT <= 0) { incT += ECON.incInterval; A.gold += A.income; B.gold += B.income; }

  waveT -= STEP;
  if (waveT <= 0) { waveT += ECON.waveInterval; wave++; }

  for (const [me, foe] of [[A, B], [B, A]]) {
    aiThink({ foe: me, wave }, STEP);
    while (prep <= 0 && me.pendingSend.length) {
      const s = me.pendingSend.shift();
      spawn(foe.board, s.key, waveHpMul(wave), s.lv);
      aiNoteIncoming(foe, s.key);
      me.sent++;
    }
  }

  for (const [me, foe] of [[A, B], [B, A]]) {
    stepBoard(me.board, STEP, {
      onKill: c => { me.gold += c.bounty; },
      onLeak: n => {
        me.board.lives -= n;
        foe.board.lives = Math.min(ECON.maxLives, foe.board.lives + n);
        me.leaked += n;
        if (me.board.lives <= 0 && !winner) winner = foe.name;
      },
    });
  }

  if (Math.abs(time % 30) < STEP / 2) {
    log.push({
      t: Math.round(time),
      wave,
      A: snap(A), B: snap(B),
    });
  }
}

function snap(s) {
  return {
    liv: s.board.lives,
    guld: Math.round(s.gold),
    ink: s.income,
    torn: s.board.towers.length,
    dps: s.board.towers.reduce((a, t) => a + towerDps(t.type, t.lv, t.branch), 0),
    nivåer: s.board.towers.map(t => t.lv + 1).sort((a, b) => b - a).join(''),
    påBanan: s.board.creeps.length,
    skickat: s.sent,
  };
}

const pad = (v, n) => String(v).padStart(n);
console.log(`Bana: ${M.name}   ${A.name} vs ${B.name}\n`);
console.log('  tid  våg | A: liv guld  ink torn    dps  creeps | B: liv guld  ink torn    dps  creeps');
for (const r of log) {
  console.log(
    `${pad(Math.floor(r.t / 60) + ':' + String(r.t % 60).padStart(2, '0'), 5)} ${pad(r.wave + 1, 4)} |` +
    `   ${pad(r.A.liv, 3)} ${pad(r.A.guld, 5)} ${pad(r.A.ink, 4)} ${pad(r.A.torn, 4)} ${pad(r.A.dps, 6)} ${pad(r.A.påBanan, 7)} |` +
    `   ${pad(r.B.liv, 3)} ${pad(r.B.guld, 5)} ${pad(r.B.ink, 4)} ${pad(r.B.torn, 4)} ${pad(r.B.dps, 6)} ${pad(r.B.påBanan, 7)}`
  );
}
console.log('');
if (winner) {
  console.log(`VINNARE: ${winner} efter ${Math.floor(time / 60)}:${String(Math.floor(time % 60)).padStart(2, '0')}`);
} else {
  console.log('INGEN VINNARE inom 30 min — matchen fastnar (försvaret är för starkt).');
}
console.log(`A skickade ${A.sent} creeps, läckte ${A.leaked} liv, torn-nivåer ${A.board.towers.map(t => t.lv + 1).sort().reverse().join('')}`);
console.log(`B skickade ${B.sent} creeps, läckte ${B.leaked} liv, torn-nivåer ${B.board.towers.map(t => t.lv + 1).sort().reverse().join('')}`);
