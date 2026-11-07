// WebSocket <-> telnet relay. Each browser socket gets its own MUD connection.
// Browser -> relay: {t:'connect'} | {t:'cmd', d} | {t:'gmcp', pkg, data?} | {t:'disconnect'}
// Relay -> browser: {t:'text', d} | {t:'prompt'} | {t:'gmcp', pkg, data} | {t:'echo', on} | {t:'status', connected, msg?}
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import { TelnetClient } from './telnet.ts';

const PORT = Number(process.env.PORT ?? 4321);
const MUD_HOST = process.env.MUD_HOST ?? 'aardmud.org';
const MUD_PORT = Number(process.env.MUD_PORT ?? 4000);
const DIST = path.resolve(import.meta.dirname, '../web/dist');
const MIME: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  let file = path.join(DIST, decodeURIComponent(url.pathname));
  if (!file.startsWith(DIST)) { res.writeHead(403).end(); return; }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
  if (!fs.existsSync(file)) { res.writeHead(404).end('Run `npm run build` first, or use `npm run dev`.'); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

const wss = new WebSocketServer({ server, path: '/ws' });

// A session outlives its browser socket for a while, so reloading the page doesn't log you out.
const DETACHED_TTL = 10 * 60_000;
const BACKLOG_MAX = 5000;
interface Session {
  mud: TelnetClient | null;
  ws: WebSocket | null;
  backlog: string[];
  expiry?: ReturnType<typeof setTimeout>;
}
const sessions = new Map<string, Session>();

function send(sess: Session, msg: object) {
  const data = JSON.stringify(msg);
  if (sess.ws && sess.ws.readyState === sess.ws.OPEN) sess.ws.send(data);
  else if (sess.backlog.push(data) > BACKLOG_MAX) sess.backlog.shift();
}

function connectMud(sess: Session) {
  sess.mud?.close();
  send(sess, { t: 'status', connected: false, msg: `Connecting to ${MUD_HOST}:${MUD_PORT}…` });
  const m = new TelnetClient({
    host: MUD_HOST, port: MUD_PORT, clientName: 'Gaslamp',
    gmcpSupports: ['Char 1', 'Room 1', 'Comm 1', 'Group 1'],
  });
  sess.mud = m;
  m.on('open', () => send(sess, { t: 'status', connected: true }));
  m.on('text', (d) => send(sess, { t: 'text', d }));
  m.on('prompt', () => send(sess, { t: 'prompt' }));
  m.on('gmcp', (pkg, data) => send(sess, { t: 'gmcp', pkg, data }));
  m.on('echo', (on) => send(sess, { t: 'echo', on }));
  m.on('close', (msg) => { if (sess.mud === m) { sess.mud = null; send(sess, { t: 'status', connected: false, msg }); } });
}

wss.on('connection', (ws: WebSocket) => {
  let sess: Session | null = null;

  ws.on('message', (raw) => {
    let msg: any;
    try { msg = JSON.parse(String(raw)); } catch { return; }
    if (msg.t === 'hello') {
      const id = typeof msg.session === 'string' ? msg.session.slice(0, 64) : '';
      const existing = id ? sessions.get(id) : undefined;
      if (existing) {
        clearTimeout(existing.expiry);
        existing.ws?.close();
        existing.ws = ws;
        sess = existing;
        ws.send(JSON.stringify({ t: 'session', resumed: !!existing.mud }));
        for (const m of existing.backlog.splice(0)) ws.send(m);
      } else {
        sess = { mud: null, ws, backlog: [] };
        if (id) sessions.set(id, sess);
        ws.send(JSON.stringify({ t: 'session', resumed: false }));
      }
      return;
    }
    if (!sess) return;
    if (msg.t === 'connect') connectMud(sess);
    else if (msg.t === 'disconnect') sess.mud?.close();
    else if (msg.t === 'cmd' && typeof msg.d === 'string') sess.mud?.send(msg.d);
    else if (msg.t === 'gmcp' && typeof msg.pkg === 'string') sess.mud?.sendGmcp(msg.pkg, msg.data);
  });

  ws.on('close', () => {
    const s = sess;
    if (!s || s.ws !== ws) return;
    s.ws = null;
    s.expiry = setTimeout(() => {
      s.mud?.close();
      for (const [id, v] of sessions) if (v === s) sessions.delete(id);
    }, DETACHED_TTL);
  });
});

server.listen(PORT, () => console.log(`relay on http://localhost:${PORT} → ${MUD_HOST}:${MUD_PORT}`));
