// Parse Aardwolf's ASCII `map` into a room grid with exits, so it can be drawn as tiles and walked.
//
//          -----------            wall rows: "---" under/over a cell = wall, spaces = open N/S
//         |[!] [#> (!*|           room rows: 3-char cells every 4 columns; "|" between = wall
//          ---     ---            middle char = contents (# you, ! mob, $ shop, * player)
//             |[ ]|               bracket chars = terrain, or > / < for an up / down exit
import type { Mapper, RoomInfo } from './mapper.ts';

export interface GridCell {
  x: number; // columns from you (east +)
  y: number; // rows from you (south +)
  glyph: string; // the 3 raw characters
  contents: string; // middle character
  terrain: string; // bracket pair with up/down markers removed, e.g. "[]", "(*", ".."
  up: boolean;
  down: boolean;
  exits: Partial<Record<GridDir, true>>;
}

/** Aardwolf draws only n/s/e/w; Iron Realms maps also draw diagonals. */
export type GridDir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export interface MapGrid { cells: GridCell[]; byPos: Map<string, GridCell> }

export const key = (x: number, y: number) => `${x},${y}`;
const STEP: Record<GridDir, [number, number]> = {
  n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0], ne: [1, -1], nw: [-1, -1], se: [1, 1], sw: [-1, 1],
};
const ALL_DIRS = Object.keys(STEP) as GridDir[];

export function parseAsciiMap(lines: string[]): MapGrid | null {
  if (lines.some((l) => IRE_HEADER_RE.test(l))) return parseIreMap(lines);
  // Anchor on you: '#' as the middle of a cell, which sits on a room row.
  let youLine = -1, youCol = -1;
  for (let i = 0; i < lines.length && youLine < 0; i++) {
    const m = /[[(<>{,.;%~/\\`* -]#[\])<>},.;%~/\\`* -]/.exec(lines[i]);
    if (m && !/^-+$/.test(lines[i].trim())) { youLine = i; youCol = m.index + 1; }
  }
  if (youLine < 0) return null;

  const start0 = ((youCol - 1) % 4 + 4) % 4; // column where cells start, modulo the 4-column stride
  const at = (line: number, col: number) => lines[line]?.[col] ?? ' ';
  const cells: GridCell[] = [];
  const byPos = new Map<string, GridCell>();

  for (let line = youLine % 2; line < lines.length; line += 2) {
    const text = lines[line];
    if (/^\s*-+[\s-]*$/.test(text)) continue; // a wall row that happens to share parity
    for (let c = start0; c + 2 < text.length; c += 4) {
      const glyph = text.slice(c, c + 3);
      if (!glyph.trim() || /^-+$/.test(glyph.trim())) continue;
      const l = glyph[0], mid = glyph[1], r = glyph[2];
      const up = l === '>' || r === '>';
      const down = l === '<' || r === '<';
      const cell: GridCell = {
        x: (c + 1 - youCol) / 4,
        y: (line - youLine) / 2,
        glyph,
        contents: mid,
        terrain: (/[<>]/.test(l) ? '' : l) + (/[<>]/.test(r) ? '' : r),
        up, down, exits: {},
      };
      cells.push(cell);
      byPos.set(key(cell.x, cell.y), cell);
    }
  }

  // Exits: a passage between two neighbouring cells that isn't drawn as a wall.
  for (const cell of cells) {
    const c = youCol - 1 + cell.x * 4; // cell's first column
    const line = youLine + cell.y * 2;
    const open = (dir: 'n' | 's' | 'e' | 'w') => {
      const [dx, dy] = STEP[dir];
      if (!byPos.has(key(cell.x + dx, cell.y + dy))) return false;
      if (dir === 'e') return at(line, c + 3) !== '|';
      if (dir === 'w') return at(line, c - 1) !== '|';
      const wall = lines[line + dy]?.slice(c, c + 3) ?? '   ';
      return !wall.includes('-');
    };
    for (const d of ['n', 's', 'e', 'w'] as const) if (open(d)) cell.exits[d] = true;
  }
  return { cells, byPos };
}

// ---- Iron Realms (Achaea) -------------------------------------------------------------------
//
//   --- Area 430: The Pygmy Dungeons - v41111 ---      rooms are "[x]" every 4 columns, 2 rows;
//                  [ ]                                 "+" inside the brackets is you.
//                   |                                  "-" between rooms on a row: east/west
//         [ ]-[ ]-[ ]                                  "|" under a room: north/south
//                    \                                 "\" and "/" in between rows: diagonals
//                     [+]
//   --- A dark, dank cell ------------- 0:0:0 ---
const IRE_HEADER_RE = /^\s*--- Area \d+: .* ---\s*$/;

export function parseIreMap(lines: string[]): MapGrid | null {
  let youLine = -1, youCol = -1;
  for (let i = 0; i < lines.length && youLine < 0; i++) {
    const c = lines[i].indexOf('[+]');
    if (c >= 0) { youLine = i; youCol = c + 1; }
  }
  if (youLine < 0) return null;
  const at = (line: number, col: number) => lines[line]?.[col] ?? ' ';
  const cells: GridCell[] = [];
  const byPos = new Map<string, GridCell>();
  for (let line = youLine % 2; line < lines.length; line += 2) {
    const text = lines[line];
    if (/^\s*---/.test(text)) continue; // header / footer
    for (let mid = ((youCol % 4) + 4) % 4; mid + 1 < text.length; mid += 4) {
      if (text[mid - 1] !== '[' || text[mid + 1] !== ']') continue;
      const ch = text[mid];
      const cell: GridCell = {
        x: (mid - youCol) / 4, y: (line - youLine) / 2,
        glyph: text.slice(mid - 1, mid + 2),
        contents: ch === '+' ? '#' : ch, // '#' is "you" everywhere else in Gaslamp
        terrain: '[]', up: false, down: false, exits: {},
      };
      cells.push(cell);
      byPos.set(key(cell.x, cell.y), cell);
    }
  }
  for (const cell of cells) {
    const mid = youCol + cell.x * 4, line = youLine + cell.y * 2;
    const link: Record<GridDir, boolean> = {
      e: at(line, mid + 2) === '-', w: at(line, mid - 2) === '-',
      s: at(line + 1, mid) === '|', n: at(line - 1, mid) === '|',
      se: at(line + 1, mid + 2) === '\\', nw: at(line - 1, mid - 2) === '\\',
      sw: at(line + 1, mid - 2) === '/', ne: at(line - 1, mid + 2) === '/',
    };
    for (const d of ALL_DIRS) {
      const [dx, dy] = STEP[d];
      if (link[d] && byPos.has(key(cell.x + dx, cell.y + dy))) cell.exits[d] = true;
    }
  }
  return { cells, byPos };
}

/** Attach known room numbers to cells by walking out from your room along known exits. */
export function labelGrid(grid: MapGrid, here: RoomInfo, mapper: Mapper): Map<string, number> {
  const ids = new Map<string, number>([[key(0, 0), here.num]]);
  const queue: [number, number, number][] = [[0, 0, here.num]];
  while (queue.length) {
    const [x, y, id] = queue.shift()!;
    const room = id === here.num ? here : mapper.rooms.get(id);
    const cell = grid.byPos.get(key(x, y));
    if (!room || !cell) continue;
    for (const d of ALL_DIRS) {
      const to = room.exits[d];
      const [dx, dy] = STEP[d];
      const k = key(x + dx, y + dy);
      if (to === undefined || !cell.exits[d] || ids.has(k) || !grid.byPos.has(k)) continue;
      ids.set(k, to);
      queue.push([x + dx, y + dy, to]);
    }
  }
  return ids;
}

/** Directions from you (0,0) to a cell, over the exits drawn on the map. */
export function gridPath(grid: MapGrid, tx: number, ty: number): string[] | null {
  const target = key(tx, ty);
  const prev = new Map<string, [string, string]>();
  const seen = new Set([key(0, 0)]);
  const queue: GridCell[] = [grid.byPos.get(key(0, 0))!].filter(Boolean);
  while (queue.length) {
    const cur = queue.shift()!;
    const ck = key(cur.x, cur.y);
    if (ck === target) {
      const dirs: string[] = [];
      for (let k = ck; prev.has(k); k = prev.get(k)![0]) dirs.unshift(prev.get(k)![1]);
      return dirs;
    }
    for (const d of Object.keys(cur.exits) as GridDir[]) {
      const [dx, dy] = STEP[d];
      const nk = key(cur.x + dx, cur.y + dy);
      const next = grid.byPos.get(nk);
      if (!next || seen.has(nk)) continue;
      seen.add(nk);
      prev.set(nk, [ck, d]);
      queue.push(next);
    }
  }
  return null;
}
