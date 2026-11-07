// Stateful ANSI SGR parser → styled segments. Handles 16-colour, xterm-256 and truecolour.

export interface Seg { text: string; fg?: string; bg?: string; b?: boolean; u?: boolean }

// Warm, slightly desaturated palette so MUD colours sit well on the gaslamp theme.
const BASE16 = [
  '#3a3735', '#d4574a', '#7fae5a', '#d9a648', '#5f8fc4', '#b072b8', '#4fa9a8', '#cfc6bd',
  '#6d6762', '#ff7b6b', '#a5d67a', '#ffd479', '#8cb8f0', '#e09be6', '#7fdcd8', '#f4eee8',
];

export function xterm256(n: number): string {
  if (n < 16) return BASE16[n];
  if (n >= 232) { const v = 8 + (n - 232) * 10; return `rgb(${v},${v},${v})`; }
  n -= 16;
  const c = (x: number) => (x === 0 ? 0 : 55 + x * 40);
  return `rgb(${c(Math.floor(n / 36))},${c(Math.floor(n / 6) % 6)},${c(n % 6)})`;
}

interface Style { fg?: number | string; bg?: number | string; b?: boolean; u?: boolean }

export class AnsiParser {
  private style: Style = {};
  private pending = ''; // incomplete escape sequence carried between chunks

  /** Parse a chunk; returns segments. Newlines are kept inside segment text. */
  parse(chunk: string): Seg[] {
    const s = this.pending + chunk;
    this.pending = '';
    const out: Seg[] = [];
    let text = '';
    const push = () => { if (text) { out.push(this.seg(text)); text = ''; } };
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (ch === '\x1b') {
        if (i + 1 >= s.length) { this.pending = s.slice(i); break; }
        if (s[i + 1] !== '[') { i++; continue; }
        let j = i + 2;
        while (j < s.length && !/[\x40-\x7e]/.test(s[j])) j++;
        if (j >= s.length) { this.pending = s.slice(i); break; }
        if (s[j] === 'm') { push(); this.sgr(s.slice(i + 2, j)); }
        i = j;
      } else if (ch === '\r' || ch === '\x07' || ch === '\0') {
        continue;
      } else {
        text += ch;
      }
    }
    push();
    return out;
  }

  private seg(text: string): Seg {
    const { fg, bg, b, u } = this.style;
    let fgc = typeof fg === 'number' ? xterm256(b && fg < 8 ? fg + 8 : fg) : fg;
    const bgc = typeof bg === 'number' ? xterm256(bg) : bg;
    if (fgc === undefined && b) fgc = BASE16[15];
    return { text, fg: fgc, bg: bgc, b, u };
  }

  private sgr(params: string) {
    const p = params === '' ? [0] : params.split(';').map((x) => Number(x) || 0);
    for (let k = 0; k < p.length; k++) {
      const n = p[k];
      if (n === 0) this.style = {};
      else if (n === 1) this.style.b = true;
      else if (n === 22) this.style.b = false;
      else if (n === 4) this.style.u = true;
      else if (n === 24) this.style.u = false;
      else if (n >= 30 && n <= 37) this.style.fg = n - 30;
      else if (n >= 90 && n <= 97) this.style.fg = n - 90 + 8;
      else if (n === 39) this.style.fg = undefined;
      else if (n >= 40 && n <= 47) this.style.bg = n - 40;
      else if (n >= 100 && n <= 107) this.style.bg = n - 100 + 8;
      else if (n === 49) this.style.bg = undefined;
      else if ((n === 38 || n === 48) && p[k + 1] === 5) {
        this.style[n === 38 ? 'fg' : 'bg'] = p[k + 2]; k += 2;
      } else if ((n === 38 || n === 48) && p[k + 1] === 2) {
        this.style[n === 38 ? 'fg' : 'bg'] = `rgb(${p[k + 2]},${p[k + 3]},${p[k + 4]})`; k += 4;
      }
    }
  }
}

export const plain = (segs: Seg[]) => segs.map((s) => s.text).join('');
