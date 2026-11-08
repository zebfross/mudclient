// Item details from Aardwolf's `invdetails <id>`, and "is this better than what I wear?".
//
//   {invdetails}
//   {invheader}3968216032|1|Armor|500|5|torso|unique, hum, magic, v3||||1|||65
//   {statmod}Hit roll|1
//   {weapon}dagger|4|stab|Pierce|
//   {/invdetails}
//
// Header fields: id | level | type | worth | weight | wear slot | flags | owner | clan | timer |
// u1 | u2 | u3 | score. The score is Aardwolf's own rating of the item.

export interface ItemDetails {
  id: string;
  level: number;
  type: string;
  worth: number;
  weight: number;
  wear: string; // "torso", "wield", "finger", "" when not wearable
  flags: string[];
  score: number;
  stats: Record<string, number>;
  weapon?: { kind: string; avg: number; damage: string };
}

/** Item types worth asking about: things you might wear or wield. */
export const DETAIL_TYPES = new Set([1, 5, 6, 7]); // light, weapon, treasure, armor

export function parseInvDetails(lines: string[]): ItemDetails | null {
  let d: ItemDetails | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    const h = /^\{invheader\}(.*)$/.exec(line);
    if (h) {
      const f = h[1].split('|');
      d = {
        id: f[0], level: Number(f[1]) || 0, type: f[2] ?? '', worth: Number(f[3]) || 0, weight: Number(f[4]) || 0,
        wear: (f[5] ?? '').trim().toLowerCase(), flags: (f[6] ?? '').split(',').map((x) => x.trim()).filter(Boolean),
        score: Number(f[f.length - 1]) || 0, stats: {},
      };
      continue;
    }
    if (!d) continue;
    const s = /^\{statmod\}([^|]+)\|(-?\d+)/.exec(line);
    if (s) { d.stats[s[1].trim()] = (d.stats[s[1].trim()] ?? 0) + Number(s[2]); continue; }
    const w = /^\{weapon\}([^|]*)\|(-?\d+)\|[^|]*\|([^|]*)/.exec(line);
    if (w) d.weapon = { kind: w[1], avg: Number(w[2]), damage: w[3] };
  }
  return d;
}

/** How many items a wear slot holds at once. */
export const slotCapacity = (wear: string) => (/^(finger|wrist|neck|ear)$/.test(wear) ? 2 : /^medal$/.test(wear) ? 4 : 1);

export type Verdict = 'better' | 'worse' | 'same' | 'empty' | 'toohigh';
export interface Comparison {
  verdict: Verdict;
  delta: number; // score difference against `against`
  against?: ItemDetails; // the worn item it would replace
  stats: [string, number][]; // per-stat change if you swapped
}

/**
 * Compare a carried item with what you wear in its slot. With a free slot it's simply an addition;
 * otherwise it's measured against the weakest item there (the one you'd swap out).
 */
export function compareItem(item: ItemDetails, worn: ItemDetails[], myLevel?: number): Comparison | null {
  if (!item.wear) return null;
  const inSlot = worn.filter((w) => w.wear === item.wear);
  const against = inSlot.length >= slotCapacity(item.wear) ? inSlot.reduce((a, b) => (b.score < a.score ? b : a)) : undefined;
  const names = new Set([...Object.keys(item.stats), ...Object.keys(against?.stats ?? {})]);
  const stats = [...names]
    .map((n): [string, number] => [n, (item.stats[n] ?? 0) - (against?.stats[n] ?? 0)])
    .filter(([, v]) => v !== 0)
    .sort((a, b) => b[1] - a[1]);
  const delta = item.score - (against?.score ?? 0);
  const verdict: Verdict = myLevel !== undefined && item.level > myLevel ? 'toohigh'
    : !against ? 'empty' : delta > 0 ? 'better' : delta < 0 ? 'worse' : 'same';
  return { verdict, delta, against, stats };
}
