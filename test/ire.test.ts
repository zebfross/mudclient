import assert from 'node:assert/strict';
import { Game } from '../web/src/lib/store.ts';
import { plain } from '../web/src/lib/ansi.ts';
import { gridPath, key, parseAsciiMap } from '../web/src/lib/asciiMap.ts';

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

// Achaea's `map`: rooms every 4 columns / 2 rows, "+" is you, -, |, \ and / are exits.
{
  const lines = [
    '--- Area 430: The Pygmy Dungeons - v41111 ---',
    '',
    '                 [ ]',
    '                  |',
    '                 [^]',
    '',
    '                 [_]',
    '',
    '         [ ]-[ ]-[ ]',
    '                    \\',
    '                     [+]',
    '',
    '--- A dark, dank cell ------------- 0:0:0 ---',
  ];
  const grid = parseAsciiMap(lines)!;
  assert.ok(grid, 'parsed');
  assert.equal(grid.cells.length, 7);
  const at = (x: number, y: number) => grid.byPos.get(key(x, y))!;
  assert.equal(at(0, 0).contents, '#', 'you');
  assert.deepEqual(at(0, 0).exits, { nw: true });
  assert.deepEqual(at(-1, -1).exits, { w: true, se: true });
  assert.deepEqual(at(-2, -1).exits, { e: true, w: true });
  assert.deepEqual(at(-1, -4).exits, { s: true });
  assert.deepEqual(at(-1, -3).exits, { n: true });
  assert.equal(at(-1, -3).contents, '^');
  assert.deepEqual(at(-1, -2).exits, {}, 'drawn with no links');
  assert.deepEqual(gridPath(grid, -3, -1), ['nw', 'w', 'w']);
}

// After a room change on Achaea, the map is fetched quietly and kept for the sidebar.
{
  const { g, sent } = setup();
  g.onMessage({ t: 'gmcp', pkg: 'Char.Name', data: { name: 'Finch' } });
  (g as any).setupPending = false;
  g.onMessage({ t: 'gmcp', pkg: 'Room.Info', data: { num: 41111, name: 'A dark, dank cell', area: 'the Pygmy Dungeons', environment: 'Indoors', exits: { nw: 41110 } } });
  await tick(400);
  assert.ok(sent.some((m) => m.t === 'cmd' && m.d === 'map'), 'map requested');
  const shown = g.state.lines.length;
  g.onMessage({ t: 'text', d: '--- Area 430: The Pygmy Dungeons - v41111 ---\r\n         [ ]-[+]\r\n--- A dark, dank cell ------------- 0:0:0 ---\r\n' });
  g.onMessage({ t: 'text', d: '350h, 385m, 600e, 600w ex-' });
  g.onMessage({ t: 'prompt' });
  await tick();
  assert.equal(g.state.asciiMap.length, 3);
  assert.equal(parseAsciiMap(g.state.asciiMap.map(plain))!.cells.length, 2);
  assert.ok(!g.state.lines.slice(shown).some((l) => /Area 430/.test(plain(l.segs))), 'map kept out of the Chronicle');
}

// Reattaching after a reload: Achaea is asked for the inventory, and its answer logs us back in.
{
  const g = new Game();
  const sent: any[] = [];
  g.attach((m: any) => sent.push(m));
  g.onSession(true, 'achaea', 'ire');
  assert.ok(sent.some((m) => m.t === 'gmcp' && m.pkg === 'Char.Items.Inv'));
  assert.ok(!sent.some((m) => m.t === 'gmcp' && /^request/.test(m.pkg)));
  g.onMessage({ t: 'gmcp', pkg: 'Char.Items.List', data: { location: 'inv', items: [] } });
  assert.ok(g.state.loggedIn);
}

console.log('ire tests passed');
