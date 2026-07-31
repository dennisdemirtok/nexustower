/* Tunn WebSocket-klient. Servern reläar bara — all spellogik är lokal. */

let ws = null;
let handlers = {};
let reconnectT = null;
export let status = 'offline';

export function connect(h) {
  handlers = h;
  open();
}

function open() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  try { ws = new WebSocket(`${proto}://${location.host}/ws`); }
  catch { status = 'offline'; return; }

  ws.onopen = () => { status = 'online'; handlers.onStatus?.('online'); };
  ws.onclose = () => {
    status = 'offline';
    handlers.onStatus?.('offline');
    clearTimeout(reconnectT);
    reconnectT = setTimeout(open, 3000);
  };
  ws.onerror = () => { /* onclose sköter återanslutning */ };
  ws.onmessage = e => {
    let m; try { m = JSON.parse(e.data); } catch { return; }
    handlers.onMessage?.(m);
  };
}

export function send(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

export function isOpen() { return ws && ws.readyState === WebSocket.OPEN; }
