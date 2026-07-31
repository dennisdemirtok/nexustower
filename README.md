# NEXUS WARS

Modern *line tower wars* för mobil och desktop. Du bygger torn på din egen bana
och skickar creeps mot motståndarens. Varje creep du skickar höjer din inkomst
permanent — men ger motståndaren guld när den dör. Först till 0 liv förlorar.

Två lägen:

- **Kampanj** — 5 sektorer mot WARDEN-AI med stigande svårighetsgrad.
- **Online 1v1** — matchmaking mot en riktig spelare via WebSocket.

## Kom igång lokalt

```bash
npm install
npm start
```

Öppna http://localhost:3000. För att testa online 1v1 lokalt: öppna två flikar
och tryck **ONLINE 1v1 → SÖK MATCH** i båda.

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

## Så är projektet uppbyggt

```
server/index.js      Express + WebSocket. Matchmaking och relä — ingen spellogik.
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

Servern simulerar ingenting. Varje klient äger sin egen bana:

- När du skickar en creep går ett `send`-meddelande till motståndaren, som
  spawnar den på sin bana.
- Din bana skickas som en snapshot 6 ggr/s så motståndaren kan rita ANFALL-vyn.
  Creeps interpoleras mellan snapshots så det ser mjukt ut.
- När din bana når 0 liv skickar du `lose` och motståndaren får sin seger.

Det gör spelet okänsligt för latens och enkelt att bygga vidare på. Nackdelen är
att en modifierad klient kan fuska — ett problem först när det finns ranking.

## Balansera spelet

```bash
node scripts/balance.mjs          # bana 1
node scripts/balance.mjs 3        # bana 4
node scripts/balance.mjs 0 4 0    # OMEGA mot WARDEN-1 på bana 1
```

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
- **Ingen multiplayer.** Nu online 1v1 med matchmaking.
- **Grafiken.** Stjärnfält, glödande banor med flödesanimation, torn med
  nivåringar och mynningsflammor, creeps med kontur och pansarmarkering,
  guldsiffror som flyger upp vid kill, träffblink och skärmskak vid läckage.

## Nästa steg

- Ranking och konton (kräver serverauktoritativ simulering för att stoppa fusk).
- Fler torn och en uppgraderingsgren per torn (t.ex. PULS → gift eller kritisk).
- Egna banor / bandesigner.
- Ljud.
