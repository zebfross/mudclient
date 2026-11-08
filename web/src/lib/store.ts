// Game state: turns the relay's text/GMCP stream into structured UI state.
import { useSyncExternalStore } from 'react';
import { AnsiParser, plain, type Seg } from './ansi.ts';
import { aardSegs, stripAard } from './aardColor.ts';
import { Mapper, type RoomInfo, type SeenCell } from './mapper.ts';
import { key, labelGrid, parseAsciiMap } from './asciiMap.ts';
import { LASTING } from './mapStyle.ts';
import { DETAIL_TYPES, parseInvDetails, type ItemDetails } from './items.ts';
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
}
const emptyNotes = (): NotesState => ({ boards: [], forum: 'Personal', posts: [], open: null, loading: false, at: 0 });
// e.g. Aaeron says, "I have sent a personal note to you…" / "A new note has been posted…"
const NEW_NOTE_RE = /\b(sent|posted|left|written)\b.*\bnote\b|\bnew (personal )?(note|post)s?\b/i;
import { emptyLasertag, parseCharges, parseRoster, parseScan, type Lasertag, type Target, type Team } from './lasertag.ts';
import { applyQuestEvent, emptyObjectives, isActiveGoal, parseCampaign, parseGoalDetail, parseGoalList, type Objectives } from './objectives.ts';

export interface Line { id: number; segs: Seg[]; kind?: 'echo' | 'sys' | 'prompt' }
export interface InvItem {
  id: string; flags: string; name: Seg[]; plainName: string;
  level: number; type: number; unique: boolean; wearLoc: number; timer: number;
}
export interface ChatMsg { id: number; chan: string; player: string; msg: Seg[]; at: number; imported?: boolean }
export interface GroupMember { name: string; info: Record<string, number | string> }

export interface State {
  connected: boolean;
  status: string;
  localEcho: boolean;
  loggedIn: boolean;
  lines: Line[];
  partial: Seg[];
  char: {
    base?: Record<string, any>;
    vitals?: { hp: number; mana: number; moves: number };
    maxstats?: Record<string, number>;
    stats?: Record<string, number>;
    status?: Record<string, any>;
    worth?: Record<string, number>;
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
  asciiMap: Seg[][];
  /** Set when you die; cleared when you loot your corpse or dismiss the banner. */
  death: { at: number } | null;
  lasertag: Lasertag;
}

const MAX_LINES = 3000;
const BLOCK_TAGS = new Set(['rdesc', 'roomchars', 'roomobjs', 'invdata', 'eqdata']);
const HIDDEN_BLOCKS = new Set(['invdata', 'eqdata']);
// Aardwolf tag names (first column of the `tags` listing) that this client knows how to parse.
const WANT_TAGS = ['roomnames', 'roomdescs', 'roomchars', 'roomobjs', 'exits', 'coords', 'map'];
const INV_VERBS = /^(get|take|drop|put|give|buy|sell|wear|wield|remove|rem|hold|quaff|eat|drink|recite|sac|sacrifice|junk|donate|brandish|zap|loot|keep|unkeep)\b/i;

let nextId = 1;
const num = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0);

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

export class Game {
  state: State = {
    connected: false, status: 'Not connected', localEcho: true, loggedIn: false,
    lines: [], partial: [], char: {}, roomDesc: [], roomChars: [], roomObjs: [],
    inventory: [], inventoryAt: 0, equipment: [], itemDetails: loadItemDetails(), chat: loadChat(), tagsListing: [], mapVersion: 0, objectives: emptyObjectives(), notes: emptyNotes(), asciiMap: [], death: null, lasertag: emptyLasertag(),
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

  private set(patch: Partial<State>) {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  // Lines arrive in bursts; batch them into one state update per animation frame.
  private print(line: Omit<Line, 'id'>) {
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
  connect() { this.sendRaw({ t: 'connect' }); }

  /** Reattached to a live MUD session after a page reload: rebuild state from the server. */
  resume() {
    this.set({ connected: true, status: 'Connected' });
    this.sys('— Reattached to your session.');
    this.gmcp('request char');
    this.gmcp('request room');
    this.command('look');
  }
  disconnect() { this.sendRaw({ t: 'disconnect' }); }

  command(cmd: string) {
    if (this.state.death && /^get all corpse\b/i.test(cmd.trim())) this.set({ death: null });
    const shown = this.state.localEcho ? cmd : '••••••';
    if (plain(this.cur).trim()) {
      // Commit the pending prompt with the command on the same line, as a terminal would.
      this.print({ segs: [...this.cur, { text: ' ' + shown, fg: '#ffb77d' }] });
      this.cur = [];
    } else {
      this.print({ segs: [{ text: shown }], kind: 'echo' });
    }
    this.sendRaw({ t: 'cmd', d: cmd });
    if (this.state.loggedIn && INV_VERBS.test(cmd.trim())) this.refreshInventory(800);
  }

  /** Several commands, e.g. a speedwalk. */
  commands(cmds: string[]) { for (const c of cmds) this.command(c); }

  /** Send a command whose next prompt should not be shown. */
  private hidden(cmd: string) {
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
  private captureReply(cmd: string, start: RegExp, cb: CaptureCb, end?: RegExp) {
    this.captureQueue.push({ cmd, start, end, cb });
    if (!this.capture) this.nextCapture();
  }

  private nextCapture() {
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
    else for (const segs of c.lines) this.print({ segs }); // not ours after all: give it back
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

  /** Quietly redraw Aardwolf's own map for the sidebar (debounced, so a speedwalk draws once). */
  refreshMap(delay = 300) {
    clearTimeout(this.mapTimer);
    this.mapTimer = setTimeout(() => {
      if (!this.state.loggedIn || !this.mapTagOn || this.captureQueue.some((q) => q.cmd === 'map')) return;
      this.captureReply('map', /^\s*<MAPSTART>/, (_text, segs) => {
        const { map, rest } = extractMap(segs);
        if (map.length) { this.set({ asciiMap: map }); this.noteMapMarks(); }
        for (const l of rest) if (plain(l).trim()) this.print({ segs: l }); // anything that wasn't the map
      });
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
      case 'status':
        this.set({ connected: msg.connected, status: msg.msg ?? (msg.connected ? 'Connected' : 'Disconnected') });
        if (msg.msg) this.sys(`— ${msg.msg}`);
        if (!msg.connected) this.set({ loggedIn: false, localEcho: true });
        break;
      case 'text': this.onText(msg.d); break;
      case 'prompt': this.sawGA = true; clearTimeout(this.promptTimer); this.onPrompt(); break;
      case 'echo': this.set({ localEcho: msg.on }); break;
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

    if (isPrompt) {
      if (text.trim()) this.learnPrompt(text);
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
    if (NEW_NOTE_RE.test(text)) { clearTimeout(this.notesTimer); this.notesTimer = setTimeout(() => this.refreshNotes(), 1500); }
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
    const char = this.state.char;
    if (p === 'char.base') this.set({ char: { ...char, base: data } });
    else if (p === 'char.vitals') this.set({ char: { ...char, vitals: { hp: num(data.hp), mana: num(data.mana), moves: num(data.moves) } } });
    else if (p === 'char.maxstats') this.set({ char: { ...char, maxstats: mapNums(data) } });
    else if (p === 'char.stats') this.set({ char: { ...char, stats: mapNums(data) } });
    else if (p === 'char.status') this.set({ char: { ...char, status: data } });
    else if (p === 'char.worth') this.set({ char: { ...char, worth: mapNums(data) } });
    else if (p === 'room.info') {
      const room: RoomInfo = {
        num: num(data.num), name: stripAard(String(data.name ?? '')), zone: String(data.zone ?? ''),
        terrain: String(data.terrain ?? ''), details: String(data.details ?? ''),
        exits: mapNums(data.exits ?? {}), coord: data.coord,
      };
      if (room.num !== this.state.room?.num) {
        this.refreshMap();
        if (this.state.lasertag.firedInRoom !== undefined) this.lt({ firedInRoom: undefined });
      }
      this.mapper.add(room);
      this.set({ room, mapVersion: this.state.mapVersion + 1 });
    } else if (p === 'comm.channel') {
      const raw = String(data.msg ?? '');
      const msg: ChatMsg = { id: nextId++, chan: String(data.chan), player: String(data.player ?? ''), msg: raw.includes('\x1b') ? new AnsiParser().parse(raw) : aardSegs(raw), at: Date.now() };
      if (!plain(msg.msg).trim()) return;
      const chat = this.state.chat.concat(msg).slice(-CHAT_MAX);
      this.set({ chat });
      saveChat(chat);
    } else if (p === 'comm.quest') {
      this.set({ objectives: { ...this.state.objectives, quest: applyQuestEvent(this.state.objectives.quest, data ?? {}) } });
    } else if (p === 'group') {
      this.set({ group: { groupname: data.groupname, leader: data.leader, members: data.members ?? [] } });
    }

    if (!this.state.loggedIn && p.startsWith('char.')) this.onLogin();
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
  private noteMapMarks() {
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
    // Wait for the prompt that ends the login burst, so hidden replies can't swallow real output.
    this.setupPending = true;
    // …or after a quiet moment, if no prompt comes (e.g. right after reattaching).
    setTimeout(() => { if (this.setupPending && !plain(this.cur).trim()) this.setupAfterLogin(); }, 1500);
  }

  private setupAfterLogin() {
    this.setupPending = false;
    this.gmcp('request char');
    this.gmcp('request room');
    // Ask which tags exist, then enable the room-related ones we know how to parse.
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
    this.refreshInventory(300);
    setTimeout(() => this.requestTellHistory(), 700);
    setTimeout(() => this.refreshObjectives(), 1200);
    this.refreshMap(1600);
    setTimeout(() => this.refreshNotes(), 2200);
  }
}

const PROMPT_KEY = 'gaslamp.promptSample';

/** "[158/158hp 189mn] >" → /^\[\d+\/\d+hp \d+mn\] > ?/ */
export function promptRegExp(sample: string) {
  const esc = sample.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&').replace(/\d+/g, '\\d+');
  return new RegExp(`^${esc} ?`);
}

function loadPromptRe(): RegExp | null {
  try { const s = localStorage.getItem(PROMPT_KEY); return s ? promptRegExp(s) : null; } catch { return null; }
}

type CaptureCb = (lines: string[], segs: Seg[][]) => void;

function trimBlankLines(lines: Seg[][]): Seg[][] {
  let a = 0, b = lines.length;
  while (a < b && !plain(lines[a]).trim()) a++;
  while (b > a && !plain(lines[b - 1]).trim()) b--;
  return lines.slice(a, b);
}

/** Split a `map` reply into the map itself and anything else that arrived in between. */
export function extractMap(lines: Seg[][]): { map: Seg[][]; rest: Seg[][] } {
  const texts = lines.map((l) => plain(l).trim());
  const start = texts.indexOf('<MAPSTART>');
  const end = texts.indexOf('<MAPEND>', start + 1);
  if (start < 0 || end < 0) return { map: trimBlankLines(lines), rest: [] }; // map tag off: whole reply is the map
  return { map: trimBlankLines(lines.slice(start + 1, end)), rest: [...lines.slice(0, start), ...lines.slice(end + 1)] };
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

const CHAT_KEY = 'gaslamp.chat.v1';
const CHAT_MAX = 400;
let chatSaveTimer: ReturnType<typeof setTimeout> | undefined;

const ITEMS_KEY = 'gaslamp.items.v1';
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

function mapNums(o: Record<string, unknown>) {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(o ?? {})) out[k] = num(v);
  return out;
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
