import {
  MAPS, TOWERS, TOWER_KEYS, CREEPS, CREEP_KEYS, ECON, BASE_LEVELS, MAX_TOWER_LV,
  buildCost, sendUpCost, creepIncome, waveHpMul, towerStat, towerFace, needsBranch,
} from './config.js';
import { makeBoard, towerAt } from './board.js';
import { spawn, stepBoard, stepRemote, addFx, addFloat } from './sim.js';
import { initAI, aiThink, aiNoteIncoming } from './ai.js';
import * as R from './render.js';
import * as UI from './ui.js';
import * as Net from './net.js';

const CV = document.getElementById('cv');
let G = null;
let snapT = 0;

/* ============================================================
   Matchuppsättning
   ============================================================ */
function makeSide(name) {
  return {
    name,
    board: null,
    gold: ECON.startGold,
    income: ECON.startIncome,
    sendLv: Object.fromEntries(CREEP_KEYS.map(k => [k, 0])),
    queue: [],
    pendingSend: [],
    sent: 0, kills: 0,
  };
}

function newMatch({ mode, mapIndex, foeName }) {
  const M = MAPS[mapIndex];
  G = {
    mode, mapIndex, map: M,
    time: 0, wave: 0, waveT: ECON.waveInterval, incT: ECON.incInterval,
    sendCd: 0, speed: 1, paused: false, over: false,
    view: 'def', sel: null, buildHint: false, previewRange: 0,
    me: makeSide('DU'),
    foe: makeSide(foeName || M.ai.nm),
  };
  G.me.board = makeBoard(M.wp);
  G.foe.board = makeBoard(M.wp);

  if (mode === 'campaign') initAI(G.foe, M.ai, G.foe.board);
  else { G.foe.board.remote = true; G.foe.board._map = new Map(); }

  UI.setState(G);
  UI.hideOverlays();
  UI.setViewTabs('def');
  UI.refreshSendbar();
  UI.updateHUD();
  document.getElementById('sector').textContent =
    mode === 'campaign' ? `SEKTOR ${mapIndex + 1} · ${M.name}` : `ONLINE · ${M.name}`;
  document.getElementById('speedBtn').style.display = mode === 'campaign' ? '' : 'none';
  UI.banner(mode === 'campaign' ? `SEKTOR ${mapIndex + 1}` : 'MATCH', `${M.name} · ${G.foe.name}`);
  snapT = 0;
  R.resize();
}

const waveMul = () => waveHpMul(G.wave);

/* ============================================================
   Uppdatering
   ============================================================ */
function update(dt) {
  G.time += dt;

  // inkomsttick
  G.incT -= dt;
  if (G.incT <= 0) {
    G.incT += ECON.incInterval;
    G.me.gold += G.me.income;
    G.foe.gold += G.foe.income;
    UI.pop('gold');
  }

  // våg: allt nytt blir hårdare, oavsett vem som skickar
  G.waveT -= dt;
  if (G.waveT <= 0) {
    G.waveT += ECON.waveInterval;
    G.wave++;
    UI.banner('VÅG ' + (G.wave + 1), `Alla nya creeps +${Math.round((ECON.waveHp - 1) * 100)} % HP`);
  }

  // min sändkö
  G.sendCd = Math.max(0, G.sendCd - dt);
  processQueue();

  if (G.mode === 'campaign') {
    aiThink(G, dt);
    while (G.foe.pendingSend.length) {
      const s = G.foe.pendingSend.shift();
      spawn(G.me.board, s.key, waveMul(), s.lv);
      G.foe.sent++;
      UI.alertTab('def');
    }
    stepBoard(G.foe.board, dt, {
      onKill: c => { G.foe.gold += c.bounty; },
      onLeak: n => hurtFoe(n),
    });
  } else {
    stepRemote(G.foe.board, dt);
  }

  stepBoard(G.me.board, dt, {
    onKill: (c, p) => {
      G.me.gold += c.bounty;
      G.me.kills++;
      addFloat(G.me.board, p.x, p.y, '+' + c.bounty, '#ffd166');
    },
    onLeak: n => hurtMe(n),
  });
}

function hurtMe(n) {
  if (G.over) return;
  G.me.board.lives -= n;
  UI.alertTab('def');
  if (G.me.board.lives <= 0) {
    G.me.board.lives = 0;
    if (G.mode === 'online') Net.send({ t: 'lose' });
    endMatch(false);
  }
}

function hurtFoe(n) {
  if (G.over) return;
  G.foe.board.lives -= n;
  UI.alertTab('atk');
  if (G.foe.board.lives <= 0) {
    G.foe.board.lives = 0;
    endMatch(true);
  }
}

function processQueue() {
  while (G.sendCd <= 0 && G.me.queue.length) {
    const key = G.me.queue[0];
    const d = CREEPS[key];
    if (G.me.income < d.unlock) { G.me.queue.shift(); continue; }
    if (G.me.gold < d.cost) break;   // stannar kvar i kön tills nästa inkomsttick
    G.me.queue.shift();
    G.me.gold -= d.cost;
    G.me.income += creepIncome(key);
    G.me.sent++;
    G.sendCd = ECON.sendCooldown;
    const lv = G.me.sendLv[key];
    if (G.mode === 'campaign') {
      spawn(G.foe.board, key, waveMul(), lv);
      aiNoteIncoming(G.foe, key);   // så WARDEN kan bygga mot det du faktiskt skickar
    } else {
      Net.send({ t: 'send', key, lv, wave: G.wave });
    }
    UI.alertTab('atk');
    UI.refreshSendbar();
  }
}

/* ============================================================
   Spelarhandlingar
   ============================================================ */
function send(key) {
  if (!G || G.over) return;
  const d = CREEPS[key];
  if (G.me.income < d.unlock) { UI.toast(`Låses upp vid inkomst ${d.unlock}`); return; }
  if (G.me.queue.length >= ECON.queueMax) { UI.toast('Kön är full'); return; }
  G.me.queue.push(key);
  processQueue();
  UI.refreshSendbarState();
}

function upgradeSend(key) {
  if (!G || G.over) return;
  const lv = G.me.sendLv[key];
  if (lv >= ECON.maxSendLv) return;
  const cost = sendUpCost(key, lv);
  if (G.me.gold < cost) { UI.toast('För lite guld'); return; }
  G.me.gold -= cost;
  G.me.sendLv[key]++;
  UI.toast(`${CREEPS[key].nm} → nivå ${G.me.sendLv[key]} (+${Math.round(ECON.sendUpHp * 100)} % HP)`);
  UI.openArmory(key);
  UI.refreshSendbar();
}

function build(key) {
  if (!G || !G.sel || G.sel.tower) return;
  const b = G.me.board;
  const cost = buildCost(key, b.towers.length);
  if (G.me.gold < cost) { UI.toast('För lite guld'); return; }
  G.me.gold -= cost;
  b.towers.push({
    type: key, cx: G.sel.cx, cy: G.sel.cy, lv: 0, branch: null,
    cd: 0, invested: cost, angle: -1.57, flash: 0,
  });
  addFx(b, 'ring', G.sel.cx, G.sel.cy, TOWERS[key].color, 1.2);
  UI.closeSheets();
  UI.updateHUD();
}

/* branch krävs bara vid gaffeln (nivå 3 → 4). Valet är permanent. */
function upgradeTower(tw, branch) {
  if (!G || tw.lv + 1 >= MAX_TOWER_LV) return;
  if (needsBranch(tw) && !branch) return;
  const useBranch = tw.lv + 1 >= BASE_LEVELS ? (branch || tw.branch || 'a') : null;
  const nxt = towerStat(tw.type, tw.lv + 1, useBranch);
  if (!nxt || G.me.gold < nxt.cost) { UI.toast('För lite guld'); return; }
  G.me.gold -= nxt.cost;
  tw.lv++;
  if (useBranch) tw.branch = useBranch;
  tw.invested += nxt.cost;
  const face = towerFace(tw.type, tw.lv, tw.branch);
  addFx(G.me.board, 'ring', tw.cx, tw.cy, face.color, 1.4);
  if (branch) UI.banner(face.name, face.tag);
  UI.openTower(tw);
  UI.updateHUD();
}

function sellTower(tw) {
  G.me.gold += Math.floor(tw.invested * ECON.sellRate);
  G.me.board.towers = G.me.board.towers.filter(t => t !== tw);
  UI.closeSheets();
  UI.toast('Torn sålt');
  UI.updateHUD();
}

function setView(v) {
  if (!G) return;
  G.view = v;
  UI.setViewTabs(v);
  UI.closeSheets();
}

function togglePause() {
  if (!G || G.over) return;
  if (G.mode === 'online') { UI.toast('Går inte att pausa online'); return; }
  G.paused = !G.paused;
  const b = document.getElementById('pauseBtn');
  b.textContent = G.paused ? '▶' : '❚❚';
  b.classList.toggle('active', G.paused);
  if (G.paused) UI.banner('PAUSAT', '');
}

function cycleSpeed() {
  if (!G || G.mode === 'online') return;
  G.speed = G.speed === 1 ? 2 : G.speed === 2 ? 3 : 1;
  const b = document.getElementById('speedBtn');
  b.textContent = G.speed + '×';
  b.classList.toggle('active', G.speed > 1);
}

/* ============================================================
   Slut på match
   ============================================================ */
function endMatch(win) {
  if (G.over) return;
  G.over = true;
  const cleared = UI.loadCleared();
  if (win && G.mode === 'campaign') {
    cleared.add(G.mapIndex);
    UI.saveCleared(cleared);
  }
  const mins = Math.floor(G.time / 60), secs = Math.floor(G.time % 60);
  UI.showEnd({
    win,
    title: win ? 'SEGER' : 'GENOMBRUTEN',
    sub: win
      ? `Du bröt igenom ${G.foe.name}s försvar.`
      : `Din nexus föll. ${G.mode === 'campaign' ? 'Tips: bygg färre torn men uppgradera dem — nivå 6 ger ~14× DPS mot nivå 1.' : ''}`,
    stats: [
      { k: 'TID', v: `${mins}:${String(secs).padStart(2, '0')}` },
      { k: 'SKICKADE', v: G.me.sent },
      { k: 'KILLS', v: G.me.kills },
      { k: 'INKOMST', v: G.me.income },
      { k: 'LIV KVAR', v: Math.max(0, G.me.board.lives) },
    ],
    showNext: win && G.mode === 'campaign' && G.mapIndex < MAPS.length - 1,
  });
}

/* ============================================================
   Online
   ============================================================ */
function snapshot() {
  const b = G.me.board;
  return {
    l: b.lives,
    tw: b.towers.map(t => [TOWER_KEYS.indexOf(t.type), t.cx, t.cy, t.lv, t.branch === 'b' ? 1 : 0]),
    cr: b.creeps.filter(c => c.t >= 0).map(c => [
      c.id, CREEP_KEYS.indexOf(c.type), +c.t.toFixed(2),
      +(c.hp / c.maxHp).toFixed(2), c.lv, c.slow > 0 ? 1 : 0,
    ]),
  };
}

function applySnapshot(s) {
  if (!G || G.mode !== 'online') return;
  const b = G.foe.board;
  b.lives = s.l;
  b.towers = s.tw.map(a => ({
    type: TOWER_KEYS[a[0]], cx: a[1], cy: a[2], lv: a[3],
    branch: a[3] >= BASE_LEVELS ? (a[4] ? 'b' : 'a') : null,
    cd: 0, invested: 0, angle: -1.57, flash: 0,
  }));
  const map = new Map(b.creeps.map(c => [c.id, c]));
  const seen = new Set();
  for (const a of s.cr) {
    const [id, ti, t, frac, lv, slow] = a;
    seen.add(id);
    let c = map.get(id);
    if (!c) {
      const type = CREEP_KEYS[ti];
      const d = CREEPS[type];
      c = {
        id, type, lv, t, hp: frac, maxHp: 1, spd: d.spd, slow: 0, slowT: 0,
        r: d.r, cls: d.cls, fly: !!d.fly, regen: 0, bounty: 0, leak: d.leak,
        burn: 0, burnT: 0,
        wob: Math.random() * 6.28, bob: Math.random() * 6.28, flash: 0, dead: false,
      };
      b.creeps.push(c);
    }
    // mjuk korrigering så extrapoleringen inte hackar
    c.t = Math.abs(c.t - t) > 1.5 ? t : c.t + (t - c.t) * 0.55;
    c.hp = frac;
    c.slow = slow ? 0.45 : 0;
    c.lv = lv;
  }
  b.creeps = b.creeps.filter(c => seen.has(c.id));
}

function onNetMessage(m) {
  switch (m.t) {
    case 'waiting':
      UI.showMatchmaking('SÖKER MOTSTÅNDARE', 'Du står i kö. Öppna spelet i en till flik eller skicka länken till en kompis.');
      break;
    case 'match':
      newMatch({ mode: 'online', mapIndex: m.mapIndex, foeName: m.opp || 'MOTSTÅNDARE' });
      break;
    case 'send':
      if (G && G.mode === 'online' && !G.over) {
        spawn(G.me.board, m.key, waveHpMul(m.wave ?? G.wave), m.lv || 0);
        UI.alertTab('def');
      }
      break;
    case 'snap':
      applySnapshot(m.s);
      break;
    case 'opp_lost':
      if (G && !G.over) { G.foe.board.lives = 0; endMatch(true); }
      break;
    case 'opp_left':
      if (G && !G.over) { UI.toast('Motståndaren lämnade'); endMatch(true); }
      break;
    case 'cancelled':
      break;
  }
}

function findMatch(name) {
  if (!Net.isOpen()) { UI.toast('Ingen kontakt med servern'); return; }
  UI.saveName(name);
  Net.send({ t: 'find', name });
  UI.showMatchmaking('SÖKER MOTSTÅNDARE', 'Väntar på en spelare…');
}

function cancelMatch() { Net.send({ t: 'cancel' }); }

function leave() {
  if (G && G.mode === 'online') Net.send({ t: 'leave' });
  G = null;
  UI.setState(null);
}

/* ============================================================
   Input
   ============================================================ */
CV.addEventListener('pointerdown', e => {
  if (!G || G.over) return;
  const rect = CV.getBoundingClientRect();
  const px = e.clientX - rect.left, py = e.clientY - rect.top;

  if (R.L.mode === 'single' && G.view !== 'def') { UI.closeSheets(); return; }

  const hit = R.pickCell(R.L.me, px, py);
  if (!hit) { UI.closeSheets(); return; }

  const b = G.me.board;
  const tw = towerAt(b, hit.cx, hit.cy);
  if (tw) {
    UI.closeSheets();
    G.sel = { cx: hit.cx, cy: hit.cy, tower: tw };
    UI.openTower(tw);
    return;
  }
  if (!b.buildable.has(hit.cx + ',' + hit.cy)) {
    UI.closeSheets();
    if (b.cells.has(hit.cx + ',' + hit.cy)) UI.toast('Här går vägen');
    return;
  }
  UI.closeSheets();
  G.sel = { cx: hit.cx, cy: hit.cy };
  UI.openBuild();
});

window.addEventListener('resize', () => {
  R.resize();
  document.body.classList.toggle('dual', R.L.mode === 'dual');
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && G && !G.over && G.mode === 'campaign' && !G.paused) togglePause();
});

/* ============================================================
   Loop
   ============================================================ */
const STEP = 1 / 60;
let last = performance.now(), acc = 0;

function loop(now) {
  requestAnimationFrame(loop);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25;

  if (G && !G.paused && !G.over) {
    acc += dt * G.speed;
    let guard = 0;
    while (acc >= STEP && guard++ < 30) { update(STEP); acc -= STEP; }
    if (G.mode === 'online') {
      snapT -= dt;
      if (snapT <= 0) { snapT = 1 / 6; Net.send({ t: 'snap', s: snapshot() }); }
    }
  }
  if (G) UI.updateHUD();
  R.drawFrame(G);
}

/* ============================================================
   Boot
   ============================================================ */
UI.initUI({
  send, upgradeSend, build, upgradeTower, sellTower,
  setView, togglePause, cycleSpeed,
  startCampaign: i => newMatch({ mode: 'campaign', mapIndex: i }),
  findMatch, cancelMatch, leave,
  nextSector: () => newMatch({ mode: 'campaign', mapIndex: Math.min(MAPS.length - 1, G.mapIndex + 1) }),
  replay: () => {
    if (!G) return;
    if (G.mode === 'online') { leave(); UI.showMenu('online'); return; }
    newMatch({ mode: 'campaign', mapIndex: G.mapIndex });
  },
});

// Felsökningskrok: window.NW.G i konsolen ger hela speltillståndet.
window.NW = { get G() { return G; }, hurtMe, endMatch };

R.initRender(CV);
document.body.classList.toggle('dual', R.L.mode === 'dual');
document.getElementById('mmName').value = UI.loadName();
Net.connect({ onMessage: onNetMessage, onStatus: () => {} });
UI.showMenu('campaign');
requestAnimationFrame(loop);
