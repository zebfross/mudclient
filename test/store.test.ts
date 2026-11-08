import assert from 'node:assert/strict';
import { Game, parseTell, extractMap, isOwnCorpse } from '../web/src/lib/store.ts';
import { plain } from '../web/src/lib/ansi.ts';

const g = new Game();
const sent: any[] = [];
g.attach((m) => sent.push(m));
const tick = () => new Promise((r) => setTimeout(r, 0));

g.onMessage({ t: 'status', connected: true });
g.onMessage({ t: 'gmcp', pkg: 'char.base', data: { name: 'Zeb', perlevel: 1000 } });
assert.equal(g.state.loggedIn, true);
// Room text in the same login burst must not be swallowed by setup commands.
g.onMessage({ t: 'text', d: 'Welcome back.\r\nA dusty road.\r\n> ' });
assert.deepEqual(sent.filter((m) => m.t === 'cmd'), []);
g.onMessage({ t: 'prompt' });
await tick();
assert.deepEqual(sent.filter((m) => m.t === 'cmd').map((m) => m.d), ['tags']);
assert.ok(g.state.lines.some((l) => plain(l.segs) === 'A dusty road.'));
const linesBefore = g.state.lines.length;

// Tag listing is hidden and drives which tags get enabled.
g.onMessage({ t: 'text', d: 'Tag Name      Description      Status\r\n------------  -------  ------\r\nROOMCHARS     Display tags around characters in a room.   NO \r\nROOMDESCS     Display tags around descs {rdesc}     YES\r\nROOMOBJS      Display tags around items in a room.        NO \r\nBOGUS         Something {rname}   NO \r\n' });
g.onMessage({ t: 'prompt' });
await tick();
assert.deepEqual(sent.filter((m) => m.t === 'cmd').map((m) => m.d), ['tags', 'tags roomchars on', 'tags roomobjs on']);
assert.equal(g.state.lines.length, linesBefore, "tags listing hidden");
g.onMessage({ t: 'text', d: 'Roomchars tag is now ON.\r\n' }); g.onMessage({ t: 'prompt' });
g.onMessage({ t: 'text', d: 'You go north.\r\n' }); g.onMessage({ t: 'prompt' });
g.onMessage({ t: 'text', d: '[ Exits: north ]\r\n' }); // unrelated output interleaves
g.onMessage({ t: 'text', d: 'Roomobjs tag is now ON.\r\n' }); g.onMessage({ t: 'prompt' });
await tick();
assert.deepEqual(g.state.lines.slice(linesBefore).map((l) => plain(l.segs)), ['You go north.', '[ Exits: north ]']);
assert.ok(!g.state.lines.some((l) => /tag is now/.test(plain(l.segs))), 'tag confirmations hidden');

// Room with tagged blocks, ANSI colour, split across chunks.
g.onMessage({ t: 'text', d: '{rname}\x1b[1;36mThe Grand City of Aylor\x1b[0m\r\n{rdesc}\r\nA wide street.\r\nVery busy.\r\n{/rdesc}\r\n{roomobjs}\r\n( 2) A loaf of bread lies here.\r\n{/roomobjs}\r\n{room' });
g.onMessage({ t: 'text', d: 'chars}\r\n[AFK] (W) Kaof the Ninja is here.\r\nA large rat is here, sniffing.\r\n{/roomchars}\r\n<100hp 50mn> ' });
g.onMessage({ t: 'prompt' });
await tick();
assert.deepEqual(g.state.roomDesc, ['A wide street.', 'Very busy.']);
assert.equal(g.state.roomObjs.length, 1);
assert.equal(g.state.roomChars.length, 2);
const texts = g.state.lines.map((l) => plain(l.segs));
assert.ok(texts.includes('The Grand City of Aylor'), 'rname tag stripped');
assert.ok(!texts.some((t) => t.includes('{')), 'no tags leak: ' + JSON.stringify(texts));
assert.equal(g.state.lines.at(-1)!.kind, 'prompt');
const nameLine = g.state.lines.find((l) => plain(l.segs) === 'The Grand City of Aylor')!;
assert.ok(nameLine.segs[0].fg && nameLine.segs[0].b, 'colour kept');

// invdata hidden, parsed, and its prompt suppressed.
await new Promise((r) => setTimeout(r, 350));
assert.deepEqual(sent.slice(-2).map((m) => m.d), ['invdata', 'eqdata']);
const before = g.state.lines.length;
g.onMessage({ t: 'text', d: '{invdata}\r\n12345,KM,@Ya @Rshiny, red@w sword,10,5,0,-1,-1\r\n999,,a torch,1,1,0,-1,300\r\n{/invdata}\r\n<prompt> ' });
g.onMessage({ t: 'prompt' });
await tick();
assert.equal(g.state.lines.length, before, 'invdata + prompt hidden');
assert.equal(g.state.inventory.length, 2);
assert.equal(g.state.inventory[0].plainName, 'a shiny, red sword');
assert.equal(g.state.inventory[0].type, 5);
assert.equal(g.state.inventory[1].timer, 300);

// GMCP room + mapper
g.onMessage({ t: 'gmcp', pkg: 'room.info', data: { num: 1, name: '@WA', zone: 'aylor', terrain: 'city', details: '', exits: { n: 2 } } });
g.onMessage({ t: 'gmcp', pkg: 'room.info', data: { num: 2, name: 'B', zone: 'aylor', terrain: 'city', details: '', exits: { s: 1, e: 3 } } });
g.onMessage({ t: 'gmcp', pkg: 'room.info', data: { num: 3, name: 'C', zone: 'aylor', terrain: 'field', details: '', exits: { w: 2 } } });
assert.deepEqual(g.mapper.path(1, 3), ['n', 'e']);
const lay = g.mapper.layout(3);
assert.deepEqual(lay.nodes.map((n) => [n.num, n.x, n.y]).sort(), [[1, -1, 1], [2, -1, 0], [3, 0, 0]].sort());
assert.equal(g.mapper.rooms.get(1)!.name, 'A');

// Commands that change inventory trigger a delayed hidden invdata.
sent.length = 0;
g.command('get bread');
await new Promise((r) => setTimeout(r, 900));
const background = /^(tell -h|campaign check|goals|goal .*|map)$/;
assert.deepEqual(sent.filter((m) => m.t === 'cmd').map((m) => m.d).filter((d) => !background.test(d)), ['get bread', 'invdata', 'eqdata']);
// Without GA, an idle partial line is treated as a prompt.
const g2 = new Game();
const sent2: any[] = [];
g2.attach((m) => sent2.push(m));
g2.refreshNotes = () => {}; // this scripted session never answers note lookups
g2.onMessage({ t: 'gmcp', pkg: 'char.base', data: { name: 'Zeb' } });
g2.onMessage({ t: 'text', d: 'Welcome.\r\n[158/158hp] > ' });
assert.deepEqual(sent2.filter((m) => m.t === 'cmd'), []);
await new Promise((r) => setTimeout(r, 300));
assert.deepEqual(sent2.filter((m) => m.t === 'cmd').map((m) => m.d), ['tags']);
assert.equal(g2.state.lines.at(-1)!.kind, 'prompt');
// GMCP with raw ANSI escapes inside JSON (as Aardwolf sends for comm.channel).
g2.onMessage({ t: 'gmcp', pkg: 'comm.channel', data: '{ "chan": "newbie", "msg": "\u001b[0;32m[Newbie] Kalal: hi\u001b[0m", "player": "Kalal" }'.replace(/\\u001b/g, '\x1b') });
assert.equal(plain(g2.state.chat.at(-1)!.msg), '[Newbie] Kalal: hi');
assert.ok(g2.state.chat.at(-1)!.msg[0].fg);
g2.onMessage({ t: 'prompt' }); // ends the login `tags` capture, as the game's prompt would
// Tell history (`tell -h` / `replay`) merges into chat without duplicating live GMCP tells.
g2.onMessage({ t: 'gmcp', pkg: 'comm.channel', data: { chan: 'tell', msg: "Brannoc tells you 'welcome!'", player: 'Brannoc' } });
const liveAt = g2.state.chat.at(-1)!.at;
const stamp = (d: Date) => `${String(d.getDate()).padStart(2, '0')} ${d.toLocaleString('en-US', { month: 'short' })} ${d.toTimeString().slice(0, 8)}`;
const earlier = new Date(Date.now() - 3600_000);
g2.onMessage({ t: 'text', d: `${stamp(earlier)} - You tell Brannoc 'hi there'\r\n${stamp(new Date(liveAt))} - Brannoc tells you 'welcome!'\r\n` });
await tick();
const tells = g2.state.chat.filter((c) => c.chan === 'tell').map((c) => plain(c.msg));
assert.deepEqual(tells, ["You tell Brannoc 'hi there'", "Brannoc tells you 'welcome!'"]);
// A history line glued to a prompt (no GA) keeps the prompt and hides the history part.
g2.requestTellHistory();
g2.onMessage({ t: 'text', d: `[158/158hp] > ${stamp(earlier)} - You tell Claire 'D'\r\n` });
await tick();
assert.ok(g2.state.chat.some((c) => plain(c.msg) === "You tell Claire 'D'"));
assert.ok(!g2.state.lines.some((l) => plain(l.segs).includes('Claire')), 'history text hidden');
// …and the same for a tag block glued to a prompt.
g2.refreshInventory();
await tick();
g2.onMessage({ t: 'text', d: '[158/158hp] > {invdata}\r\n1,,a belt,1,10,0,-1,-1\r\n{/invdata}\r\n' });
await tick();
assert.deepEqual(g2.state.inventory.map((i) => i.plainName), ['a belt']);
assert.ok(!g2.state.lines.some((l) => plain(l.segs).includes('invdata')));
const mk = (text: string) => ({ id: 0, chan: 'tell', player: '', msg: [{ text }], at: 0 });
assert.deepEqual(parseTell(mk("Brannoc tells you 'check the help files ok'")), { dir: 'in', who: 'Brannoc', text: "check the help files ok" });
assert.deepEqual(parseTell(mk("You tell Brannoc 'hey!'")), { dir: 'out', who: 'Brannoc', text: 'hey!' });
assert.equal(parseTell(mk('[Newbie] Kalal: hi')), null);
// Map replies: only what's between the markers is the map; other lines go back to the log.
const L = (t: string) => [{ text: t }];
const ex = extractMap([L('Fennic arrives.'), L('<MAPSTART>'), L(''), L(' [ ][*]'), L('  |'), L(''), L('<MAPEND>'), L('')]);
assert.deepEqual(ex.map.map(plain), [' [ ][*]', '  |']);
assert.deepEqual(ex.rest.map(plain).filter((t) => t), ['Fennic arrives.']);
assert.deepEqual(extractMap([L(''), L('[*]'), L('')]).map.map(plain), ['[*]']);
// A map the player asks for themselves also lands in the sidebar, without the markers in the log.
g2.onMessage({ t: 'text', d: '<MAPSTART>\r\n [#]\r\n<MAPEND>\r\n' });
await tick();
assert.deepEqual(g2.state.asciiMap.map(plain), [' [#]']);
assert.ok(!g2.state.lines.some((l) => plain(l.segs).includes('MAPSTART')));
// Unrelated output (with its own prompt) before a background reply must not be swallowed by it.
await new Promise((r) => setTimeout(r, 5200)); // let any earlier capture time out
g2.refreshObjectives();
g2.onMessage({ t: 'text', d: '{rname}Combat Training Room\r\nFennic has entered Aardwolf.\r\n' });
g2.onMessage({ t: 'prompt' });
g2.onMessage({ t: 'text', d: 'You are not currently on a campaign.\r\nYou may take a campaign at this level.\r\n' });
g2.onMessage({ t: 'prompt' });
await tick();
const shown = g2.state.lines.map((l) => plain(l.segs));
assert.ok(shown.includes('Combat Training Room') && shown.includes('Fennic has entered Aardwolf.'), 'earlier output shown');
assert.ok(!shown.some((t) => /campaign/.test(t)), 'campaign reply hidden');
assert.equal(g2.state.objectives.campaign?.active, false);
assert.deepEqual(g2.state.objectives.campaign?.lines, ['You are not currently on a campaign.', 'You may take a campaign at this level.']);
// Any reply glued onto the last-seen prompt is split off, e.g. "[prompt] > You are not currently…".
await new Promise((r) => setTimeout(r, 5200));
g2.onMessage({ t: 'text', d: '[158/158hp 189mn] > ' }); g2.onMessage({ t: 'prompt' });
g2.state = { ...g2.state, objectives: { ...g2.state.objectives, loading: false } }; // previous test's goals never answered
g2.refreshObjectives();
g2.onMessage({ t: 'text', d: '[158/158hp 189mn] > You are not currently on a campaign.\r\n' });
g2.onMessage({ t: 'prompt' });
await tick();
assert.deepEqual(g2.state.objectives.campaign?.lines, ['You are not currently on a campaign.']);
// Very first prompt after a reattach (nothing to compare against yet) with the reply glued on.
const g3 = new Game();
const sent3: any[] = [];
g3.attach((m) => sent3.push(m));
g3.onMessage({ t: 'gmcp', pkg: 'char.base', data: { name: 'Zeb' } });
await new Promise((r) => setTimeout(r, 1600)); // quiet-period setup sends `tags`
assert.ok(sent3.some((m) => m.d === 'tags'));
g3.onMessage({ t: 'text', d: '[*Daily Blessing*] [158/158hp] > Tag Name      Description      Status\r\nMAP           Display tags around map: <MAPSTART> <MAPEND>            YES\r\n' });
g3.onMessage({ t: 'prompt' });
await tick();
assert.ok(!g3.state.lines.some((l) => /Tag Name|MAPSTART/.test(plain(l.segs))), 'tags reply hidden: ' + JSON.stringify(g3.state.lines.map((l) => plain(l.segs))));
assert.ok(g3.state.tagsListing.some((l) => /^MAP\s/.test(l)));
// A chat line that mentions "campaign" is not mistaken for the campaign reply.
assert.ok(!/^\s*(You are not currently on a campaign|The targets for this campaign)/.test('[Newbie] Kalal: anyone on a campaign?'));
// Death: banner state set on the death message, cleared by looting.
g3.onMessage({ t: 'text', d: 'A goblin wallops you!\r\nYou have been KILLED!!\r\n' });
await tick();
assert.ok(g3.state.death);
g3.command('get all corpse');
assert.equal(g3.state.death, null);
assert.ok(isOwnCorpse('The corpse of Quillonmarsh is lying here.', 'Quillonmarsh'));
assert.ok(!isOwnCorpse('The corpse of a goblin is lying here.', 'Quillonmarsh'));
assert.ok(!isOwnCorpse('The corpse of Quillonmarshy lies here.', 'Quillonmarsh'));
// eqdata (worn items) is parsed into equipment, hidden from the log.
g3.onMessage({ t: 'text', d: '{eqdata}\r\n77,M,a leather cap,1,7,0,1,-1\r\n{/eqdata}\r\n' });
await tick();
assert.deepEqual(g3.state.equipment.map((i) => i.plainName), ['a leather cap']);
assert.ok(!g3.state.lines.some((l) => plain(l.segs).includes('eqdata')));
console.log('store tests passed');
process.exit(0);
