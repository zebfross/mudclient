// Aardwolf Lasertag helpers. Aardwolf doesn't document these output formats, so the parsers are
// deliberately tolerant; check them against a recorded game (test/fixtures) and tighten.

export type Team = 'red' | 'green';
export interface Target { dir: string; dist: number; name: string; label: string; team?: Team; player: boolean }
export interface Lasertag {
  charges?: number;
  maxCharges?: number;
  chargesAt: number;
  team?: Team;
  rosters: { red: string[]; green: string[] };
  targets: Target[];
  scanAt: number;
  status: string[];
  score: string[];
  news?: { text: string; at: number }; // latest "Lasertag: ..." announcement
  firedInRoom?: number; // room you last fired from; you must move before firing again
  nextGameAt?: number; // from `lasertag status`
}

export const emptyLasertag = (): Lasertag => ({ chargesAt: 0, rosters: { red: [], green: [] }, targets: [], scanAt: 0, status: [], score: [] });

const DIRS = ['north', 'south', 'east', 'west', 'up', 'down'] as const;
// Most specific first: "not far" and "very far" both contain "far".
const DIST_WORDS: [RegExp, number][] = [[/\b(very far|4)\b/i, 4], [/\b(not far|2)\b/i, 2], [/\b(far|distant|3)\b/i, 3], [/\b(nearby|close|1)\b/i, 1]];

/** Charges from an arena prompt, e.g. "[Charges: 95/100] >" or "<95 charges>". */
export function parseCharges(prompt: string): { charges: number; max?: number } | null {
  const m = /charges?\D{0,4}(\d+)(?:\s*\/\s*(\d+))?/i.exec(prompt) ?? /(\d+)(?:\s*\/\s*(\d+))?\s*charges?/i.exec(prompt);
  return m ? { charges: Number(m[1]), max: m[2] ? Number(m[2]) : undefined } : null;
}

const teamOf = (s: string): Team | undefined => (/\bred\b/i.test(s) ? 'red' : /\bgreen\b/i.test(s) ? 'green' : undefined);

/**
 * `scan` output (seen live): "Right here you see:", "North from here you see:", "3 North from here
 * you see:", each followed by entries like "     - (Player) (Flying) (OPK) Corvon". The leading
 * number is the distance. People in your own room can't be shot, so they're skipped.
 */
export function parseScan(lines: string[]): Target[] {
  const out: Target[] = [];
  let dir: string | null = null;
  let dist = 1;
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;
    const head = /:\s*$/.test(line) ? line.toLowerCase() : '';
    if (head) {
      const d = DIRS.find((x) => new RegExp(`\\b${x}\\b`).test(head));
      dir = /right here|in the room|here you see/.test(head) && !d ? null : d ?? null;
      const n = /^\s*(\d+)\s+\w/.exec(head);
      dist = n ? Number(n[1]) : DIST_WORDS.find(([re]) => re.test(head))?.[1] ?? 1;
      continue;
    }
    if (!dir) continue;
    const label = line.replace(/^\s*[-*]\s*/, '').trim();
    if (!label) continue;
    const tags = (label.match(/[([][^)\]]*[)\]]/g) ?? []).join(' ');
    const team = teamOf(tags);
    const words = label.replace(/^(\s*[([][^)\]]*[)\]]\s*)+/, '').split(/\s+/);
    // Players are one word; for mobs ("A touring dwarf") the last word is the usual keyword.
    const word = /^(a|an|the)$/i.test(words[0] ?? '') ? words[words.length - 1] : words[0];
    const name = word?.replace(/[^A-Za-z]/g, '') ?? '';
    if (name) out.push({ dir, dist, name, label, team, player: /\(player\)/i.test(tags) });
  }
  return out;
}

/** Player names from `who red` / `who green`: the first capitalised word after any [..] / (..) blocks. */
export function parseRoster(lines: string[]): string[] {
  const names: string[] = [];
  for (const l of lines) {
    if (/^\s*[-=~]{3,}/.test(l) || /players? (found|shown|online)|^\s*$|:\s*$/i.test(l)) continue; // rules, totals, headers
    const rest = l.replace(/^(\s*[([][^)\]]*[)\]]\s*)+/, '');
    const m = /^\s*([A-Z][a-z]{2,})\b/.exec(rest);
    if (m && !names.includes(m[1])) names.push(m[1]);
  }
  return names;
}
