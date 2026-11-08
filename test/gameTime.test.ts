import assert from 'node:assert/strict';
import { formatDate, formatHour, parseHour, parseTimeLine, phaseOf } from '../web/src/lib/gameTime.ts';

// Real line recorded 2026-11-07.
assert.deepEqual(parseTimeLine('  *  It is Noon in the daytime of the 97th day of the Season of the Snake, year 32 AVT.'),
  { hour: 12, day: 97, season: 'Season of the Snake', year: 32 });
assert.equal(parseTimeLine('  *  It is the year of Friendship.'), null);
assert.equal(parseTimeLine('Nothing to see'), null);
// Other hours: wording not seen live yet, so accept the likely forms.
assert.equal(parseTimeLine('  *  It is 3 o\'clock pm in the daytime of the 1st day of the Season of the Wolf, year 33 AVT.')?.hour, 15);
assert.equal(parseTimeLine('  *  It is Midnight in the nighttime of the 2nd day of the Season of the Wolf, year 33 AVT.')?.hour, 0);
assert.equal(parseHour('9 am'), 9);
assert.equal(parseHour('9pm'), 21);
assert.equal(parseHour('12 pm'), 12);
assert.equal(parseHour('12 am'), 0);
assert.equal(parseHour('soon'), null);
assert.deepEqual([0, 5, 6, 7, 12, 18, 19, 20, 23].map(phaseOf), ['night', 'dawn', 'dawn', 'day', 'day', 'day', 'dusk', 'dusk', 'night']);
assert.deepEqual([0, 1, 11, 12, 13, 23].map(formatHour), ['Midnight', '1 am', '11 am', 'Noon', '1 pm', '11 pm']);
assert.equal(formatDate({ syncedAt: 0, day: 97, season: 'Season of the Snake', year: 32 }), '97th day of the Season of the Snake, year 32 AVT');
assert.equal(formatDate({ syncedAt: 0, day: 1, season: 'X', year: 1 }).slice(0, 3), '1st');
assert.equal(formatDate({ syncedAt: 0, day: 12, season: 'X', year: 1 }).slice(0, 4), '12th');
assert.equal(formatDate({ syncedAt: 0, day: 22, season: 'X', year: 1 }).slice(0, 4), '22nd');
assert.equal(formatDate({ syncedAt: 0, day: 113, season: 'X', year: 1 }).slice(0, 5), '113th');
// Store: quiet `time` sets the clock, ticks advance it, sun messages correct it.
const { Game } = await import('../web/src/lib/store.ts');
const { plain } = await import('../web/src/lib/ansi.ts');
const g = new Game();
const sent: string[] = [];
g.attach((m: any) => { if (m.t === 'cmd') sent.push(m.d); });
g.state = { ...g.state, loggedIn: true };
const tick = () => new Promise((r) => setTimeout(r, 5));
g.syncTime();
assert.deepEqual(sent, ['time']);
g.onMessage({ t: 'text', d: '  *  It is Noon in the daytime of the 97th day of the Season of the Snake, year 32 AVT.\r\n\r\n  *  It is the year of Friendship.\r\n\r\nFor offline time information, see \'realtime\'.\r\n\r\n[237/237hp] > ' });
g.onMessage({ t: 'prompt' }); await tick();
assert.equal(g.state.clock.hour, 12);
assert.ok(!g.state.lines.some((l) => /It is|Friendship|realtime/.test(plain(l.segs))), 'reply hidden');
const gmcpTick = () => g.onMessage({ t: 'gmcp', pkg: 'comm.tick', data: { ctime: 0 } });
gmcpTick(); gmcpTick();
assert.equal(g.state.clock.hour, 14);
g.onMessage({ t: 'text', d: 'The sun slowly disappears in the west.\r\n' }); await tick();
assert.equal(g.state.clock.hour, 19, 'sunset corrects the clock');
for (let i = 0; i < 5; i++) gmcpTick();
assert.deepEqual([g.state.clock.hour, g.state.clock.day], [0, 98], 'midnight starts a new day');
assert.equal(sent.at(-1), 'time', 'and re-reads the calendar');
console.log('gameTime tests passed');
process.exit(0);
