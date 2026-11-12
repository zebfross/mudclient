// Game state: turns the relay's text/GMCP stream into structured UI state.
import { useSyncExternalStore } from 'react';
import { currentGame, gameKey } from './gameChoice.ts';
import { AnsiParser, plain, type Seg } from './ansi.ts';
import { aardSegs, stripAard } from './aardColor.ts';
import { adapterFor, type GameAdapter, type Host } from './games/index.ts';
import type { CaptureCb } from './games/types.ts';
import { mapNums, num, trimBlankLines } from './games/util.ts';
export { extractMap } from './games/util.ts';
import { Mapper, type RoomInfo, type SeenCell } from './mapper.ts';
import { key, labelGrid, parseAsciiMap } from './asciiMap.ts';
import { LASTING } from './mapStyle.ts';
import { DETAIL_TYPES, parseInvDetails, type ItemDetails } from './items.ts';
import { SUN_EVENTS, emptyClock, parseTimeLine, type GameClock } from './gameTime.ts';
import { parseBoards, parseNote, parseNoteList, type Board, type Note, type Post } from './notes.ts';

export interface NotesState {
  boards: Board[];
  current?: string; // the game's current forum, as far as we know
  forum: string; // the board shown in the panel
  posts: Post[]; // newest first
  open: Note | null;
  reading?: number;
  loading: boolean;
  at: number;
  /** Writing a note through Aardwolf's note editor, step by step. */
  compose?: { stage: 'starting' | 'to' | 'subject' | 'checking' | 'body' | 'posting' | 'posted' | 'error'; error?: string };
}
export interface NoteDraft { to: string; subject: string; body: string }
// Aardwolf's exact wording isn't documented, so these are deliberately broad.
const NOTE_REFUSED_RE = /not found|no such|no one|nobody|invalid|cannot|can't|unable|not allowed|you must|huh\?/i;
const DIR_FULL: Record<string, string> = {
  n: 'north', s: 'south', e: 'east', w: 'west', u: 'up', d: 'down',
  ne: 'northeast', nw: 'northwest', se: 'southeast', sw: 'southwest', in: 'in', out: 'out',
  north: 'north', south: 'south', east: 'east', west: 'west', up: 'up', down: 'down',
  northeast: 'northeast', northwest: 'northwest', southeast: 'southeast', southwest: 'southwest',
};
// "Stitch tells you 'I would pay around 15 gold coins for a long sword.'" / "Stitch is not interested in a pink flamingo."
// Narrow on purpose: a player's tell arriving meanwhile must not be taken (and hidden) as the answer.
const VALUE_REPLY_RE = /tells you '(?:I would pay|Alas, I cannot afford)|is not interested in|is far too valuable to sell|cannot be sold|can'?t be sold|you don'?t (?:have|seem to have)|you do not have|there is no shopkeeper|no shopkeeper here|won'?t buy|doesn'?t buy/i;
/** A shopkeeper's answer to 'value': the gold offered, or null when they won't (or can't) buy it. */
export function parseValueReply(text: string): { keeper: string; gold: number | null; why?: string } | null {
  const pay = /^\s*(.+?) tells you '.*?\bpay\b\D*([\d,]+) gold/i.exec(text);
  if (pay) return { keeper: pay[1].trim(), gold: Number(pay[2].replace(/,/g, '')) };
  const afford = /^\s*(.+?) tells you '.*cannot afford/i.exec(text);
  if (afford) return { keeper: afford[1].trim(), gold: null, why: 'can’t afford it' };
  const no = /^\s*(.+?) (?:is not interested in|won'?t buy|doesn'?t buy)/i.exec(text);
  if (no) return { keeper: no[1].trim(), gold: null };
  if (/too valuable to sell/i.test(text)) return { keeper: '', gold: null, why: 'too valuable to sell' };
  if (/cannot be sold|can'?t be sold/i.test(text)) return { keeper: '', gold: null, why: 'can’t be sold to a shop' };
  return null;
}
const SHOPS_KEY = gameKey('gaslamp.shops.v1');
function loadShops(): Map<number, ShopOffers> {
  try { return new Map((JSON.parse(localStorage.getItem(SHOPS_KEY) ?? '[]') as ShopOffers[]).map((e) => [e.room, e])); } catch { return new Map(); }
}
function saveShops(m: Map<number, ShopOffers>) {
  try { localStorage.setItem(SHOPS_KEY, JSON.stringify([...m.values()].slice(-60))); } catch { /* ignore */ }
}
const NOTE_EDITOR_IN_RE = /^\s*You are now creating a new post|^\s*Enter your post\. Type END/i;
const NOTE_EDITOR_OUT_RE = /^\s*You are back in the game|^\s*Note cancelled/i;
const NOTE_POSTED_RE = /note (?:has been |was )?(?:posted|sent)|posted (?:to|on)|your note (?:has|is)|added to the/i;

/**
 * A note body as editor lines: wrapped to fit, blank edges trimmed. A line that the editor would
 * read as a command ('.q', '.p', 'end'…) gets a leading space so it stays text.
 */
export function noteLines(body: string, width = 76): string[] {
  const out: string[] = [];
  for (const raw of body.replace(/\r/g, '').split('\n')) {
    let line = raw.replace(/\s+$/, '');
    if (!line.trim()) { out.push(' '); continue; }
    while (line.length > width) {
      const cut = line.lastIndexOf(' ', width);
      const at = cut > width / 2 ? cut : width;
      out.push(line.slice(0, at));
      line = line.slice(at).replace(/^ /, '');
    }
    out.push(line);
  }
  while (out.length && !out[0].trim()) out.shift();
  while (out.length && !out[out.length - 1].trim()) out.pop();
  return out.map((l) => (/^\s*(?:\.|end\s*$)/i.test(l) && !l.startsWith(' ') ? ` ${l}` : l));
}
const emptyNotes = (): NotesState => ({ boards: [], forum: 'Personal', posts: [], open: null, loading: false, at: 0 });
// e.g. Aaeron says, "I have sent a personal note to you…" / "A new note has been posted…"
export interface LoginState { stage: 'idle' | 'waiting' | 'name' | 'password' | 'error'; error?: string; retry?: boolean }
// The wording isn't documented, so these are deliberately broad. (The name prompt is per game.)
const WRONG_PASSWORD_RE = /wrong password|incorrect password|password (?:is )?incorrect|invalid password/i;
// Only checked after the name was sent: the login banner itself mentions creating a new character.
const NEW_CHAR_RE = /did i get that right|is that (?:right|correct)\?|no such (?:player|character)/i;
const PRESS_RETURN_RE = /press (?:return|enter)|\[\s*(?:return|enter)\s*\]|hit (?:return|enter)/i;
const NEW_NOTE_RE = /\b(sent|posted|left|written)\b.*\bnote\b|\bnew (personal )?(note|post)s?\b/i;
import { emptyLasertag, parseCharges, parseRoster, parseScan, type Lasertag, type Target, type Team } from './lasertag.ts';
import { applyQuestEvent, emptyObjectives, isActiveGoal, parseCampaign, parseGoalDetail, parseGoalList, type Objectives } from './objectives.ts';

export interface Line { id: number; segs: Seg[]; kind?: 'echo' | 'sys' | 'prompt' }
export interface ShopOffers { room: number; keeper: string; offers: Record<string, number | null> }

export interface InvItem {
  id: string; flags: string; name: Seg[]; plainName: string;
  level: number; type: number; unique: boolean; wearLoc: number; timer: number;
}
export interface ChatMsg { id: number; chan: string; player: string; msg: Seg[]; at: number; imported?: boolean }
export interface GroupMember { name: string; info: Record<string, number | string> }

/** Which game the relay is connected to. `family` decides whose conventions apply. */
export interface MudInfo { game: string; family: 'aardwolf' | 'ire' }

export interface State {
  mud: MudInfo;
  connected: boolean;
  status: string;
  localEcho: boolean;
  loggedIn: boolean;
  login: LoginState;
  sessionAt: number; // when the relay told us whether this tab's MUD session survived
  manualDisconnect: boolean; // you pressed Disconnect: don't log back in by yourself
  lines: Line[];
  partial: Seg[];
  char: {
    base?: Record<string, any>;
    vitals?: { hp: number; mana: number; moves: number };
    maxstats?: Record<string, number>;
    stats?: Record<string, number>;
    status?: Record<string, any>;
    worth?: Record<string, number>;
    ire?: { vitals?: Record<string, string>; status?: Record<string, string> };
    /** Iron Realms: can you act? Balance (body) and equilibrium (mind). */
    ready?: { balance: boolean; equilibrium: boolean };
  };
  room?: RoomInfo;
  roomDesc: string[];
  roomChars: Seg[][];
  roomObjs: Seg[][];
  inventory: InvItem[];
  inventoryAt: number;
  equipment: InvItem[];
  itemDetails: Record<string, ItemDetails>; // from `invdetails`, by object id
  chat: ChatMsg[];
  group?: { groupname: string; leader: string; members: GroupMember[] };
  tagsListing: string[];
  mapVersion: number;
  objectives: Objectives;
  notes: NotesState;
  clock: GameClock;
  asciiMap: Seg[][];
  /** Set when you die; cleared when you loot your corpse or dismiss the banner. */
  death: { at: number } | null;
  /** What the shopkeeper here would pay for your items: gold, or null for "not interested". */
  shop: ShopOffers | null;
  shopAsking: boolean;
  /** In Aardwolf's note editor: whatever you type becomes part of the note. */
  noteEditor: boolean;
  lasertag: Lasertag;
}

const MAX_LINES = 3000;
const BLOCK_TAGS = new Set(['rdesc', 'roomchars', 'roomobjs', 'invdata', 'eqdata']);
const HIDDEN_BLOCKS = new Set(['invdata', 'eqdata']);
// Aardwolf tag names (first column of the `tags` listing) that this client knows how to parse.
const WANT_TAGS = ['roomnames', 'roomdescs', 'roomchars', 'roomobjs', 'exits', 'coords', 'map'];
const INV_VERBS = /^(get|take|drop|put|give|buy|sell|wear|wield|remove|rem|hold|quaff|eat|drink|recite|sac|sacrifice|junk|donate|brandish|zap|loot|keep|unkeep)\b/i;

let nextId = 1;

function takePrefix(segs: Seg[], n: number): Seg[] {
  const out: Seg[] = [];
  for (const s of segs) {
    if (n <= 0) break;
    out.push(s.text.length <= n ? s : { ...s, text: s.text.slice(0, n) });
    n -= s.text.length;
  }
  return out;
}

function stripPrefix(segs: Seg[], n: number): Seg[] {
  const out: Seg[] = [];
  for (const s of segs) {
    if (n <= 0) { out.push(s); continue; }
    if (s.text.length <= n) { n -= s.text.length; continue; }
    out.push({ ...s, text: s.text.slice(n) });
    n = 0;
  }
  return out;
}

export class Game implements Host {
  state: State = {
    mud: { game: currentGame.id, family: currentGame.family },
    connected: false, status: 'Not connected', localEcho: true, loggedIn: false, login: { stage: 'idle' }, sessionAt: 0, manualDisconnect: false,
    lines: [], partial: [], char: {}, roomDesc: [], roomChars: [], roomObjs: [],
    inventory: [], inventoryAt: 0, equipment: [], itemDetails: loadItemDetails(), chat: loadChat(), tagsListing: [], mapVersion: 0, objectives: emptyObjectives(), notes: emptyNotes(), clock: emptyClock(), asciiMap: [], death: null, shop: null, shopAsking: false, noteEditor: false, lasertag: emptyLasertag(),
  };
  mapper = new Mapper();
  private listeners = new Set<() => void>();
  private ansi = new AnsiParser();
  private cur: Seg[] = [];
  private block: { tag: string; lines: Seg[][] } | null = null;
  // Replies to commands the client sends on its own are hidden. Prompts can't be paired with
  // commands reliably (combat and ticks emit prompts too), so every hiding rule expires.
  private suppressPrompts = 0;
  private suppressPromptsUntil = 0;
  private hideMatching: { re: RegExp; until: number } | null = null;
  private tellHistoryQuietUntil = 0; // hide `tell -h` output the client asked for itself
  private tellOffset = 0;            // server clock minus local clock, learned from matching tells
  private capture: { cb: CaptureCb; start: RegExp; end?: RegExp; started: boolean; lines: Seg[][]; timer: ReturnType<typeof setTimeout> } | null = null;
  private captureQueue: { cmd: string; start: RegExp; end?: RegExp; cb: CaptureCb }[] = [];
  private mapTimer: ReturnType<typeof setTimeout> | undefined;
  // The player's prompt, learned from a confirmed prompt with numbers generalised, so a prompt is
  // recognised however it arrives: after GA, after a pause, ended by a newline, or with a reply
  // glued on. Saved so it's known straight after a reload.
  private promptRe: RegExp | null = loadPromptRe();
  private mapTagOn = false; // only with <MAPSTART>/<MAPEND> markers can a map reply be told apart
  private mapBlock: Seg[][] | null = null; // collecting a <MAPSTART>…<MAPEND> block from normal output
  private invTimer: ReturnType<typeof setTimeout> | undefined;
  private sendRaw: (msg: object) => void = () => {};
  private pendingLines: Line[] = [];
  // Aardwolf doesn't send GA/EOR after prompts by default, so an idle partial line counts as one.
  private sawGA = false;
  private promptTimer: ReturnType<typeof setTimeout> | undefined;
  private flushQueued = false;

  attach(send: (msg: object) => void) { this.sendRaw = send; }

  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => this.listeners.delete(fn); };
  getSnapshot = () => this.state;

  /** This game's conventions (Aardwolf, Iron Realms…), picked by what the relay connects to. */
  get adapter(): GameAdapter { return adapterFor(this.state.mud.family); }

  set(patch: Partial<State>) {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  // Lines arrive in bursts; batch them into one state update per animation frame.
  print(line: Omit<Line, 'id'>) {
    this.pendingLines.push({ id: nextId++, ...line });
    if (this.flushQueued) return;
    this.flushQueued = true;
    queueMicrotask(() => {
      this.flushQueued = false;
      const lines = this.state.lines.concat(this.pendingLines).slice(-MAX_LINES);
      this.pendingLines = [];
      this.set({ lines, partial: this.cur });
    });
  }
  sys(text: string) { this.print({ segs: [{ text, fg: '#a38c7c' }], kind: 'sys' }); }

  // ---- outbound -------------------------------------------------------------
  connect() {
    this.connecting = true;
    if (this.state.manualDisconnect) this.set({ manualDisconnect: false });
    this.sendRaw({ t: 'connect' });
  }
  private connecting = false;

  /** The relay's answer to hello: reattach to a live session, or open a new one. */
  onSession(resumed: boolean, gameId?: string, family?: string) {
    this.gameDown = false;
    if (gameId && gameId !== this.state.mud.game) {
      this.set({ mud: { game: gameId, family: family === 'ire' ? 'ire' : 'aardwolf' } });
      if (typeof document !== 'undefined') document.title = `Gaslamp · ${this.gameName}`;
    }
    this.set({ sessionAt: Date.now() });
    if (resumed) this.resume(); else this.connect();
  }

  /** Reattached to a live MUD session after a page reload: rebuild state from the server. */
  resume() {
    this.set({ connected: true, status: 'Connected' });
    this.sys('— Reattached to your session.');
    // If you're in the game, the character data that comes back logs us in and we look around.
    // (At Aardwolf's login screen a 'look' would be taken as a character name.)
    this.lookAfterLogin = true;
    this.adapter.onResume(this);
  }
  /** The game's display name: "Aardwolf", "Achaea". */
  get gameName() { const g = this.state.mud.game; return g.charAt(0).toUpperCase() + g.slice(1); }
  private lookAfterLogin = false;
  disconnect() { this.set({ manualDisconnect: true }); this.cancelSignIn(); this.sendRaw({ t: 'disconnect' }); }

  command(cmd: string) {
    if (this.state.death && /^get all corpse\b/i.test(cmd.trim())) this.set({ death: null });
    const shown = this.state.localEcho ? cmd : '••••••';
    if (plain(this.cur).trim()) {
      // Commit the pending prompt with the command on the same line, as a terminal would.
      this.print({ segs: [...this.cur, { text: ' ' + shown, fg: '#ffb77d' }] });
      this.cur = [];
      this.loginPartialSeen = ''; // that prompt is answered and gone; it won't come back as a line
    } else {
      this.print({ segs: [{ text: shown }], kind: 'echo' });
    }
    this.sendRaw({ t: 'cmd', d: cmd });
    if (this.state.loggedIn && INV_VERBS.test(cmd.trim())) this.refreshInventory(800);
    const dir = DIR_FULL[cmd.trim().toLowerCase()];
    if (dir && !this.walker) this.lastMove = { dir, at: Date.now(), opened: false };
    else if (!dir && !/^(?:open|unlock)\b/i.test(cmd.trim())) this.lastMove = null;
  }

  /** Several commands, e.g. a speedwalk. */
  commands(cmds: string[]) { for (const c of cmds) this.command(c); }

  /**
   * Walk a route one step at a time, each after the game shows we've arrived, so a closed door
   * can be opened on the way (sending the whole route at once would run the rest from the wrong room).
   */
  walk(dirs: string[]) {
    const steps = dirs.map((d) => DIR_FULL[d.toLowerCase()] ?? d.toLowerCase()).filter(Boolean);
    if (!steps.length) return;
    this.stopWalk();
    this.lastMove = null;
    this.walker = { steps, i: 0, from: this.state.room?.num, opened: false, timer: undefined };
    this.walkStep();
  }
  stopWalk() { if (this.walker) clearTimeout(this.walker.timer); this.walker = null; }

  private walker: { steps: string[]; i: number; from?: number; opened: boolean; unlocked?: boolean; timer?: ReturnType<typeof setTimeout> } | null = null;
  /** The last single step typed or clicked, for opening a door it bumps into. */
  private lastMove: { dir: string; at: number; opened: boolean; unlocked?: boolean } | null = null;

  private walkStep() {
    const w = this.walker;
    if (!w) return;
    if (w.i >= w.steps.length) return this.stopWalk();
    w.from = this.state.room?.num;
    w.opened = false; w.unlocked = false;
    this.command(w.steps[w.i]);
    this.walkTimeout();
  }
  private walkTimeout() {
    const w = this.walker;
    if (!w) return;
    clearTimeout(w.timer);
    w.timer = setTimeout(() => { if (this.walker === w) this.stopWalk(); }, 5000); // no arrival: stop rather than guess
  }

  /** A door in the way of a move: open it and try once more. */
  private onDoorClosed() { this.retryDoor(false); }

  /** A locked door: try the key once (unlock, open, move); after that, give up. */
  private onDoorLocked() { this.retryDoor(true); }

  private retryDoor(locked: boolean) {
    const w = this.walker;
    const m = w ? { dir: w.steps[w.i], opened: !!w.opened, unlocked: !!w.unlocked } : this.lastMove;
    if (!m || (!w && Date.now() - this.lastMove!.at > 4000)) return;
    if (locked ? m.unlocked : m.opened) {
      if (w) this.stopWalk();
      else this.lastMove = null; // tried already: no loop
      return;
    }
    if (locked) this.command(this.adapter.doorCommand('unlock', m.dir));
    this.command(this.adapter.doorCommand('open', m.dir));
    this.command(m.dir);
    // The retry is itself a move: mark what we tried, or the same reply would start this again.
    const tried = { opened: true, unlocked: m.unlocked || locked };
    if (w) { Object.assign(w, tried); this.walkTimeout(); }
    else this.lastMove = { dir: m.dir, at: Date.now(), ...tried };
  }

  /** Send a command whose next prompt should not be shown. */
  private hidden(cmd: string) {
    // In the note editor it would become a line of the note; some games only allow a few quietly.
    if (this.gameDown || this.writer || !this.adapter.allowsQuiet(cmd)) return;
    if (Date.now() > this.suppressPromptsUntil) this.suppressPrompts = 0;
    this.suppressPrompts++;
    this.suppressPromptsUntil = Date.now() + 3000;
    this.sendRaw({ t: 'cmd', d: cmd });
  }

  /**
   * Send a command and capture (hide) its reply: from the first line matching `start` up to the
   * next prompt. Output that arrives before the reply starts (broadcasts, earlier commands) is
   * shown normally. Captures run one at a time, in order, and each gives up after a timeout.
   */
  /**
   * Send `cmd` quietly and hand its reply to `cb`. The reply starts at a line matching `start` and
   * ends at the next prompt, or at a line matching `end` for replies Aardwolf sends without one.
   */
  /**
   * The game connection is gone: forget queued background lookups. Sent on a new connection, the
   * first of them would land on the login screen and be taken as a character name.
   */
  private gameDown = false; // the relay told us the game connection closed (and no new one yet)
  private dropBackgroundWork() {
    this.shopPending.clear(); clearTimeout(this.shopTimer); if (this.state.shopAsking) this.set({ shopAsking: false });
    this.stopWalk();
    if (this.writer) {
      clearTimeout(this.writer.timer);
      this.writer = null;
      this.patchNotes({ compose: { stage: 'error', error: 'The connection closed while writing the note.' } });
    }
    if (this.capture) { clearTimeout(this.capture.timer); this.capture = null; }
    this.captureQueue = [];
    this.suppressPrompts = 0;
    this.detailsPending.clear();
    clearTimeout(this.invTimer); clearTimeout(this.mapTimer); clearTimeout(this.notesTimer);
    if (this.state.objectives.loading) this.set({ objectives: { ...this.state.objectives, loading: false } });
    if (this.state.notes.loading) this.set({ notes: { ...this.state.notes, loading: false } });
  }

  captureReply(cmd: string, start: RegExp, cb: CaptureCb, end?: RegExp) {
    // Game down: nothing to ask; it would be sent to whatever connects next.
    if (this.gameDown || !this.adapter.allowsQuiet(cmd)) return;
    this.captureQueue.push({ cmd, start, end, cb });
    if (!this.capture) this.nextCapture();
  }

  private nextCapture() {
    if (this.writer) return; // held until the note is posted: anything sent now would land in the note
    const next = this.captureQueue.shift();
    if (!next) return;
    this.capture = { cb: next.cb, start: next.start, end: next.end, started: false, lines: [], timer: setTimeout(() => this.endCapture(false), 5000) };
    this.sendRaw({ t: 'cmd', d: next.cmd });
  }

  private endCapture(ok: boolean) {
    const c = this.capture;
    if (!c) return;
    this.capture = null;
    clearTimeout(c.timer);
    if (ok) c.cb(c.lines.map(plain), c.lines);
    // Not ours after all: give the lines back to the normal handler, so room tags and the map are
    // still recognised rather than printed raw.
    else for (const segs of c.lines) this.line(segs, false);
    if (!this.capture) this.nextCapture(); // the callback may already have started the next one
  }

  private learnPrompt(text: string) {
    const sample = text.trimEnd();
    if (sample.length < 2 || sample.length > 200) return;
    // Only prompt-like text: login questions and mid-line pauses mustn't be learned.
    if (!/[>\]]$/.test(sample) && !(/\d/.test(sample) && /[:)]$/.test(sample))) return;
    this.promptRe = promptRegExp(sample);
    try { localStorage.setItem(PROMPT_KEY, sample); } catch { /* ignore */ }
  }

  /** Quietly redraw the game's own map for the sidebar (debounced, so a speedwalk draws once). */
  refreshMap(delay = 300) {
    clearTimeout(this.mapTimer);
    this.mapTimer = setTimeout(() => {
      if (!this.state.loggedIn || this.captureQueue.some((q) => q.cmd === 'map')) return;
      // Aardwolf: only with <MAPSTART>/<MAPEND> markers can a map reply be told apart.
      if (this.adapter.family === 'aardwolf' && !this.mapTagOn) return;
      this.adapter.fetchMap(this);
    }, delay);
  }

  /** Quietly re-read goals, campaign and quest status. */
  refreshObjectives() {
    if (!this.state.loggedIn || this.state.objectives.loading) return;
    const patch = (p: Partial<Objectives>) => this.set({ objectives: { ...this.state.objectives, ...p } });
    patch({ loading: true });
    this.gmcp('request quest');
    this.captureReply('campaign check', CAMPAIGN_START, (lines) => patch({ campaign: parseCampaign(lines) }));
    this.captureReply('goals', /^\s*Goal listing/, (lines) => {
      const active = parseGoalList(lines).filter(isActiveGoal);
      if (!active.length) { patch({ goals: [], at: Date.now(), loading: false }); return; }
      const goals = active.map((g) => ({ ...g, ...this.state.objectives.goals.find((o) => o.name === g.name) }));
      patch({ goals });
      active.forEach((g, i) => {
        this.captureReply(`goal ${g.name.toLowerCase()}`, /^\s*Goal information for/, (detail) => {
          const updated = this.state.objectives.goals.map((o) => (o.name === g.name ? { ...o, ...parseGoalDetail(detail), status: g.status } : o));
          patch({ goals: updated, ...(i === active.length - 1 ? { at: Date.now(), loading: false } : {}) });
        });
      });
    });
    // Never leave the spinner on if the game didn't answer.
    setTimeout(() => { if (this.state.objectives.loading) patch({ loading: false, at: Date.now() }); }, 15000);
  }

  gmcp(pkg: string, data?: unknown) { this.sendRaw({ t: 'gmcp', pkg, data }); }

  // ---- sign-in ----------------------------------------------------------------
  // The password is only held in memory until it's sent at the password prompt, then dropped.
  private pendingLogin: { name: string; password: string; timer: ReturnType<typeof setTimeout> } | null = null;
  private atNamePrompt = false;
  private loginPartialSeen = '';

  /** Log in: connect if needed, answer the name prompt, then the password prompt (echo off). */
  signIn(name: string, password: string) {
    if (this.state.loggedIn || !name.trim() || !password) return;
    if (this.pendingLogin) clearTimeout(this.pendingLogin.timer);
    this.pendingLogin = { name: name.trim(), password, timer: setTimeout(() => this.loginFailed(`${this.gameName} didn’t finish the login. Check the Chronicle for what it asked.`), 30000) };
    this.set({ login: { stage: 'waiting' } });
    if (!this.state.connected && !this.connecting) this.connect();
    else if (this.atNamePrompt) this.sendLoginName();
    else {
      // Connected but no name prompt seen (e.g. this page reattached to a session already waiting
      // at it). Not logged in, so nothing to lose: reconnect for a fresh prompt.
      setTimeout(() => {
        if (this.state.login.stage === 'waiting' && !this.atNamePrompt && !this.state.loggedIn && this.state.connected) this.connect();
      }, 2000);
    }
  }
  cancelSignIn() { if (this.pendingLogin) clearTimeout(this.pendingLogin.timer); this.pendingLogin = null; this.set({ login: { stage: 'idle' } }); }

  private loginFailed(error: string, retry = false) {
    if (this.pendingLogin) clearTimeout(this.pendingLogin.timer);
    this.pendingLogin = null;
    this.set({ login: { stage: 'error', error, ...(retry ? { retry } : {}) } });
  }

  private sendLoginName() {
    const p = this.pendingLogin;
    if (!p || this.state.login.stage !== 'waiting') return;
    this.atNamePrompt = false;
    this.set({ login: { stage: 'name' } });
    this.command(p.name);
  }

  private onPasswordPrompt() {
    const p = this.pendingLogin;
    if (!p || this.state.login.stage !== 'name' || !p.password) return;
    const pw = p.password;
    p.password = '';
    this.set({ login: { stage: 'password' } });
    this.command(pw); // shown as dots: the server has echo off
  }

  /** Before login: spot the name prompt, the "press return" pause, and failures. */
  private watchLogin(text: string) {
    if (this.adapter.namePrompt.test(text)) {
      this.atNamePrompt = true;
      if (this.state.login.stage === 'name') this.loginFailed(`${this.gameName} asked for the name again. Check the spelling.`);
      else this.sendLoginName();
      return;
    }
    if (!this.pendingLogin && this.state.login.stage !== 'password') return;
    if (WRONG_PASSWORD_RE.test(text)) this.loginFailed('Wrong password.');
    else if (this.state.login.stage === 'name' && NEW_CHAR_RE.test(text)) this.loginFailed(`${this.gameName} doesn’t know that name: it’s offering to create a new character. Answer it in the command line, or check the name.`);
    else if (PRESS_RETURN_RE.test(text) && this.state.login.stage === 'password') this.sendRaw({ t: 'cmd', d: '' });
  }

  /** Quietly read the game clock; ticks keep it going from there. */
  syncTime() {
    if (!this.state.loggedIn || this.captureQueue.some((q) => q.cmd === 'time')) return;
    this.captureReply('time', /^\s*\*\s*It is /, (lines) => { for (const l of lines) this.noteTime(l); });
  }

  /** A `time` reply or a sunrise/sunset message sets the clock. */
  private noteTime(text: string) {
    const t = parseTimeLine(text);
    if (t) { this.set({ clock: { ...t, syncedAt: Date.now() } }); return; }
    const sun = SUN_EVENTS.find(([re]) => re.test(text));
    if (sun) this.set({ clock: { ...this.state.clock, hour: sun[1], syncedAt: Date.now() } });
  }

  /** One tick is one game hour. A new day re-reads the calendar (seasons roll over). */
  tick() {
    const c = this.state.clock;
    if (c.hour === undefined) return;
    const hour = (c.hour + 1) % 24;
    this.set({ clock: { ...c, hour, day: hour === 0 && c.day !== undefined ? c.day + 1 : c.day } });
    if (hour === 0) this.syncTime();
  }

  private notesTimer: ReturnType<typeof setTimeout> | undefined;
  private patchNotes(p: Partial<NotesState>) { this.set({ notes: { ...this.state.notes, ...p } }); }

  /** Quietly read the board list and the posts on `forum` (Personal unless you've picked another). */
  refreshNotes(forum = this.state.notes.forum) {
    if (!this.state.loggedIn || this.captureQueue.some((q) => q.cmd === 'note list')) return;
    this.patchNotes({ loading: true, forum });
    this.captureReply('board', /^\+-+\+-+/, (lines) => this.patchNotes(parseBoards(lines)));
    // `note list` shows the current forum, so switch to the one we want first.
    this.captureReply(`forum ${forum.toLowerCase()}`, /forum/i, () => {});
    this.captureReply('note list', /^\s*(Posts in the|There are no|No posts|You have no)/i, (lines) => {
      const { posts } = parseNoteList(lines);
      this.patchNotes({ posts: posts.slice(-40).reverse(), current: forum, loading: false, at: Date.now() });
    });
    setTimeout(() => { if (this.state.notes.loading) this.patchNotes({ loading: false }); }, 12000);
  }

  /** Read a note into the Notes panel (this marks it read, as reading it in the game would). */
  readNote(num: number) {
    this.patchNotes({ reading: num, open: null });
    this.captureReply(`note read ${num}`, /^\s*~{10,}\s*$/, (_lines, segs) => {
      const note = parseNote(segs);
      const n = this.state.notes;
      const wasUnread = n.posts.some((p) => p.num === num && p.unread);
      this.patchNotes({
        open: note, reading: undefined,
        posts: n.posts.map((p) => (p.num === num ? { ...p, unread: false } : p)),
        boards: wasUnread ? n.boards.map((b) => (b.name.toLowerCase() === n.forum.toLowerCase() ? { ...b, unread: Math.max(0, b.unread - 1) } : b)) : n.boards,
      });
    });
  }
  closeNote() { this.patchNotes({ open: null, reading: undefined }); }

  /**
   * Write a note on the Personal board through Aardwolf's note editor ('note write <to>', a subject
   * prompt, the body line by line, then '.p'). Each step waits until the game shows it's ready, and
   * '.s' confirms we're really in the editor before any of the body is sent, so the note's text can
   * never be taken as game commands.
   */
  writeNote(draft: NoteDraft) {
    const to = draft.to.trim(), subject = draft.subject.replace(/\s+/g, ' ').trim();
    if (!this.state.loggedIn || this.writer || !to || !subject || !draft.body.trim()) return;
    this.patchNotes({ compose: { stage: 'starting' } });
    this.captureReply('forum personal', /forum/i, (lines) => {
      if (!lines.some((l) => /personal/i.test(l))) return this.noteFailed('Couldn’t switch to the Personal board.');
      this.writer = { stage: 'to', to, subject, body: noteLines(draft.body), seen: '', timer: undefined };
      this.patchNotes({ compose: { stage: 'to' }, current: 'Personal' });
      this.sendRaw({ t: 'cmd', d: `note write ${to}` });
      this.writerTimeout();
    });
  }

  private writer: { stage: 'to' | 'subject' | 'checking' | 'posting'; to: string; subject: string; body: string[]; seen: string; timer?: ReturnType<typeof setTimeout> } | null = null;

  private writerTimeout(ms = 8000) {
    const w = this.writer;
    if (!w) return;
    clearTimeout(w.timer);
    w.timer = setTimeout(() => {
      if (this.writer !== w) return;
      this.noteFailed(w.stage === 'posting'
        ? 'Aardwolf didn’t confirm the note was posted. Check the log, and the Personal board.'
        : 'Aardwolf didn’t answer as expected, so nothing more was sent. If the log shows you’re in the note editor, type .q to cancel it.');
    }, ms);
  }

  private noteFailed(error: string) {
    if (this.writer) clearTimeout(this.writer.timer);
    // Our own half-written note: leave the editor rather than strand you in it.
    if (this.writer && this.writer.stage !== 'to' && this.state.noteEditor) { this.sendRaw({ t: 'cmd', d: '.q' }); error = `${error.replace(/ If the log.*$/, '')} The unfinished note was cancelled.`; }
    this.writer = null;
    this.patchNotes({ compose: { stage: 'error', error } });
    this.nextCapture();
  }

  /** Follow the note editor's replies (whole lines, and prompts that arrive without a newline). */
  private watchWriter(text: string) {
    const w = this.writer;
    if (!w || !text.trim() || text === w.seen) return;
    w.seen = text;
    if (w.stage === 'to') {
      if (/subject/i.test(text)) {
        w.stage = 'subject';
        this.patchNotes({ compose: { stage: 'subject' } });
        this.sendRaw({ t: 'cmd', d: w.subject });
        // Then ask the editor to show the note so far: only the real editor answers with our headers.
        setTimeout(() => {
          if (this.writer !== w) return;
          w.stage = 'checking';
          this.patchNotes({ compose: { stage: 'checking' } });
          this.sendRaw({ t: 'cmd', d: '.s' });
          this.writerTimeout();
        }, 600);
        this.writerTimeout();
      } else if (NOTE_REFUSED_RE.test(text)) {
        this.noteFailed(`Aardwolf said: ${text.trim()}`);
      }
    } else if (w.stage === 'checking') {
      // Aardwolf's preview puts the subject on the From line ("From    : Name: Subject"); other
      // servers have a Subject line. Either way only the editor echoes our subject back like this.
      const m = /^\s*(?:from|subject)\s*:\s*(.*)$/i.exec(text);
      if (m && m[1].toLowerCase().includes(w.subject.slice(0, 20).toLowerCase())) {
        w.stage = 'posting';
        this.patchNotes({ compose: { stage: 'body' } });
        for (const l of w.body) this.sendRaw({ t: 'cmd', d: l });
        this.sendRaw({ t: 'cmd', d: '.p' });
        this.patchNotes({ compose: { stage: 'posting' } });
        // Aardwolf's confirmation wording isn't known, so if none is recognised, look for the post.
        clearTimeout(w.timer);
        w.timer = setTimeout(() => { if (this.writer === w) this.confirmPosted(w.subject); }, 2500);
      } else if (/huh\?|not (?:writing|in) a note|isn't a command|unknown command/i.test(text)) {
        this.noteFailed('The note editor didn’t open, so the note wasn’t sent.');
      }
    } else if (w.stage === 'posting') {
      if (/^\s*You are back in the game/i.test(text) && !NOTE_POSTED_RE.test(text)) { clearTimeout(w.timer); this.confirmPosted(w.subject); }
      else if (NOTE_POSTED_RE.test(text)) {
        clearTimeout(w.timer);
        this.writer = null;
        this.patchNotes({ compose: { stage: 'posted' } });
        this.nextCapture();
        setTimeout(() => this.refreshNotes('Personal'), 800);
      }
    }
  }
  /** Check the Personal board for the note we just posted. */
  private confirmPosted(subject: string) {
    this.writer = null;
    this.nextCapture();
    this.captureReply('note list', /^\s*(Posts in the|There are no|No posts|You have no)/i, (lines) => {
      const { posts } = parseNoteList(lines);
      // The list may shorten long subjects.
      const want = subject.toLowerCase();
      const found = posts.some((p) => { const got = p.subject.trim().toLowerCase().replace(/\.{2,}$/, ''); return !!got && want.startsWith(got); });
      this.patchNotes(found
        ? { compose: { stage: 'posted' }, posts: posts.slice(-40).reverse(), current: 'Personal', forum: 'Personal', at: Date.now() }
        : { compose: { stage: 'error', error: 'The note doesn’t show on your Personal board. Check the log: if you’re still in the note editor, type .q to cancel it.' } });
    });
  }

  cancelNoteWrite() {
    const w = this.writer;
    if (w && w.stage !== 'to') this.sendRaw({ t: 'cmd', d: '.q' }); // at the subject prompt, .q would become the subject
    if (w) clearTimeout(w.timer);
    this.writer = null;
    this.patchNotes({ compose: undefined });
    this.nextCapture();
  }
  clearCompose() { if (!this.writer) this.patchNotes({ compose: undefined }); }

  private shopCache = loadShops();
  private shopPending = new Set<string>();
  private shopTimer?: ReturnType<typeof setTimeout>;

  private enterShop(num: number) {
    const entry = this.shopCache.get(num) ?? { room: num, keeper: '', offers: {} };
    this.set({ shop: { ...entry, offers: { ...entry.offers } } });
  }

  /**
   * Ask the shopkeeper here what they'd pay ('value <id>' never sells anything): for the given
   * items, or every carried item not asked about yet. Answers are remembered per shop.
   */
  checkShop(ids?: string[]) {
    const room = this.state.room;
    if (!this.state.loggedIn || !room || !/\bshop\b/i.test(room.details)) return;
    const entry = this.shopCache.get(room.num) ?? { room: room.num, keeper: '', offers: {} };
    this.shopCache.set(room.num, entry);
    if (!this.capture && !this.captureQueue.length) this.shopPending.clear(); // unanswered asks may be retried
    const want = ids ?? this.state.inventory.filter((it) => it.wearLoc === -1 && !(it.id in entry.offers)).map((it) => it.id);
    for (const id of want) {
      const key = `${room.num}:${id}`;
      if (this.shopPending.has(key)) continue;
      this.shopPending.add(key);
      this.captureReply(`value ${id}`, VALUE_REPLY_RE, (lines) => {
        this.shopPending.delete(key);
        const v = parseValueReply(lines.join(' '));
        if (!v) return;
        entry.offers[id] = v.gold;
        if (v.keeper) entry.keeper = v.keeper;
        saveShops(this.shopCache);
        if (this.state.room?.num === room.num) this.set({ shop: { ...entry, offers: { ...entry.offers } }, shopAsking: this.shopPending.size > 0 });
      });
    }
    this.set({ shop: { ...entry, offers: { ...entry.offers } }, shopAsking: this.shopPending.size > 0 });
    clearTimeout(this.shopTimer);
    this.shopTimer = setTimeout(() => { if (this.state.shopAsking) this.set({ shopAsking: false }); }, 30000); // some may never be answered
  }

  private detailsPending = new Set<string>();
  /** Quietly look up stats for wearable items we haven't seen before (each id once; they're cached). */
  fetchItemDetails() {
    if (!this.state.loggedIn) return;
    // Nothing in flight: anything still marked pending never got an answer, so it may be retried.
    if (!this.capture && !this.captureQueue.length) this.detailsPending.clear();
    const { inventory, equipment, itemDetails } = this.state;
    for (const it of [...equipment, ...inventory]) {
      if (!DETAIL_TYPES.has(it.type) || itemDetails[it.id] || this.detailsPending.has(it.id)) continue;
      this.detailsPending.add(it.id);
      // No prompt follows an invdetails reply, so it ends at its closing tag.
      this.captureReply(`invdetails ${it.id}`, /^\s*\{invdetails\}/, (lines) => {
        this.detailsPending.delete(it.id);
        const d = parseInvDetails(lines);
        if (!d) return;
        const next = { ...this.state.itemDetails, [it.id]: d };
        this.set({ itemDetails: next });
        saveItemDetails(next);
      }, /^\s*\{\/invdetails\}/);
    }
  }

  refreshInventory(delay = 0) {
    clearTimeout(this.invTimer);
    this.invTimer = setTimeout(() => { this.hidden('invdata'); this.hidden('eqdata'); }, delay);
  }

  // ---- inbound --------------------------------------------------------------
  /** Last raw relay messages, for debugging parsing against real traffic (dev only). */
  trace: { at: number; msg: unknown }[] = [];

  onMessage(msg: any) {
    this.trace.push({ at: Date.now(), msg });
    if (this.trace.length > 8000) this.trace.shift();
    switch (msg.t) {
      case 'status': {
        // The relay announces an attempt with a not-yet-connected status: that's progress, not failure.
        const attempt = !msg.connected && /^Connecting to /.test(msg.msg ?? '');
        this.connecting = attempt;
        this.gameDown = !msg.connected;
        this.set({ connected: msg.connected, status: msg.msg ?? (msg.connected ? 'Connected' : 'Disconnected') });
        // A new connection asks the same name question word for word: it must not look already answered.
        this.loginPartialSeen = '';
        if (msg.msg) this.sys(`— ${msg.msg}`);
        if (!msg.connected) {
          this.set({ loggedIn: false, localEcho: true, noteEditor: false });
          this.atNamePrompt = false;
          this.dropBackgroundWork();
          // Couldn't reach the game, or it hung up mid-login: worth another try later.
          if (this.pendingLogin && !attempt) this.loginFailed(msg.msg ? `Couldn’t reach ${this.gameName} (${msg.msg}).` : 'The connection closed during login.', true);
        }
        break;
      }
      case 'text': this.onText(msg.d); break;
      case 'prompt': this.sawGA = true; clearTimeout(this.promptTimer); this.onPrompt(); break;
      case 'echo':
        this.set({ localEcho: msg.on });
        if (!msg.on) this.onPasswordPrompt();
        break;
      case 'gmcp': this.onGmcp(msg.pkg, msg.data); break;
    }
  }

  private onText(chunk: string) {
    clearTimeout(this.promptTimer);
    for (const seg of this.ansi.parse(chunk)) {
      const parts = seg.text.split('\n');
      parts.forEach((part, i) => {
        if (i > 0) { this.line(this.cur, false); this.cur = []; }
        if (part) this.cur.push({ ...seg, text: part });
      });
    }
    if (!this.flushQueued) this.set({ partial: this.cur });
    // Login questions end without a newline (and without GA on some servers): check them as they arrive.
    if (!this.state.loggedIn && this.cur.length) {
      const t = plain(this.cur);
      if (this.adapter.namePrompt.test(t) && t !== this.loginPartialSeen) { this.loginPartialSeen = t; this.watchLogin(t); }
    }
    if (this.writer && this.cur.length) this.watchWriter(plain(this.cur));
    if (!this.sawGA && this.cur.length) {
      this.promptTimer = setTimeout(() => { if (this.cur.length) this.onPrompt(); }, 200);
    }
  }

  private onPrompt() {
    const segs = this.cur;
    this.cur = [];
    this.line(segs, true);
    if (!this.flushQueued) this.set({ partial: [] });
  }

  private line(segs: Seg[], isPrompt: boolean) {
    const text = plain(segs);
    if (NOTE_EDITOR_IN_RE.test(text)) { if (!this.state.noteEditor) this.set({ noteEditor: true }); }
    else if (this.state.noteEditor && NOTE_EDITOR_OUT_RE.test(text)) this.set({ noteEditor: false });
    if (this.writer) this.watchWriter(text);
    if (!this.state.loggedIn) {
      if (text === this.loginPartialSeen) this.loginPartialSeen = ''; // already handled as it arrived
      else this.watchLogin(text);
    }

    if (isPrompt) {
      if (text.trim()) { this.learnPrompt(text); this.adapter.onPrompt?.(this, text); }
      const ch = parseCharges(text);
      if (ch) this.lt({ charges: ch.charges, maxCharges: ch.max ?? Math.max(this.state.lasertag.maxCharges ?? 0, ch.charges), chargesAt: Date.now() });
      if (this.mirror) { this.endMirror(); }
      if (this.setupPending) queueMicrotask(() => this.setupAfterLogin());
      if (this.capture?.started) { this.endCapture(true); return; }
      if (this.suppressPrompts > 0 && Date.now() <= this.suppressPromptsUntil) { this.suppressPrompts--; return; }
      if (text.trim()) this.print({ segs, kind: 'prompt' });
      return;
    }
    // Without GA, a reply can arrive on the same line as the previous prompt
    // ("[158hp] > {invdata}"). Split it so the prompt and the reply are each handled normally.
    const pm = this.promptRe?.exec(text);
    if (pm && !text.slice(pm[0].length).trim()) { this.line(segs, true); return; } // a prompt ended by a newline
    const gluedAt = pm ? pm[0].length : GLUED_PROMPT_RE.exec(text)?.[1].length ?? 0;
    if (gluedAt) {
      this.line(takePrefix(segs, gluedAt), true);
      this.line(stripPrefix(segs, gluedAt), false);
      return;
    }

    if (this.capture) {
      if (this.capture.started || this.capture.start.test(text)) {
        this.capture.started = true;
        this.capture.lines.push(segs);
        if (this.capture.end?.test(text)) this.endCapture(true);
        return;
      }
      // The reply may arrive glued onto a prompt: "[158hp] > Tag Name …". Split it off.
      const glued = new RegExp(`^(.*?[>\\]] )(?=${this.capture.start.source.replace(/^\^(\\s\*)?/, '')})`).exec(text);
      if (glued) {
        this.line(takePrefix(segs, glued[1].length), true);
        this.line(stripPrefix(segs, glued[1].length), false);
        return;
      }
      if (!text.trim()) return; // blank lines while waiting for the reply
      // Not our reply yet: handle the line normally.
    }
    const marker = /^\s*<MAP(START|END)>\s*$/.exec(text);
    if (marker) {
      if (marker[1] === 'START') this.mapBlock = [];
      else if (this.mapBlock) { this.set({ asciiMap: trimBlankLines(this.mapBlock) }); this.mapBlock = null; this.noteMapMarks(); }
      return;
    }
    if (this.mapBlock) this.mapBlock.push(segs);
    if (DEATH_RE.test(text)) this.set({ death: { at: Date.now() } });
    const a = this.adapter;
    if (a.doorClosed.test(text)) this.onDoorClosed();
    else if (a.doorLocked.test(text)) this.onDoorLocked();
    else if (this.walker && a.walkBlocked.test(text)) this.stopWalk();
    if (a.features.gameClock) this.noteTime(text);
    if (a.features.notes && NEW_NOTE_RE.test(text)) { clearTimeout(this.notesTimer); this.notesTimer = setTimeout(() => this.refreshNotes(), 1500); }
    if (this.mirror) this.mirror.lines.push(text);
    const news = /^\s*Lasertag\s*:\s*(.+)$/.exec(text);
    if (news) this.lt({ news: { text: news[1].trim(), at: Date.now() } });
    const team = TEAM_RE.exec(text);
    if (team) this.lt({ team: team[1].toLowerCase() as Team });
    const hist = TELL_HISTORY_RE.exec(text);
    if (hist) {
      this.importTell(hist);
      if (Date.now() <= this.tellHistoryQuietUntil) return;
    }
    if (!text.trim() && Date.now() <= this.tellHistoryQuietUntil) return;
    if (this.hideMatching && Date.now() <= this.hideMatching.until) {
      if (!text.trim() || (this.hideMatching.re.test(text) && /\btags?\b/i.test(text))) return;
    }

    // Inside a {tag}…{/tag} block
    if (this.block) {
      const b = this.block;
      if (text.trimStart().startsWith(`{/${b.tag}}`)) {
        this.block = null;
        this.endBlock(b.tag, b.lines);
        return;
      }
      b.lines.push(segs);
      if (HIDDEN_BLOCKS.has(b.tag)) return;
      this.print({ segs });
      return;
    }

    const m = /^\{(\/?)([a-z]+)\}/.exec(text);
    if (m) {
      const tag = m[2];
      const rest = stripPrefix(segs, m[0].length);
      if (!m[1] && BLOCK_TAGS.has(tag)) {
        this.block = { tag, lines: [] };
        if (tag === 'rdesc' || tag === 'roomchars' || tag === 'roomobjs') this.startRoomPart(tag);
        if (plain(rest).trim()) this.line(rest, false);
        return;
      }
      if (tag === 'rname') this.set({ roomDesc: [], roomChars: [], roomObjs: [] });
      if (tag === 'coords') return; // continent coordinates; room.info already carries them
      if (plain(rest).trim()) this.print({ segs: rest });
      return;
    }

    this.print({ segs });
  }

  private startRoomPart(tag: string) {
    if (tag === 'rdesc') this.set({ roomDesc: [] });
    if (tag === 'roomchars') this.set({ roomChars: [] });
    if (tag === 'roomobjs') this.set({ roomObjs: [] });
  }

  private endBlock(tag: string, lines: Seg[][]) {
    const nonEmpty = lines.filter((l) => plain(l).trim());
    if (tag === 'rdesc') this.set({ roomDesc: nonEmpty.map((l) => plain(l).trim()) });
    else if (tag === 'roomchars') this.set({ roomChars: nonEmpty });
    else if (tag === 'roomobjs') this.set({ roomObjs: nonEmpty });
    else if (tag === 'eqdata') { this.set({ equipment: nonEmpty.map((l) => parseInv(plain(l))).filter((x): x is InvItem => !!x) }); this.fetchItemDetails(); }
    else if (tag === 'invdata') { this.set({ inventory: nonEmpty.map((l) => parseInv(plain(l))).filter((x): x is InvItem => !!x), inventoryAt: Date.now() }); this.fetchItemDetails(); }
  }

  private onGmcp(pkg: string, data: any) {
    // Aardwolf embeds raw ANSI escapes in GMCP JSON strings, which strict JSON rejects.
    if (typeof data === 'string') {
      try { data = JSON.parse(data.replace(/[\x00-\x1f]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'))); } catch { /* keep string */ }
    }
    const p = pkg.toLowerCase();
    this.adapter.onGmcp(this, p, data ?? {});
    if (!this.state.loggedIn && this.adapter.isLoginSignal(p)) this.onLogin();
  }

  /** A room report from any game: walking, the map, and per-room features. */
  enterRoom(room: RoomInfo) {
    if (this.walker && room.num !== this.walker.from) { this.walker.i++; queueMicrotask(() => this.walkStep()); }
    if (room.num !== this.state.room?.num) {
      this.refreshMap();
      clearTimeout(this.shopTimer);
      if (this.adapter.features.shops && /\bshop\b/i.test(room.details)) this.enterShop(room.num); // remembered answers only; asking is on request
      else if (this.state.shop) this.set({ shop: null });
      if (this.state.lasertag.firedInRoom !== undefined) this.lt({ firedInRoom: undefined });
    }
    this.mapper.add(room);
    this.set({ room, mapVersion: this.state.mapVersion + 1 });
  }

  /** A channel message, from whichever GMCP package the game uses. */
  addChat(m: Omit<ChatMsg, 'id' | 'at'>) {
    if (!plain(m.msg).trim()) return;
    const chat = this.state.chat.concat({ ...m, id: nextId++, at: Date.now() }).slice(-CHAT_MAX);
    this.set({ chat });
    saveChat(chat);
  }

  dismissDeath() { this.set({ death: null }); }

  // ---- Lasertag --------------------------------------------------------------
  private mirror: { lines: string[]; cb: (lines: string[]) => void; timer: ReturnType<typeof setTimeout> } | null = null;

  private lt(patch: Partial<Lasertag>) { this.set({ lasertag: { ...this.state.lasertag, ...patch } }); }

  /** Send a command normally (output still shows in the log) and also hand its reply to `cb`. */
  private mirrorReply(cmd: string, cb: (lines: string[]) => void) {
    this.endMirror();
    this.command(cmd);
    this.mirror = { lines: [], cb, timer: setTimeout(() => this.endMirror(), 4000) };
  }

  private endMirror() {
    const m = this.mirror;
    if (!m) return;
    this.mirror = null;
    clearTimeout(m.timer);
    m.cb(m.lines);
  }

  /**
   * Remember what Aardwolf's map showed: shops and clan halls on visited rooms, and every unvisited
   * room (terrain, passages, shop) relative to where you stood, so the area map keeps them.
   */
  noteMapMarks() {
    const room = this.state.room;
    const grid = room && parseAsciiMap(this.state.asciiMap.map(plain));
    if (!room || !grid) return;
    let changed = false;
    const ids = labelGrid(grid, room, this.mapper);
    const seen: SeenCell[] = [];
    for (const cell of grid.cells) {
      const k = key(cell.x, cell.y);
      const num = ids.get(k);
      const c = cell.contents;
      if (num !== undefined && this.mapper.rooms.has(num)) {
        if (LASTING.has(c)) changed = this.mapper.setMark(num, c) || changed;
        else if (c === ' ') changed = this.mapper.setMark(num, undefined) || changed; // seen empty: it's gone
        continue;
      }
      const ud = `${cell.up ? 'u' : ''}${cell.down ? 'd' : ''}`;
      seen.push({
        dx: cell.x, dy: cell.y, terrain: cell.terrain, exits: Object.keys(cell.exits).join(''),
        ...(num !== undefined ? { num } : {}), ...(LASTING.has(c) ? { mark: c } : {}), ...(ud ? { ud } : {}),
      });
    }
    changed = this.mapper.setSeen(room.num, seen) || changed;
    if (changed) this.set({ mapVersion: this.state.mapVersion + 1 });
  }

  ltScan() { this.mirrorReply('scan', (lines) => this.lt({ targets: parseScan(lines), scanAt: Date.now() })); }
  ltStatus() {
    this.mirrorReply('lasertag status', (lines) => {
      const status = lines.filter((l) => l.trim() && !/^\s*[-=~]{5,}\s*$/.test(l)).map((l) => l.trim());
      const mins = /next lasertag game will start in (?:approximately )?(\d+) minute/i.exec(status.join(' '))?.[1];
      this.lt({ status, nextGameAt: mins ? Date.now() + Number(mins) * 60_000 : undefined });
    });
  }
  ltScore() { this.mirrorReply('lasertag score', (lines) => this.lt({ score: lines.filter((l) => l.trim()) })); }
  ltTeams() {
    this.mirrorReply('who red', (red) => {
      this.lt({ rosters: { ...this.state.lasertag.rosters, red: parseRoster(red) } });
      this.mirrorReply('who green', (green) => {
        const rosters = { red: this.state.lasertag.rosters.red, green: parseRoster(green) };
        const me = stripAard(String(this.state.char.base?.name ?? ''));
        const mine = rosters.red.includes(me) ? 'red' : rosters.green.includes(me) ? 'green' : this.state.lasertag.team;
        this.lt({ rosters, team: mine });
      });
    });
  }
  ltShoot(t: Target) {
    if (this.state.lasertag.firedInRoom === this.state.room?.num) return; // must move between shots
    this.command(`shoot ${t.dir} ${t.name}`);
    this.lt({ firedInRoom: this.state.room?.num });
  }
  /** Which team a player is on, from scan tags or the rosters. */
  teamOf(t: Target): Team | undefined {
    const r = this.state.lasertag.rosters;
    return t.team ?? (r.red.includes(t.name) ? 'red' : r.green.includes(t.name) ? 'green' : undefined);
  }

  /** Fetch Aardwolf's tell history quietly; its lines are merged into the chat as they arrive. */
  requestTellHistory() {
    this.tellHistoryQuietUntil = Date.now() + 4000;
    this.hidden('tell -h');
  }

  private importTell(m: RegExpExecArray) {
    const [, dd, mon, hh, mm, ss, body] = m;
    const now = new Date();
    let when = new Date(`${mon} ${dd} ${now.getFullYear()} ${hh}:${mm}:${ss}`);
    if (Number.isNaN(when.getTime())) return;
    if (when.getTime() > now.getTime() + 86_400_000) when.setFullYear(now.getFullYear() - 1);
    const who = /^You tell (\S+) /.exec(body)?.[1] ?? /^(\S+) tells you /.exec(body)?.[1] ?? '';
    const norm = (x: string) => x.replace(/\s+/g, ' ').trim();
    const key = norm(body);
    const chat = this.state.chat;
    // A live GMCP copy of the same tell teaches us the server/local clock offset.
    const twin = chat.find((c) => isTellChan(c.chan) && norm(plain(c.msg)) === key && !c.imported);
    if (twin && !chat.some((c) => c.imported && norm(plain(c.msg)) === key)) this.tellOffset = twin.at - when.getTime();
    const at = when.getTime() + this.tellOffset;
    if (chat.some((c) => isTellChan(c.chan) && norm(plain(c.msg)) === key && Math.abs(c.at - at) < 120_000)) return;
    const msg: ChatMsg = { id: nextId++, chan: 'tell', player: who, msg: [{ text: body, fg: '#7fdcd8' }], at, imported: true };
    const next = chat.concat(msg).sort((a, b) => a.at - b.at).slice(-CHAT_MAX);
    this.set({ chat: next });
    saveChat(next);
  }

  private setupPending = false;

  private onLogin() {
    this.set({ loggedIn: true });
    if (this.lookAfterLogin) { this.lookAfterLogin = false; this.command('look'); }
    this.atNamePrompt = false;
    if (this.pendingLogin) { clearTimeout(this.pendingLogin.timer); this.pendingLogin = null; }
    if (this.state.login.stage !== 'idle') this.set({ login: { stage: 'idle' } });
    // Wait for the prompt that ends the login burst, so hidden replies can't swallow real output.
    this.setupPending = true;
    // …or after a quiet moment, if no prompt comes (e.g. right after reattaching).
    setTimeout(() => { if (this.setupPending && !plain(this.cur).trim()) this.setupAfterLogin(); }, 1500);
  }

  private setupAfterLogin() {
    this.setupPending = false;
    this.adapter.afterLogin(this);
  }

  /** Aardwolf: ask which {tags} exist, then turn on the room-related ones we know how to parse. */
  setupTags() {
    this.captureReply('tags', /^Tag Name\s/, (lines) => {
      this.set({ tagsListing: lines });
      // Only the first column names a tag; descriptions mention {rdesc} etc., which aren't valid names.
      // Skip tags that are already on (status column says YES).
      const off = new Set(lines.map((l) => /^([A-Za-z]+)\s{2,}.*\bNO\s*$/.exec(l)?.[1]?.toLowerCase()).filter(Boolean));
      const enable = WANT_TAGS.filter((t) => off.has(t));
      this.mapTagOn = lines.some((l) => /^MAP\s{2,}.*\bYES\s*$/.test(l)) || enable.includes('map');
      if (!enable.length) return;
      this.hideMatching = { re: new RegExp(`\\b(${enable.join('|')})\\b`, 'i'), until: Date.now() + 4000 };
      for (const t of enable) this.hidden(`tags ${t} on`);
    });
  }
}

const PROMPT_KEY = gameKey('gaslamp.promptSample');

/** "[158/158hp 189mn] >" → /^\[\d+\/\d+hp \d+mn\] > ?/ */
export function promptRegExp(sample: string) {
  const esc = sample.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&').replace(/\d+/g, '\\d+');
  return new RegExp(`^${esc} ?`);
}

function loadPromptRe(): RegExp | null {
  try { const s = localStorage.getItem(PROMPT_KEY); return s ? promptRegExp(s) : null; } catch { return null; }
}




// First line of a `campaign check` reply, whether or not you're on one.
const CAMPAIGN_START = /^\s*(You are not currently on a campaign|The targets for this campaign|You still have to kill|You have .* to finish this campaign|Note: One or more target names)/;

// "You have been assigned to the Red team" / "You are on the green team" (wording unconfirmed).
const TEAM_RE = /\byou\b.*\b(?:assigned|placed|are on|joined|join)\b.*\b(red|green) team\b/i;

// Aardwolf's death announcement.
export const DEATH_RE = /You have been KILLED!!/i;

/** Is this room-object line your own corpse? ("The corpse of Quillonmarsh is lying here.") */
export const isOwnCorpse = (line: string, name: string | undefined) =>
  !!name && new RegExp(`corpse of ${name.replace(/[^A-Za-z]/g, '')}\\b`, 'i').test(line);

const GLUED_PROMPT_RE = /^(.*?[>\]] ?)(?=\{\/?[a-z]+\}|<MAPSTART>|\d{1,2} [A-Z][a-z]{2} \d\d:\d\d:\d\d - )/;
const TELL_HISTORY_RE = /^(\d{1,2}) ([A-Z][a-z]{2}) (\d{2}):(\d{2}):(\d{2}) - ((?:You tell \S+|\S+ tells you) '.*')\s*$/;
export const isTellChan = (chan: string) => /tell/i.test(chan);

/** A tell, split into direction, the other person, and what was said. */
export function parseTell(c: ChatMsg): { dir: 'in' | 'out'; who: string; text: string } | null {
  const t = plain(c.msg).trim();
  const out = /^You tell (\S+) '([\s\S]*)'$/.exec(t);
  if (out) return { dir: 'out', who: out[1], text: out[2] };
  const inc = /^(\S+) tells you '([\s\S]*)'$/.exec(t);
  if (inc) return { dir: 'in', who: inc[1], text: inc[2] };
  return null;
}

/** Who a reply to this chat line should go to. */
export function replyTarget(c: ChatMsg) {
  const t = plain(c.msg);
  return /^You tell (\S+)/.exec(t)?.[1] ?? /^(\S+) tells you/.exec(t)?.[1] ?? stripAard(c.player);
}

const CHAT_KEY = gameKey('gaslamp.chat.v1');
const CHAT_MAX = 400;
let chatSaveTimer: ReturnType<typeof setTimeout> | undefined;

const ITEMS_KEY = gameKey('gaslamp.items.v1');
function loadItemDetails(): Record<string, ItemDetails> {
  try { return JSON.parse(localStorage.getItem(ITEMS_KEY) ?? '{}'); } catch { return {}; }
}
function saveItemDetails(all: Record<string, ItemDetails>) {
  // Keep the cache small: the most recent 400 items.
  const entries = Object.entries(all).slice(-400);
  try { localStorage.setItem(ITEMS_KEY, JSON.stringify(Object.fromEntries(entries))); } catch { /* quota */ }
}

function loadChat(): ChatMsg[] {
  try {
    const list = JSON.parse(localStorage.getItem(CHAT_KEY) ?? '[]') as ChatMsg[];
    return list.filter((c) => plain(c.msg).trim()).map((c) => ({ ...c, id: nextId++ }));
  } catch { return []; }
}

function saveChat(chat: ChatMsg[]) {
  clearTimeout(chatSaveTimer);
  chatSaveTimer = setTimeout(() => {
    try { localStorage.setItem(CHAT_KEY, JSON.stringify(chat)); } catch { /* quota or unavailable */ }
  }, 500);
}


function parseInv(line: string): InvItem | null {
  // objectid,flags,itemname,level,type,unique,wear-loc,timer — the name may itself contain commas.
  const parts = line.split(',');
  if (parts.length < 8) return null;
  const tail = parts.splice(-5);
  const [id, flags, ...nameParts] = parts;
  const rawName = nameParts.join(',');
  return {
    id: id.trim(), flags, name: aardSegs(rawName), plainName: stripAard(rawName),
    level: num(tail[0]), type: num(tail[1]), unique: tail[2] === '1', wearLoc: num(tail[3]), timer: num(tail[4]),
  };
}

export const game = new Game();
export const useGame = () => useSyncExternalStore(game.subscribe, game.getSnapshot);
