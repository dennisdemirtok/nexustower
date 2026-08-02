/* ============================================================
   Bildladdare.
   Spelet ritar allt procedurellt som standard och fungerar helt utan
   bildfiler. Läggs en PNG i /public/assets/ med rätt namn används den
   i stället — utan kodändring. Saknas filen faller allt tillbaka på
   det procedurella, så man kan lägga till en bild i taget och se
   skillnaden växa fram.
   ============================================================ */

import { CREEPS } from './config.js';

const cache = new Map();
let enabled = true;

/* Bilduppsättning. 'malad' är de handmålade sprites vi kört hittills,
   '3d' är samma motiv renderade från Tripo-modeller. Sätts med ?art=3d i
   adressfältet så vi kan växla mellan dem i samma match och faktiskt se
   skillnaden i stället för att jämföra minnesbilder. Saknas en fil i
   3d-uppsättningen faller den tillbaka på den målade. */
let set = 'malad';
try {
  const q = new URLSearchParams(location.search).get('art');
  if (q === '3d' || q === 'malad') set = q;
} catch { /* körs även utan DOM i testharnessen */ }
export const artSet = () => set;

const towerSpriteName = (lv, branch) =>
  lv <= 0 ? 'tower-wood'
  : lv <= 2 ? 'tower-stone'
  : `tower-${branch || 'eld'}-${lv >= 5 ? 2 : 1}`;

/* Hämtar en sprite. Returnerar null tills bilden är laddad, och för
   alltid null om den inte finns — anroparen ritar då sin egen version. */
export function sprite(name) {
  if (!enabled) return null;
  if (cache.has(name)) {
    const v = cache.get(name);
    return v && v._ok ? v : null;
  }
  /* Provar PNG först, sedan SVG. Målade sprites och handritad vektor kan
     alltså blandas fritt — och en PNG som läggs in senare ersätter SVG:n
     utan att något behöver ändras. */
  const img = new Image();
  img.decoding = 'async';
  img._ok = false;
  // Ordningen att prova: vald uppsättning, sedan målad PNG, sedan SVG.
  const kandidater = (set === '3d' ? [`3d/${name}.png`] : []).concat([`${name}.png`, `${name}.svg`]);
  let i = 0;
  img.onload = () => { img._ok = true; };
  img.onerror = () => {
    if (++i < kandidater.length) { img.src = `/assets/${kandidater[i]}`; return; }
    cache.set(name, null);
  };
  img.src = `/assets/${kandidater[0]}`;
  cache.set(name, img);
  return null;
}

export const spriteFor = {
  terrain: () => sprite('terrain-ground'),
  /* Tre pilbågsnivåer delar två bilder, sedan två steg per element:
     nivå 4-5 = steg 1, nivå 6-7 = steg 2. */
  tower(type, lv, branch) {
    return sprite(towerSpriteName(lv, branch));
  },
  /* Ett torn med en pipa måste peka mot målet, ett runt torn ska stå
     stilla. Skillnaden avgörs av om det finns ett riktningsark för just
     den bilden — kanonen har ett, palissaden har inget. */
  towerDirs: (lv, branch) => sprite(towerSpriteName(lv, branch) + '-dirs'),
  /* Creepen pekar ut sin bild själv, så flera creeps kan dela sprite
     och namnbyten i speldatan inte kräver att filer döps om. */
  creep: key => sprite(`creep-${(CREEPS[key] && CREEPS[key].sprite) || key}`),
  panel: () => sprite('ui-panel'),
  /* Åtta riktningar på rad i en bild. Finns arket används det, annars
     ritas creepen orienterad som den är målad. Det här är det enda som
     3D-modellerna ger som en målad sprite inte kan: en creep som faktiskt
     vänder sig i kurvan i stället för att glida sidledes genom den. */
  creepDirs: key => sprite(`creep-${(CREEPS[key] && CREEPS[key].sprite) || key}-dirs`),
};

/* Adressen till en sprite som redan är laddad. Gränssnittet är HTML och
   kan inte rita ur en canvas-bild, men det ska visa exakt samma figur som
   brädet — annars står det en abstrakt symbol på köpknappen och en helt
   annan varelse på banan. Returnerar null tills bilden finns, då faller
   anroparen tillbaka på sin egen ritning. */
export function spriteUrl(name) {
  const img = sprite(name);
  return img ? img.src : null;
}

export const DIRS = 8;

/* Ritar rätt ruta ur riktningsarket. Vinkeln är i skärmkoordinater, alltså
   0 = åt höger och växande medurs. */
export function drawDirSprite(ctx, sheet, x, y, size, angle) {
  const f = sheet.naturalHeight;
  const k = ((Math.round(angle / (Math.PI * 2 / DIRS)) % DIRS) + DIRS) % DIRS;
  ctx.drawImage(sheet, k * f, 0, f, f, x - size / 2, y - size / 2, size, size);
}

/* Rita en sprite centrerad i en ruta, skalad efter rutstorleken.
   Bilderna antas vara kvadratiska och sedda uppifrån. */
export function drawSprite(ctx, img, x, y, size) {
  ctx.drawImage(img, x - size / 2, y - size / 2, size, size);
}

export function setEnabled(v) { enabled = v; }
