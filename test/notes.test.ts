import assert from 'node:assert/strict';
import { parseBoards, parseNote, parseNoteList } from '../web/src/lib/notes.ts';
import { plain } from '../web/src/lib/ansi.ts';

// Real output recorded 2026-11-07.
const b = parseBoards([
  '+-------+------------+-----------+-------------------------------------------+',
  '| Forum | Name       | New Posts | Description                               |',
  '+-------+------------+-----------+-------------------------------------------+',
  '|     1 |   Announce |        19 | Announcements from Immortals              |',
  '|    17 |   Personal |         1 | Personal messages                         |',
  '+-------+------------+-----------+-------------------------------------------+',
  '',
  'Your current forum is Personal.',
]);
assert.deepEqual(b.boards, [
  { num: 1, name: 'Announce', unread: 19, desc: 'Announcements from Immortals' },
  { num: 17, name: 'Personal', unread: 1, desc: 'Personal messages' },
]);
assert.equal(b.current, 'Personal');

const list = parseNoteList([
  'Posts in the Personal forum :',
  '+------+------------+-------------+-------------------------------------+----+',
  '| Post#| Date/Time  | Author      | Subject                             |Size|',
  '+------+------------+-------------+-------------------------------------+----+',
  '|711145|07 Nov 18:00| Quillonmarsh| Tells unheard at game reboot        |   3|',
  '|711253|07 Nov 22:24|*Aaeron      | Communications Lesson               |   4|',
  '+------+------------+-------------+-------------------------------------+----+',
]);
assert.equal(list.forum, 'Personal');
assert.deepEqual(list.posts, [
  { num: 711145, date: '07 Nov 18:00', author: 'Quillonmarsh', subject: 'Tells unheard at game reboot', unread: false },
  { num: 711253, date: '07 Nov 22:24', author: 'Aaeron', subject: 'Communications Lesson', unread: true },
]);

const L = (t: string) => [{ text: t }];
const note = parseNote([
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  'From    : Quillonmarsh: Tells unheard at game reboot',
  'Forum   : Personal - #711145',
  'To      : Quillonmarsh',
  'Date    : Sat Nov  7 18:00:07 2026',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  "| 07 Nov 16:08:09 - Brannoc tells you 'welcome to the game! ",
  "| glad to have you'",
  '| ',
  "| Note auto-formatted...use 'note ran' to read unformatted.",
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
].map(L))!;
assert.deepEqual([note.num, note.from, note.subject, note.forum, note.to, note.date],
  [711145, 'Quillonmarsh', 'Tells unheard at game reboot', 'Personal', 'Quillonmarsh', 'Sat Nov  7 18:00:07 2026']);
assert.deepEqual(note.body.map(plain), ["07 Nov 16:08:09 - Brannoc tells you 'welcome to the game! ", "glad to have you'"]);
assert.equal(parseNote([L('nothing')]), null);
// Store: quiet lookups fill the panel; reading a note marks it read.
const { Game } = await import('../web/src/lib/store.ts');
const g = new Game();
const sent: string[] = [];
g.attach((m: any) => { if (m.t === 'cmd') sent.push(m.d); });
g.state = { ...g.state, loggedIn: true };
const P = '[237/237hp 347/347mn] > ';
const tick = () => new Promise((r) => setTimeout(r, 5));
g.refreshNotes();
assert.deepEqual(sent, ['board']);
g.onMessage({ t: 'text', d: '+-------+------------+-----------+------+\r\n|    17 |   Personal |         1 | Personal messages |\r\nYour current forum is Personal.\r\n' + P });
g.onMessage({ t: 'prompt' }); await tick();
assert.deepEqual(sent, ['board', 'forum personal']);
g.onMessage({ t: 'text', d: 'Current forum changed to Personal. You can read and write in this forum.\r\n' + P }); g.onMessage({ t: 'prompt' }); await tick();
g.onMessage({ t: 'text', d: 'Posts in the Personal forum :\r\n|711145|07 Nov 18:00| Quillonmarsh| Tells unheard at game reboot        |   3|\r\n|711253|07 Nov 22:24|*Aaeron      | Communications Lesson               |   4|\r\n' + P });
g.onMessage({ t: 'prompt' }); await tick();
assert.deepEqual(g.state.notes.posts.map((p) => [p.num, p.unread]), [[711253, true], [711145, false]], 'newest first');
assert.equal(g.state.notes.boards[0].unread, 1);
assert.equal(g.state.lines.filter((l) => /Personal|Aaeron|forum/.test(plain(l.segs))).length, 0, 'nothing in the log');
g.readNote(711253);
assert.equal(sent.at(-1), 'note read 711253');
g.onMessage({ t: 'text', d: '~~~~~~~~~~~~~~~~~~~~\r\nFrom    : Aaeron: Communications Lesson\r\nForum   : Personal - #711253\r\nTo      : Quillonmarsh\r\nDate    : Sat Nov  7 22:24:00 2026\r\n~~~~~~~~~~~~~~~~~~~~\r\nType \'help channels\'.\r\n~~~~~~~~~~~~~~~~~~~~\r\n\r\n' + P });
g.onMessage({ t: 'prompt' }); await tick();
assert.equal(g.state.notes.open?.subject, 'Communications Lesson');
assert.deepEqual(g.state.notes.open?.body.map(plain), ["Type 'help channels'."]);
assert.equal(g.state.notes.posts[0].unread, false);
assert.equal(g.state.notes.boards[0].unread, 0, 'unread count drops');
console.log('notes tests passed');
process.exit(0);
