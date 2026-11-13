// Iron Realms games (Achaea, Aetolia, Lusternia, Imperian…): IRE GMCP, plain text, `map` with diagonals.
import { AnsiParser } from '../ansi.ts';
import type { RoomInfo } from '../mapper.ts';
import { mapNums, num, trimBlankLines } from './util.ts';
import { mergeTasks, taskList } from '../tasks.ts';
import type { GameAdapter } from './types.ts';

const DIR_SHORT: Record<string, string> = {
  north: 'n', south: 's', east: 'e', west: 'w', up: 'u', down: 'd',
  northeast: 'ne', northwest: 'nw', southeast: 'se', southwest: 'sw', in: 'in', out: 'out',
};
// "--- Area 430: The Pygmy Dungeons - v41111 ---" … "--- A dark, dank cell ------ 0:0:0 ---"
const MAP_START = /^\s*--- Area \d+: .* ---\s*$/;
const PROMPT_RE = /^\s*\d+h, \d+m(?:, \d+[a-z])*\s+([a-z@]*)-/;
/** Tasks aren't in the relay's start-up list: turn them on, then ask. */
function askTasks(host: { gmcp(pkg: string, data?: unknown): void }) {
  host.gmcp('Core.Supports.Add', ['IRE.Tasks 1']);
  host.gmcp('IRE.Tasks.Request');
}
const MAP_END = /^\s*--- .* -?\d+:-?\d+:-?\d+ ---\s*$/;

export const ire: GameAdapter = {
  family: 'ire',
  features: {
    hungerThirst: false, notes: false, objectives: false, shops: false, lasertag: false,
    gameClock: false, coords: false, diagonals: true, balance: true, tasks: true, movesLabel: 'EP',
  },
  quickCommands: ['look', 'score', 'inventory', 'qw', 'map', 'help'],

  namePrompt: /enter your character'?s name\.?\s*$/i,
  isLoginSignal: (pkg) => pkg === 'char.vitals' || pkg === 'char.name' || pkg === 'char.status' || pkg.startsWith('char.items.'),
  // Only answered in the game, so the reply logs us in.
  onResume(host) {
    host.gmcp('Char.Items.Inv');
    askTasks(host);
  },
  afterLogin(host) {
    host.gmcp('Char.Items.Inv');
    askTasks(host);
    host.gmcp('Comm.Channel.Players');
    host.refreshMap(800);
  },

  /**
   * Char.Vitals {hp, maxhp, mp, maxmp, ep, maxep, wp, maxwp, nl}, Char.Name {name, fullname},
   * Char.Status {level: "12 (34%)", class, race, gold…}, Room.Info {num, name, area, environment,
   * exits, details[]}, Comm.Channel.Text {channel, talker, text}.
   */
  onGmcp(host, p, data) {
    const char = host.state.char;
    if (p === 'char.vitals') {
      host.set({ char: { ...char,
        vitals: { hp: num(data.hp), mana: num(data.mp), moves: num(data.ep) },
        maxstats: { ...char.maxstats, maxhp: num(data.maxhp), maxmana: num(data.maxmp), maxmoves: num(data.maxep) },
        ire: { ...char.ire, vitals: data },
        // "1" / "0". Not every IRE game sends them; the prompt's flags are the fallback.
        ...(data.bal !== undefined || data.eq !== undefined ? { ready: {
          balance: data.bal !== undefined ? String(data.bal) === '1' : char.ready?.balance ?? true,
          equilibrium: data.eq !== undefined ? String(data.eq) === '1' : char.ready?.equilibrium ?? true,
        } } : {}),
      } });
    } else if (p === 'char.name') {
      host.set({ char: { ...char, base: { ...char.base, name: String(data.name ?? ''), fullname: String(data.fullname ?? '') } } });
    } else if (p === 'char.status') {
      // Status updates are partial: merge.
      const ireState = { ...char.ire, status: { ...char.ire?.status, ...data } };
      const st = ireState.status;
      host.set({ char: { ...char, ire: ireState,
        base: { ...char.base, name: st.name ?? char.base?.name, class: st.class, race: st.race, fullname: st.fullname ?? char.base?.fullname },
        worth: st.gold !== undefined ? { ...char.worth, gold: num(st.gold), bank: num(st.bank) } : char.worth,
      } });
    } else if (p === 'room.info') {
      const room: RoomInfo = {
        num: num(data.num), name: String(data.name ?? ''), zone: String(data.area ?? ''),
        terrain: String(data.environment ?? '').toLowerCase(),
        details: Array.isArray(data.details) ? data.details.join(',') : String(data.details ?? ''),
        exits: mapNums(data.exits ?? {}),
      };
      host.enterRoom(room);
    } else if (p === 'ire.tasks.list') {
      host.set({ tasks: { list: taskList(data), at: Date.now(), loading: false } });
    } else if (p === 'ire.tasks.update' || p === 'ire.tasks.completed') {
      host.set({ tasks: { ...host.state.tasks, list: mergeTasks(host.state.tasks.list, data, p === 'ire.tasks.completed'), at: Date.now() } });
    } else if (p === 'comm.channel.text') {
      host.addChat({ chan: String(data.channel ?? ''), player: String(data.talker ?? ''), msg: new AnsiParser().parse(String(data.text ?? '')) });
    }
  },

  // "272h, 385m, 800e, 800w ex-": e = equilibrium, x = balance (other letters: prone, blind…).
  onPrompt(host, text) {
    const flags = PROMPT_RE.exec(text)?.[1];
    if (flags === undefined) return;
    const ready = { balance: flags.includes('x'), equilibrium: flags.includes('e') };
    const had = host.state.char.ready;
    if (had?.balance !== ready.balance || had?.equilibrium !== ready.equilibrium) host.set({ char: { ...host.state.char, ready } });
  },

  // Only the map so far: other Aardwolf-style lookups would print junk here.
  allowsQuiet: (cmd) => cmd === 'map',
  fetchMap(host) {
    host.captureReply('map', MAP_START, (_text, segs) => host.set({ asciiMap: trimBlankLines(segs) }), MAP_END);
  },

  // Doors are named: "open door nw", "unlock door nw".
  doorCommand: (verb, dir) => `${verb} door ${DIR_SHORT[dir] ?? dir}`,
  // "There is a door in the way." (wording to be confirmed against the game)
  doorClosed: /^\s*There is a (?:closed )?[\w' -]+ in the way\.?\s*$/i,
  doorLocked: /^\s*(?:it'?s locked|the [\w' -]+ is locked)/i,
  walkBlocked: /^\s*(?:there is no exit in that direction|you can'?t go that way|you cannot (?:go|move) that way|you are (?:asleep|sleeping|sitting|prone|stunned|paralysed|bound|entangled)|you must (?:stand|be standing))/i,
  // Moving again straight after arriving gets "Now now, don't be so hasty!" and the move is dropped.
  stepGap: 600,
  walkTooFast: /^\s*Now now, don'?t be so hasty!?\s*$/i,
};
