import assert from 'node:assert/strict';
import { Game } from '../web/src/lib/store.ts';

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
function setup() {
  const g = new Game();
  const sent: string[] = [];
  g.attach((m: any) => { if (m.t === 'cmd') sent.push(m.d); });
  g.onMessage({ t: 'status', connected: true });
  g.onMessage({ t: 'gmcp', pkg: 'char.base', data: { name: 'Finch' } });
  (g as any).setupPending = false; (g as any).captureQueue = []; (g as any).capture = null;
  (g as any).hidden = () => {}; (g as any).refreshMap = () => {};
  g.onMessage({ t: 'gmcp', pkg: 'room.info', data: { num: 1, name: 'Start', zone: 'z', exits: { n: 2 } } });
  sent.length = 0;
  const room = (num: number) => g.onMessage({ t: 'gmcp', pkg: 'room.info', data: { num, name: `R${num}`, zone: 'z', exits: {} } });
  const say = (d: string) => g.onMessage({ t: 'text', d });
  return { g, sent, room, say };
}

// A map walk goes one step at a time and opens a door on the way.
{
  const { g, sent, room, say } = setup();
  g.walk(['n', 'e', 's']);
  assert.deepEqual(sent, ['north'], 'only the first step is sent');
  room(2); await tick();
  assert.deepEqual(sent, ['north', 'east']);
  say('The door is closed.\r\n> '); await tick();
  assert.deepEqual(sent.slice(2), ['open east', 'east']);
  room(3); await tick();
  assert.deepEqual(sent.slice(4), ['south']);
  room(4); await tick();
  assert.equal(sent.length, 5, 'done');
}

// A locked door stops the walk; nothing more is sent.
{
  const { g, sent, room, say } = setup();
  g.walk(['n', 'n']);
  say('The iron gate is closed.\r\n> '); await tick();
  assert.deepEqual(sent, ['north', 'open north', 'north']);
  say("It's locked.\r\nThe iron gate is closed.\r\n> "); await tick();
  room(9); await tick();
  assert.deepEqual(sent, ['north', 'open north', 'north']);
}

// A single typed or clicked step also opens the door, once.
{
  const { g, sent, say } = setup();
  g.command('w');
  say('The door is closed.\r\n> '); await tick();
  assert.deepEqual(sent, ['w', 'open west', 'west']);
  say('The door is closed.\r\n> '); await tick();
  assert.equal(sent.length, 3, 'only one try');
  g.command('look north');
  say('The door is closed.\r\n> '); await tick();
  assert.equal(sent.length, 4, 'looking at a door does not open it');
}

// A locked door with no key: one try, then nothing more, even as the game keeps answering.
{
  const { g, sent, say } = setup();
  g.command('west');
  for (let i = 0; i < 4; i++) {
    say('The door is closed.\r\n[100hp] > '); await tick(250);
    say("It's locked.\r\n[100hp] > "); await tick(250);
  }
  assert.deepEqual(sent, ['west', 'open west', 'west']);
}

console.log('walk tests passed');
process.exit(0);
