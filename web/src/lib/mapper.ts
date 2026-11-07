// Room graph built from GMCP room.info, persisted in localStorage.
import { stripAard } from './aardColor.ts';

export interface RoomInfo {
  num: number;
  name: string;
  zone: string;
  terrain: string;
  details: string;
  exits: Record<string, number>;
  coord?: { id: number; x: number; y: number; cont: number };
}

const KEY = 'gaslamp.rooms.v1';
export const DIRS: Record<string, [number, number]> = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
export const DIR_NAMES: Record<string, string> = { n: 'north', s: 'south', e: 'east', w: 'west', u: 'up', d: 'down' };

export class Mapper {
  rooms = new Map<number, RoomInfo>();
  private saveTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) for (const r of JSON.parse(raw) as RoomInfo[]) this.rooms.set(r.num, r);
    } catch { /* storage unavailable or corrupt: start fresh */ }
  }

  add(r: RoomInfo) {
    this.rooms.set(r.num, { ...r, name: stripAard(r.name) });
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
