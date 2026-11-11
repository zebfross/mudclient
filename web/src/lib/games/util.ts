// Small helpers shared by the store and the game adapters.
import { plain, type Seg } from '../ansi.ts';

export const num = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0);

export function mapNums(o: Record<string, unknown>) {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(o ?? {})) out[k] = num(v);
  return out;
}

export function trimBlankLines(lines: Seg[][]): Seg[][] {
  let a = 0, b = lines.length;
  while (a < b && !plain(lines[a]).trim()) a++;
  while (b > a && !plain(lines[b - 1]).trim()) b--;
  return lines.slice(a, b);
}

/** Split an Aardwolf `map` reply into the map itself and anything else that arrived in between. */
export function extractMap(lines: Seg[][]): { map: Seg[][]; rest: Seg[][] } {
  const texts = lines.map((l) => plain(l).trim());
  const start = texts.indexOf('<MAPSTART>');
  const end = texts.indexOf('<MAPEND>', start + 1);
  if (start < 0 || end < 0) return { map: trimBlankLines(lines), rest: [] }; // map tag off: whole reply is the map
  return { map: trimBlankLines(lines.slice(start + 1, end)), rest: [...lines.slice(0, start), ...lines.slice(end + 1)] };
}
