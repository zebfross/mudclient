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
