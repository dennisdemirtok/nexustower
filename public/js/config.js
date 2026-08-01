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

/* ============================================================
   SKADETYPER × PANSARKLASSER
   Hjärtat i taktiken, som i WC3: inget torn är bra mot allt.
   Motståndaren ser vad du bygger och skickar det du är svag mot.
   ============================================================ */
export const DMG = {
  kin: { nm: 'KINETISK',  color: '#4fd8eb', short: 'KIN' },
  spr: { nm: 'SPRÄNG',    color: '#ff9d54', short: 'SPR' },
  ter: { nm: 'TERMISK',   color: '#ff6b3d', short: 'TER' },
  kry: { nm: 'KRYO',      color: '#9bd8ff', short: 'KRY' },
  ele: { nm: 'ELEKTRISK', color: '#a78bfa', short: 'ELE' },
  sik: { nm: 'SIKTAD',    color: '#ffd166', short: 'SIK' },
};

export const ARMOR = {
  latt: { nm: 'LÄTT',   glyph: '○', color: '#ffb454', desc: 'Snabba, tunna kroppar' },
  tung: { nm: 'TUNG',   glyph: '◍', color: '#3ddc97', desc: 'Tjock massa, ingen sköld' },
  pans: { nm: 'PANSAR', glyph: '⬢', color: '#c05be0', desc: 'Platta på platta' },
  flyg: { nm: 'FLYG',   glyph: '▲', color: '#66e0ff', desc: 'Flyger rakt över banan' },
};

/* Multiplikator på skadan. 1.00 = normal.
   Läs raden: "vad är mitt torn bra mot".
   Läs kolumnen: "vad ska jag skicka mot deras torn".            */
export const TYPE_VS = {
  kin: { latt: 1.15, tung: 0.90, pans: 0.60, flyg: 0.70 },
  spr: { latt: 1.35, tung: 1.00, pans: 1.20, flyg: 0.35 },
  ter: { latt: 1.30, tung: 1.15, pans: 0.85, flyg: 0.80 },
  kry: { latt: 1.05, tung: 1.20, pans: 0.75, flyg: 1.10 },
  ele: { latt: 1.40, tung: 0.85, pans: 0.60, flyg: 1.40 },
  sik: { latt: 0.75, tung: 1.35, pans: 1.20, flyg: 1.30 },
};

export const dmgMul = (type, cls) => (TYPE_VS[type] && TYPE_VS[type][cls]) ?? 1;

/* ---------- banor ---------- */
export const MAPS = [
  {
    name: 'ORMEN', short: 'Lång slingrande bana',
    ai: { nm: 'WARDEN-1', iq: 0.45, aggr: 0.35, tick: 1.5, bank: 0.30 },
    wp: [[0,1],[7,1],[7,4],[1,4],[1,7],[7,7],[7,10],[1,10],[1,13]],
  },
  /* Ordningen är vald efter banlängd: lång bana = starkt försvar = lättare.
     SPIRALEN har 44 rutor väg, SICKSACK 30, GATLOPPET bara 13. Tillsammans
     med AI-konfigurationerna ger det en ramp som faktiskt känns. */
  {
    name: 'SPIRALEN', short: 'Lång spiral mot mitten',
    ai: { nm: 'WARDEN-2', iq: 0.6, aggr: 0.45, tick: 1.3, bank: 0.33 },
    wp: [[0,0],[8,0],[8,13],[0,13],[0,3],[5,3],[5,10],[2,10],[2,6]],
  },
  {
    name: 'SICKSACK', short: 'Tätare svängar',
    ai: { nm: 'HELIX', iq: 0.78, aggr: 0.55, tick: 1.1, bank: 0.37 },
    wp: [[0,2],[6,2],[6,5],[2,5],[2,8],[6,8],[6,11],[0,11]],
  },
  {
    name: 'KORSELDEN', short: 'Kort — svårt att hinna',
    ai: { nm: 'RAZOR', iq: 0.9, aggr: 0.6, tick: 0.9, bank: 0.42 },
    wp: [[0,3],[5,3],[5,7],[8,7],[8,11],[2,11],[2,13]],
  },
  {
    name: 'GATLOPPET', short: 'Extremt kort bana',
    ai: { nm: 'OMEGA', iq: 1.0, aggr: 0.55, tick: 0.75, bank: 0.48 },
    wp: [[0,5],[4,5],[4,10],[8,10]],
  },
];

/* ============================================================
   TORN
   Nivå 1–3 är gemensamma. Vid nivå 4 väljer du EN av två grenar
   och tornet byter skadetyp, form och roll. Valet är permanent —
   det är där partiet avgörs.
   Totalt: 3 gemensamma + 3 i vald gren = 6 nivåer per torn.
   ============================================================ */
export const TOWERS = {
  pulse: {
    name: 'PULS', color: '#4fd8eb', shape: 'tri', dmg: 'kin',
    tag: 'Enkelmål · snabb',
    desc: 'Billig grundpjäs med hög eldhastighet.',
    lv: [
      { cost: 160, dmg: 13, rate: 0.35, range: 2.4 },
      { cost: 220, dmg: 27, rate: 0.32, range: 2.5 },
      { cost: 380, dmg: 56, rate: 0.30, range: 2.6 },
    ],
    branches: {
      a: {
        name: 'SPLITTER', color: '#4fd8eb', shape: 'tri', dmg: 'kin',
        tag: 'Träffar flera mål',
        desc: 'Delar skottet mellan flera creeps. Mal ner svärmar.',
        lv: [
          { cost: 700,  dmg: 70,  rate: 0.28, range: 2.8, multi: 2 },
          { cost: 1250, dmg: 145, rate: 0.26, range: 3.0, multi: 2 },
          { cost: 2250, dmg: 300, rate: 0.24, range: 3.2, multi: 3 },
        ],
      },
      b: {
        name: 'LANS', color: '#ffd166', shape: 'cross', dmg: 'sik',
        tag: 'Genomborrar pansar',
        desc: 'Byter till siktad skada. Straffar TUNG och PANSAR.',
        lv: [
          { cost: 720,  dmg: 165, rate: 0.40, range: 3.0 },
          { cost: 1280, dmg: 350, rate: 0.38, range: 3.2 },
          { cost: 2300, dmg: 760, rate: 0.36, range: 3.4 },
        ],
      },
    },
  },

  blast: {
    name: 'BLAST', color: '#ff9d54', shape: 'hex', dmg: 'spr',
    tag: 'Splash · marknära',
    desc: 'Träffar allt i en radie. Nästan verkningslös mot FLYG.',
    lv: [
      { cost: 280, dmg: 28,  rate: 1.10, range: 2.2, splash: 1.0 },
      { cost: 380, dmg: 55,  rate: 1.05, range: 2.3, splash: 1.1 },
      { cost: 660, dmg: 112, rate: 1.00, range: 2.5, splash: 1.2 },
    ],
    branches: {
      a: {
        name: 'BRAND', color: '#ff6b3d', shape: 'flame', dmg: 'ter',
        tag: 'Sätter eld · skada över tid',
        desc: 'Termisk skada plus brand som tickar i 3 s. Stapla inte — den förnyas.',
        lv: [
          { cost: 1200, dmg: 190, rate: 0.95, range: 2.6, splash: 1.2, burn: 70,  burnT: 3 },
          { cost: 2050, dmg: 390, rate: 0.90, range: 2.7, splash: 1.3, burn: 150, burnT: 3 },
          { cost: 3600, dmg: 800, rate: 0.85, range: 2.9, splash: 1.4, burn: 320, burnT: 3 },
        ],
      },
      b: {
        name: 'SEISMISK', color: '#ff9d54', shape: 'hex', dmg: 'spr',
        tag: 'Stor radie · skakar ner',
        desc: 'Dubbelt så stor sprängradie och en kort inbromsning.',
        lv: [
          { cost: 1180, dmg: 235,  rate: 1.00, range: 2.7, splash: 1.6, slow: 0.25, slowT: 1.2 },
          { cost: 2000, dmg: 480,  rate: 0.95, range: 2.9, splash: 1.8, slow: 0.30, slowT: 1.4 },
          { cost: 3520, dmg: 1000, rate: 0.90, range: 3.1, splash: 2.1, slow: 0.35, slowT: 1.6 },
        ],
      },
    },
  },

  cryo: {
    name: 'KRYO', color: '#9bd8ff', shape: 'dia', dmg: 'kry',
    tag: 'Saktar ner',
    desc: 'Låg skada, men håller kvar creeps i de andra tornens eldzon.',
    lv: [
      { cost: 240, dmg: 6,  rate: 0.80, range: 2.3, slow: 0.35, slowT: 1.5 },
      { cost: 320, dmg: 13, rate: 0.75, range: 2.4, slow: 0.42, slowT: 1.7 },
      { cost: 560, dmg: 27, rate: 0.70, range: 2.6, slow: 0.48, slowT: 1.9 },
    ],
    branches: {
      a: {
        name: 'FROST', color: '#9bd8ff', shape: 'dia', dmg: 'kry',
        tag: 'Extrem inbromsning',
        desc: 'Upp till 75 % långsammare. Ett FROST-torn förvandlar en kort bana till en lång.',
        lv: [
          { cost: 1000, dmg: 55,  rate: 0.65, range: 2.8, slow: 0.60, slowT: 2.2 },
          { cost: 1700, dmg: 115, rate: 0.60, range: 3.0, slow: 0.68, slowT: 2.4 },
          { cost: 3000, dmg: 240, rate: 0.55, range: 3.2, slow: 0.75, slowT: 2.6 },
        ],
      },
      b: {
        name: 'SKÄRVA', color: '#7fe8d0', shape: 'shard', dmg: 'kry',
        tag: 'Skadetorn · flera mål',
        desc: 'Offrar inbromsningen för riktig skada mot TUNG.',
        lv: [
          { cost: 980,  dmg: 90,  rate: 0.60, range: 2.8, slow: 0.32, slowT: 1.4, multi: 3 },
          { cost: 1680, dmg: 185, rate: 0.55, range: 3.0, slow: 0.35, slowT: 1.5, multi: 3 },
          { cost: 2960, dmg: 390, rate: 0.50, range: 3.2, slow: 0.38, slowT: 1.6, multi: 4 },
        ],
      },
    },
  },

  arc: {
    name: 'ARC', color: '#a78bfa', shape: 'star', dmg: 'ele',
    tag: 'Kedjeblixt',
    desc: 'Hoppar mellan creeps. Elektrisk skada äter LÄTT och FLYG.',
    lv: [
      { cost: 440,  dmg: 32,  rate: 1.00, range: 2.6, chain: 3 },
      { cost: 600,  dmg: 62,  rate: 0.95, range: 2.7, chain: 3 },
      { cost: 1040, dmg: 125, rate: 0.90, range: 2.9, chain: 4 },
    ],
    branches: {
      a: {
        name: 'STORM', color: '#a78bfa', shape: 'star', dmg: 'ele',
        tag: 'Många hopp',
        desc: 'Upp till nio mål per skott. Raderar svärmar och drönarflock.',
        lv: [
          { cost: 1850, dmg: 230, rate: 0.85, range: 3.1, chain: 6 },
          { cost: 3150, dmg: 470, rate: 0.80, range: 3.3, chain: 7 },
          { cost: 5450, dmg: 960, rate: 0.75, range: 3.5, chain: 9 },
        ],
      },
      b: {
        name: 'ÖVERLADDNING', color: '#d68bfa', shape: 'bolt', dmg: 'ele',
        tag: 'Få hopp · enorm skada',
        desc: 'Nästan all kraft i första målet. Bra mot enstaka tunga creeps.',
        lv: [
          { cost: 1800, dmg: 520,  rate: 1.10, range: 3.0, chain: 2 },
          { cost: 3100, dmg: 1080, rate: 1.05, range: 3.2, chain: 2 },
          { cost: 5400, dmg: 2250, rate: 1.00, range: 3.4, chain: 3 },
        ],
      },
    },
  },

  rail: {
    name: 'RAIL', color: '#ffd166', shape: 'cross', dmg: 'sik',
    tag: 'Lång räckvidd',
    desc: 'Täcker halva banan. Siktad skada mot TUNG, PANSAR och FLYG.',
    lv: [
      { cost: 400, dmg: 60,  rate: 1.60, range: 4.2 },
      { cost: 560, dmg: 122, rate: 1.50, range: 4.4 },
      { cost: 960, dmg: 250, rate: 1.40, range: 4.6 },
    ],
    branches: {
      a: {
        name: 'LUFTVÄRN', color: '#66e0ff', shape: 'aa', dmg: 'sik',
        tag: 'Dubbel skada mot FLYG',
        desc: 'Snabbare eldgivning och specialammunition mot luftmål.',
        lv: [
          { cost: 1700, dmg: 380,  rate: 0.95, range: 4.8, airBonus: 2.0 },
          { cost: 2950, dmg: 780,  rate: 0.90, range: 5.1, airBonus: 2.0 },
          { cost: 5150, dmg: 1600, rate: 0.85, range: 5.4, airBonus: 2.2 },
        ],
      },
      b: {
        name: 'GAUSS', color: '#ffe08a', shape: 'cross', dmg: 'sik',
        tag: 'Ignorerar all pansarklass',
        desc: 'Ren skada — inga multiplikatorer alls, varken upp eller ner.',
        lv: [
          { cost: 1720, dmg: 1150, rate: 1.35, range: 5.2, trueDmg: true },
          { cost: 2980, dmg: 2400, rate: 1.30, range: 5.6, trueDmg: true },
          { cost: 5200, dmg: 5000, rate: 1.25, range: 6.0, trueDmg: true },
        ],
      },
    },
  },
};

export const TOWER_KEYS = Object.keys(TOWERS);
export const BASE_LEVELS = 3;   // nivåer innan grenvalet
export const MAX_TOWER_LV = 6;
export const BRANCH_KEYS = ['a', 'b'];

/* Statistik för en given nivå. lv är 0-indexerad (0 = nivå 1). */
export function towerStat(type, lv, branch) {
  const d = TOWERS[type];
  if (lv < BASE_LEVELS) return d.lv[lv];
  return d.branches[branch || 'a'].lv[lv - BASE_LEVELS];
}

/* Namn, färg, form och skadetyp — byts när tornet valt gren. */
export function towerFace(type, lv, branch) {
  const d = TOWERS[type];
  if (lv < BASE_LEVELS || !branch) {
    return { name: d.name, color: d.color, shape: d.shape, dmg: d.dmg, tag: d.tag, desc: d.desc };
  }
  const b = d.branches[branch];
  return { name: b.name, color: b.color, shape: b.shape, dmg: b.dmg, tag: b.tag, desc: b.desc };
}

/* Nästa nivå kräver grenval om vi står på sista gemensamma nivån. */
export const needsBranch = tw => tw.lv === BASE_LEVELS - 1 && !tw.branch;

export function nextStat(tw, branch) {
  if (tw.lv + 1 >= MAX_TOWER_LV) return null;
  return towerStat(tw.type, tw.lv + 1, branch || tw.branch);
}

/* ============================================================
   CREEPS
   cls = pansarklass, avgör vilka torn som biter.
   fly = flyger rakt över banan i stället för att följa vägen.
   unlock = inkomsten du måste ha nått för att få skicka typen.
   ============================================================ */
export const CREEPS = {
  swarm: {
    nm: 'SVÄRM', shape: 'blob', color: '#ff9d54', cls: 'latt',
    hp: 14, spd: 2.1, r: 0.15, cost: 64, bounty: 8, leak: 1, count: 4, unlock: 0,
    note: '4 st · billigast att komma igång med',
  },
  grunt: {
    nm: 'GRUNT', shape: 'blob', color: '#ff5d73', cls: 'tung',
    hp: 60, spd: 1.5, r: 0.25, cost: 96, bounty: 20, leak: 1, unlock: 0,
    note: 'Allround · straffar KINETISK och ELEKTRISK',
  },
  runner: {
    nm: 'LÖPARE', shape: 'dart', color: '#ffd166', cls: 'latt',
    hp: 34, spd: 3.1, r: 0.20, cost: 120, bounty: 20, leak: 1, unlock: 90,
    note: 'Springer förbi långsamma torn',
  },
  drone: {
    nm: 'DRÖNARE', shape: 'wing', color: '#66e0ff', cls: 'flyg', fly: true,
    hp: 85, spd: 1.75, r: 0.22, cost: 260, bounty: 46, leak: 1, count: 2, unlock: 260,
    note: '2 st · flyger RAKT över banan och struntar i vägen',
  },
  regen: {
    nm: 'REGEN', shape: 'blob', color: '#3ddc97', cls: 'tung',
    hp: 140, spd: 1.4, r: 0.27, cost: 220, bounty: 40, leak: 2, regen: 10, unlock: 175,
    note: 'Läker 10 HP/s — kräver burstskada',
  },
  brute: {
    nm: 'BJÄSSE', shape: 'tank', color: '#c05be0', cls: 'pans',
    hp: 300, spd: 1.0, r: 0.34, cost: 320, bounty: 56, leak: 2, unlock: 280,
    note: 'PANSAR — KINETISK och ELEKTRISK studsar av',
  },
  boss: {
    nm: 'BOSS', shape: 'boss', color: '#ff3b5c', cls: 'pans',
    hp: 1700, spd: 0.8, r: 0.42, cost: 880, bounty: 180, leak: 3, unlock: 560,
    note: 'PANSAR · tar 4 liv om den kommer fram',
  },
};

export const CREEP_KEYS = Object.keys(CREEPS);

export const creepIncome = key => Math.round(CREEPS[key].cost * ECON.incomeRate);
export const sendUpCost = (key, lv) => ECON.sendUpCost(CREEPS[key].cost, lv);
export const sendHpMul = lv => Math.pow(1 + ECON.sendUpHp, lv);
export const waveHpMul = wave => Math.pow(ECON.waveHp, wave);
export const buildCost = (key, towerCount) =>
  Math.round(TOWERS[key].lv[0].cost * Math.pow(ECON.buildTax, towerCount));
