import assert from 'node:assert/strict';
import { compareItem, parseInvDetails, slotCapacity } from '../web/src/lib/items.ts';

// Real `invdetails` output recorded 2026-11-07.
const jerkin = parseInvDetails(['{invdetails}', '{invheader}3966565769|1|Armor|0|2|torso|v3|||||||10', '{statmod}Strength|1', '{/invdetails}'])!;
const plate = parseInvDetails([
  '{invdetails}', '{invheader}3968216032|1|Armor|500|5|torso|unique, hum, magic, v3||||1|||65',
  '{statmod}Hit roll|1', '{statmod}Damage roll|1', '{statmod}Constitution|3', '{statmod}Intelligence|1', '{statmod}Dexterity|1', '{/invdetails}',
])!;
const dirk = parseInvDetails(['{invdetails}', '{invheader}3966565771|1|Weapon|0|4|wield|v3|||||1||26', '{weapon}dagger|4|stab|Pierce|', '{statmod}Hit roll|2', '{/invdetails}'])!;

assert.deepEqual([jerkin.id, jerkin.level, jerkin.wear, jerkin.score, jerkin.stats], ['3966565769', 1, 'torso', 10, { Strength: 1 }]);
assert.deepEqual(plate.flags, ['unique', 'hum', 'magic', 'v3']);
assert.equal(plate.worth, 500);
assert.deepEqual(dirk.weapon, { kind: 'dagger', avg: 4, damage: 'Pierce' });
assert.equal(parseInvDetails(['nothing']), null);

const c = compareItem(jerkin, [plate, dirk], 8)!;
assert.equal(c.verdict, 'worse');
assert.equal(c.delta, -55);
assert.equal(c.against?.id, plate.id);
assert.deepEqual(c.stats, [['Strength', 1], ['Hit roll', -1], ['Damage roll', -1], ['Intelligence', -1], ['Dexterity', -1], ['Constitution', -3]]);
assert.equal(compareItem(plate, [jerkin])!.verdict, 'better');
assert.equal(compareItem(jerkin, [dirk])!.verdict, 'empty', 'nothing on the torso');
assert.equal(compareItem({ ...plate, level: 20 }, [jerkin], 8)!.verdict, 'toohigh');
assert.equal(compareItem({ ...jerkin, wear: '' }, [plate]), null, 'not wearable');

// Two-slot locations compare against the weaker of the pair, and a half-empty pair is a free slot.
const ring = (id: string, score: number) => ({ ...jerkin, id, wear: 'finger', score, stats: {} });
assert.equal(slotCapacity('finger'), 2);
assert.equal(compareItem(ring('n', 30), [ring('a', 10)])!.verdict, 'empty');
const two = compareItem(ring('n', 30), [ring('a', 10), ring('b', 50)])!;
assert.deepEqual([two.verdict, two.against?.id, two.delta], ['better', 'a', 20]);
// Store: details are fetched quietly for wearable items, and replies (which have no prompt) don't leak.
const { Game } = await import('../web/src/lib/store.ts');
const { plain } = await import('../web/src/lib/ansi.ts');
const g = new Game();
const sent: string[] = [];
g.attach((m: any) => { if (m.t === 'cmd') sent.push(m.d); });
g.state = { ...g.state, loggedIn: true };
g.onMessage({ t: 'text', d: '{invdata}\r\n11,,a jerkin,1,7,0,-1,-1\r\n12,,an apple,0,14,0,-1,-1\r\n{/invdata}\r\n' });
g.onMessage({ t: 'text', d: '{eqdata}\r\n21,,a breastplate,1,7,0,12,-1\r\n{/eqdata}\r\n' });
await new Promise((r) => setTimeout(r, 10));
assert.deepEqual(sent.filter((c) => c.startsWith('invdetails')), ['invdetails 11'], 'one at a time, apple skipped');
g.onMessage({ t: 'text', d: '{invdetails}\r\n{invheader}11|1|Armor|0|2|torso|v3|||||||10\r\n{statmod}Strength|1\r\n{/invdetails}\r\n{invdetails}\r\n{invheader}21|1|Armor|500|5|torso|v3||||1|||65\r\n{statmod}Constitution|3\r\n{/invdetails}\r\n' });
await new Promise((r) => setTimeout(r, 10));
assert.deepEqual(sent.filter((c) => c.startsWith('invdetails')), ['invdetails 11', 'invdetails 21']);
assert.equal(g.state.itemDetails['21']?.score, 65);
assert.equal(g.state.itemDetails['11']?.score, 10);
assert.ok(!g.state.lines.some((l) => /invdetails|invheader|statmod/.test(plain(l.segs))), 'nothing leaks into the log');
g.fetchItemDetails();
assert.equal(sent.filter((c) => c.startsWith('invdetails')).length, 2, 'cached: not asked again');
console.log('items tests passed');
process.exit(0);
