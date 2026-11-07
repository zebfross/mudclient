import assert from 'node:assert/strict';
import { gridPath, key, labelGrid, parseAsciiMap } from '../web/src/lib/asciiMap.ts';
import { Mapper } from '../web/src/lib/mapper.ts';

// Real `map` output from the Aylorian Academy (room 35214, exits e/s/w/u).
const lines = [
  '         -----------         ',
  '        |[!] [#> (!*|     ',
  '         ---     ---         ',
  '            |[ ]|         ',
  '         ---     ---         ',
  '        |[!] [ ] [$]|     ',
  '         ---     ---         ',
  '            |[ ]|         ',
];
const grid = parseAsciiMap(lines)!;
assert.ok(grid);
const cell = (x: number, y: number) => grid.byPos.get(key(x, y));
assert.deepEqual(grid.cells.map((c) => [c.x, c.y]).sort(), [[-1, 0], [-1, 2], [0, 0], [0, 1], [0, 2], [0, 3], [1, 0], [1, 2]].sort());

const you = cell(0, 0)!;
assert.equal(you.contents, '#');
assert.ok(you.up && !you.down, 'up exit from ">"');
assert.deepEqual(Object.keys(you.exits).sort(), ['e', 's', 'w'], 'matches GMCP exits e/s/w');
assert.equal(cell(1, 0)!.terrain, '(*', 'forest-style brackets');
assert.equal(cell(1, 0)!.contents, '!');
assert.equal(cell(1, 2)!.contents, '$', 'shop');
assert.deepEqual(Object.keys(cell(0, 1)!.exits).sort(), ['n', 's'], 'corridor cell');
assert.deepEqual(Object.keys(cell(-1, 2)!.exits), ['e'], 'west room only opens east');
assert.deepEqual(Object.keys(cell(0, 3)!.exits), ['n']);

assert.deepEqual(gridPath(grid, 1, 2), ['s', 's', 'e'], 'walk to the shop');
assert.deepEqual(gridPath(grid, 0, 0), []);
assert.equal(gridPath(grid, 5, 5), null);

// Labels: known room ids spread out from you along exits that are both in GMCP and on the map.
const mapper = new Mapper();
mapper.rooms.clear();
mapper.rooms.set(35213, { num: 35213, name: 'Hallway', zone: 'academy', terrain: 'inside', details: '', exits: { n: 35214, s: 35212 } });
const here = { num: 35214, name: 'End of the hallway', zone: 'academy', terrain: 'inside', details: '', exits: { e: 35216, s: 35213, w: 35215, u: 35217 } };
const ids = labelGrid(grid, here, mapper);
assert.equal(ids.get(key(0, 0)), 35214);
assert.equal(ids.get(key(1, 0)), 35216);
assert.equal(ids.get(key(-1, 0)), 35215);
assert.equal(ids.get(key(0, 1)), 35213);
assert.equal(ids.get(key(0, 2)), 35212, 'two steps out through a visited room');
assert.equal(ids.get(key(1, 2)), undefined, 'unvisited beyond that');

// The earlier map with a down exit on the left bracket ("<!.").
const other = parseAsciiMap([
  '             ---     ---',
  '        |[!] [!] <#.|',
  '             ---     ---',
])!;
assert.ok(other.byPos.get(key(0, 0))!.down);
assert.equal(parseAsciiMap(['no map here']), null);
console.log('asciiMap tests passed');
