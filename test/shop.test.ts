import assert from 'node:assert/strict';
import { Game, parseValueReply } from '../web/src/lib/store.ts';

// Real replies from Aardwolf.
assert.deepEqual(parseValueReply("Stitch, the leather dude tells you 'I would pay around 15 gold coins for a long sword.'"), { keeper: 'Stitch, the leather dude', gold: 15 });
assert.deepEqual(parseValueReply('Stitch, the leather dude is not interested in a pink flamingo.'), { keeper: 'Stitch, the leather dude', gold: null });
assert.deepEqual(parseValueReply("Bob tells you 'I would pay around 1,250 gold coins for a ring.'")?.gold, 1250);
assert.equal(parseValueReply("You don't have that item."), null);
assert.deepEqual(parseValueReply("Stitch, the leather dude tells you 'Alas, I cannot afford Vladia's Shopping Bag.'")?.gold, null);
assert.deepEqual(parseValueReply('Aylorian Academy portal is far too valuable to sell.')?.gold, null);
assert.deepEqual(parseValueReply('Academy Refresh Potion cannot be sold to a store.'), { keeper: '', gold: null, why: 'can’t be sold to a shop' });

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const g = new Game();
const sent: string[] = [];
g.attach((m: any) => { if (m.t === 'cmd') sent.push(m.d); });
g.onMessage({ t: 'status', connected: true });
g.onMessage({ t: 'gmcp', pkg: 'char.base', data: { name: 'Finch' } });
const gg = g as any;
gg.setupPending = false; gg.captureQueue = []; gg.capture = null; gg.refreshMap = () => {}; gg.fetchItemDetails = () => {};
g.onMessage({ t: 'text', d: '{invdata}\r\n111,,a long sword,5,5,0,-1,-1\r\n222,,a pink flamingo,1,10,0,-1,-1\r\n333,,a worn cap,1,7,0,6,-1\r\n{/invdata}\r\n> ' });
await tick(250);
sent.length = 0;

g.onMessage({ t: 'gmcp', pkg: 'room.info', data: { num: 50, name: 'Leather Shoppe', zone: 'z', details: 'shop', exits: {} } });
await tick(800);
assert.deepEqual(sent, ['value 111'], 'asks about carried items one at a time; not the worn cap');
g.onMessage({ t: 'text', d: "Stitch tells you 'I would pay around 15 gold coins for a long sword.'\r\n\r\n> " });
await tick(250);
assert.deepEqual(sent, ['value 111', 'value 222']);
g.onMessage({ t: 'text', d: 'Stitch is not interested in a pink flamingo.\r\n\r\n> ' });
await tick(250);
assert.deepEqual(g.state.shop, { room: 50, keeper: 'Stitch', offers: { 111: 15, 222: null } });
assert.ok(!g.state.lines.some((l) => l.segs.some((x) => /would pay|not interested/.test(x.text))), 'replies stay out of the log');

// Leaving clears it; coming back reuses the answers without asking again.
g.onMessage({ t: 'gmcp', pkg: 'room.info', data: { num: 51, name: 'Street', zone: 'z', details: '', exits: {} } });
assert.equal(g.state.shop, null);
g.onMessage({ t: 'gmcp', pkg: 'room.info', data: { num: 50, name: 'Leather Shoppe', zone: 'z', details: 'shop', exits: {} } });
await tick(800);
assert.equal(sent.length, 2, 'no new questions');
assert.equal(g.state.shop?.offers['111'], 15);

console.log('shop tests passed');
process.exit(0);
