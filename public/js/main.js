import {
  MAPS, TOWERS, TOWER_KEYS, CREEPS, CREEP_KEYS, ECON, BASE_LEVELS, MAX_TOWER_LV,
  buildCost, sendUpCost, creepIncome, waveHpMul, towerStat, towerFace, needsBranch,
  BRANCH_KEYS, RESEARCH, researchCost, requiredResearch, creepUnlocked,
} from './config.js';
import { makeBoard, towerAt, canBuild, rebuildSolid } from './board.js';
import { spawn, stepBoard, stepRemote, addFx, addFloat, addParts } from './sim.js';
import { initAI, aiThink, aiNoteIncoming } from './ai.js';
import * as R from './render.js';
import * as UI from './ui.js';
import * as Net from './net.js';
import * as Audio from './audio.js';

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
    research: Object.fromEntries(BRANCH_KEYS.map(k => [k, 0])),
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
    sendCd: 0, prep: ECON.prepTime, speed: 1, paused: false, over: false,
    view: 'def', sel: null, buildHint: false, previewRange: 0,
    me: makeSide('DU'),
    foe: makeSide(foeName || M.ai.nm),
  };
  G.me.board = makeBoard(M);
  G.foe.board = makeBoard(M);

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
  Audio.unlock();
  Audio.startMusic();
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
    Audio.sfx.income();
  }

  // våg: allt nytt blir hårdare, oavsett vem som skickar
  G.waveT -= dt;
  if (G.waveT <= 0) {
    G.waveT += ECON.waveInterval;
    G.wave++;
    if (ECON.waveHp > 1) {
      UI.banner('VÅG ' + (G.wave + 1), `Alla nya creeps +${Math.round((ECON.waveHp - 1) * 100)} % HP`);
      Audio.sfx.wave(G.wave);
    }
  }

  // byggfas: ingen får skicka förrän nedräkningen är slut
  if (G.prep > 0) {
    const was = Math.ceil(G.prep);
    G.prep -= dt;
    if (was > 0 && Math.ceil(G.prep) !== was && Math.ceil(G.prep) <= 5 && G.prep > 0) Audio.sfx.ui();
    if (G.prep <= 0) { UI.banner('FÖRSTA VÅGEN', 'Creeps släpps lös'); Audio.sfx.wave(0); }
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
    // Fiendens bana hörs svagare — annars blir det dubbelt så mycket ljud.
    stepBoard(G.foe.board, dt, {
      onKill: c => { G.foe.gold += c.bounty; Audio.sfx.death(0.35); },
      onLeak: n => hurtFoe(n),
      onFire: st => Audio.sfx.shoot(st.dmgType, 0.3),
    });
  } else {
    stepRemote(G.foe.board, dt);
  }

  stepBoard(G.me.board, dt, {
    onKill: (c, p) => {
      G.me.gold += c.bounty;
      G.me.kills++;
      addFloat(G.me.board, p.x, p.y, '+' + Math.round(c.bounty), '#ffd166');
      Audio.sfx.death();
    },
    onLeak: n => hurtMe(n),
    onFire: st => Audio.sfx.shoot(st.dmgType),
    onImpact: st => { if (st.splash) Audio.sfx.boom(st.splash); },
  });

  // Musiken tätnar när det faktiskt brinner på din bana.
  audioT -= dt;
  if (audioT <= 0) {
    audioT = 0.5;
    const threat = G.me.board.creeps.reduce((s, c) => s + c.hp, 0);
    const lifeLoss = 1 - G.me.board.lives / G.me.board.maxLives;
    Audio.setIntensity(Math.min(1, threat / 4000 + lifeLoss * 0.7));
  }
}
let audioT = 0;

/* Livstöld: den som läcker förlorar liv och den som skickade creepen vinner
   lika många. Summan är konstant, så matchen är en dragkamp — inte två
   parallella nedräkningar som råkar ta olika lång tid. */
const steal = (side, n) => {
  if (!ECON.lifeSteal) return;
  side.board.lives = Math.min(ECON.maxLives, side.board.lives + n);
};

function hurtMe(n) {
  if (G.over) return;
  G.me.board.lives -= n;
  UI.alertTab('def');
  Audio.sfx.leak();
  Audio.buzz([28, 40, 28]);
  // I kampanjen sköter vi båda sidor; online måste motståndaren få veta.
  if (G.mode === 'campaign') steal(G.foe, n);
  else Net.send({ t: 'steal', n });
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
  steal(G.me, n);
  addFloat(G.me.board, 4, 7, '+' + n + ' LIV', '#4fd8eb');
  if (G.foe.board.lives <= 0) {
    G.foe.board.lives = 0;
    endMatch(true);
  }
}

/* Kön är redan betald — den styr bara utsläppstakten så att tjugo creeps
   inte spawnar ovanpå varandra. */
function processQueue() {
  if (G.prep > 0) return;
  while (G.sendCd <= 0 && G.me.queue.length) {
    const { key, lv } = G.me.queue.shift();
    G.sendCd = ECON.sendCooldown;
    if (G.mode === 'campaign') {
      spawn(G.foe.board, key, waveMul(), lv);
      aiNoteIncoming(G.foe, key);
    } else {
      Net.send({ t: 'send', key, lv, wave: G.wave });
    }
    UI.alertTab('atk');
  }
}

/* ============================================================
   Spelarhandlingar
   ============================================================ */
/* Betalningen sker direkt vid trycket. Har du guldet får du trycka hur
   många gånger du vill — kön styr bara i vilken takt de släpps ut, och
   guldet är enda taket. Att spara ihop och dumpa allt på en gång är ett
   legitimt drag. */
function send(key) {
  if (!G || G.over) return;
  const d = CREEPS[key];
  if (!creepUnlocked(key, G.time)) {
    UI.toast(`Låses upp vid ${d.unlockMin} min`);
    Audio.sfx.denied();
    return;
  }
  if (G.me.gold < d.cost) { UI.toast('För lite guld'); Audio.sfx.denied(); return; }
  if (G.me.queue.length >= ECON.queueMax) { UI.toast('Kön är full'); Audio.sfx.denied(); return; }
  G.me.gold -= d.cost;
  G.me.income += creepIncome(key);
  G.me.sent++;
  G.me.queue.push({ key, lv: G.me.sendLv[key] });
  Audio.sfx.send();
  Audio.buzz(8);
  UI.refreshSendbar();
}

function upgradeSend(key) {
  if (!G || G.over) return;
  const lv = G.me.sendLv[key];
  if (lv >= ECON.maxSendLv) return;
  const cost = sendUpCost(key, lv);
  if (G.me.gold < cost) { UI.toast('För lite guld'); Audio.sfx.denied(); return; }
  G.me.gold -= cost;
  G.me.sendLv[key]++;
  Audio.sfx.upgrade();
  UI.toast(`${CREEPS[key].nm} → nivå ${G.me.sendLv[key]} (+${Math.round(ECON.sendUpHp * 100)} % HP)`);
  UI.openArmory(key);
  UI.refreshSendbar();
}

function build(key) {
  if (!G || !G.sel || G.sel.tower) return;
  const b = G.me.board;
  const cost = buildCost(key, b.towers.length);
  if (G.me.gold < cost) { UI.toast('För lite guld'); Audio.sfx.denied(); return; }
  // Labyrintregeln: du får aldrig stänga vägen helt.
  const check = canBuild(b, G.sel.cx, G.sel.cy);
  if (!check.ok) { UI.toast(check.why); Audio.sfx.denied(); return; }
  G.me.gold -= cost;
  b.towers.push({
    type: key, cx: G.sel.cx, cy: G.sel.cy, lv: 0, branch: null,
    cd: 0, recoil: 0, invested: cost, angle: -1.57, flash: 0,
  });
  rebuildSolid(b);
  Audio.sfx.build();
  Audio.buzz(12);
  addFx(b, 'ring', G.sel.cx, G.sel.cy, TOWERS[key].color, 1.2);
  UI.closeSheets();
  UI.updateHUD();
}

/* Forskning: köp en elementnivå. Den gäller alla dina torn av det
   elementet, så det är en investering i EN riktning — inte i ett torn. */
function research(el) {
  if (!G || G.over) return;
  const lv = G.me.research[el] || 0;
  if (lv >= RESEARCH.maxLevel) return;
  const cost = researchCost(lv);
  if (G.me.gold < cost) { UI.toast('För lite guld'); Audio.sfx.denied(); return; }
  G.me.gold -= cost;
  G.me.research[el] = lv + 1;
  Audio.sfx.branch();
  Audio.buzz([12, 24, 12]);
  UI.banner(TOWERS.wall.branches[el].name + ' NIVÅ ' + (lv + 1), 'Nya torntier upplåsta');
  UI.openResearch();
  UI.updateHUD();
}

/* branch krävs bara vid gaffeln (nivå 3 → 4). Valet är permanent. */
function upgradeTower(tw, branch) {
  if (!G || tw.lv + 1 >= MAX_TOWER_LV) return;
  if (needsBranch(tw) && !branch) return;
  const useBranch = tw.lv + 1 >= BASE_LEVELS ? (branch || tw.branch || 'a') : null;
  // Elementforskningen är porten: rätt nivå krävs innan tornet får gå vidare.
  if (useBranch) {
    const need = requiredResearch(tw.lv + 1);
    if ((G.me.research[useBranch] || 0) < need) {
      const nm = TOWERS.wall.branches[useBranch].name;
      UI.toast(`Kräver ${nm} nivå ${need} — forska först`);
      Audio.sfx.denied();
      return;
    }
  }
  const nxt = towerStat(tw.type, tw.lv + 1, useBranch);
  if (!nxt || G.me.gold < nxt.cost) { UI.toast('För lite guld'); Audio.sfx.denied(); return; }
  G.me.gold -= nxt.cost;
  tw.lv++;
  if (useBranch) tw.branch = useBranch;
  tw.invested += nxt.cost;
  const face = towerFace(tw.type, tw.lv, tw.branch);
  addFx(G.me.board, 'ring', tw.cx, tw.cy, face.color, 1.4);
  addParts(G.me.board, tw.cx, tw.cy, branch ? 18 : 8, face.color, branch ? 3.5 : 2);
  if (branch) { UI.banner(face.name, face.tag); Audio.sfx.branch(); Audio.buzz([14, 30, 14]); }
  else { Audio.sfx.upgrade(); Audio.buzz(10); }
  UI.openTower(tw);
  UI.updateHUD();
}

function sellTower(tw) {
  G.me.gold += Math.floor(tw.invested * ECON.sellRate);
  G.me.board.towers = G.me.board.towers.filter(t => t !== tw);
  rebuildSolid(G.me.board);
  Audio.sfx.sell();
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
  if (G.paused) { UI.banner('PAUSAT', ''); Audio.stopMusic(); }
  else Audio.startMusic();
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
  Audio.stopMusic();
  if (win) Audio.sfx.win(); else Audio.sfx.lose();
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
      { k: 'INKOMST', v: Math.round(G.me.income) },
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
      c.id, CREEP_KEYS.indexOf(c.type), +c.x.toFixed(2), +c.y.toFixed(2),
      +(c.hp / c.maxHp).toFixed(2), c.lv, c.slow > 0 ? 1 : 0, +c.t.toFixed(2),
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
  rebuildSolid(b);
  const map = new Map(b.creeps.map(c => [c.id, c]));
  const seen = new Set();
  for (const a of s.cr) {
    const [id, ti, px, py, frac, lv, slow, t] = a;
    seen.add(id);
    let c = map.get(id);
    if (!c) {
      const type = CREEP_KEYS[ti];
      const d = CREEPS[type];
      c = {
        id, type, lv, t, x: px, y: py, jx: 0, jy: 0,
        hp: frac, maxHp: 1, spd: d.spd, slow: 0, slowT: 0,
        r: d.r, cls: d.cls, fly: !!d.fly, regen: 0, bounty: 0, leak: d.leak,
        burn: 0, burnT: 0,
        wob: Math.random() * 6.28, bob: Math.random() * 6.28, flash: 0, dead: false,
      };
      b.creeps.push(c);
    }
    // mjuk korrigering så extrapoleringen inte hackar
    const far = Math.hypot(px - c.x, py - c.y) > 1.5;
    c.x = far ? px : c.x + (px - c.x) * 0.55;
    c.y = far ? py : c.y + (py - c.y) * 0.55;
    c.t = t;
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
    case 'steal':
      // Motståndaren läckte — vi vinner lika många liv som de förlorade.
      if (G && G.mode === 'online' && !G.over) {
        G.me.board.lives = Math.min(ECON.maxLives, G.me.board.lives + (m.n || 0));
        addFloat(G.me.board, 4, 7, '+' + m.n + ' LIV', '#4fd8eb');
      }
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
  Audio.stopMusic();
  G = null;
  UI.setState(null);
}

/* ============================================================
   Input
   ============================================================ */
/* Direktbygge. Det finns bara en sak att bygga — en palisad — så en meny
   mellan varje klick vore bara i vägen när man ska lägga tjugo i rad.
   Håll och dra för att lägga en hel rad på en gång. */
let painting = false, lastPaint = null;

function tryBuildAt(cx, cy, quiet) {
  const b = G.me.board;
  if (towerAt(b, cx, cy)) return false;
  const cost = buildCost('wall', b.towers.length);
  if (G.me.gold < cost) {
    if (!quiet) { UI.toast('För lite guld'); Audio.sfx.denied(); }
    return false;
  }
  const check = canBuild(b, cx, cy);
  if (!check.ok) {
    if (!quiet) { UI.toast(check.why); Audio.sfx.denied(); }
    return false;
  }
  G.me.gold -= cost;
  b.towers.push({
    type: 'wall', cx, cy, lv: 0, branch: null,
    cd: 0, recoil: 0, invested: cost, angle: -1.57, flash: 0,
  });
  rebuildSolid(b);
  addFx(b, 'ring', cx, cy, TOWERS.wall.color, 0.9);
  Audio.sfx.build();
  Audio.buzz(8);
  UI.updateHUD();
  return true;
}

function cellFromEvent(e) {
  const rect = CV.getBoundingClientRect();
  return R.pickCell(R.L.me, e.clientX - rect.left, e.clientY - rect.top);
}

CV.addEventListener('pointerdown', e => {
  if (!G || G.over) return;
  if (G.view !== 'def') { UI.closeSheets(); return; }
  const hit = cellFromEvent(e);
  if (!hit) { UI.closeSheets(); return; }

  const tw = towerAt(G.me.board, hit.cx, hit.cy);
  if (tw) {
    UI.closeSheets();
    G.sel = { cx: hit.cx, cy: hit.cy, tower: tw };
    UI.openTower(tw);
    return;
  }
  UI.closeSheets();
  painting = true;
  G.buildHint = true;
  lastPaint = hit;
  tryBuildAt(hit.cx, hit.cy, false);
});

CV.addEventListener('pointermove', e => {
  if (!painting || !G || G.over) return;
  const hit = cellFromEvent(e);
  if (!hit) return;
  if (lastPaint && lastPaint.cx === hit.cx && lastPaint.cy === hit.cy) return;
  lastPaint = hit;
  tryBuildAt(hit.cx, hit.cy, true);   // tyst under dragning
});

for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) {
  CV.addEventListener(ev, () => { painting = false; if (G) G.buildHint = false; });
}

window.addEventListener('resize', () => {
  R.resize();

});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && G && !G.over && G.mode === 'campaign' && !G.paused) togglePause();
  if (document.hidden) Audio.stopMusic();
  else if (G && !G.over && !G.paused) Audio.startMusic();
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
  /* Ett fel i ritningen får inte döda spelet. Det har hänt två gånger att en
     saknad funktion kastade mitt i drawFrame, och då slutade hela canvasen
     uppdateras — allt blev vitt. Nu loggas felet en gång och loopen lever
     vidare, så man ser åtminstone vad som gick sönder. */
  try {
    R.drawFrame(G);
  } catch (err) {
    if (!loop._warned) {
      loop._warned = true;
      console.error('Ritfel — spelet fortsätter men bilden kan sakna delar:', err);
    }
  }
}

/* ============================================================
   Boot
   ============================================================ */
UI.initUI({
  send, upgradeSend, build, upgradeTower, sellTower, research,
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

/* Ljud får bara startas från en riktig användargest. Vi hakar på den
   allra första och släpper sedan lyssnaren. */
document.addEventListener('pointerdown', () => Audio.unlock(), { capture: true, once: true });

/* iOS Safari struntar i user-scalable=no. Utan det här zoomar sidan när man
   trycker snabbt flera gånger i sendbaren, vilket är exakt vad man gör. */
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(ev, e => e.preventDefault(), { passive: false });
}
document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });

// Felsökningskrok: window.NW.G i konsolen ger hela speltillståndet.
window.NW = {
  get G() { return G; },
  hurtMe, endMatch,
  /* Låter ett testskript driva spelklockan manuellt. Panelen som spelet
     körs i under utveckling fryser requestAnimationFrame, så utan den här
     går det inte att spela igenom en match automatiskt. */
  step(dt) { if (G && !G.over && !G.paused) update(dt); },
  run(seconds, dt = 1 / 30) {
    let n = 0;
    for (let t = 0; t < seconds && G && !G.over; t += dt) { update(dt); n++; }
    return n;
  },
};

R.initRender(CV);

document.getElementById('mmName').value = UI.loadName();
Net.connect({ onMessage: onNetMessage, onStatus: () => {} });
UI.showMenu('campaign');
requestAnimationFrame(loop);
