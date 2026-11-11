// Room graph built from GMCP room.info, persisted in localStorage.
import { stripAard } from './aardColor.ts';
import { gameKey } from './gameChoice.ts';

export interface RoomInfo {
  num: number;
  name: string;
  zone: string;
  terrain: string;
  details: string;
  exits: Record<string, number>;
  coord?: { id: number; x: number; y: number; cont: number };
  /** Lasting feature seen on Aardwolf's map: '$' shop, '?' clan hall exit. */
  mark?: string;
}

const KEY = gameKey('gaslamp.rooms.v1');
const SEEN_KEY = gameKey('gaslamp.seen.v1');

/** A room seen on Aardwolf's map but never visited, stored relative to the room it was seen from. */
export interface SeenCell {
  dx: number;
  dy: number;
  terrain: string; // Aardwolf bracket pair, e.g. "[]", ".."
  exits: string; // drawn passages, e.g. "ns"
  num?: number; // room id, when it could be worked out from known exits
  mark?: string; // '$' shop, '?' clan hall
  ud?: string; // 'u' / 'd' / 'ud'
}
export type AreaNode = {
  num: number; x: number; y: number; ghost: boolean; from?: number; dir?: string;
  seen?: SeenCell; // set for rooms only known from Aardwolf's map
  border?: string; // a visited room in another area, next to this one: its zone
};
// Diagonals only occur in Iron Realms games; Aardwolf never has them.
export const DIRS: Record<string, [number, number]> = {
  n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0], ne: [1, -1], nw: [-1, -1], se: [1, 1], sw: [-1, 1],
};
export const DIR_NAMES: Record<string, string> = {
  n: 'north', s: 'south', e: 'east', w: 'west', u: 'up', d: 'down',
  ne: 'northeast', nw: 'northwest', se: 'southeast', sw: 'southwest', in: 'in', out: 'out',
};

export class Mapper {
  rooms = new Map<number, RoomInfo>();
  /** Unvisited rooms seen on Aardwolf's map, keyed by the visited room they were seen from. */
  seen = new Map<number, SeenCell[]>();
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  private seenTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) for (const r of JSON.parse(raw) as RoomInfo[]) this.rooms.set(r.num, { ...r, name: stripAard(r.name) }); // also cleans names saved before ANSI was stripped
      const seen = localStorage.getItem(SEEN_KEY);
      if (seen) this.seen = new Map(JSON.parse(seen));
    } catch { /* storage unavailable or corrupt: start fresh */ }
  }

  /** Replace what was seen from `anchor` with the latest map drawn there. */
  setSeen(anchor: number, cells: SeenCell[]) {
    const before = JSON.stringify(this.seen.get(anchor) ?? []);
    if (before === JSON.stringify(cells)) return false;
    if (cells.length) this.seen.set(anchor, cells); else this.seen.delete(anchor);
    clearTimeout(this.seenTimer);
    this.seenTimer = setTimeout(() => {
      try { localStorage.setItem(SEEN_KEY, JSON.stringify([...this.seen])); } catch { /* quota */ }
    }, 1000);
    return true;
  }

  add(r: RoomInfo) {
    const mark = this.rooms.get(r.num)?.mark;
    this.rooms.set(r.num, { ...r, name: stripAard(r.name), ...(mark ? { mark } : {}) });
    this.save();
  }

  /** Remember (or forget) a room's lasting map feature. Returns true if it changed. */
  setMark(num: number, mark: string | undefined) {
    const r = this.rooms.get(num);
    if (!r || r.mark === mark) return false;
    if (mark) r.mark = mark; else delete r.mark;
    this.save();
    return true;
  }

  private save() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      try { localStorage.setItem(KEY, JSON.stringify([...this.rooms.values()])); } catch { /* quota */ }
    }, 1000);
  }

  get size() { return this.rooms.size; }

  /** Lay out known rooms around `center` on a grid by walking compass exits within one zone. */
  layout(center: number, radius = 3) {
    const nodes = new Map<string, { num: number; x: number; y: number; dist: number }>();
    const placed = new Map<number, [number, number]>();
    const edges: { from: number; to: number; dir: string }[] = [];
    const stubs: { num: number; dir: string }[] = [];
    const start = this.rooms.get(center);
    if (!start) return { nodes: [], edges, stubs };
    const queue: [number, number, number, number][] = [[center, 0, 0, 0]];
    placed.set(center, [0, 0]);
    nodes.set('0,0', { num: center, x: 0, y: 0, dist: 0 });
    while (queue.length) {
      const [num, x, y, dist] = queue.shift()!;
      const room = this.rooms.get(num);
      if (!room) continue;
      for (const [dir, to] of Object.entries(room.exits)) {
        const off = DIRS[dir];
        if (!off) continue;
        const target = this.rooms.get(to);
        const nx = x + off[0], ny = y + off[1];
        if (!target || target.zone !== start.zone) { stubs.push({ num, dir }); continue; }
        if (placed.has(to)) {
          const [px, py] = placed.get(to)!;
          if (px === nx && py === ny) edges.push({ from: num, to, dir });
          continue;
        }
        if (Math.abs(nx) > radius || Math.abs(ny) > radius) { stubs.push({ num, dir }); continue; }
        if (nodes.has(`${nx},${ny}`)) { stubs.push({ num, dir }); continue; }
        placed.set(to, [nx, ny]);
        nodes.set(`${nx},${ny}`, { num: to, x: nx, y: ny, dist: dist + 1 });
        edges.push({ from: num, to, dir });
        queue.push([to, nx, ny, dist + 1]);
      }
    }
    return { nodes: [...nodes.values()], edges, stubs };
  }

  /**
   * Every known room in `center`'s zone, placed on a grid by walking compass exits outward from
   * `center`. Exits to rooms never visited become ghost nodes, so the edge of what you've explored
   * shows. Rooms that would land on an occupied square (Aardwolf areas aren't always Euclidean)
   * are left out rather than drawn on top of each other.
   */
  areaLayout(center: number) {
    type Node = AreaNode;
    const nodes = new Map<string, Node>();
    const placed = new Map<number, [number, number]>();
    const edges: { from: number; to: number }[] = [];
    const seenEdge = new Set<string>();
    const edge = (a: number, b: number) => {
      const k = a < b ? `${a}-${b}` : `${b}-${a}`;
      if (!seenEdge.has(k)) { seenEdge.add(k); edges.push({ from: a, to: b }); }
    };
    const start = this.rooms.get(center);
    if (!start) return { nodes: [] as Node[], edges, zone: '' };
    placed.set(center, [0, 0]);
    nodes.set('0,0', { num: center, x: 0, y: 0, ghost: false });
    const queue: [number, number, number][] = [[center, 0, 0]];
    while (queue.length) {
      const [num, x, y] = queue.shift()!;
      for (const [dir, to] of Object.entries(this.rooms.get(num)!.exits)) {
        const off = DIRS[dir];
        if (!off) continue;
        const nx = x + off[0], ny = y + off[1];
        const target = this.rooms.get(to);
        const border = !!target && target.zone !== start.zone;
        const at = placed.get(to);
        if (at) {
          if (at[0] === nx && at[1] === ny) edge(num, to);
          continue;
        }
        if (nodes.has(`${nx},${ny}`)) continue;
        placed.set(to, [nx, ny]);
        nodes.set(`${nx},${ny}`, { num: to, x: nx, y: ny, ghost: !target, from: num, dir, ...(border ? { border: target!.zone } : {}) });
        edge(num, to);
        if (target && !border) queue.push([to, nx, ny]);
      }
    }

    // Fill in rooms only seen on Aardwolf's map, around each visited room they were seen from.
    // Real rooms and known exits win any clash. Seen-only rooms get ids below zero.
    let fake = -1;
    const byPos = (x: number, y: number) => nodes.get(`${x},${y}`);
    const added: [Node, SeenCell][] = [];
    for (const n of [...nodes.values()]) {
      if (n.ghost || n.border) continue;
      for (const c of this.seen.get(n.num) ?? []) {
        const x = n.x + c.dx, y = n.y + c.dy;
        const there = byPos(x, y);
        if (there) {
          // Same room as a ghost exit: keep the extra detail (terrain, shop).
          if (there.ghost && !there.seen && (c.num === undefined || c.num === there.num)) { there.seen = c; added.push([there, c]); }
          continue;
        }
        const node: Node = { num: c.num !== undefined && !placed.has(c.num) ? c.num : fake--, x, y, ghost: true, seen: c };
        placed.set(node.num, [x, y]);
        nodes.set(`${x},${y}`, node);
        added.push([node, c]);
      }
    }
    for (const [node, c] of added) {
      for (const d of c.exits) {
        const off = DIRS[d];
        const other = off && byPos(node.x + off[0], node.y + off[1]);
        if (other) edge(node.num, other.num);
      }
    }
    return { nodes: [...nodes.values()], edges, zone: start.zone };
  }

  /** Shortest list of direction letters from one room to another over known exits. */
  path(from: number, to: number): string[] | null {
    if (from === to) return [];
    const prev = new Map<number, [number, string]>();
    const queue = [from];
    const seen = new Set([from]);
    while (queue.length) {
      const cur = queue.shift()!;
      for (const [dir, nxt] of Object.entries(this.rooms.get(cur)?.exits ?? {})) {
        if (seen.has(nxt) || !this.rooms.has(nxt)) continue;
        seen.add(nxt);
        prev.set(nxt, [cur, dir]);
        if (nxt === to) {
          const dirs: string[] = [];
          for (let n = to; n !== from; n = prev.get(n)![0]) dirs.unshift(prev.get(n)![1]);
          return dirs;
        }
        queue.push(nxt);
      }
    }
    return null;
  }
}

/** Directions from one node to another along the drawn connections (for rooms you haven't visited). */
export function drawnPath(layout: { nodes: AreaNode[]; edges: { from: number; to: number }[] }, from: number, to: number): string[] | null {
  const at = new Map(layout.nodes.map((n) => [n.num, n]));
  const adj = new Map<number, number[]>();
  for (const e of layout.edges) {
    adj.set(e.from, [...(adj.get(e.from) ?? []), e.to]);
    adj.set(e.to, [...(adj.get(e.to) ?? []), e.from]);
  }
  const prev = new Map<number, number>();
  const queue = [from];
  const seen = new Set([from]);
  while (queue.length) {
    const cur = queue.shift()!;
    if (cur === to) break;
    for (const nxt of adj.get(cur) ?? []) {
      if (seen.has(nxt)) continue;
      seen.add(nxt); prev.set(nxt, cur); queue.push(nxt);
    }
  }
  if (!prev.has(to)) return null;
  const dirs: string[] = [];
  for (let n = to; n !== from; n = prev.get(n)!) {
    const a = at.get(prev.get(n)!)!, b = at.get(n)!;
    const dir = Object.entries(DIRS).find(([, [dx, dy]]) => dx === b.x - a.x && dy === b.y - a.y)?.[0];
    if (!dir) return null;
    dirs.unshift(dir);
  }
  return dirs;
}
