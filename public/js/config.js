/* ============================================================
   NEXUS WARS — balans & speldata
   All tuning bor här. Rör inget annat för att ändra känslan.
   ============================================================ */

export const COLS = 9;
export const ROWS = 14;

/* ---------- ekonomi ----------
   Grundproblemet i v1: varje skickad creep gav +1 inkomst för 8 guld,
   och man kunde hålla inne knappen och skicka 4/sek. Inkomsten sprang
   iväg till +2000/tick medan tornen låg kvar på max nivå 4.
   Nu: inkomst = 5% av creep-kostnaden, global sändcooldown, och
   torn som skalar ~2x DPS per nivå i sex nivåer.                     */
export const ECON = {
  /* Guldskalan är medvetet "stor" (hundratal, inte tiotal). Med små tal blev
     inkomsten per creep 1 för både SVÄRM och GRUNT efter avrundning, och då
     försvinner hela valet mellan billig och dyr creep. */
  startGold: 1040,
  startIncome: 48,       // guld per inkomsttick
  incInterval: 5,        // sekunder mellan inkomsttick
  /* Andel av creepkostnaden som blir permanent inkomst.
     Detta är spelets känsligaste siffra: inkomsten växer exponentiellt med
     den. 0.20 (v1) gav återbetalning på 25 s och inkomst i tiotusental.
     0.05 ger återbetalning på ~100 s — att skicka blir en investering man
     måste väga mot att bygga, inte gratis pengar. */
  incomeRate: 0.05,
  sendCooldown: 1.0,     // sekunder mellan sändningar (kön hanterar resten)
  queueMax: 6,
  buildTax: 1.05,        // varje torn du äger gör nästa torn 5% dyrare
  waveInterval: 30,      // sekunder mellan HP-vågor
  waveHp: 1.26,          // HP-multiplikator per våg
  maxSendLv: 5,
  sendUpHp: 0.35,        // +35% HP per nivå på den creeptypen
  sendUpCost: (cost, lv) => Math.round(cost * 4 * Math.pow(1.7, lv)),
  lives: 20,
  sellRate: 0.75,
};

/* ---------- banor ---------- */
export const MAPS = [
  {
    name: 'ORMEN', short: 'Lång slingrande bana',
    ai: { nm: 'WARDEN-1', iq: 0.45, aggr: 0.35, tick: 1.5, bank: 0.35 },
    wp: [[0,1],[7,1],[7,4],[1,4],[1,7],[7,7],[7,10],[1,10],[1,13]],
  },
  {
    name: 'SICKSACK', short: 'Tätare svängar',
    ai: { nm: 'WARDEN-2', iq: 0.6, aggr: 0.45, tick: 1.3, bank: 0.3 },
    wp: [[0,2],[6,2],[6,5],[2,5],[2,8],[6,8],[6,11],[0,11]],
  },
  {
    name: 'SPIRALEN', short: 'Spiral mot mitten',
    ai: { nm: 'HELIX', iq: 0.75, aggr: 0.55, tick: 1.1, bank: 0.28 },
    wp: [[0,0],[8,0],[8,13],[0,13],[0,3],[5,3],[5,10],[2,10],[2,6]],
  },
  {
    name: 'KORSELDEN', short: 'Kort — svårt att hinna',
    ai: { nm: 'RAZOR', iq: 0.88, aggr: 0.65, tick: 0.95, bank: 0.25 },
    wp: [[0,3],[5,3],[5,7],[8,7],[8,11],[2,11],[2,13]],
  },
  {
    name: 'GATLOPPET', short: 'Extremt kort bana',
    ai: { nm: 'OMEGA', iq: 1.0, aggr: 0.8, tick: 0.8, bank: 0.22 },
    wp: [[0,5],[4,5],[4,10],[8,10]],
  },
];

/* ---------- torn ----------
   lv[0].cost = byggkostnad, övriga = uppgraderingskostnad.
   DPS fördubblas ungefär per nivå medan kostnaden går ×1.7.
   Att uppgradera ett torn till nivå 6 ger ~1.4 DPS/guld;
   att bygga sex nya nivå 1-torn ger ~0.7. Uppgradering vinner alltid. */
export const TOWERS = {
  pulse: {
    name: 'PULS', color: '#4fd8eb', shape: 'tri', tag: 'Enkelmål · snabb',
    desc: 'Hög eldhastighet. Straffas hårt av pansar.',
    lv: [
      { cost: 160,  dmg: 10,  rate: 0.35, range: 2.4 },
      { cost: 220,  dmg: 21,  rate: 0.32, range: 2.5 },
      { cost: 380,  dmg: 44,  rate: 0.30, range: 2.6 },
      { cost: 680,  dmg: 92,  rate: 0.28, range: 2.8 },
      { cost: 1200, dmg: 195, rate: 0.26, range: 3.0 },
      { cost: 2160, dmg: 420, rate: 0.24, range: 3.2 },
    ],
  },
  blast: {
    name: 'BLAST', color: '#ff9d54', shape: 'hex', tag: 'Splash · pansarbryt',
    desc: 'Träffar allt i en radie. Ignorerar halva pansaret.',
    lv: [
      { cost: 280,  dmg: 28,  rate: 1.10, range: 2.2, splash: 1.0,  pierce: 0.5 },
      { cost: 380,  dmg: 55,  rate: 1.05, range: 2.3, splash: 1.1,  pierce: 0.5 },
      { cost: 660,  dmg: 112, rate: 1.00, range: 2.5, splash: 1.2,  pierce: 0.5 },
      { cost: 1160, dmg: 230, rate: 0.95, range: 2.7, splash: 1.35, pierce: 0.5 },
      { cost: 2000, dmg: 470, rate: 0.90, range: 2.9, splash: 1.5,  pierce: 0.5 },
      { cost: 3520, dmg: 980, rate: 0.85, range: 3.1, splash: 1.7,  pierce: 0.5 },
    ],
  },
  cryo: {
    name: 'KRYO', color: '#9bd8ff', shape: 'dia', tag: 'Sakta ner',
    desc: 'Låg skada men håller kvar creeps i eldzonen.',
    lv: [
      { cost: 240,  dmg: 6,   rate: 0.80, range: 2.3, slow: 0.35, slowT: 1.5 },
      { cost: 320,  dmg: 13,  rate: 0.75, range: 2.4, slow: 0.42, slowT: 1.7 },
      { cost: 560,  dmg: 27,  rate: 0.70, range: 2.6, slow: 0.48, slowT: 1.9 },
      { cost: 980,  dmg: 56,  rate: 0.65, range: 2.8, slow: 0.55, slowT: 2.1 },
      { cost: 1680, dmg: 118, rate: 0.60, range: 3.0, slow: 0.62, slowT: 2.3 },
      { cost: 2960, dmg: 245, rate: 0.55, range: 3.2, slow: 0.70, slowT: 2.6 },
    ],
  },
  arc: {
    name: 'ARC', color: '#a78bfa', shape: 'star', tag: 'Kedjeblixt',
    desc: 'Hoppar mellan creeps. Krossar svärmar.',
    lv: [
      { cost: 440,  dmg: 32,   rate: 1.00, range: 2.6, chain: 3 },
      { cost: 600,  dmg: 62,   rate: 0.95, range: 2.7, chain: 3 },
      { cost: 1040, dmg: 125,  rate: 0.90, range: 2.9, chain: 4 },
      { cost: 1800, dmg: 255,  rate: 0.85, range: 3.1, chain: 5 },
      { cost: 3120, dmg: 520,  rate: 0.80, range: 3.3, chain: 6 },
      { cost: 5400, dmg: 1060, rate: 0.75, range: 3.5, chain: 7 },
    ],
  },
  rail: {
    name: 'RAIL', color: '#ffd166', shape: 'cross', tag: 'Lång räckvidd',
    desc: 'Extrem räckvidd och skada, men långsam. Ignorerar pansar.',
    lv: [
      { cost: 400,  dmg: 60,   rate: 1.60, range: 4.2, pierce: 1 },
      { cost: 560,  dmg: 122,  rate: 1.50, range: 4.4, pierce: 1 },
      { cost: 960,  dmg: 250,  rate: 1.40, range: 4.6, pierce: 1 },
      { cost: 1680, dmg: 510,  rate: 1.30, range: 4.9, pierce: 1 },
      { cost: 2920, dmg: 1040, rate: 1.20, range: 5.2, pierce: 1 },
      { cost: 5120, dmg: 2150, rate: 1.10, range: 5.6, pierce: 1 },
    ],
  },
};

export const TOWER_KEYS = Object.keys(TOWERS);
export const MAX_TOWER_LV = 6;

/* ---------- creeps ----------
   unlock = inkomsten du måste ha nått för att få skicka typen.
   Det gör att matchen har en naturlig upptrappning i stället för
   att alla spammar den billigaste creepen hela vägen.               */
export const CREEPS = {
  swarm: {
    nm: 'SVÄRM', shape: 'blob', color: '#ff9d54',
    hp: 14, spd: 2.1, r: 0.15, cost: 64, bounty: 8, leak: 1, count: 4, unlock: 0,
    note: '4 st · billigast att komma igång med',
  },
  grunt: {
    nm: 'GRUNT', shape: 'blob', color: '#ff5d73',
    hp: 55, spd: 1.5, r: 0.25, cost: 96, bounty: 20, leak: 1, unlock: 0,
    note: 'Allround · bäst HP per guld',
  },
  runner: {
    nm: 'LÖPARE', shape: 'dart', color: '#ffd166',
    hp: 34, spd: 3.1, r: 0.20, cost: 120, bounty: 20, leak: 1, unlock: 90,
    note: 'Springer förbi långsamma torn',
  },
  regen: {
    nm: 'REGEN', shape: 'blob', color: '#3ddc97',
    hp: 130, spd: 1.4, r: 0.27, cost: 220, bounty: 40, leak: 2, regen: 9, unlock: 170,
    note: 'Läker 9 HP/s — kräver burstskada',
  },
  brute: {
    nm: 'BJÄSSE', shape: 'tank', color: '#c05be0',
    hp: 260, spd: 1.0, r: 0.34, cost: 320, bounty: 56, leak: 2, armor: 5, unlock: 280,
    note: 'Pansar 5 — dödar PULS-strategier',
  },
  boss: {
    nm: 'BOSS', shape: 'boss', color: '#ff3b5c',
    hp: 1500, spd: 0.8, r: 0.42, cost: 880, bounty: 180, leak: 4, armor: 14, unlock: 560,
    note: 'Pansar 14 · tar 4 liv',
  },
};

export const CREEP_KEYS = Object.keys(CREEPS);

export const creepIncome = key => Math.round(CREEPS[key].cost * ECON.incomeRate);
export const sendUpCost = (key, lv) => ECON.sendUpCost(CREEPS[key].cost, lv);
export const sendHpMul = lv => Math.pow(1 + ECON.sendUpHp, lv);
export const waveHpMul = wave => Math.pow(ECON.waveHp, wave);
export const buildCost = (key, towerCount) =>
  Math.round(TOWERS[key].lv[0].cost * Math.pow(ECON.buildTax, towerCount));
