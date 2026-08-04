import {
  MAPS, TOWERS, TOWER_KEYS, CREEPS, CREEP_KEYS, ECON, BASE_LEVELS, MAX_TOWER_LV,
  buildCost, sendUpCost, creepIncome, waveHpMul, towerStat, towerFace, needsBranch,
  BRANCH_KEYS, RESEARCH, researchCost, requiredResearch, creepUnlocked, applyDiff,
  CHAIN,
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
let lifeT = 0;

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

function newMatch({ mode, mapIndex, foeName, net }) {
  const M = MAPS[mapIndex];
  G = {
    mode, mapIndex, map: M,
    time: 0, wave: 0, waveT: ECON.waveInterval, incT: ECON.incInterval,
    sendCd: 0, prep: ECON.prepTime, speed: 1, paused: false, over: false,
    view: 'def', sel: null, buildHint: false, previewRange: 0,
    buildFade: 0, hoverCell: null, hoverOk: true,
    me: makeSide('DU'),
    foe: makeSide(foeName || M.ai.nm),
    /* Ringen. null i kampanjen, annars vem jag anfaller, vem som anfaller
       mig och hur många som fortfarande lever. Kedjan och vanlig 1v1 är
       samma sak — 1v1 är bara en ring med två länkar, där mitt mål och min
       anfallare råkar vara samma person. */
    net: net || null,
  };
  towerSig = '';   // ny match, tvinga fram en full tornlista i första snapshoten
  G.me.board = makeBoard(M);
  G.foe.board = makeBoard(M);

  if (mode === 'campaign') initAI(G.foe, applyDiff(M.ai, UI.getDiff()), G.foe.board);
  else { G.foe.board.remote = true; G.foe.board._map = new Map(); }

  UI.setState(G);
  UI.hideOverlays();
  UI.setViewTabs('def');
  UI.refreshSendbar();
  UI.updateRing(G);
  UI.updateHUD();
  const kedja = net && net.kind === 'chain';
  document.getElementById('sector').textContent =
    mode === 'campaign' ? `SEKTOR ${mapIndex + 1} · ${M.name}`
      : kedja ? `KEDJA ${net.size} · ${M.name}`
      : `ONLINE · ${M.name}`;

  UI.banner(
    mode === 'campaign' ? `SEKTOR ${mapIndex + 1}` : kedja ? `KEDJAN · ${net.size} SPELARE` : 'MATCH',
    kedja ? `Du anfaller ${G.foe.name} · ${net.attacker} anfaller dig` : `${M.name} · ${G.foe.name}`);
  snapT = 0;
  lifeT = 0;
  R.resize();
  Audio.unlock();
  Audio.startMusic();
}

/* Ringen har ändrats: matchen startade, eller någon slogs ut och grannarna
   fick nya platser. Byter jag mål måste fjärrbanan börja om från noll —
   snapshoten från den nya spelaren beskriver en helt annan bana. */
function applyRing(m) {
  if (!G || !G.net) return;
  const n = G.net;
  const bytteMal = n.targetId && m.targetId && n.targetId !== m.targetId;
  n.alive = m.alive;
  n.ring = m.ring || n.ring;
  n.attacker = m.attacker;
  n.attackerId = m.attackerId;
  n.targetId = m.targetId;

  if (bytteMal) {
    G.foe = makeSide(m.target);
    G.foe.board = makeBoard(G.map);
    G.foe.board.remote = true;
    G.foe.board._map = new Map();
    UI.banner('NYTT MÅL', `${m.target} · ${m.attacker} anfaller dig`);
    Audio.sfx.wave(0);
  } else {
    G.foe.name = m.target;
  }
  UI.updateRing(G);
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
    G.foe.gold += G.foe.income * (G.foe.cfg?.eco || 1);
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
    onLeak: (n, igenom) => hurtMe(n, igenom),
    onFire: st => Audio.sfx.shoot(st.dmgType),
    onImpact: st => { if (st.splash) Audio.sfx.boom(st.splash); },
  });

  /* Bygglägets overlay tonar in och ut på 150 ms i stället för att blinka. */
  const target = G.buildHint ? 1 : 0;
  const step = dt / 0.15;
  G.buildFade += Math.sign(target - G.buildFade) * Math.min(step, Math.abs(target - G.buildFade));

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

function hurtMe(n, igenom) {
  if (G.over) return;
  G.me.board.lives -= n;
  UI.alertTab('def');
  Audio.sfx.leak();
  Audio.buzz([28, 40, 28]);
  // I kampanjen sköter vi båda sidor; online måste motståndaren få veta.
  if (G.mode === 'campaign') steal(G.foe, n);
  else Net.send({ t: 'steal', n });
  passOn(igenom);
  if (G.me.board.lives <= 0) {
    G.me.board.lives = 0;
    if (G.mode === 'online') { Net.send({ t: 'lose' }); endMatch(false, G.net ? G.net.alive : 2); }
    else endMatch(false);
  }
}

/* Läckan rullar vidare. En creep som tar sig igenom min bana dör inte —
   den fortsätter in hos den jag anfaller, med den hälsa den hade kvar när
   den gick igenom. Jag förlorar liv på den ändå, men klarar inte grannen
   den heller får jag liven tillbaka från dem. Det är hela poängen med
   kedjan: trycket vandrar runt ringen i stället för att ta slut hos den
   som råkade läcka först. */
function passOn(igenom) {
  if (!igenom || !igenom.length) return;
  if (!G.net || G.net.kind !== 'chain') return;
  const tak = CHAIN.maxHops(G.net.alive);
  let n = 0;
  for (const c of igenom) {
    if (c.hop >= tak) continue;
    Net.send({ t: 'pass', key: c.type, lv: c.lv, hop: c.hop + 1, frac: c.frac, wave: G.wave });
    n++;
  }
  if (n) addFloat(G.me.board, G.me.board.exit[0], G.me.board.exit[1], `→ ${G.foe.name}`, '#ff9d54');
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
    cd: 0, recoil: 0, invested: cost, angle: -1.57, flash: 0, hp: cost * 60, maxHp: cost * 60,
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
  // Livet följer investeringen, så ett uppgraderat torn tål mer belägring.
  tw.maxHp = tw.invested * 60;
  tw.hp = tw.maxHp;
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

/* Paus och hastighet har ingen knapp längre. Funktionerna finns kvar för
   testharnessen och för att spelet pausar av sig självt när fliken göms —
   men spelet har ett tempo, och en pausknapp mitt i tummens väg blev mest
   tryckt av misstag. */
function togglePause() {
  if (!G || G.over || G.mode === 'online') return;
  G.paused = !G.paused;
  if (G.paused) { UI.banner('PAUSAT', ''); Audio.stopMusic(); }
  else Audio.startMusic();
}

function cycleSpeed() {}

/* ============================================================
   Slut på match
   ============================================================ */
function endMatch(win, place) {
  if (G.over) return;
  G.over = true;
  Audio.stopMusic();
  if (win) Audio.sfx.win(); else Audio.sfx.lose();
  const cleared = UI.loadCleared();
  if (win && G.mode === 'campaign') {
    cleared.add(G.mapIndex);
    UI.saveCleared(cleared);
  }
  const kedja = !!(G.net && G.net.kind === 'chain');
  const mins = Math.floor(G.time / 60), secs = Math.floor(G.time % 60);
  const stats = [
    { k: 'TID', v: `${mins}:${String(secs).padStart(2, '0')}` },
    { k: 'SKICKADE', v: G.me.sent },
    { k: 'KILLS', v: G.me.kills },
    { k: 'INKOMST', v: Math.round(G.me.income) },
    { k: 'LIV KVAR', v: Math.max(0, G.me.board.lives) },
  ];
  if (kedja && place) stats.unshift({ k: 'PLACERING', v: `${place}/${G.net.size}` });

  UI.showEnd({
    win,
    title: win ? (kedja ? 'SISTA KVAR' : 'SEGER') : (kedja ? 'UTSLAGEN' : 'GENOMBRUTEN'),
    sub: kedja
      ? (win
        ? `Du stod kvar när ringen var tom. ${G.net.size} spelare, du blev ettan.`
        : `Din nexus föll. Du kom ${place || '?'}:a av ${G.net.size} — kedjan spelar vidare utan dig.`)
      : win
        ? `Du bröt igenom ${G.foe.name}s försvar.`
        : `Din nexus föll. ${G.mode === 'campaign' ? 'Tips: bygg färre torn men uppgradera dem — nivå 6 ger ~14× DPS mot nivå 1.' : ''}`,
    stats,
    showNext: win && G.mode === 'campaign' && G.mapIndex < MAPS.length - 1,
  });
}

/* ============================================================
   Online
   ============================================================ */
/* Tornen ändras sällan men är dyra att skicka. Vi jämför mot en signatur och
   skickar listan bara när något faktiskt byggts, uppgraderats eller rivits.
   null betyder "oförändrat" och tolkas så av mottagaren. */
let towerSig = '';
function towerDelta(b) {
  const rows = b.towers.map(t => [TOWER_KEYS.indexOf(t.type), t.cx, t.cy, t.lv, t.branch === 'b' ? 1 : 0]);
  const sig = rows.map(r => r.join(',')).join(';');
  if (sig === towerSig) return null;
  towerSig = sig;
  return rows;
}

function snapshot() {
  const b = G.me.board;
  return {
    l: b.lives,
    // Motståndarens inkomst fanns aldrig med i snapshoten, så siffran i
    // HUD:en stod still hela matchen online. Kapplöpningen i ekonomi är
    // hela spelet — den måste synas.
    i: Math.round(G.me.income),
    tw: towerDelta(b),
    /* Döende creeps hör inte hemma i snapshoten. De ligger kvar lokalt för
       dödsanimationen, men skickade vi dem växte meddelandet i takt med hur
       mycket som dödades — och när det blev stort nog kom det inte fram
       alls, vilket är varför motståndarens creeps försvann mitt i ett
       anfall. Taket är en sista säkring. */
    /* Inget tak längre. Ett tak dolde creeps, men det som faktiskt fick vyn
       att sluta uppdatera var storleken: tornen skickades i sin helhet sex
       gånger i sekunden, och efter tjugo minuter är det sextio torn plus
       hundratals creeps i varje meddelande. Tornen skickas nu bara när de
       ändrats — se tw ovan — och creepsen bantas till en decimal. */
    cr: b.creeps.filter(c => c.t >= 0 && !c.dead).map(c => [
      c.id, CREEP_KEYS.indexOf(c.type), +c.x.toFixed(1), +c.y.toFixed(1),
      +(c.hp / c.maxHp).toFixed(2), c.lv, c.slow > 0 ? 1 : 0, +c.t.toFixed(1),
    ]),
  };
}

function applySnapshot(s) {
  if (!G || G.mode !== 'online') return;
  const b = G.foe.board;
  b.lives = s.l;
  if (s.i !== undefined) G.foe.income = s.i;
  if (s.tw) b.towers = s.tw.map(a => ({
    type: TOWER_KEYS[a[0]], cx: a[1], cy: a[2], lv: a[3],
    branch: a[3] >= BASE_LEVELS ? (a[4] ? 'b' : 'a') : null,
    cd: 0, invested: 0, angle: -1.57, flash: 0,
  }));
  // Fältet räknas bara om när tornen faktiskt ändrats.
  if (s.tw) rebuildSolid(b);
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

/* Det som ska ut på nätet varje bildruta. Ligger utanför loopen så att
   testkroken nedan kan driva en hel match manuellt — panelen spelet körs i
   under utveckling fryser requestAnimationFrame, och utan det här hade
   snapshots och livräknare aldrig gått iväg när man stegar fram för hand. */
function netTick(dt) {
  if (!G || G.mode !== 'online' || G.over) return;
  snapT -= dt;
  if (snapT <= 0) { snapT = 1 / 6; Net.send({ t: 'snap', s: snapshot() }); }
  /* Snapshoten går bara bakåt till min anfallare, så i en kedja skulle
     ingen annan se hur det går för mig. Livräknaren är billig nog att
     skicka till hela ringen en gång i sekunden — och det är den siffran
     man behöver för att veta om trycket är på väg mot en. */
  lifeT -= dt;
  if (lifeT <= 0) { lifeT = 1; Net.send({ t: 'life', l: Math.max(0, G.me.board.lives) }); }
}

function onNetMessage(m) {
  switch (m.t) {
    case 'lobby':
      UI.showLobby(m);
      break;

    case 'match':
      newMatch({
        mode: 'online',
        mapIndex: m.mapIndex,
        foeName: m.target || 'MOTSTÅNDARE',
        net: {
          kind: m.mode === 'chain' ? 'chain' : 'duel',
          size: m.size || 2, seat: m.seat || 0, myId: m.id,
          alive: m.alive || m.size || 2,
          ring: m.ring || [],
          targetId: m.targetId, attacker: m.attacker, attackerId: m.attackerId,
        },
      });
      break;

    case 'ring':
      applyRing(m);
      break;

    case 'send':
      if (G && G.mode === 'online' && !G.over) {
        spawn(G.me.board, m.key, waveHpMul(m.wave ?? G.wave), m.lv || 0);
        UI.alertTab('def');
      }
      break;

    /* En creep som redan tagit sig igenom någon annans bana. Den kommer in
       med sin kvarvarande hälsa och en räknare på hur många banor den
       passerat — en i taget, även för typer som normalt spawnar i par. */
    case 'pass':
      if (G && G.mode === 'online' && !G.over) {
        spawn(G.me.board, m.key, waveHpMul(m.wave ?? G.wave), m.lv || 0,
          { hpMul: m.frac || 1, count: 1, hop: m.hop || 0 });
        UI.alertTab('def');
        UI.toast(`Läcka vidare från ${m.fromName || 'ringen'}`);
      }
      break;

    case 'snap':
      applySnapshot(m.s);
      break;

    case 'steal':
      // Den jag anfaller läckte — jag vinner lika många liv som de förlorade.
      if (G && G.mode === 'online' && !G.over) {
        G.me.board.lives = Math.min(ECON.maxLives, G.me.board.lives + (m.n || 0));
        addFloat(G.me.board, 4, 7, '+' + m.n + ' LIV', '#4fd8eb');
      }
      break;

    case 'lives':
      if (G && G.net) {
        const r = G.net.ring.find(p => p.id === m.id);
        if (r) { r.lives = m.l; UI.updateRing(G); }
      }
      break;

    case 'out':
      if (G && G.net && !G.over) {
        G.net.alive = m.alive;
        G.net.ring = G.net.ring.filter(p => p.id !== m.id);
        UI.updateRing(G);
        UI.toast(m.reason === 'left' ? `${m.name} lämnade (${m.place}:a)` : `${m.name} slogs ut — ${m.place}:a plats`);
      }
      break;

    /* Placeringen räknas ut lokalt i samma stund banan faller, så slutskärmen
       inte behöver vänta på ett svar som kanske aldrig kommer. Faller två
       banor i samma ögonblick har båda räknat samma siffra — servern har
       sista ordet och rättar den i efterhand. */
    case 'eliminated':
      if (G && !G.over) { G.me.board.lives = 0; endMatch(false, m.place); }
      else if (G && G.net) UI.setPlacement(m.place, G.net.size);
      break;

    case 'win':
      if (G && !G.over) { G.foe.board.lives = 0; endMatch(true, 1); }
      break;

    case 'cancelled':
      break;
  }
}

function findMatch(name, kind, size) {
  if (!Net.isOpen()) { UI.toast('Ingen kontakt med servern'); return; }
  UI.saveName(name);
  Net.send({ t: 'find', name, mode: kind === 'chain' ? 'chain' : 'duel', size });
  UI.showLobby({ mode: kind, size, have: 1, need: size - 1, names: [name] });
}

function cancelMatch() { Net.send({ t: 'cancel' }); }

function leave() {
  if (G && G.mode === 'online') Net.send({ t: 'leave' });
  Audio.stopMusic();
  G = null;
  UI.setState(null);
  UI.updateRing(null);
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
    cd: 0, recoil: 0, invested: cost, angle: -1.57, flash: 0, hp: cost * 60, maxHp: cost * 60,
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
  setHover(hit);
  tryBuildAt(hit.cx, hit.cy, false);
});

/* Markören visar var tornet hamnar och om rutan duger — grönt eller rött
   innan man släpper, i stället för att man får gissa. */
function setHover(hit) {
  if (!hit) { G.hoverCell = null; return; }
  G.hoverCell = hit;
  const b = G.me.board;
  G.hoverOk = !towerAt(b, hit.cx, hit.cy)
    && G.me.gold >= buildCost('wall', b.towers.length)
    && canBuild(b, hit.cx, hit.cy).ok;
}

CV.addEventListener('pointermove', e => {
  if (!painting || !G || G.over) return;
  const hit = cellFromEvent(e);
  if (!hit) return;
  setHover(hit);
  if (lastPaint && lastPaint.cx === hit.cx && lastPaint.cy === hit.cy) return;
  lastPaint = hit;
  tryBuildAt(hit.cx, hit.cy, true);   // tyst under dragning
});

for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) {
  CV.addEventListener(ev, () => { painting = false; if (G) { G.buildHint = false; G.hoverCell = null; } });
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

/* Simuleringen drivs av VÄGGKLOCKAN, inte av hur ofta loopen råkar anropas.
   Tidigare klipptes varje kliv till 0,25 s, vilket i praktiken betydde att
   all tid man varit borta kastades bort: gömde man fliken stannade banan,
   och när man kom tillbaka fortsatte den som om ingenting hänt. I kampanjen
   är det en paus och helt rimligt. Online är det fusk — creepsen står still,
   man läcker inte, och den som anfaller en ser en fryst ANFALL-vy.

   Nu sparas den förflutna tiden i stället och betas av i fasta kliv.
   Två tak håller det hanterbart:
     MAX_EFTERSLAP  hur mycket speltid vi över huvud taget sparar. Är man
                    borta längre än så efterskänks resten — annars kunde en
                    telefon som legat i fickan i tjugo minuter komma tillbaka
                    till en match som är avgjord utan att man sett den.
     MAX_KLIV       hur många kliv ett enda anrop får ta, så tråden aldrig
                    låser sig medan efterslapet betas av.                  */
const MAX_EFTERSLAP = 30;
const MAX_KLIV = 1800;           // = MAX_EFTERSLAP i fasta kliv

let sistTick = performance.now(), acc = 0;

function advance(now) {
  const real = Math.max(0, (now - sistTick) / 1000);
  sistTick = now;
  if (!G || G.paused || G.over) return;
  acc = Math.min(MAX_EFTERSLAP, acc + real * G.speed);
  let n = 0;
  while (acc >= STEP && n++ < MAX_KLIV) { update(STEP); acc -= STEP; }
  netTick(real);
}

function loop(now) {
  requestAnimationFrame(loop);
  advance(now);
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

/* Vakthund. requestAnimationFrame slutar helt att anropas i en gömd flik —
   och i vissa inbäddade vyer även när fliken syns. Den här timern mäter hur
   länge sedan loopen gick, och tar över simuleringen om den tystnat. Den
   ritar ingenting och rör inte HUD:en; ingen tittar ändå.

   Bara online. I kampanjen är en gömd flik en paus, och det är meningen.

   Webbläsare bromsar setInterval till ungefär en gång i sekunden i bakgrunden,
   men det spelar ingen roll: advance() räknar på verklig förfluten tid, så
   ett glest anrop hinner ikapp lika mycket som många täta. */
setInterval(() => {
  if (!G || G.mode !== 'online' || G.over || G.paused) return;
  const now = performance.now();
  if (now - sistTick < 250) return;      // loopen lever — låt den vara
  advance(now);
}, 200);

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
    if (G.mode === 'online') {
      const tillbaka = G.net && G.net.kind === 'chain' ? 'chain' : 'online';
      leave();
      UI.showMenu(tillbaka);
      return;
    }
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
  build: (x, y) => tryBuildAt(x, y, true),
  send: key => send(key),
  /* Låter ett testskript driva spelklockan manuellt. Panelen som spelet
     körs i under utveckling fryser requestAnimationFrame, så utan den här
     går det inte att spela igenom en match automatiskt. */
  step(dt) { if (G && !G.over && !G.paused) { update(dt); netTick(dt); UI.updateHUD(); } },
  run(seconds, dt = 1 / 30) {
    let n = 0;
    for (let t = 0; t < seconds && G && !G.over; t += dt) { update(dt); netTick(dt); n++; }
    if (G) UI.updateHUD();
    return n;
  },
};

R.initRender(CV);

document.getElementById('mmName').value = UI.loadName();
Net.connect({ onMessage: onNetMessage, onStatus: () => {} });
UI.showMenu('campaign');
requestAnimationFrame(loop);
