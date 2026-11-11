import assert from 'node:assert/strict';
import { Game } from '../web/src/lib/store.ts';
import { plain } from '../web/src/lib/ansi.ts';

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
function setup() {
  const g = new Game();
  const sent: any[] = [];
  g.attach((m: any) => { if (m.t === 'cmd' || m.t === 'gmcp') sent.push(m); });
  g.onSession(false, 'achaea', 'ire');
  g.onMessage({ t: 'status', connected: true });
  sent.length = 0;
  return { g, sent };
}

// The relay says which game it is; Aardwolf stays the default.
{
  assert.equal(new Game().state.mud.family, 'aardwolf');
  const { g } = setup();
  assert.deepEqual(g.state.mud, { game: 'achaea', family: 'ire' });
  assert.equal(g.gameName, 'Achaea');
}

// Achaea's login screen counts as the name prompt.
{
  const { g, sent } = setup();
  g.signIn('Finch', 'fake-test-pass');
  g.onMessage({ t: 'text', d: "Enter an option or enter your character's name. " });
  await tick();
  assert.ok(sent.some((m) => m.t === 'cmd' && m.d === 'Finch'), 'name sent at the Achaea prompt');
}

// IRE GMCP fills the same state Aardwolf's does, and logs us in.
{
  const { g, sent } = setup();
  g.onMessage({ t: 'gmcp', pkg: 'Char.Name', data: { name: 'Finch', fullname: 'Finch the Wanderer' } });
  assert.ok(g.state.loggedIn);
  g.onMessage({ t: 'gmcp', pkg: 'Char.Vitals', data: { hp: '410', maxhp: '500', mp: '300', maxmp: '320', ep: '1800', maxep: '2000', wp: '1500', maxwp: '1600', nl: '12' } });
  assert.deepEqual(g.state.char.vitals, { hp: 410, mana: 300, moves: 1800 });
  assert.equal(g.state.char.maxstats?.maxhp, 500);
  assert.equal(g.state.char.maxstats?.maxmoves, 2000);
  g.onMessage({ t: 'gmcp', pkg: 'Char.Status', data: { name: 'Finch', class: 'Runewarden', gold: '120' } });
  g.onMessage({ t: 'gmcp', pkg: 'Char.Status', data: { gold: '95' } }); // partial update
  assert.equal(g.state.char.base?.class, 'Runewarden');
  assert.equal(g.state.char.worth?.gold, 95);
  g.onMessage({ t: 'gmcp', pkg: 'Room.Info', data: { num: 3885, name: 'Outside the Crossroads', area: 'Ashtan', environment: 'Urban', details: ['shop', 'bank'], exits: { n: 3886, sw: 3880 } } });
  assert.equal(g.state.room?.zone, 'Ashtan');
  assert.equal(g.state.room?.terrain, 'urban');
  assert.equal(g.state.room?.details, 'shop,bank');
  assert.deepEqual(g.state.room?.exits, { n: 3886, sw: 3880 });
  assert.equal(g.state.shop, null, 'no Aardwolf shop lookups');
  g.onMessage({ t: 'gmcp', pkg: 'Comm.Channel.Text', data: { channel: 'newbie', talker: 'Mira', text: '\x1b[32m(Newbie): Mira says, "Welcome!"\x1b[0m' } });
  const last = g.state.chat.at(-1)!;
  assert.equal(last.chan, 'newbie');
  assert.equal(plain(last.msg), '(Newbie): Mira says, "Welcome!"');

  // After login: no Aardwolf background commands (tags, invdata, map, notes…).
  g.onMessage({ t: 'text', d: '410h, 300m ex-\r\n' });
  g.onMessage({ t: 'prompt' });
  await tick(50);
  assert.deepEqual(sent.filter((m) => m.t === 'cmd'), [], `nothing typed for us: ${JSON.stringify(sent)}`);
  assert.ok(sent.some((m) => m.t === 'gmcp' && m.pkg === 'Char.Items.Inv'));
  assert.ok(!sent.some((m) => m.t === 'gmcp' && /^request/.test(m.pkg)), 'no Aardwolf GMCP requests');
}

console.log('ire tests passed');
