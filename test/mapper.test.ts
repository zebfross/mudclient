import assert from 'node:assert/strict';
import { Mapper, drawnPath } from '../web/src/lib/mapper.ts';

const m = new Mapper();
m.rooms.clear();
const add = (num: number, exits: Record<string, number>, zone = 'town') => m.rooms.set(num, { num, name: `R${num}`, zone, terrain: 'city', details: '', exits });
// 1 - 2 - 3, with 3 north to unvisited 9, 2 south to 4 in another zone, and 4 far away.
add(1, { e: 2 });
add(2, { w: 1, e: 3, s: 4 });
add(3, { w: 2, n: 9, u: 5 });
add(4, { n: 2 }, 'forest');
add(5, { d: 3 });
add(6, { w: 7 }); add(7, { e: 6 }); // disconnected rooms in the same zone aren't reachable

const a = m.areaLayout(2);
const at = (num: number) => a.nodes.find((n) => n.num === num);
assert.equal(a.zone, 'town');
assert.deepEqual([at(1)!.x, at(1)!.y], [-1, 0]);
assert.deepEqual([at(3)!.x, at(3)!.y], [1, 0]);
assert.deepEqual([at(9)!.x, at(9)!.y, at(9)!.ghost, at(9)!.from, at(9)!.dir], [1, -1, true, 3, 'n'], 'unvisited exit is a ghost');
assert.equal(at(4), undefined, 'other zone left out');
assert.equal(at(5), undefined, 'up/down rooms are not placed on the flat grid');
assert.equal(at(6), undefined);
assert.equal(a.edges.length, 3, 'one edge per connection, no duplicates');

// Non-Euclidean: a room that would land on an occupied square is left out.
add(10, { e: 11, s: 12 }, 'maze'); add(11, { w: 10, s: 13 }, 'maze'); add(12, { n: 10, e: 14 }, 'maze');
add(13, { n: 11 }, 'maze'); add(14, { w: 12 }, 'maze');
const b = m.areaLayout(10);
assert.equal(b.nodes.length, 4, '13 and 14 both want (1,1); first one wins');
// Shop marks survive GMCP updates for the same room, and can be cleared.
assert.equal(m.setMark(1, '$'), true);
assert.equal(m.setMark(1, '$'), false, 'no change');
m.add({ num: 1, name: 'R1', zone: 'town', terrain: 'city', details: '', exits: { e: 2 } });
assert.equal(m.rooms.get(1)!.mark, '$');
m.setMark(1, undefined);
assert.equal(m.rooms.get(1)!.mark, undefined);
assert.equal(m.setMark(999, '$'), false, 'unknown room');
// Rooms only seen on Aardwolf's map stay on the area map, placed relative to where they were seen.
const t = new Mapper();
t.rooms.clear(); t.seen.clear();
t.add({ num: 1, name: 'A', zone: 'z', terrain: 'city', details: '', exits: { e: 2 } });
t.setSeen(1, [
  { dx: 1, dy: 0, terrain: '..', exits: 'we', num: 2 },     // the known (unvisited) exit east: enriches the ghost
  { dx: 2, dy: 0, terrain: '..', exits: 'ws', mark: '$' },  // beyond it, no id
  { dx: 2, dy: 1, terrain: '(*', exits: 'n', ud: 'u' },
  { dx: 0, dy: 0, terrain: '[]', exits: '' },               // clashes with the real room: ignored
]);
const l = t.areaLayout(1);
const p = (x: number, y: number) => l.nodes.find((n) => n.x === x && n.y === y);
assert.equal(l.nodes.length, 4);
assert.equal(p(0, 0)!.num, 1);
assert.equal(p(1, 0)!.num, 2);
assert.equal(p(1, 0)!.seen?.terrain, '..', 'ghost exit picks up seen terrain');
assert.ok(p(2, 0)!.num < 0 && p(2, 0)!.seen?.mark === '$', 'seen-only shop');
assert.equal(p(2, 1)!.seen?.ud, 'u');
const has = (a: number, b: number) => l.edges.some((e) => (e.from === a && e.to === b) || (e.from === b && e.to === a));
assert.ok(has(1, 2) && has(2, p(2, 0)!.num) && has(p(2, 0)!.num, p(2, 1)!.num), 'drawn passages connect');
assert.equal(t.setSeen(1, t.seen.get(1)!), false, 'unchanged');
assert.deepEqual(drawnPath(l, 1, p(2, 1)!.num), ['e', 'e', 's'], 'walk to a seen-only room');
assert.equal(drawnPath(l, 1, 12345), null);
console.log('mapper tests passed');
