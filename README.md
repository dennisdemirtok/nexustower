# NEXUS WARS

Modern *line tower wars* för mobil och desktop. Du bygger torn på din egen bana
och skickar creeps mot motståndarens. Varje creep du skickar höjer din inkomst
permanent — men ger motståndaren guld när den dör. Först till 0 liv förlorar.

Tre lägen:

- **Kampanj** — 5 sektorer mot WARDEN-AI med stigande svårighetsgrad.
- **Online 1v1** — matchmaking mot en riktig spelare via WebSocket.
- **Kedjan** — 3–4 spelare i en ring. Du anfaller nästa och försvarar dig mot
  föregående, och en creep som tar sig igenom din bana rullar vidare till
  nästa spelare.

## Kom igång lokalt

```bash
npm install
npm start
```

Öppna http://localhost:3000. För att testa online 1v1 lokalt: öppna två flikar
och tryck **ONLINE 1v1 → SÖK MATCH** i båda. Kedjan testas likadant med tre
eller fyra flikar — men håll dem synliga, en flik i bakgrunden fryser
`requestAnimationFrame` och därmed hela matchen.

## Lägg upp på GitHub

```bash
git remote add origin git@github.com:<ditt-användarnamn>/nexus-wars.git
git push -u origin main
```

## Deploya på Railway

Railway behövs eftersom multiplayer kräver en Node-server med WebSockets
(GitHub Pages kan bara serva statiska filer och klarar inte online-läget).

1. railway.app → **New Project → Deploy from GitHub repo** → välj repot.
2. Railway läser `railway.json` och kör `npm start`. Ingen konfiguration behövs —
   servern lyssnar på `process.env.PORT`.
3. **Settings → Networking → Generate Domain** ger dig en publik URL.

Hälsokoll finns på `/health` (används av Railway för att se att appen lever).

WebSocket-anslutningen använder samma host som sidan (`wss://` på HTTPS), så
inga miljövariabler behöver sättas.

### Spela på mobilen

Öppna Railway-URL:en i mobilen och välj **Lägg till på hemskärmen**. Appen är en
PWA (`manifest.webmanifest`) och startar då i helskärm utan webbläsarens ramar.

## Ekonomin — hämtad från Line Tower Wars

Tre regler är tagna rakt från WC3-förlagan:

**Inkomsten tickar var 15:e sekund.** Med 5 sekunder droppade det in pengar
hela tiden och man hann aldrig bli fattig. Nu kommer en klumpsumma, man gör av
med den, och sedan står man och tittar på nedräkningen medan creepsen kommer.
Ett aggressivt spel ligger pank ungefär halva matchen.

**Billiga creeps ger mer inkomst per guld än dyra.** Inte en fast procent:

| Creep | Kostnad | Inkomst | Andel | Återbetalt |
|-------|---------|---------|-------|------------|
| SVÄRM | 64 | +14 | 22 % | ~69 s |
| GRUNT | 96 | +19 | 20 % | ~76 s |
| LÖPARE | 120 | +22 | 18 % | ~82 s |
| REGEN | 220 | +36 | 16 % | ~92 s |
| DRÖNARE | 260 | +42 | 16 % | ~93 s |
| BJÄSSE | 320 | +46 | 14 % | ~104 s |
| BOSS | 880 | +105 | 12 % | ~126 s |

Billiga creeps är alltså ekonomibygget, dyra är ren press. Med en enhetlig
procent fanns det valet inte alls.

**Livstöld.** Den som läcker förlorar liv *och* den som skickade creepen vinner
lika många. Summan liv i matchen är konstant, så partiet blir en dragkamp som
faktiskt tar slut — inte två parallella nedräkningar som råkar ta olika lång
tid. Det är därför WC3-spelare kan stå på 83 liv mot 13.

## Kedjan — 3–4 spelare i en ring

Alla står i en ring. Du anfaller **nästa** spelare och försvarar dig mot
**föregående**. Ringraden under HUD:en visar hela varvet med liv: du först,
sedan ditt mål i korall, och din anfallare i gult.

Det som gör läget till något annat än 1v1 i cirkel är att **läckan rullar
vidare**. En creep som tar sig igenom din bana dör inte — den fortsätter in
hos den du anfaller, med den hälsa den hade kvar när den gick igenom. Du
förlorar liv på den ändå, men klarar inte grannen den heller får du liven
tillbaka från dem.

Följ en creep genom en fyrring A → B → C → D:

| Steg | Vad händer | Liv |
|------|------------|-----|
| A skickar till B | B får creepen (hopp 0) | — |
| B läcker | creepen går vidare till C (hopp 1) | B −1, A +1 |
| C läcker | creepen går vidare till D (hopp 2) | C −1, B +1 |
| D läcker | creepen stannar — taket är nått | D −1, C +1 |

Netto: A vinner ett liv, D förlorar ett, B och C går jämnt ut. Trycket
vandrar alltså runt ringen i stället för att ta slut hos den som råkade läcka
först — och den som står sist i en kedja av misslyckanden betalar.

Taket på antalet hopp är **antalet levande spelare minus två**, vilket är
exakt så långt creepen kan rulla utan att komma tillbaka till den som betalade
för den. I 1v1 blir taket noll, och läget är identiskt med förut.

**Livstöld** följer samma riktning som i 1v1: läcker du, vinner den som
anfaller dig lika många liv. Summan liv i matchen är konstant hela vägen.

När någon når 0 liv slås de ut och **ringen sluter sig** — deras anfallare får
ett nytt mål, och du får ett meddelande om ditt byts. Sist kvar vinner, och
slutskärmen visar placering.

Lobbyn är kön: det finns ingen värd som trycker på start, rummet öppnar i samma
stund som sista platsen fylls. Tre och fyra spelare är två separata köer.

## Skadetyper och pansarklasser

Som i WC3 finns inget torn som är bra mot allt. Varje torn har en **skadetyp**
och varje creep en **pansarklass**, och tabellen avgör hur mycket som går fram:

|            | LÄTT | TUNG | PANSAR | FLYG |
|------------|------|------|--------|------|
| KINETISK   | 115% | 90%  | 60%    | 70%  |
| SPRÄNG     | 135% | 100% | 120%   | 35%  |
| TERMISK    | 130% | 115% | 85%    | 80%  |
| KRYO       | 105% | 120% | 75%    | 110% |
| ELEKTRISK  | 140% | 85%  | 60%    | 140% |
| SIKTAD     | 75%  | 135% | 120%   | 130% |

**FLYG** följer inte korridoren — drönare går rakt från in- till utgång, vilket
ofta är en tredjedel så lång sträcka. Ett torn i ett hörn hinner aldrig skjuta.

## Banan är en korridor, inte en stig

Creepsen går i en **bred gata** (3–4 rutor) och sprider ut sig i sidled över
hela bredden i stället för att gå på ett led. Allt utanför gatan går att bygga
på — 52–72 byggplatser per bana i stället för ~30 — så fältet fylls med torn
längs båda sidorna. Det är skillnaden mot en vanlig tower defense: du täcker
en gata, du följer inte en linje.

| Bana | Längd | Bredd | Byggplatser |
|------|-------|-------|-------------|
| SERPENTINEN | 26 | 3 | 52 |
| TRAPPAN | 23 | 3 | 63 |
| KROKEN | 23 | 3 | 61 |
| VINKELN | 19 | 3 | 71 |
| GATLOPPET | 18 | 4 | 72 |

Lång korridor = mer tid i eldzonen = starkare försvar, därför är banorna
ordnade efter längd.

Hela tabellen finns i spelet under **TYPER** i kontrollraden.

### Grenval vid nivå 4

Torn har sex nivåer. Nivå 1–3 är gemensamma. **Vid nivå 4 väljer du en av två
specialiseringar** och tornet byter namn, form och ofta skadetyp. Valet är
permanent — det är där partiet avgörs.

| Torn  | Gren A | Gren B |
|-------|--------|--------|
| PULS  | SPLITTER — träffar flera mål, behåller KINETISK | LANS — byter till SIKTAD, krossar TUNG och PANSAR |
| BLAST | BRAND — TERMISK plus brand som tickar i 3 s | SEISMISK — dubbel sprängradie och inbromsning |
| KRYO  | FROST — upp till 75 % långsammare | SKÄRVA — offrar bromsen för skada mot flera mål |
| ARC   | STORM — upp till nio kedjehopp | ÖVERLADDNING — nästan all kraft i första målet |
| RAIL  | LUFTVÄRN — dubbel skada mot FLYG | GAUSS — ren skada, helt utanför tabellen |

Totalt alltså **5 torn × 2 grenar = 10 sluttorn**, och 6 nivåer var.
Creeps har dessutom 5 arménivåer var (+35 % HP per nivå).

## Ljud

Allt syntetiseras med WebAudio — inga ljudfiler, så spelet laddar direkt även
på mobildata. **Varje skadetyp har sin egen klangfärg**, så man hör vad som
skjuter utan att titta: KINETISK klickar, SPRÄNG dunkar, TERMISK väser uppåt,
KRYO ringer, ELEKTRISK zappar, SIKTAD smäller till.

Musiken är generativ ambient: bas på ett och fem, pad-ackord som skiftar var
åttonde takt, och glesa melodistänk. Den **tätnar när det brinner** — täthet
och percussion styrs av hur mycket HP som är på din bana och hur mycket liv du
förlorat. Musiken går ner igen när du fått kontroll.

Ljudet startar först vid din första skärmtryckning (webbläsarkrav) och kan
stängas av med högtalarikonen uppe till höger. Valet sparas.

Det finns ett rösttak på ~14 skottljud per sekund. Utan det blir tolv torn som
skjuter samtidigt till ett grötigt brus.

## Grafik

- Parallaxstjärnor i två lager plus mjuka färgmoln som andas
- Additivt ljuslager för skott, blixtar, gnistor och spillror — det som ger
  bloom-känslan utan en riktig post-process-pipeline
- Spillror med gravitation och luftmotstånd när creeps dör
- Rekyl och mynningsflamma på tornen, glödrand när ett torn är maxat
- Energiprickar som rinner längs banan i creepsens färdriktning
- Vinjett och scanlines (cachade som mönster, inte 270 fillRect per bildruta)
- Haptik på mobil: kort vibration vid bygge, längre vid läckage

## Så är projektet uppbyggt

```
server/index.js      Express + WebSocket. Ring, lobby och relä — ingen spellogik.
public/js/config.js  All balans: ekonomi, torn, creeps, banor. Ändra känslan här.
public/js/board.js   Rutnät, väg och byggbara rutor.
public/js/sim.js     Simulering: skjuta, skada, pansar, rörelse, effekter.
public/js/ai.js      WARDEN — spelar med samma regler och priser som du.
public/js/render.js  All canvas-ritning. Split-screen på desktop, växelvy på mobil.
public/js/ui.js      HUD, sheets, menyer, sendbar.
public/js/main.js    Speltillstånd, loop, input, nätmeddelanden.
scripts/balance.mjs  Balanstest — kör två AI mot varandra och skriver ut kurvorna.
```

### Nätverksmodellen

Servern simulerar ingenting. Ett rum är en **ring** av spelare, och 1v1 är
samma sak med två länkar — då är nästa och föregående samma person. Det är
därför det bara finns en kodväg på servern: allt är kedja.

Varje klient äger sin egen bana:

- `send` och `pass` går **framåt** i ringen, till den du anfaller. `pass` är en
  läckt creep som rullar vidare, med kvarvarande hälsa och en hoppräknare.
- `snap` och `steal` går **bakåt**, till den som anfaller dig. Snapshoten går
  bakåt eftersom det är din anfallare som ritar din bana i sin ANFALL-vy; 6
  ggr/s, med creeps interpolerade mellan snapshots.
- `life` går till **hela rummet** en gång i sekunden. Snapshoten når bara en
  granne, så utan den skulle man aldrig se hur det går för resten av ringen.
- När din bana når 0 liv skickar du `lose`. Servern plockar dig ur ringen,
  sluter den igen och skickar ut vem som fått nya grannar. Sist kvar får `win`.

Det gör spelet okänsligt för latens och enkelt att bygga vidare på. Nackdelen är
att en modifierad klient kan fuska — ett problem först när det finns ranking.

## Balansera spelet

```bash
node scripts/balance.mjs             # AI mot AI, bana 1
node scripts/balance.mjs 3           # bana 4
node scripts/playtest.mjs 0 balanced # en människoliknande spelare mot AI
node scripts/playtest.mjs 0 turtle   # bygg brett och passivt — ska förlora
node scripts/playtest.mjs 0 rusher   # skicka hårt tidigt
```

`balance.mjs` visar att systemet är internt konsekvent. `playtest.mjs` visar om
det är *roligt*: den spelar som en vettig men inte perfekt människa och testar
tre strategier. En frisk balans ska ge att **turtle förlorar** — bygger man
brett i stället för djupt når man aldrig grenvalet, och då tar creepsen slut på
en. Kör flera gånger per bana; AI:n har slump och enskilda körningar är brusiga.

Skriptet kör två AI mot varandra och skriver ut liv, guld, inkomst, antal torn
och DPS var 30:e sekund. En frisk match ska:

- sluta på **8–12 minuter**,
- ha **lite guld i kassan** hela vägen (guld som samlas på hög = inkomsten skenar),
- ha **liven kvar på 20** de första minuterna (försvaret ska hålla i början).

Den känsligaste siffran är `ECON.incomeRate` i `config.js`. Den styr hur stor
andel av creepkostnaden som blir permanent inkomst, och därmed hur snabbt
ekonomin växer exponentiellt.

## Vad som ändrades från prototypen

- **Ekonomin skenade.** Inkomst per skickad creep var ~20 % av kostnaden med
  25 sekunders återbetalning, plus håll-in-knappen som skickade 4 creeps/s.
  Efter 6 minuter var inkomsten +2000/tick och matchen slutade aldrig. Nu 5 %,
  global sändcooldown på 1 s och en kö i stället för autorepetition.
- **Uppgraderingar kändes svaga.** Torn hade 4 nivåer och nådde taket tidigt.
  Nu 6 nivåer med ~2× DPS per nivå, plus en byggskatt som gör det dyrare att
  bygga brett än att uppgradera djupt.
- **Sändningar missade.** Knapparna reagerade på `pointerdown` mitt i en scroll
  och var helt avstängda när guldet inte räckte. Nu: tryck = skicka (köas om
  guldet saknas), håll = öppna armén, rörelse > 10 px = scroll.
- **Försvaret spelade ingen roll.** Alla creeps var samma sorts säck med HP.
  Nu har BJÄSSE och BOSS pansar (platt avdrag per träff) vilket gör PULS
  värdelöst mot dem och tvingar fram BLAST/RAIL — och REGEN kräver burstskada.
- **Ingen multiplayer.** Nu online 1v1 med matchmaking, och kedjan för 3–4
  spelare i en ring.
- **Grafiken.** Stjärnfält, glödande banor med flödesanimation, torn med
  nivåringar och mynningsflammor, creeps med kontur och pansarmarkering,
  guldsiffror som flyger upp vid kill, träffblink och skärmskak vid läckage.

## Nästa steg

- Ranking och konton (kräver serverauktoritativ simulering för att stoppa fusk).
- Fler torn och en uppgraderingsgren per torn (t.ex. PULS → gift eller kritisk).
- Egna banor / bandesigner.
- Ljud.
