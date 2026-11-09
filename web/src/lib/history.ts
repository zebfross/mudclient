/** History entries containing `query` (case-insensitive), newest first, without repeats. */
export function searchHistory(history: string[], query: string, limit = 50): string[] {
  const q = query.toLowerCase();
  const out: string[] = [];
  for (const h of history) {
    if (out.length >= limit) break;
    if (h.toLowerCase().includes(q) && !out.includes(h)) out.push(h);
  }
  return out;
}

export const HISTORY_MAX = 1000;

/**
 * Add a command to the front of the history. An earlier copy moves up instead of being kept twice,
 * so repeated commands (scan, scan, scan…) don't push older ones out.
 */
export function addHistory(history: string[], cmd: string, max = HISTORY_MAX): string[] {
  return [cmd, ...history.filter((h) => h !== cmd)].slice(0, max);
}
