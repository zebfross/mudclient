// The command bar's Quick actions: user-editable, saved in this browser.
import { gameKey } from './gameChoice.ts';
export interface QuickAction { id: string; label: string; cmd: string }

const KEY = gameKey('gaslamp.quick.v1');
/** Quick actions from plain commands (each game has its own defaults). */
export const quickDefaults = (cmds: string[]): QuickAction[] => cmds.map((c) => ({ id: c, label: '', cmd: c }));
export const DEFAULT_QUICK: QuickAction[] = quickDefaults(['look', 'score', 'where', 'quest info', 'campaign check', 'affects', 'scan', 'recall']);

/** The list you saved, or null if you never changed the defaults. */
export function loadSavedQuick(): QuickAction[] | null {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as QuickAction[]) : null;
    if (Array.isArray(list)) return list.filter((q) => q && typeof q.cmd === 'string');
  } catch { /* storage unavailable or corrupt */ }
  return null;
}
export function clearQuick() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }

export const newId = () => Math.random().toString(36).slice(2, 10);

export function loadQuick(): QuickAction[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as QuickAction[]) : null;
    if (Array.isArray(list)) return list.filter((q) => q && typeof q.cmd === 'string');
  } catch { /* storage unavailable or corrupt */ }
  return DEFAULT_QUICK;
}

export function saveQuick(list: QuickAction[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* ignore */ }
}

/** "get all corpse; sac corpse" → two commands. Blank pieces are dropped. */
export const splitCommands = (cmd: string) => cmd.split(';').map((c) => c.trim()).filter(Boolean);

/** What the button shows: its label, or the command itself. */
export const quickLabel = (q: QuickAction) => q.label.trim() || q.cmd.trim();

/** Move the item at `from` so it lands at index `to`. */
export function move<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= list.length) return list;
  const out = [...list];
  const [it] = out.splice(from, 1);
  out.splice(Math.max(0, Math.min(out.length, to)), 0, it);
  return out;
}
