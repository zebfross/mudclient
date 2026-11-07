import assert from 'node:assert/strict';
import { parseCharges, parseRoster, parseScan } from '../web/src/lib/lasertag.ts';
import { Game } from '../web/src/lib/store.ts';

// NOTE: formats below are guesses until checked against a recorded game.
assert.deepEqual(parseCharges('[Charges: 95/100] >'), { charges: 95, max: 100 });
assert.deepEqual(parseCharges('<95 charges> '), { charges: 95, max: undefined });
assert.equal(parseCharges('[158/158hp 189/189mn] >'), null);

// Style 1: ROM-like headers per direction and distance.
const s1 = parseScan([
  'Right here you see:',
  '     - (Red) Quillonmarsh',
  'North from here you see:',
  '     - (Green) Bob',
  'Not far east you see:',
  '     - (Red) Alice the Brave',
  '     - (Green) Carl',
]);
assert.deepEqual(s1.map((t) => [t.dir, t.dist, t.name, t.team]), [
  ['north', 1, 'Bob', 'green'], ['east', 2, 'Alice', 'red'], ['east', 2, 'Carl', 'green'],
], 'own room skipped; direction, distance, team parsed');

// Style 2: no team tags, "Nearby"/"Far" wording.
const s2 = parseScan(['Nearby south you see:', '  Dave', 'Far off west you see:', '  [AFK] Eve']);
assert.deepEqual(s2.map((t) => [t.dir, t.dist, t.name]), [['south', 1, 'Dave'], ['west', 3, 'Eve']]);

assert.deepEqual(parseRoster([
  'Players in Lasertag (red team):',
  '[ 12 Elf Mag ] Quillonmarsh the mage',
  '[ 40 Hum War ] (AFK) Alice',
  '------------------',
  '2 players found.',
]), ['Quillonmarsh', 'Alice']);

// Store: charges from the prompt, team announcement, and the move-before-firing rule.
const g = new Game();
const sent: string[] = [];
g.attach((m: any) => { if (m.t === 'cmd') sent.push(m.d); });
g.onMessage({ t: 'text', d: 'You have been assigned to the Red team!\r\n[Charges: 80/100] > ' });
g.onMessage({ t: 'prompt' });
await new Promise((r) => setTimeout(r, 0));
assert.equal(g.state.lasertag.team, 'red');
assert.equal(g.state.lasertag.charges, 80);
g.onMessage({ t: 'gmcp', pkg: 'room.info', data: { num: 500, name: 'Maze', zone: 'lasertag', terrain: 'inside', details: '', exits: { n: 501 } } });
g.ltShoot({ dir: 'north', dist: 1, name: 'Bob', label: 'Bob' });
g.ltShoot({ dir: 'north', dist: 1, name: 'Bob', label: 'Bob' });
assert.deepEqual(sent.filter((c) => c.startsWith('shoot')), ['shoot north Bob'], 'second shot blocked until you move');
g.onMessage({ t: 'gmcp', pkg: 'room.info', data: { num: 501, name: 'Maze', zone: 'lasertag', terrain: 'inside', details: '', exits: { s: 500 } } });
g.ltShoot({ dir: 'south', dist: 1, name: 'Bob', label: 'Bob' });
assert.equal(sent.filter((c) => c.startsWith('shoot')).length, 2, 'can fire again after moving');

// Scan via the panel: output stays in the log and fills the target list.
g.ltScan();
g.onMessage({ t: 'text', d: 'North from here you see:\r\n  - (Green) Bob\r\n' });
g.onMessage({ t: 'prompt' });
await new Promise((r) => setTimeout(r, 0));
assert.deepEqual(g.state.lasertag.targets.map((t) => t.name), ['Bob']);
assert.ok(g.state.lines.some((l) => l.segs.map((s) => s.text).join('').includes('Bob')), 'scan output still in the log');
// Real `lasertag status` output (captured 2026-11-07).
g.ltStatus();
g.onMessage({ t: 'text', d: '--------------------------------------------------------------------------\r\nThere is no lasertag game being run at the moment.\r\nThe next lasertag game will start in approximately 86 minutes.\r\n--------------------------------------------------------------------------\r\n' });
g.onMessage({ t: 'prompt' });
await new Promise((r) => setTimeout(r, 0));
assert.deepEqual(g.state.lasertag.status, ['There is no lasertag game being run at the moment.', 'The next lasertag game will start in approximately 86 minutes.']);
const minsLeft = Math.round((g.state.lasertag.nextGameAt! - Date.now()) / 60_000);
assert.equal(minsLeft, 86);
console.log('lasertag tests passed');
process.exit(0);
