// What differs between MUD families. The core (store.ts) keeps one game-neutral picture of your
// character, room, chat and map; an adapter turns one family's protocol and wording into it.
import type { Seg } from '../ansi.ts';
import type { RoomInfo } from '../mapper.ts';
import type { ChatMsg, State } from '../store.ts';

export type Family = 'aardwolf' | 'ire';

/** Which parts of the UI and background work make sense for this game. */
export interface Features {
  hungerThirst: boolean; // header meters
  notes: boolean;        // Notes tab (Aardwolf's boards)
  objectives: boolean;   // goals, campaign, quest
  shops: boolean;        // "what would they buy?"
  lasertag: boolean;
  gameClock: boolean;    // in-game time in the header
  coords: boolean;       // continent x,y on the map
  diagonals: boolean;    // ne/nw/se/sw exits: compass corners
  movesLabel: string;    // third vitals bar: "MV" (moves) or "EP" (endurance)
}

export type CaptureCb = (lines: string[], segs: Seg[][]) => void;

/** What an adapter may do to the game. Implemented by the store's Game class. */
export interface Host {
  readonly state: State;
  set(patch: Partial<State>): void;
  gmcp(pkg: string, data?: unknown): void;
  print(line: { segs: Seg[] }): void;
  captureReply(cmd: string, start: RegExp, cb: CaptureCb, end?: RegExp): void;
  /** A room report: walking, the mapper, map refresh and per-room features all hang off this. */
  enterRoom(room: RoomInfo): void;
  addChat(msg: Omit<ChatMsg, 'id' | 'at'>): void;
  tick(): void;
  noteMapMarks(): void;
  // Aardwolf's start-up lookups (no-ops elsewhere).
  setupTags(): void;
  refreshInventory(delay?: number): void;
  requestTellHistory(): void;
  refreshObjectives(): void;
  refreshMap(delay?: number): void;
  refreshNotes(): void;
  syncTime(): void;
}

export interface GameAdapter {
  family: Family;
  features: Features;
  /** Default Quick bar commands. */
  quickCommands: string[];

  // ---- login ----
  /** The question that asks for your character's name. */
  namePrompt: RegExp;
  /** Does this GMCP package mean we're in the game (not at the login screen)? */
  isLoginSignal(pkg: string): boolean;
  /** After a page reload reattached to a live session: ask for whatever proves we're logged in. */
  onResume(host: Host): void;
  /** Once logged in and the login burst has ended. */
  afterLogin(host: Host): void;

  // ---- protocol ----
  /** GMCP, lower-cased package name; data already parsed. */
  onGmcp(host: Host, pkg: string, data: any): void;
  /** May this command be sent quietly in the background? */
  allowsQuiet(cmd: string): boolean;
  /** Fetch the game's own map quietly into state.asciiMap. */
  fetchMap(host: Host): void;

  // ---- movement ----
  doorCommand(verb: 'open' | 'unlock', dir: string): string;
  doorClosed: RegExp;
  doorLocked: RegExp;
  walkBlocked: RegExp;
}
