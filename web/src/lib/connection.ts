// Browser ↔ relay WebSocket. The relay keeps the MUD session alive across reloads, keyed by a
// per-tab session id, so refreshing the page reattaches instead of logging out.
import { game } from './store.ts';

let ws: WebSocket | null = null;

function sessionId() {
  try {
    let id = sessionStorage.getItem('gaslamp.session');
    if (!id) { id = crypto.randomUUID(); sessionStorage.setItem('gaslamp.session', id); }
    return id;
  } catch { return crypto.randomUUID(); }
}

export function startConnection() {
  const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  ws = new WebSocket(url);
  ws.onopen = () => ws!.send(JSON.stringify({ t: 'hello', session: sessionId() }));
  ws.onmessage = (e) => {
    let msg: any;
    try { msg = JSON.parse(e.data); } catch { return; }
    if (msg.t === 'session') {
      game.onSession(!!msg.resumed, msg.game, msg.family);
      return;
    }
    try { game.onMessage(msg); } catch (err) { console.error(err); }
  };
  ws.onclose = () => {
    game.onMessage({ t: 'status', connected: false, msg: 'Lost contact with relay; retrying…' });
    setTimeout(startConnection, 2000);
  };
}

game.attach((msg) => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg)); });
