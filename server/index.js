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

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

/* ------------------------------------------------------------------ *
 * Matchmaking + relä.
 * Servern simulerar ingenting. Varje klient äger sin egen bana och
 * skickar (a) kommandon när något lämnar banan mot motståndaren och
 * (b) en snapshot ~6 ggr/s så motståndaren kan rita ANFALL-vyn.
 * ------------------------------------------------------------------ */

const clients = new Map(); // ws -> player
const rooms = new Map();   // roomId -> {id, a, b, mapIndex, startedAt}
let queue = [];
let nextId = 1;

const MAP_COUNT = 5;

function send(ws, msg) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function makePlayer(ws) {
  return { id: nextId++, ws, name: 'PILOT', room: null, alive: true, lastSeen: Date.now() };
}

function tryMatch() {
  queue = queue.filter(p => p.ws.readyState === p.ws.OPEN && !p.room);
  while (queue.length >= 2) {
    const a = queue.shift();
    const b = queue.shift();
    const room = {
      id: 'r' + nextId++,
      a, b,
      mapIndex: Math.floor(Math.random() * MAP_COUNT),
      startedAt: Date.now(),
    };
    rooms.set(room.id, room);
    a.room = room; b.room = room;
    send(a.ws, { t: 'match', room: room.id, mapIndex: room.mapIndex, opp: b.name });
    send(b.ws, { t: 'match', room: room.id, mapIndex: room.mapIndex, opp: a.name });
  }
}

function opponentOf(p) {
  if (!p.room) return null;
  return p.room.a === p ? p.room.b : p.room.a;
}

function closeRoom(room, reason, loserId) {
  if (!room || !rooms.has(room.id)) return;
  rooms.delete(room.id);
  for (const p of [room.a, room.b]) {
    if (!p) continue;
    p.room = null;
    if (p.id !== loserId) send(p.ws, { t: reason });
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
    const opp = opponentOf(player);

    switch (m.t) {
      case 'find':
        if (player.room) return;
        player.name = String(m.name || 'PILOT').slice(0, 14).toUpperCase();
        if (!queue.includes(player)) queue.push(player);
        send(ws, { t: 'waiting', queued: queue.length });
        tryMatch();
        break;

      case 'cancel':
        queue = queue.filter(p => p !== player);
        send(ws, { t: 'cancelled' });
        break;

      // Vidarebefordra allt spelrelaterat rakt av till motståndaren.
      case 'send':
      case 'snap':
      case 'emote':
        if (opp) send(opp.ws, m);
        break;

      case 'lose':
        if (player.room) closeRoom(player.room, 'opp_lost', player.id);
        break;

      case 'leave':
        if (player.room) closeRoom(player.room, 'opp_left', player.id);
        queue = queue.filter(p => p !== player);
        break;

      case 'ping':
        send(ws, { t: 'pong', ts: m.ts });
        break;
    }
  });

  ws.on('close', () => {
    queue = queue.filter(p => p !== player);
    if (player.room) closeRoom(player.room, 'opp_left', player.id);
    clients.delete(ws);
  });

  ws.on('error', () => { /* close-handlern städar */ });
});

// Rensa döda anslutningar
setInterval(() => {
  for (const [ws, p] of clients) {
    if (ws.readyState !== ws.OPEN) {
      queue = queue.filter(q => q !== p);
      if (p.room) closeRoom(p.room, 'opp_left', p.id);
      clients.delete(ws);
    }
  }
}, 15000);

server.listen(PORT, () => {
  console.log(`NEXUS WARS körs på http://localhost:${PORT}`);
});
