// Aardwolf in-band colour codes (@r, @W, @x123, @@) as used in GMCP strings and invdata names.
import { xterm256, type Seg } from './ansi.ts';

const CODES: Record<string, number> = {
  k: 0, r: 1, g: 2, y: 3, b: 4, m: 5, c: 6, w: 7,
  D: 8, R: 9, G: 10, Y: 11, B: 12, M: 13, C: 14, W: 15,
};

export function aardSegs(s: string): Seg[] {
  const out: Seg[] = [];
  let fg: string | undefined;
  let text = '';
  const push = () => { if (text) { out.push({ text, fg }); text = ''; } };
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== '@' || i + 1 >= s.length) { text += s[i]; continue; }
    const c = s[i + 1];
    if (c === '@') { text += '@'; i++; continue; }
    if (c === 'x') {
      const m = /^\d{1,3}/.exec(s.slice(i + 2));
      push();
      fg = m ? xterm256(Number(m[0])) : undefined;
      i += 1 + (m ? m[0].length : 0);
      continue;
    }
    if (c in CODES) { push(); fg = c === 'w' ? undefined : xterm256(CODES[c]); i++; continue; }
    text += '@';
  }
  push();
  return out;
}

export const stripAard = (s: string) => aardSegs(s).map((x) => x.text).join('');
