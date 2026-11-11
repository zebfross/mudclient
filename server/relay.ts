// WebSocket <-> telnet relay. Each browser socket gets its own MUD connection.
// Browser -> relay: {t:'connect'} | {t:'cmd', d} | {t:'gmcp', pkg, data?} | {t:'disconnect'}
// Relay -> browser: {t:'text', d} | {t:'prompt'} | {t:'gmcp', pkg, data} | {t:'echo', on} | {t:'status', connected, msg?}
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import { TelnetClient } from './telnet.ts';

const PORT = Number(process.env.PORT ?? 4321);

// Which game this relay connects to. MUD=achaea picks Iron Realms' Achaea; MUD_HOST/MUD_PORT override.
// `family` tells the browser which game's conventions (GMCP shapes, login, commands) to expect.
const PROFILES = {
  aardwolf: { family: 'aardwolf', host: 'aardmud.org', port: 4000, gmcp: ['Char 1', 'Room 1', 'Comm 1', 'Group 1'] },
  achaea: { family: 'ire', host: 'achaea.com', port: 23, gmcp: ['Char 1', 'Char.Items 1', 'Char.Skills 1', 'Room 1', 'Comm.Channel 1', 'IRE.Rift 1', 'IRE.Target 1'] },
} as const;
type GameId = keyof typeof PROFILES;
const isGame = (g: unknown): g is GameId => typeof g === 'string' && g in PROFILES;
// The game for browsers that don't say (MUD=achaea). The browser normally picks one in the header.
const DEFAULT_GAME: GameId = isGame(process.env.MUD) ? process.env.MUD : 'aardwolf';
/** Where to connect. MUD_HOST/MUD_PORT override the default game's address (e.g. a local test MUD). */
function target(game: GameId) {
  const p = PROFILES[game];
  const local = game === DEFAULT_GAME;
  return { ...p, host: (local && process.env.MUD_HOST) || p.host, port: Number((local && process.env.MUD_PORT) || p.port) };
}
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
  game: GameId;
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
  const t = target(sess.game);
  send(sess, { t: 'status', connected: false, msg: `Connecting to ${t.host}:${t.port}…` });
  const m = new TelnetClient({
    host: t.host, port: t.port, clientName: 'Gaslamp',
    gmcpSupports: [...t.gmcp],
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
      const game: GameId = isGame(msg.game) ? msg.game : DEFAULT_GAME;
      const found = id ? sessions.get(id) : undefined;
      // A session id belongs to one game; asked for another, start fresh rather than cross wires.
      const existing = found?.game === game ? found : undefined;
      if (found && !existing) { found.mud?.close(); sessions.delete(id); }
      if (existing) {
        clearTimeout(existing.expiry);
        existing.ws?.close();
        existing.ws = ws;
        sess = existing;
        ws.send(JSON.stringify({ t: 'session', resumed: !!existing.mud, game, family: PROFILES[game].family }));
        for (const m of existing.backlog.splice(0)) ws.send(m);
      } else {
        sess = { game, mud: null, ws, backlog: [] };
        if (id) sessions.set(id, sess);
        ws.send(JSON.stringify({ t: 'session', resumed: false, game, family: PROFILES[game].family }));
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

server.listen(PORT, () => console.log(`relay on http://localhost:${PORT} → ${Object.keys(PROFILES).join(', ')} (default ${DEFAULT_GAME}: ${target(DEFAULT_GAME).host}:${target(DEFAULT_GAME).port})`));
