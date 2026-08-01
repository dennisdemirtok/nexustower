/* ============================================================
   NEXUS WARS — balans & speldata
   All tuning bor här. Rör inget annat för att ändra känslan.
   ============================================================ */

/* Fältet är större nu — labyrinten behöver plats att slingra på. */
export const COLS = 11;
export const ROWS = 16;

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
  startGold: 800,
  startIncome: 120,      // guld per inkomsttick

  /* 15 sekunder, som i Line Tower Wars. Med 5 s droppade det in pengar
     hela tiden och man hann aldrig bli fattig — inget tryck, inget val.
     Nu kommer en klumpsumma, man gör av med den, och sedan står man där
     och tittar på nedräkningen medan creepsen kommer. Det är tempot. */
  incInterval: 15,

  /* Byggfas innan första creepen får skickas. Utan den läcker man på nio
     sekunder — man hinner inte lägga en enda rad. WC3-TD:er har samma
     nedräkning innan våg ett. */
  prepTime: 25,
  sendCooldown: 1.0,     // sekunder mellan sändningar (kön hanterar resten)
  queueMax: 6,
  /* Ingen byggskatt längre. I en labyrint SKA man spamma billiga
     byggnader — det är så man ritar vägen. En skatt som gjorde det 7 gånger
     dyrare vid 40 torn hade dödat hela mekaniken. Guldet är gränsen. */
  buildTax: 1.0,
  waveInterval: 30,      // sekunder mellan HP-vågor
  waveHp: 1.26,          // HP-multiplikator per våg
  maxSendLv: 5,
  sendUpHp: 0.35,        // +35% HP per nivå på den creeptypen
  sendUpCost: (cost, lv) => Math.round(cost * 4 * Math.pow(1.7, lv)),
  lives: 25,

  /* Livstöld, som i LTW: den som läcker förlorar liv OCH den som skickade
     creepen vinner lika många. Summan liv i matchen är konstant, så partiet
     blir en dragkamp som faktiskt tar slut i stället för två parallella
     nedräkningar. Det är därför WC3-spelare kan stå på 83 liv mot 13.      */
  lifeSteal: true,
  maxLives: 60,

  /* Högt återköp: labyrinten ska byggas om under matchens gång.
     "Spamma grundbyggnader, sälj dem senare" är standardöppningen i LTW. */
  sellRate: 0.85,
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

/* ---------- banor ----------
   wp = korridorens MITTLINJE, w = hur många rutor bred den är.
   Creepsen sprider ut sig över hela bredden; allt utanför går att bygga på.
   Svårighetsordningen följer korridorens längd — lång korridor betyder mer
   tid i eldzonen, alltså starkare försvar och lättare bana.               */
const rocks = (...runs) => runs.flat();
const row = (y, x0, x1) => { const o = []; for (let x = x0; x <= x1; x++) o.push([x, y]); return o; };
const col = (x, y0, y1) => { const o = []; for (let y = y0; y <= y1; y++) o.push([x, y]); return o; };

/* ---------- banor ----------
   Öppet fält. entry = där creepsen kommer in, exit = din nexus.
   rock = fasta hinder du inte kan bygga på och som formar fältet.
   Resten ritar du själv med torn.                                       */
export const MAPS = [
  {
    name: 'ÖPPNA FÄLTET', short: 'Inga hinder — din labyrint, dina regler',
    ai: { nm: 'WARDEN-1', iq: 0.45, aggr: 0.35, tick: 1.5, bank: 0.30, mazeTarget: 34 },
    entry: [5, 0], exit: [5, 15], rock: [],
  },
  {
    name: 'PELARNA', short: 'Fem klippor att bygga runt',
    ai: { nm: 'WARDEN-2', iq: 0.6, aggr: 0.45, tick: 1.3, bank: 0.33, mazeTarget: 40 },
    entry: [5, 0], exit: [5, 15],
    rock: [[2, 4], [8, 4], [5, 8], [2, 12], [8, 12]],
  },
  {
    name: 'KLYFTAN', short: 'En mur tvärs över med ett enda hål',
    ai: { nm: 'HELIX', iq: 0.78, aggr: 0.55, tick: 1.1, bank: 0.37, mazeTarget: 46 },
    entry: [5, 0], exit: [5, 15],
    rock: rocks(row(8, 0, 3), row(8, 7, 10)),
  },
  {
    name: 'TRÅNGA PASSET', short: 'Smalt fält — mindre plats att slingra',
    ai: { nm: 'RAZOR', iq: 0.9, aggr: 0.6, tick: 0.9, bank: 0.42, mazeTarget: 40 },
    entry: [5, 0], exit: [5, 15],
    rock: rocks(col(0, 3, 12), col(10, 3, 12)),
  },
  {
    name: 'SPILLRORNA', short: 'Utspridda klippor i vägen',
    ai: { nm: 'OMEGA', iq: 1.0, aggr: 0.55, tick: 0.75, bank: 0.48, mazeTarget: 44 },
    entry: [5, 0], exit: [5, 15],
    rock: [[1, 2], [9, 3], [3, 5], [7, 6], [2, 9], [8, 10], [4, 12], [6, 13], [5, 4], [5, 11]],
  },
];

/* ============================================================
   TORN
   Nivå 1–3 är gemensamma. Vid nivå 4 väljer du EN av två grenar
   och tornet byter skadetyp, form och roll. Valet är permanent —
   det är där partiet avgörs.
   Totalt: 3 gemensamma + 3 i vald gren = 6 nivåer per torn.
   ============================================================ */
/* ============================================================
   TORNTRÄDET
   Du bygger bara EN sak: en träpalisad för 40 guld. Den är både
   labyrintmaterial och början på varje torn du kommer att äga.

     nivå 1  TRÄPALISAD   40 g   — spärr, nästan ingen skada
     nivå 2  STENTORN    110 g   — fortfarande billigt
     nivå 3  VÄLJ ELEMENT        — eld, is, blixt, ljus eller mörker
     nivå 4-6                    — vidare i det valda elementet

   Elementen är de fem från WC3-förlagan och varje element har sin egen
   skadetyp, så valet avgör vad tornet biter på.
   ============================================================ */
export const TOWERS = {
  wall: {
    name: 'PALISAD', color: '#8a93b8', shape: 'block', dmg: 'kin',
    tag: 'Billig · bygger labyrinten',
    desc: 'Spärr med en nypa skada. Bygg många, uppgradera de som står bra.',
    lv: [
      { cost: 40,  dmg: 6,  rate: 1.2, range: 1.5 },
      { cost: 110, dmg: 18, rate: 1.0, range: 1.8 },
    ],
    branches: {
      eld: {
        name: 'ELD', color: '#ff6b3d', shape: 'flame', dmg: 'ter',
        tag: 'Splash + brand',
        desc: 'Träffar allt i en radie och sätter eld som tickar i 3 s.',
        lv: [
          { cost: 320,  dmg: 60,  rate: 1.00, range: 2.3, splash: 1.10, burn: 25,  burnT: 3 },
          { cost: 700,  dmg: 130, rate: 0.95, range: 2.5, splash: 1.20, burn: 60,  burnT: 3 },
          { cost: 1500, dmg: 280, rate: 0.90, range: 2.7, splash: 1.35, burn: 140, burnT: 3 },
          { cost: 3200, dmg: 620, rate: 0.85, range: 2.9, splash: 1.50, burn: 320, burnT: 3 },
        ],
      },
      is: {
        name: 'IS', color: '#9bd8ff', shape: 'dia', dmg: 'kry',
        tag: 'Bromsar allt',
        desc: 'Upp till 72 % långsammare. Ett IS-torn förlänger hela labyrinten.',
        lv: [
          { cost: 320,  dmg: 34,  rate: 0.80, range: 2.3, slow: 0.42, slowT: 1.7 },
          { cost: 700,  dmg: 74,  rate: 0.72, range: 2.5, slow: 0.52, slowT: 2.0 },
          { cost: 1500, dmg: 160, rate: 0.65, range: 2.7, slow: 0.62, slowT: 2.3 },
          { cost: 3200, dmg: 350, rate: 0.58, range: 2.9, slow: 0.72, slowT: 2.6 },
        ],
      },
      blixt: {
        name: 'BLIXT', color: '#a78bfa', shape: 'bolt', dmg: 'ele',
        tag: 'Kedja mellan mål',
        desc: 'Hoppar upp till åtta gånger. Raderar svärmar och drönare.',
        lv: [
          { cost: 320,  dmg: 46,  rate: 1.00, range: 2.5, chain: 3 },
          { cost: 700,  dmg: 100, rate: 0.95, range: 2.7, chain: 4 },
          { cost: 1500, dmg: 215, rate: 0.88, range: 2.9, chain: 6 },
          { cost: 3200, dmg: 470, rate: 0.80, range: 3.2, chain: 8 },
        ],
      },
      ljus: {
        name: 'LJUS', color: '#ffd166', shape: 'aa', dmg: 'sik',
        tag: 'Lång räckvidd · luftvärn',
        desc: 'Täcker halva fältet och får bonus mot FLYG.',
        lv: [
          { cost: 320,  dmg: 95,  rate: 1.30, range: 3.8 },
          { cost: 700,  dmg: 205, rate: 1.20, range: 4.2, airBonus: 1.6 },
          { cost: 1500, dmg: 440, rate: 1.10, range: 4.6, airBonus: 1.8 },
          { cost: 3200, dmg: 950, rate: 1.00, range: 5.0, airBonus: 2.0 },
        ],
      },
      morker: {
        name: 'MÖRKER', color: '#c05be0', shape: 'star', dmg: 'spr',
        tag: 'Stor sprängradie',
        desc: 'Dubbel radie mot slutet, och på maxnivå struntar den i pansar helt.',
        lv: [
          { cost: 320,  dmg: 70,  rate: 1.10, range: 2.2, splash: 1.30 },
          { cost: 700,  dmg: 150, rate: 1.05, range: 2.4, splash: 1.50 },
          { cost: 1500, dmg: 320, rate: 1.00, range: 2.6, splash: 1.75 },
          { cost: 3200, dmg: 700, rate: 0.95, range: 2.8, splash: 2.00, trueDmg: true },
        ],
      },
    },
  },
};

export const TOWER_KEYS = Object.keys(TOWERS);
export const BASE_LEVELS = 2;   // TRÄ och STEN innan elementvalet
export const MAX_TOWER_LV = 6;
/* ============================================================
   ELEMENTFORSKNING
   Grundloopen från Element TD: bygg bastorn → forska fram element →
   kombinera torn och elementnivå för att låsa upp högre tiers.

   Du kan inte forska allt. Att ta ett enda element till nivå 3 kostar
   4 800 guld; att ta alla fem kostar 24 000. Det är det som tvingar
   fram en specialisering i stället för att man bygger lite av varje.
   ============================================================ */
export const RESEARCH = {
  maxLevel: 3,
  cost: [350, 1400, 3600],          // kostnad för nivå 1, 2, 3
  /* Vilken forskningsnivå tornet kräver för att nå respektive nivå.
     Index = tornets nivå (0-baserad). Trä och sten kräver ingenting. */
  requires: [0, 0, 1, 1, 2, 3],
};

export const researchCost = lv => RESEARCH.cost[lv] ?? Infinity;
export const requiredResearch = towerLv => RESEARCH.requires[towerLv] ?? 0;

export const BRANCH_KEYS = Object.keys(TOWERS.wall.branches);
export const branchKeysFor = type => Object.keys(TOWERS[type].branches);

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
    const lvl = Math.min(lv, d.lv.length - 1);
    const nm = lv >= 1 ? 'STENTORN' : d.name;
    return { name: nm, color: lvl >= 1 ? '#b8c2e8' : d.color, shape: d.shape, dmg: d.dmg, tag: d.tag, desc: d.desc };
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
   cls  = pansarklass, avgör vilka torn som biter.
   fly  = flyger rakt över banan i stället för att följa vägen.
   inc  = permanent inkomstökning när du skickar typen.
   unlock = inkomsten du måste ha nått för att få skicka typen.

   Inkomsten är INTE en fast procent av kostnaden. Som i Line Tower Wars
   ger billiga creeps mer inkomst per guld än dyra:

     SVÄRM   64 guld → +14   (22 %, återbetalt på ~69 s)
     BOSS   880 guld → +105  (12 %, återbetalt på ~126 s)

   Därför är billiga creeps ekonomibygget och dyra creeps ren press.
   Med en enhetlig procent fanns det valet inte alls.
   ============================================================ */
export const CREEPS = {
  swarm: {
    nm: 'SVÄRM', shape: 'blob', color: '#ff9d54', cls: 'latt',
    hp: 14, spd: 2.1, r: 0.15, cost: 64, inc: 14, bounty: 8, leak: 1, count: 4, unlock: 0,
    note: '4 st · bäst inkomst per guld',
  },
  grunt: {
    nm: 'GRUNT', shape: 'blob', color: '#ff5d73', cls: 'tung',
    hp: 60, spd: 1.5, r: 0.25, cost: 96, inc: 19, bounty: 20, leak: 1, unlock: 0,
    note: 'Allround · straffar KINETISK och ELEKTRISK',
  },
  runner: {
    nm: 'LÖPARE', shape: 'dart', color: '#ffd166', cls: 'latt',
    hp: 34, spd: 3.1, r: 0.20, cost: 120, inc: 22, bounty: 20, leak: 1, unlock: 270,
    note: 'Springer förbi långsamma torn',
  },
  regen: {
    nm: 'REGEN', shape: 'blob', color: '#3ddc97', cls: 'tung',
    hp: 140, spd: 1.4, r: 0.27, cost: 220, inc: 36, bounty: 40, leak: 2, regen: 10, unlock: 520,
    note: 'Läker 10 HP/s — kräver burstskada',
  },
  drone: {
    nm: 'DRÖNARE', shape: 'wing', color: '#66e0ff', cls: 'flyg', fly: true,
    hp: 85, spd: 1.75, r: 0.22, cost: 260, inc: 42, bounty: 46, leak: 1, count: 2, unlock: 780,
    note: '2 st · flyger RAKT över banan och struntar i vägen',
  },
  brute: {
    nm: 'BJÄSSE', shape: 'tank', color: '#c05be0', cls: 'pans',
    hp: 300, spd: 1.0, r: 0.34, cost: 320, inc: 46, bounty: 56, leak: 2, unlock: 840,
    note: 'PANSAR — KINETISK och ELEKTRISK studsar av',
  },
  boss: {
    nm: 'BOSS', shape: 'boss', color: '#ff3b5c', cls: 'pans',
    hp: 1700, spd: 0.8, r: 0.42, cost: 880, inc: 105, bounty: 180, leak: 3, unlock: 1680,
    note: 'PANSAR · tar 3 liv — ren press, sämst inkomst',
  },

  /* Sena creeps. Utan dem tar trappan slut efter BOSS och man fastnar i
     att skicka samma sak i tio minuter — det var den verkliga bristen. */
  shade: {
    nm: 'SKUGGA', shape: 'dart', color: '#7fe8d0', cls: 'latt',
    hp: 620, spd: 3.4, r: 0.22, cost: 1150, inc: 130, bounty: 210, leak: 2, unlock: 2400,
    note: 'Extremt snabb — hinner förbi långsamma torn',
  },
  warden: {
    nm: 'VÄKTARE', shape: 'blob', color: '#5bb8e0', cls: 'tung',
    hp: 2600, spd: 1.15, r: 0.32, cost: 1600, inc: 175, bounty: 300, leak: 3, regen: 40, unlock: 3200,
    note: 'TUNG med kraftig läkning — kräver rå burst',
  },
  brood: {
    nm: 'RUVARE', shape: 'wing', color: '#b57bff', cls: 'flyg', fly: true,
    hp: 1450, spd: 1.6, r: 0.3, cost: 2100, inc: 220, bounty: 380, leak: 2, count: 2, unlock: 4400,
    note: '2 st · tung FLYG som struntar i labyrinten',
  },
  titan: {
    nm: 'TITAN', shape: 'boss', color: '#ff8a3d', cls: 'pans',
    hp: 9000, spd: 0.7, r: 0.48, cost: 3400, inc: 330, bounty: 620, leak: 5, unlock: 6000,
    note: 'PANSAR · tar 5 liv — sista ordet i en lång match',
  },
};

export const CREEP_KEYS = Object.keys(CREEPS);

export const creepIncome = key => CREEPS[key].inc;
export const sendUpCost = (key, lv) => ECON.sendUpCost(CREEPS[key].cost, lv);
export const sendHpMul = lv => Math.pow(1 + ECON.sendUpHp, lv);
export const waveHpMul = wave => Math.pow(ECON.waveHp, wave);
export const buildCost = (key, towerCount) =>
  Math.round(TOWERS[key].lv[0].cost * Math.pow(ECON.buildTax, towerCount));
