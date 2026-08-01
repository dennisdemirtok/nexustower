/* ============================================================
   Bildladdare.
   Spelet ritar allt procedurellt som standard och fungerar helt utan
   bildfiler. Läggs en PNG i /public/assets/ med rätt namn används den
   i stället — utan kodändring. Saknas filen faller allt tillbaka på
   det procedurella, så man kan lägga till en bild i taget och se
   skillnaden växa fram.
   ============================================================ */

const cache = new Map();
let enabled = true;

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
  let triedSvg = false;
  img.onload = () => { img._ok = true; };
  img.onerror = () => {
    if (!triedSvg) { triedSvg = true; img.src = `/assets/${name}.svg`; return; }
    cache.set(name, null);
  };
  img.src = `/assets/${name}.png`;
  cache.set(name, img);
  return null;
}

export const spriteFor = {
  terrain: () => sprite('terrain-ground'),
  /* Tornen: trä och sten är gemensamma, sedan två steg per element.
     Steg 1 = nivå 3–4, steg 2 = nivå 5–6. */
  tower(type, lv, branch) {
    if (lv === 0) return sprite('tower-wood');
    if (lv === 1) return sprite('tower-stone');
    return sprite(`tower-${branch || 'eld'}-${lv >= 4 ? 2 : 1}`);
  },
  creep: key => sprite(`creep-${key}`),
  panel: () => sprite('ui-panel'),
};

/* Rita en sprite centrerad i en ruta, skalad efter rutstorleken.
   Bilderna antas vara kvadratiska och sedda uppifrån. */
export function drawSprite(ctx, img, x, y, size) {
  ctx.drawImage(img, x - size / 2, y - size / 2, size, size);
}

export function setEnabled(v) { enabled = v; }
