import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer } from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const app = express();
const isProd = process.env.NODE_ENV === 'production' || !!process.env.RAILWAY_ENVIRONMENT;
// ES-moduler cachas per fil, så en versionsquery på index.html räcker inte.
// Vi kör revalidering (ETag) i stället — filerna är små.
app.use(express.static(path.join(__dirname, '..', 'public'), {
  maxAge: 0,
  etag: true,
  setHeaders(res) {
    res.setHeader('Cache-Control', isProd ? 'no-cache' : 'no-store');
  },
}));
app.get('/health', (_req, res) => res.json({ ok: true, players: clients.size, rooms: rooms.size }));

/* Dev-verktyget under public/_dev renderar GLB-modeller till sprites i
   webbläsaren och behöver kunna lägga resultatet på disk. Rutten finns
   bara lokalt — i produktion existerar den inte alls, och sökvägen tvingas
   ner i public/assets så den aldrig kan skriva utanför. */
if (!isProd) {
  app.post('/_dev/save', express.json({ limit: '40mb' }), async (req, res) => {
    const { name, dataUrl } = req.body || {};
    if (!/^[a-z0-9/_-]+\.png$/i.test(name || '')) return res.status(400).json({ error: 'ogiltigt namn' });
    const dest = path.resolve(__dirname, '..', 'public', 'assets', name);
    const root = path.resolve(__dirname, '..', 'public', 'assets');
    if (!dest.startsWith(root + path.sep)) return res.status(400).json({ error: 'utanför assets' });
    const buf = Buffer.from(String(dataUrl).split(',')[1] || '', 'base64');
    const { mkdir, writeFile } = await import('node:fs/promises');
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, buf);
    res.json({ ok: true, bytes: buf.length });
  });
}

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

/* ------------------------------------------------------------------ *
 * Matchmaking + relä.
 *
 * Servern simulerar ingenting. Ett rum är en RING av spelare: var och en
 * anfaller nästa i ringen och försvarar sig mot föregående. Vanlig 1v1 är
 * samma sak med två spelare — då är nästa och föregående samma person och
 * ringen beter sig precis som det gamla duelläget. Det är därför det bara
 * finns EN kodväg här: allt är kedja, 1v1 är kedjan med två länkar.
 *
 * Varje klient äger sin egen bana och skickar
 *   send/pass  → nästa spelare (det jag anfaller med)
 *   snap/steal → föregående spelare (den som anfaller MIG)
 * Snapshoten går bakåt eftersom det är min anfallare som behöver rita min
 * bana i sin ANFALL-vy. Livstölden går samma väg: läcker jag, vinner den
 * som skickade creepen.
 * ------------------------------------------------------------------ */

const clients = new Map(); // ws -> player
const rooms = new Map();   // roomId -> room
const queues = new Map();  // 'chain:3' -> [player]
let nextId = 1;

const MAP_COUNT = 5;
const SIZES = new Set([2, 3, 4]);

function send(ws, msg) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function makePlayer(ws) {
  return { id: nextId++, ws, name: 'PILOT', room: null, queue: null, lives: 0, lastSeen: Date.now() };
}

/* ---------------- kö ---------------- */
const qkey = (mode, size) => `${mode}:${size}`;

function leaveQueue(p) {
  if (!p.queue) return;
  const k = p.queue;
  p.queue = null;
  const q = queues.get(k);
  if (!q) return;
  queues.set(k, q.filter(x => x !== p));
  pumpQueue(k);
}

function joinQueue(p, mode, size) {
  leaveQueue(p);
  const k = qkey(mode, size);
  const q = queues.get(k) || [];
  q.push(p);
  queues.set(k, q);
  p.queue = k;
  pumpQueue(k);
}

/* Starta så många rum som kön räcker till och berätta för resten hur
   många de väntar på. Lobbyn ÄR kön — det finns ingen värd som trycker
   på start, rummet öppnar i samma stund som sista platsen fylls. */
function pumpQueue(k) {
  const [mode, sizeStr] = k.split(':');
  const size = Number(sizeStr);
  let q = (queues.get(k) || []).filter(p => p.ws.readyState === p.ws.OPEN && !p.room);
  while (q.length >= size) startRoom(q.splice(0, size), mode);
  queues.set(k, q);
  for (const p of q) {
    p.queue = k;
    send(p.ws, { t: 'lobby', mode, size, have: q.length, need: size - q.length, names: q.map(x => x.name) });
  }
}

/* ---------------- ring ---------------- */
function startRoom(players, mode) {
  const room = {
    id: 'r' + nextId++,
    mode,
    size: players.length,
    order: players.slice(),
    mapIndex: Math.floor(Math.random() * MAP_COUNT),
    startedAt: Date.now(),
  };
  rooms.set(room.id, room);
  for (const p of players) { p.room = room; p.queue = null; p.lives = 0; }
  players.forEach((p, seat) => {
    send(p.ws, {
      t: 'match',
      room: room.id,
      mapIndex: room.mapIndex,
      mode: room.mode,
      size: room.size,
      seat,
      id: p.id,
      ...ringPayload(room, p),
    });
  });
}

const stepIn = (room, p, d) => {
  const i = room.order.indexOf(p);
  if (i < 0 || !room.order.length) return null;
  return room.order[(i + d + room.order.length) % room.order.length];
};

const nextOf = p => (p.room ? stepIn(p.room, p, +1) : null);
const prevOf = p => (p.room ? stepIn(p.room, p, -1) : null);

/* Vem anfaller vem — skickas vid start och varje gång någon slås ut, för
   då sluter sig ringen och två spelare får en ny granne. */
function ringPayload(room, p) {
  const nx = stepIn(room, p, +1), pv = stepIn(room, p, -1);
  return {
    alive: room.order.length,
    ring: room.order.map(q => ({ id: q.id, name: q.name, lives: q.lives })),
    target: nx ? nx.name : '', targetId: nx ? nx.id : 0,
    attacker: pv ? pv.name : '', attackerId: pv ? pv.id : 0,
  };
}

function sendRing(room) {
  for (const p of room.order) send(p.ws, { t: 'ring', ...ringPayload(room, p) });
}

/* Ut ur ringen. Placeringen är antalet spelare som fortfarande lever plus
   en själv — den som ryker först i en fyra blir alltså fyra. */
function eliminate(p, reason) {
  const room = p.room;
  if (!room || !rooms.has(room.id)) return;
  const i = room.order.indexOf(p);
  if (i < 0) return;
  room.order.splice(i, 1);
  p.room = null;
  const place = room.order.length + 1;

  if (reason !== 'left') send(p.ws, { t: 'eliminated', place, of: room.size });
  for (const q of room.order) {
    send(q.ws, { t: 'out', id: p.id, name: p.name, place, alive: room.order.length, reason });
  }

  if (room.order.length <= 1) {
    const w = room.order[0];
    room.order = [];
    rooms.delete(room.id);
    if (w) { w.room = null; send(w.ws, { t: 'win', place: 1, of: room.size }); }
  } else {
    sendRing(room);
  }
}

wss.on('connection', (ws) => {
  const player = makePlayer(ws);
  clients.set(ws, player);
  send(ws, { t: 'hello', id: player.id });

  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw.toString()); } catch { return; }
    player.lastSeen = Date.now();

    switch (m.t) {
      case 'find': {
        if (player.room) return;
        player.name = String(m.name || 'PILOT').slice(0, 14).toUpperCase();
        const mode = m.mode === 'chain' ? 'chain' : 'duel';
        const size = SIZES.has(m.size) ? m.size : (mode === 'chain' ? 3 : 2);
        joinQueue(player, mode, size);
        break;
      }

      case 'cancel':
        leaveQueue(player);
        send(ws, { t: 'cancelled' });
        break;

      // Framåt i ringen: det jag anfaller med.
      case 'send':
      case 'pass':
      case 'emote': {
        const nx = nextOf(player);
        if (nx) send(nx.ws, { ...m, from: player.id, fromName: player.name });
        break;
      }

      // Bakåt i ringen: min bana och mina läckor tillhör den som anfaller mig.
      case 'snap':
      case 'steal': {
        const pv = prevOf(player);
        if (pv) send(pv.ws, { ...m, from: player.id });
        break;
      }

      /* Livräknaren för hela ringen. Snapshoten går bara till en granne, så
         utan det här skulle man aldrig se hur det går för den tredje
         spelaren — och i en kedja är det just den man behöver hålla koll på
         för att veta om trycket är på väg att nå en själv. */
      case 'life': {
        player.lives = m.l | 0;
        const room = player.room;
        if (room) for (const q of room.order) if (q !== player) send(q.ws, { t: 'lives', id: player.id, l: player.lives });
        break;
      }

      case 'lose':
        eliminate(player, 'lost');
        break;

      case 'leave':
        leaveQueue(player);
        eliminate(player, 'left');
        break;

      case 'ping':
        send(ws, { t: 'pong', ts: m.ts });
        break;
    }
  });

  ws.on('close', () => {
    leaveQueue(player);
    eliminate(player, 'left');
    clients.delete(ws);
  });

  ws.on('error', () => { /* close-handlern städar */ });
});

// Rensa döda anslutningar
setInterval(() => {
  for (const [ws, p] of clients) {
    if (ws.readyState !== ws.OPEN) {
      leaveQueue(p);
      eliminate(p, 'left');
      clients.delete(ws);
    }
  }
}, 15000);

server.listen(PORT, () => {
  console.log(`NEXUS WARS körs på http://localhost:${PORT}`);
});
