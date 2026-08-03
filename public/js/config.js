/* ---------- svårighetsgrader ----------
   Skalar banans egen AI-profil. De tre första fuskar inte: skillnaden är
   hur ofta WARDEN tänker, hur väl den läser hotbilden och hur långt den
   orkar bygga. BRUTAL får dessutom mer inkomst — det står i klartext på
   knappen, annars vore det bara orättvist.                              */
export const DIFFS = [
  { id: 'lugn',   nm: 'LUGN',   sub: 'Skickar sällan · −25 % inkomst',
    iq: 0.50, tick: 1.50, aggr: 0.45, maze: 0.70, eco: 0.75 },
  { id: 'normal', nm: 'NORMAL', sub: 'Banans egen styrka',
    iq: 1.00, tick: 1.00, aggr: 1.00, maze: 1.00, eco: 1.00 },
  { id: 'svar',   nm: 'SVÅR',   sub: 'Tänker dubbelt så ofta, kontrar rätt',
    iq: 1.40, tick: 0.65, aggr: 1.20, maze: 1.25, eco: 1.00 },
  { id: 'brutal', nm: 'BRUTAL', sub: 'Spelar optimalt · +30 % inkomst',
    iq: 1.70, tick: 0.45, aggr: 1.35, maze: 1.40, eco: 1.30 },
];
export const diffById = id => DIFFS.find(d => d.id === id) || DIFFS[1];

export function applyDiff(ai, id) {
  const d = diffById(id);
  return { ...ai, diff: d,
    iq: Math.min(1, ai.iq * d.iq),
    tick: ai.tick * d.tick,
    aggr: Math.min(0.95, ai.aggr * d.aggr),
    mazeTarget: Math.round(ai.mazeTarget * d.maze),
    eco: d.eco };
}

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
  /* Kalibrerat mot Reforged-proportionerna: income = 5 % av sändkostnaden
     per tick, bounty = 4 %. Payback på en sändning är 20 ticks = 5 minuter,
     och eftersom bounty ligger UNDER income lönar det sig alltid att skicka
     själv i stället för att vänta ut motståndaren. */
  /* Förhållandet startguld:torn ska vara ~10:1 så öppningen räcker till
     5-10 torn OCH några sändningar. Jag höjer startguldet i stället för att
     sänka tornpriset — sänker man tornet blir det plötsligt fem gånger
     kostnadseffektivare än creepsen, och då rasar hela HP-per-guld-tabellen
     som är själva matchklockan.
       500 = 6 torn (300) + 4 får (80) med slack, eller 8 torn + 2 får. */
  startGold: 500,
  /* Basinkomsten är golvet som gör att man aldrig står och väntar. 30/tick
     gav 120 guld i minuten — sex får, alltså ett var tionde sekund. Det
     räckte inte för att hålla ett flöde igång samtidigt som man bygger.
     60/tick ger 240 i minuten: fyra torn ELLER tolv får, eller en blandning. */
  startIncome: 60,
  incInterval: 15,
  /* 20 %, taget ur den riktiga WC3-skärmbilden: får 5 guld ger +1 inkomst.
     Sifferplanen gissade 5 % och jag höjde till 7 % — men mätt mot förlagan
     var vi nästan tre gånger för snåla, och det är därför öppningen kändes
     som att stå och vänta. Återbetalning: 5 ticks = 75 sekunder. */
  incomeRate: 0.20,
  bountyRate: 0.04,

  /* Ingen kö-gräns. Har du sparat ihop guldet ska du kunna trycka tjugo
     gånger och släppa allt på en gång — att spara och sedan dumpa är ett
     legitimt drag, inte något spelet ska hindra. Guldet är enda taket.
     Betalningen sker direkt vid trycket; kön styr bara utsläppstakten. */
  queueMax: 60,
  sendCooldown: 0.22,

  prepTime: 25,
  buildTax: 1.0,
  waveInterval: 30,
  waveHp: 1.0,           // HP-trappan ligger i creepstierna, inte i vågor
  maxSendLv: 5,
  sendUpHp: 0.35,
  sendUpCost: (cost, lv) => Math.round(cost * 4 * Math.pow(1.7, lv)),
  /* Kalibrering mot labyrinten, PER TIER.
     Först satte jag en platt faktor på 4,2 för att matcherna inte skulle
     fastna. Det löste sluttempot men förstörde öppningen: ett får fick 126
     HP och ett nivå-1-torn behövde 12,6 sekunder på det. Man kunde varken
     bygga tillräckligt eller skicka.

     Problemet var aldrig T1. Det är sent i matchen försvaret drar ifrån,
     eftersom torn är permanenta medan creeps förbrukas. Alltså ska bara de
     senare tierna skalas:
       T1 orört  -> ett torn dödar ett får på tre sekunder, som det ska
       T4 x4,5   -> anfallet hinner ikapp det uppbyggda försvaret

     Trappan måste dessutom vara jämn. Med x2,2 på T2 gick ett creep från
     30 HP till 616 HP på två minuter — tjugo gånger tåligare i ett hopp,
     och tolv nivå-1-torn tappade tio liv utan att spelaren gjort fel.     */
  tierHp: { 0: 1.0, 2: 1.3, 4: 2.2, 7: 4.0, 10: 5.0 },

  lives: 60,
  lifeSteal: true,
  maxLives: 140,
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
    /* Floden delar fältet på mitten och lämnar två vad. Labyrinten måste
       byggas i den halva creepsen befinner sig i — och det som passerar ett
       vad går alltid genom samma två rutor, vilket är den bästa platsen på
       hela banan att ställa ett torn. Flygande bryr sig inte, så luftvägen
       blir för första gången värd att kontra. */
    name: 'FLODEN', short: 'En flod tvärs över med två vad',
    ai: { nm: 'WARDEN-2', iq: 0.6, aggr: 0.45, tick: 1.3, bank: 0.33, mazeTarget: 40 },
    entry: [5, 0], exit: [5, 15],
    rock: [[1, 3], [9, 12]],
    water: rocks(row(7, 0, 1), row(7, 3, 6), row(7, 8, 10)),
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
    name: 'PILBÅGSTORN', color: '#8a93b8', shape: 'block', dmg: 'kin',
    tag: 'Billig · bygger labyrinten',
    desc: 'Grundbygget. Spamma dem för att rita vägen, uppgradera de som står bra.',
    lv: [
      { cost: 50,  dmg: 8,  rate: 0.80, range: 1.7 },
      { cost: 150, dmg: 29, rate: 0.70, range: 2.0 },
      { cost: 300, dmg: 66, rate: 0.60, range: 2.3 },
    ],
    branches: {
      eld: {
        name: 'ELD', color: '#ff6b3d', shape: 'flame', dmg: 'ter',
        tag: 'Splash + brand',
        desc: 'Träffar allt i en radie och sätter eld som tickar i 3 s.',
        lv: [
          { cost: 150,   dmg: 109,  rate: 0.95, range: 2.5, splash: 1.15, burn: 30,   burnT: 3 },
          { cost: 1500,  dmg: 437,  rate: 0.95, range: 2.7, splash: 1.30, burn: 120,  burnT: 3 },
          { cost: 4000,  dmg: 1330, rate: 0.95, range: 2.9, splash: 1.45, burn: 360,  burnT: 3 },
          { cost: 12000, dmg: 4085, rate: 0.95, range: 3.2, splash: 1.65, burn: 1100, burnT: 3 },
        ],
      },
      is: {
        name: 'IS', color: '#9bd8ff', shape: 'dia', dmg: 'kry',
        tag: 'Bromsar allt',
        desc: 'Upp till 72 % långsammare. Ett IS-torn förlänger hela labyrinten.',
        lv: [
          { cost: 150,   dmg: 86,   rate: 0.75, range: 2.5, slow: 0.45, slowT: 1.8 },
          { cost: 1500,  dmg: 345,  rate: 0.75, range: 2.7, slow: 0.55, slowT: 2.1 },
          { cost: 4000,  dmg: 1050, rate: 0.75, range: 2.9, slow: 0.64, slowT: 2.4 },
          { cost: 12000, dmg: 3225, rate: 0.75, range: 3.2, slow: 0.72, slowT: 2.7 },
        ],
      },
      blixt: {
        name: 'BLIXT', color: '#a78bfa', shape: 'bolt', dmg: 'ele',
        tag: 'Kedja mellan mål',
        desc: 'Hoppar upp till åtta gånger. Raderar svärmar och flygande flockar.',
        lv: [
          { cost: 150,   dmg: 115,  rate: 1.00, range: 2.6, chain: 3 },
          { cost: 1500,  dmg: 460,  rate: 1.00, range: 2.8, chain: 5 },
          { cost: 4000,  dmg: 1400, rate: 1.00, range: 3.0, chain: 6 },
          { cost: 12000, dmg: 4300, rate: 1.00, range: 3.3, chain: 8 },
        ],
      },
      ljus: {
        name: 'LJUS', color: '#ffd166', shape: 'aa', dmg: 'sik',
        tag: 'Lång räckvidd · luftvärn',
        desc: 'Täcker halva fältet och får bonus mot FLYG.',
        lv: [
          { cost: 150,   dmg: 144,  rate: 1.25, range: 3.9 },
          { cost: 1500,  dmg: 575,  rate: 1.25, range: 4.3, airBonus: 1.7 },
          { cost: 4000,  dmg: 1750, rate: 1.25, range: 4.7, airBonus: 1.9 },
          { cost: 12000, dmg: 5375, rate: 1.25, range: 5.2, airBonus: 2.1 },
        ],
      },
      morker: {
        name: 'MÖRKER', color: '#c05be0', shape: 'star', dmg: 'spr',
        tag: 'Stor sprängradie',
        desc: 'Dubbel radie mot slutet, och på sista nivån struntar den i pansar helt.',
        lv: [
          { cost: 150,   dmg: 127,  rate: 1.10, range: 2.3, splash: 1.35 },
          { cost: 1500,  dmg: 506,  rate: 1.10, range: 2.5, splash: 1.60 },
          { cost: 4000,  dmg: 1540, rate: 1.10, range: 2.7, splash: 1.85 },
          { cost: 12000, dmg: 4730, rate: 1.10, range: 3.0, splash: 2.10, trueDmg: true },
        ],
      },
    },
  },
};

export const TOWER_KEYS = Object.keys(TOWERS);
export const BASE_LEVELS = 3;   // tre pilbågsnivåer innan elementvalet
export const MAX_TOWER_LV = 7;
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
  cost: [200, 800, 2500],           // kostnad för nivå 1, 2, 3
  /* Vilken forskningsnivå tornet kräver för att nå respektive nivå.
     Index = tornets nivå (0-baserad). Trä och sten kräver ingenting. */
  requires: [0, 0, 0, 1, 1, 2, 3],
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
  /* Tolv sändningar i fyra tier som låses upp på TID, inte på inkomst.
     Tier-tiderna är halverade mot ursprungsplanen (0/2/4/7/10 min) — med
     de långa tiderna hann försvaret bygga ifatt och matcherna fastnade.
     Det viktiga är HP-per-guld-kurvan: T1 ~1,5-2x, T2 ~2,3x, T3 ~2,8x,
     T4 ~3x. Anfallet blir alltså gradvis billigare än försvaret, och det
     är den glidningen som gör att matchen måste ta slut.

     inc = 5 % av kostnaden, bounty = 4 %. Bounty ligger medvetet UNDER
     income — annars lönar det sig att sitta still och låta motståndaren
     mata en med guld, och spelet blir passivt. */

  // ---- T1, från start ----
  far: {
    nm: 'LARV', shape: 'blob', color: '#e8e2d0', cls: 'latt', sprite: 'swarm',
    hp: 30, spd: 1.6, r: 0.20, cost: 25, leak: 1, unlockMin: 0,
    note: 'Basen. Billigast vägen till inkomst.',
  },
  varg: {
    nm: 'VARG', shape: 'dart', color: '#9aa7c0', cls: 'latt', sprite: 'runner',
    hp: 45, spd: 2.0, r: 0.20, cost: 40, leak: 1, unlockMin: 0,
    note: '25 % snabbare — hinner förbi långsamma torn',
  },
  vildsvin: {
    nm: 'SKALBAGGE', shape: 'tank', color: '#a9713f', cls: 'tung', sprite: 'grunt',
    hp: 130, spd: 1.15, r: 0.26, cost: 60, leak: 1, unlockMin: 0,
    note: 'Långsam tank. Bäst HP per guld i T1.',
  },

  // ---- T2, 3 minuter ----
  ghoul: {
    nm: 'GHOUL', shape: 'blob', color: '#7fb069', cls: 'tung', sprite: 'brute',
    hp: 280, spd: 1.4, r: 0.27, cost: 120, leak: 1, unlockMin: 2,
    note: 'Standardslitaren i mellanspelet',
  },
  harpya: {
    nm: 'HARPYA', shape: 'wing', color: '#66e0ff', cls: 'flyg', fly: true, sprite: 'drone',
    hp: 240, spd: 1.7, r: 0.24, cost: 200, leak: 2, unlockMin: 2,
    note: 'FLYG — går rakt över labyrinten',
  },
  shaman: {
    nm: 'IRRBLOSS', shape: 'blob', color: '#3ddc97', cls: 'tung', sprite: 'regen',
    hp: 320, spd: 1.3, r: 0.27, cost: 280, leak: 2, unlockMin: 2,
    healAura: 26, healRange: 2.2,
    note: 'Läker alla creeps omkring sig — döda den först',
  },

  // ---- T3, 7 minuter ----
  golem: {
    nm: 'GOLEM', shape: 'tank', color: '#b8a48c', cls: 'pans', sprite: 'titan',
    hp: 1700, spd: 0.95, r: 0.34, cost: 600, leak: 2, unlockMin: 4,
    note: 'PANSAR — kinetisk och elektrisk studsar av',
  },
  wyvern: {
    nm: 'TROLLSLÄNDA', shape: 'wing', color: '#b57bff', cls: 'flyg', fly: true, sprite: 'brood',
    hp: 1900, spd: 1.9, r: 0.32, cost: 900, leak: 2, unlockMin: 4,
    note: 'Snabb FLYG — kräver riktigt luftvärn',
  },
  prastinna: {
    nm: 'VÄKTARE', shape: 'blob', color: '#7fe8d0', cls: 'pans', sprite: 'shade',
    hp: 2800, spd: 1.1, r: 0.30, cost: 1200, leak: 3, unlockMin: 4,
    magicImmune: true,
    note: 'Magiimmun: ELD, IS och BLIXT gör 25 % skada',
  },

  // ---- T4, 12 minuter ----
  jatte: {
    nm: 'URPADDA', shape: 'boss', color: '#5bb8e0', cls: 'pans', sprite: 'warden',
    hp: 9000, spd: 0.85, r: 0.42, cost: 3000, leak: 4, unlockMin: 7,
    towerDebuff: 0.35, debuffRange: 2.6,
    note: 'Sänker eldkraften hos torn den passerar med 35 %',
  },
  drake: {
    nm: 'DRAKE', shape: 'wing', color: '#ff8a3d', cls: 'flyg', fly: true, sprite: 'drake',
    hp: 16000, spd: 1.3, r: 0.44, cost: 5000, leak: 5, unlockMin: 7,
    splashResist: 0.5,
    note: 'FLYG · tar bara halv skada av splash',
  },

  /* Belägrare. De skjuter på tornen i stället för att bara gå förbi dem, och
     är det enda i spelet som kan riva något du byggt. Poängen är dynamik:
     mot dem hjälper det inte att stapla mer eldkraft på samma ställe, för
     just den stapeln är det de siktar på. Två steg — ett tidigt som svider
     och ett sent som river på allvar. */
  bandit: {
    nm: 'BANDIT', shape: 'dart', color: '#e0a03d', cls: 'latt', sprite: 'bandit',
    hp: 900, spd: 1.25, r: 0.30, cost: 350, leak: 1, unlockMin: 3,
    siege: 26, siegeRange: 1.6,
    note: 'Skjuter på tornen den passerar — flytta inte allt till en rad',
  },
  krossare: {
    nm: 'KROSSARE', shape: 'boss', color: '#c94f2e', cls: 'pans', sprite: 'krossare',
    hp: 26000, spd: 0.75, r: 0.48, cost: 7000, leak: 6, unlockMin: 13,
    siege: 420, siegeRange: 2.0,
    note: 'River torn. Det enda som tvingar fram ombyggnad mitt i matchen',
  },
  svarm: {
    nm: 'SVÄRMMODER', shape: 'boss', color: '#8ee06a', cls: 'tung', sprite: 'svarm',
    hp: 42000, spd: 0.85, r: 0.50, cost: 11000, leak: 6, unlockMin: 16,
    deathSpawn: { key: 'ghoul', count: 6 },
    note: 'Föder sex ghouls när den dör — döda den långt från din nexus',
  },

  // ---- Boss, 16 minuter ----
  behemoth: {
    nm: 'BEHEMOTH', shape: 'boss', color: '#ff3b5c', cls: 'pans', sprite: 'boss',
    hp: 60000, spd: 0.7, r: 0.52, cost: 15000, leak: 8, unlockMin: 10,
    deathSpawn: { key: 'far', count: 4 },
    note: 'Släpper fyra FÅR när den dör. Avslutaren.',
  },
};

/* Sorterade efter pris. Ordningen kom tidigare ur i vilken ordning de
   skrevs in, så BANDIT på 350 låg efter DRAKE på 5000 — och i en rad man
   scrollar är priset det enda man jämför på. */
export const CREEP_KEYS = Object.keys(CREEPS).sort((a, b) => CREEPS[a].cost - CREEPS[b].cost);

/* Både income och bounty räknas ur kostnaden. Handskrivna heltal glider vid
   avrundning — FÅR hamnade på 5 % i stället för 7 % — och då slutar
   procentsatserna vara den garanti de ska vara. */
export const creepIncome = key => CREEPS[key].cost * ECON.incomeRate;
/* Bounty räknas ur kostnaden i stället för att skrivas per creep. Med
   handskrivna heltal blev FÅR 5 % i stället för 4 % vid avrundning, och då
   bryts regeln att bounty alltid ska ligga under income. */
export const creepBounty = key => CREEPS[key].cost * ECON.bountyRate;
/* Tier låses upp på matchtid, inte på inkomst — då kommer trappan i samma
   takt för båda spelarna oavsett hur de spelat. */
/* Guldet är enda spärren. Tidslåsen begränsade en spelare som sparat ihop
   till något dyrare, vilket är precis det beteende ekonomin ska belöna.
   unlockMin finns kvar i speldatan eftersom tierHp använder den för att
   skala HP — men den styr inte längre vad man får skicka. */
export const creepUnlocked = () => true;
export const sendUpCost = (key, lv) => ECON.sendUpCost(CREEPS[key].cost, lv);
export const sendHpMul = lv => Math.pow(1 + ECON.sendUpHp, lv);
export const waveHpMul = wave => Math.pow(ECON.waveHp, wave);

/* HP-skalan för en creep, satt av dess tier. Nyckeln i tierHp är samma
   upplåsningstid som creepen har, så tabellen läses direkt. */
export const tierHpMul = key => ECON.tierHp[CREEPS[key].unlockMin] ?? 1;
export const buildCost = (key, towerCount) =>
  Math.round(TOWERS[key].lv[0].cost * Math.pow(ECON.buildTax, towerCount));
