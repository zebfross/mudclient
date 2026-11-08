// Aardwolf's note boards ("forums"): parsers for `board`, `note list` and a read note.
import { plain, type Seg } from './ansi.ts';

export interface Board { num: number; name: string; unread: number; desc: string }
export interface Post { num: number; date: string; author: string; subject: string; unread: boolean }
export interface Note { num: number; from: string; subject: string; forum: string; to: string; date: string; body: Seg[][] }

/**
 * `board`:
 *   |     1 |   Announce |        19 | Announcements from Immortals              |
 *   Your current forum is Personal.
 */
export function parseBoards(lines: string[]): { boards: Board[]; current?: string } {
  const boards: Board[] = [];
  let current: string | undefined;
  for (const l of lines) {
    const m = /^\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*(\d+)\s*\|\s*(.*?)\s*\|\s*$/.exec(l);
    if (m) boards.push({ num: Number(m[1]), name: m[2], unread: Number(m[3]), desc: m[4] });
    const c = /current forum is (\w+)/i.exec(l);
    if (c) current = c[1];
  }
  return { boards, current };
}

/**
 * `note list`:
 *   Posts in the Personal forum :
 *   |711253|07 Nov 22:24|*Aaeron      | Communications Lesson               |   4|
 * A '*' before the author marks a post you haven't read.
 */
export function parseNoteList(lines: string[]): { forum?: string; posts: Post[] } {
  let forum: string | undefined;
  const posts: Post[] = [];
  for (const l of lines) {
    const f = /^Posts in the (\w+) forum/i.exec(l);
    if (f) forum = f[1];
    const m = /^\|\s*(\d+)\|([^|]*)\|(\*?)([^|]*)\|([^|]*)\|\s*\d*\s*\|\s*$/.exec(l);
    if (m) posts.push({ num: Number(m[1]), date: m[2].trim(), unread: m[3] === '*', author: m[4].trim(), subject: m[5].trim() });
  }
  return { forum, posts };
}

const RULE = /^\s*~{10,}\s*$/;

/** A note from `note read <n>`: a ~~~ rule, header fields, a rule, the body, a closing rule. */
export function parseNote(segs: Seg[][]): Note | null {
  const text = segs.map(plain);
  const rules = text.map((t, i) => (RULE.test(t) ? i : -1)).filter((i) => i >= 0);
  if (rules.length < 2) return null;
  const head = text.slice(rules[0] + 1, rules[1]);
  const field = (name: string) => head.find((h) => h.startsWith(name))?.replace(/^[^:]*:\s*/, '') ?? '';
  const fromLine = field('From');
  const sep = fromLine.indexOf(': ');
  const forumLine = field('Forum');
  let body = segs.slice(rules[1] + 1, rules[2] ?? segs.length);
  const bodyText = body.map(plain);
  // Auto-formatted notes put "| " before every line; drop it, and the footer about formatting.
  if (bodyText.length && bodyText.every((t) => t.startsWith('|'))) body = body.map((l) => stripLead(l, /^\|\s?/));
  body = body.filter((l) => !/^\s*Note auto-formatted/.test(plain(l)));
  while (body.length && !plain(body[body.length - 1]).trim()) body = body.slice(0, -1);
  return {
    num: Number(/#(\d+)/.exec(forumLine)?.[1] ?? 0),
    from: sep >= 0 ? fromLine.slice(0, sep) : fromLine,
    subject: sep >= 0 ? fromLine.slice(sep + 2) : '',
    forum: forumLine.replace(/\s*-\s*#\d+.*$/, ''),
    to: field('To'),
    date: field('Date'),
    body,
  };
}

/** Remove a leading match from a line of coloured segments. */
function stripLead(line: Seg[], re: RegExp): Seg[] {
  const m = re.exec(plain(line));
  let n = m ? m[0].length : 0;
  const out: Seg[] = [];
  for (const s of line) {
    if (n >= s.text.length) { n -= s.text.length; continue; }
    out.push(n ? { ...s, text: s.text.slice(n) } : s);
    n = 0;
  }
  return out;
}
