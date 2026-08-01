# Bilder till NEXUS WARS

Spelet ritar allt procedurellt och fungerar helt utan den här mappen. Lägger du
in en PNG med rätt namn används den i stället — utan kodändring. Saknas filen
faller den tillbaka på det ritade. **Du kan lägga in en bild i taget** och se
skillnaden växa fram.

## Gemensamt för alla bilder

| Krav | Värde |
|------|-------|
| Format | PNG med **genomskinlig bakgrund** (utom marken) |
| Storlek | 512×512 för torn och creeps, 1024×1024 för marken |
| Vy | **Rakt uppifrån** eller svagt lutad uppifrån — samma kamera som spelet |
| Ljus | Alltid uppifrån **vänster** |
| Skugga | Rita **ingen** markskugga — spelet lägger på den själv |
| Ram | Motivet ska fylla 80–90 % av rutan och vara centrerat |

Lägg den här textraden sist i varje prompt så håller stilen ihop mellan
bilderna:

> hand-painted casual mobile game art style like Clash Royale or Brawl Stars,
> rich saturated colors, soft painted shading, thick dark outline, clean
> readable silhouette, light from upper left, transparent background, centered,
> no text, no UI, no ground shadow

## 1. Marken — `terrain-ground.png`

1024×1024, **ingen** genomskinlighet, måste vara **sömlöst kaklingsbar**.
Spelet kaklar den över hela fältet.

> Seamless tileable top-down terrain texture for a mobile tower defense game.
> Warm golden-brown packed dirt with subtle cracks and small pebbles, patches of
> vibrant green moss and grass, a few tiny flowers. Seamless on all four edges.
> Hand-painted casual mobile game art style, rich saturated colors, no text, no
> characters, no grid lines.

## 2. Torn — 12 bilder

Trädet är: trä → sten → välj element → två steg till i elementet.

| Fil | Vad |
|-----|-----|
| `tower-wood.png` | Enkel träpalisad, spetsade stockar |
| `tower-stone.png` | Låg gråstensbastion med tinnar |
| `tower-eld-1.png` / `-2.png` | Eld: glödande kol → brinnande kanon |
| `tower-is-1.png` / `-2.png` | Is: frostkristall → istorn med isbitar |
| `tower-blixt-1.png` / `-2.png` | Blixt: tesla-spole → åskspira med bågar |
| `tower-ljus-1.png` / `-2.png` | Ljus: guldlykta → hög solkanon |
| `tower-morker-1.png` / `-2.png` | Mörker: lila obelisk → skuggportal |

Steg **1** = nivå 3–4, steg **2** = nivå 5–6. Steg 2 ska vara tydligt mäktigare:
större, mer detaljer, starkare glöd.

Exempel för `tower-eld-2.png`:

> Top-down view of a fantasy fire tower for a tower defense game: a stone tower
> with a glowing molten core and a flaming cannon on top, orange and red embers,
> cracked lava veins in the stone. \[+ gemensamma stilraden ovan]

## 3. Creeps — 7 bilder

Alla sedda **rakt uppifrån**, som om de går nedåt på skärmen.

| Fil | Vad | Färg |
|-----|-----|------|
| `creep-swarm.png` | Liten snabb insektsvarelse | orange |
| `creep-grunt.png` | Kompakt bepansrad soldat | röd |
| `creep-runner.png` | Smal springande varelse | gul |
| `creep-regen.png` | Slemmig varelse som läker | grön |
| `creep-drone.png` | **Flygande** varelse med vingar | ljusblå |
| `creep-brute.png` | Tung koloss med tjockt pansar | lila |
| `creep-boss.png` | Enorm pansarboss med horn | mörkröd |

Exempel för `creep-brute.png`:

> Top-down view of a heavy armored brute monster for a tower defense game, seen
> from directly above walking downward, thick purple plated armor, broad
> shoulders, small head. \[+ gemensamma stilraden ovan]

## 4. Panel — `ui-panel.png` (valfri)

1024×256, genomskinlig. En ram i sten och trä till kommandoraden längst ner,
som i WC3. Lämna mitten tom — knapparna ritas ovanpå.

## Om något ser fel ut

- **För stort/litet i rutan** — motivet ska fylla 80–90 %, inte kanterna
- **Dubbel skugga** — ta bort den inbakade, spelet lägger på sin egen
- **Fel håll** — creeps ska gå nedåt, torn ska vara riktningslösa (de roterar)
