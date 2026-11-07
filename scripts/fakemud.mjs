// A tiny Aardwolf-flavoured fake MUD for UI development: GMCP, {tags}, invdata, prompts.
// Usage: node scripts/fakemud.mjs [port]   then run the relay with MUD_HOST=localhost MUD_PORT=<port>
import net from 'node:net';

const PORT = Number(process.argv[2] ?? 4555);
const IAC = 255, WILL = 251, WONT = 252, SB = 250, SE = 240, GA = 249, GMCP = 201, ECHO = 1;

const ROOMS = {
  100: { name: 'Blackfriars Wynd', terrain: 'city', exits: { n: 101, e: 102, s: 103, w: 104, d: 105 },
    desc: ['Yellow sulfurous fog coils thick about greasy flagstones. Above, the gargoyles of', 'St. Jude loom like silent wardens through the chimney soot.'],
    chars: ['\x1b[1;33mDr. Aris Thorne\x1b[0m the Physician is here, examining a corpse.', '( 2) A \x1b[31mmangy sewer rat\x1b[0m is here, gnawing a bone.'],
    objs: ['A rune-etched \x1b[33mbrass watch\x1b[0m lies here, ticking backwards.', '( 3) A copy of the London Gazette lies here.'] },
  101: { name: "St. Jude's Square", terrain: 'city', exits: { s: 100, e: 106 }, desc: ['A cobbled square beneath a soot-black church.'], chars: [], objs: [] },
  102: { name: 'Old Curiosity Shop', terrain: 'inside', exits: { w: 100 }, desc: ['Dust and stuffed birds crowd the bow-front windows.'], chars: ['An old shopkeeper is here, polishing a lamp.'], objs: [] },
  103: { name: "Miller's Wharf", terrain: 'river', exits: { n: 100 }, desc: ['Black water slaps against rotting pilings.'], chars: [], objs: ['A coil of tarred rope lies here.'] },
  104: { name: "Blind Man's Alley", terrain: 'city', exits: { e: 100 }, desc: ['A narrow alley that smells of gin.'], chars: [], objs: [] },
  105: { name: 'Cistern Below', terrain: 'underground', exits: { u: 100 }, desc: ['Rushing water echoes in the dark.'], chars: [], objs: [] },
  106: { name: 'Bell Tower Steps', terrain: 'city', exits: { w: 101 }, desc: ['Worn steps spiral upward.'], chars: [], objs: [] },
};
const DIRS = { n: 'north', e: 'east', s: 'south', w: 'west', u: 'up', d: 'down' };

net.createServer((sock) => {
  const raw = (...b) => sock.write(Buffer.from(b));
  const send = (s) => sock.write(s.replace(/\n/g, '\r\n'));
  const gmcp = (pkg, data) => sock.write(Buffer.concat([Buffer.from([IAC, SB, GMCP]), Buffer.from(`${pkg} ${JSON.stringify(data)}`), Buffer.from([IAC, SE])]));
  let stage = 'name', room = 100, hp = 1840, inv = [
    ['5001', 'KM', '@Ya @Rruby-hilted@w sabre', 42, 5, 0, -1, -1],
    ['5002', '', 'a brass lantern', 10, 1, 0, -1, -1],
    ['5003', 'G', '@Ca phial of @Bcobalt@C tincture', 30, 8, 0, -1, 600],
    ['5004', '', 'a set of lockpicks', 5, 13, 0, -1, -1],
    ['5005', '', 'a leather greatcoat', 40, 7, 0, 5, -1],
  ];
  const prompt = () => { send(`\n\x1b[0;37m[\x1b[1;31m${hp}\x1b[0;37m/2100hp \x1b[1;36m900\x1b[0;37m/900mn]\x1b[0m > `); raw(IAC, GA); };
  const look = () => {
    const r = ROOMS[room];
    gmcp('room.info', { num: room, name: r.name, zone: 'blackfriars', terrain: r.terrain, details: room === 102 ? 'shop' : '', exits: r.exits, coord: { id: 0, x: -1, y: -1, cont: 0 } });
    send(`{rname}\x1b[1;36m${r.name}\x1b[0m\n{rdesc}\n${r.desc.join('\n')}\n{/rdesc}\n\n`);
    send(`{exits}\x1b[0;32m[ Exits: ${Object.keys(r.exits).map((d) => DIRS[d]).join(' ')} ]\x1b[0m\n`);
    send(`{roomobjs}\n${r.objs.join('\n')}\n{/roomobjs}\n{roomchars}\n${r.chars.join('\n')}\n{/roomchars}\n`);
  };
  raw(IAC, WILL, GMCP);
  send('\n  --- Welcome to the Fake Wolf ---\n\nWhat be thy name, adventurer? ');
  let buf = '';
  sock.on('data', (d) => {
    // Drop telnet negotiation bytes; this fake only cares about lines.
    const bytes = [...d];
    let txt = '';
    for (let i = 0; i < bytes.length; i++) {
      if (bytes[i] === IAC) { if (bytes[i + 1] === SB) { while (i < bytes.length && !(bytes[i] === IAC && bytes[i + 1] === SE)) i++; i++; } else i += 2; continue; }
      txt += String.fromCharCode(bytes[i]);
    }
    buf += txt;
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).replace(/\r/g, '').trim();
      buf = buf.slice(nl + 1);
      handle(line);
    }
  });
  const handle = (line) => {
    if (stage === 'name') { stage = 'pass'; send('Password: '); raw(IAC, WILL, ECHO); return; }
    if (stage === 'pass') {
      stage = 'game'; raw(IAC, WONT, ECHO);
      send('\nWelcome back, Finch.\n');
      gmcp('char.base', { name: 'Finch', class: 'Thief', subclass: 'Ninja', race: 'Human', clan: '', pretitle: '', perlevel: 3000, tier: 0, remorts: 1, level: 37 });
      gmcp('char.vitals', { hp, mana: 900, moves: 640 });
      gmcp('char.maxstats', { maxhp: 2100, maxmana: 900, maxmoves: 800 });
      gmcp('char.status', { level: 37, tnl: 1240, hunger: 30, thirst: 30, align: 1200, state: 3, pos: 'Standing', enemy: '', enemypct: 0 });
      gmcp('char.worth', { gold: 18342, bank: 0, qp: 210, tp: 0, trains: 4, pracs: 12 });
      look(); prompt(); return;
    }
    const [verb, ...rest] = line.split(/\s+/);
    const dir = Object.entries(DIRS).find(([k, v]) => verb === k || verb === v)?.[0];
    if (!line) { prompt(); return; }
    if (verb === 'tags' && rest.length) { send(`${rest[0]} tag is now ${rest[1]?.toUpperCase()}.\n`); prompt(); return; }
    if (verb === 'tags') { send('Available tags:\n  roomname  roomdesc  roomchars  roomobjs  exits  invdata\n'); prompt(); return; }
    if (verb === 'invdata') { send(`{invdata}\n${inv.map((r) => r.join(',')).join('\n')}\n{/invdata}\n`); prompt(); return; }
    if (dir) {
      const to = ROOMS[room].exits[dir];
      if (!to) send('Alas, you cannot go that way.\n'); else { room = to; look(); }
      prompt(); return;
    }
    if (verb === 'look' || verb === 'l') { if (rest.length) send(`You look closely at the ${rest.join(' ')}. Nothing unusual.\n`); else look(); prompt(); return; }
    if (verb === 'consider') { send(`The ${rest.join(' ')} looks like an easy kill.\n`); prompt(); return; }
    if (verb === 'kill') {
      gmcp('char.status', { level: 37, tnl: 1240, state: 8, pos: 'Fighting', enemy: 'a mangy sewer rat', enemypct: 100 });
      let pct = 100;
      const t = setInterval(() => {
        pct -= 30; hp -= 25;
        send(`Your slash \x1b[1;33m*** DEVASTATES ***\x1b[0m a mangy sewer rat! [${pct > 0 ? 40 : 90}]\n`);
        gmcp('char.vitals', { hp, mana: 900, moves: 640 });
        gmcp('char.status', { level: 37, tnl: 1240, state: pct > 0 ? 8 : 3, pos: 'Fighting', enemy: pct > 0 ? 'a mangy sewer rat' : '', enemypct: Math.max(0, pct) });
        if (pct <= 0) { clearInterval(t); send('A mangy sewer rat is \x1b[1;31mDEAD\x1b[0m!!\n'); }
        prompt();
      }, 700);
      return;
    }
    if (verb === 'get') { inv.push([String(6000 + inv.length), '', `a ${rest.join(' ')}`, 1, 6, 0, -1, -1]); send(`You get ${rest.join(' ')}.\n`); prompt(); return; }
    if (verb === 'gossip' || verb === 'say') {
      gmcp('comm.channel', { chan: verb, msg: `@wYou ${verb}: '@Y${rest.join(' ')}@w'`, player: 'Finch' });
      send(`You ${verb} '${rest.join(' ')}'\n`); prompt(); return;
    }
    send(`Huh? (${line})\n`); prompt();
  };
  // Some ambient chatter.
  const chat = setInterval(() => {
    if (stage !== 'game') return;
    gmcp('comm.channel', { chan: 'gossip', msg: "@wLasher gossips: '@Manyone selling a @Ybrass compass@M?@w'", player: 'Lasher' });
    send("\x1b[0;35mLasher gossips: 'anyone selling a brass compass?'\x1b[0m\n"); prompt();
  }, 15000);
  sock.on('close', () => clearInterval(chat));
  sock.on('error', () => {});
}).listen(PORT, () => console.log(`fake mud on ${PORT}`));
