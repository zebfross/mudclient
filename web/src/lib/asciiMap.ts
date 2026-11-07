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
  exits: Partial<Record<'n' | 's' | 'e' | 'w', true>>;
}

export interface MapGrid { cells: GridCell[]; byPos: Map<string, GridCell> }

export const key = (x: number, y: number) => `${x},${y}`;
const STEP: Record<'n' | 's' | 'e' | 'w', [number, number]> = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };

export function parseAsciiMap(lines: string[]): MapGrid | null {
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

/** Attach known room numbers to cells by walking out from your room along known exits. */
export function labelGrid(grid: MapGrid, here: RoomInfo, mapper: Mapper): Map<string, number> {
  const ids = new Map<string, number>([[key(0, 0), here.num]]);
  const queue: [number, number, number][] = [[0, 0, here.num]];
  while (queue.length) {
    const [x, y, id] = queue.shift()!;
    const room = id === here.num ? here : mapper.rooms.get(id);
    const cell = grid.byPos.get(key(x, y));
    if (!room || !cell) continue;
    for (const d of ['n', 's', 'e', 'w'] as const) {
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
    for (const d of Object.keys(cur.exits) as ('n' | 's' | 'e' | 'w')[]) {
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
