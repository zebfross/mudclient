import assert from 'node:assert/strict';
import { Game, noteLines } from '../web/src/lib/store.ts';

// Wrapping and editor-command escaping.
assert.deepEqual(noteLines('\n\nhello\n.p\nend\n\n'), ['hello', ' .p', ' end']);
const long = noteLines('word '.repeat(40).trim());
assert.ok(long.length > 1 && long.every((l) => l.length <= 76), 'long lines wrap');
assert.deepEqual(noteLines('a\n\nb'), ['a', ' ', 'b']);

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

function setup() {
  const g = new Game();
  const sent: string[] = [];
  g.attach((m: any) => { if (m.t === 'cmd') sent.push(m.d); });
  g.onMessage({ t: 'status', connected: true });
  g.onMessage({ t: 'gmcp', pkg: 'char.base', data: { name: 'Finch' } });
  (g as any).setupPending = false; (g as any).captureQueue = []; (g as any).capture = null; // skip the login setup lookups
  sent.length = 0;
  const say = (d: string) => g.onMessage({ t: 'text', d });
  return { g, sent, say };
}

// The happy path: every step waits for the game.
{
  const { g, sent, say } = setup();
  g.writeNote({ to: 'Finch', subject: 'Directions', body: 'From recall: run u3n\n.q is not a command here' });
  assert.deepEqual(sent, ['forum personal']);
  say('Current forum changed to Personal.\r\n> ');
  await tick(250);
  assert.deepEqual(sent, ['forum personal', 'note write Finch']);
  say('Subject: ');                       // a prompt with no newline
  await tick();
  assert.deepEqual(sent.slice(2), ['Directions']);
  await tick(700);
  assert.deepEqual(sent.slice(3), ['.s'], 'checks the editor before any body text');
  // Aardwolf's real preview (the subject rides on the From line).
  say('~~~~~~~~\r\nFrom    : Finch: Directions\r\nForum   : Personal\r\nTo      : Finch\r\nDate    : Sun Nov  8 15:11:07 2026\r\n~~~~~~~~\r\nYou haven\'t written anything yet....\r\n\r\n');
  await tick();
  assert.deepEqual(sent.slice(4), ['From recall: run u3n', ' .q is not a command here', '.p']);
  assert.equal(g.state.notes.compose?.stage, 'posting');
  say('Note posted to Personal.\r\n> ');
  await tick();
  assert.equal(g.state.notes.compose?.stage, 'posted');
}

// No recognisable confirmation: the post is looked for on the board instead.
{
  const { g, sent, say } = setup();
  g.writeNote({ to: 'Finch', subject: 'Goals', body: 'Level 10' });
  say('Current forum changed to Personal.\r\n> ');
  await tick(250);
  say('Subject :  ');
  await tick(700);
  say('From    : Finch: Goals\r\n');
  await tick();
  assert.equal(sent.at(-1), '.p');
  say('Something unexpected.\r\n> ');
  await tick(2600);
  assert.equal(sent.at(-1), 'note list');
  say('Posts in the Personal forum:\r\n');
  say('|  2|Nov 08 2026|Finch       |Goals                      |  0 |\r\n> ');
  await tick(300);
  assert.equal(g.state.notes.compose?.stage, 'posted');
}

// An unknown recipient: nothing after 'note write' is sent.
{
  const { g, sent, say } = setup();
  g.writeNote({ to: 'Nobodyhere', subject: 'Hi', body: 'quit' });
  say('Current forum changed to Personal.\r\n> ');
  await tick(250);
  say('No such player: Nobodyhere.\r\n> ');
  await tick(900);
  assert.deepEqual(sent, ['forum personal', 'note write Nobodyhere']);
  assert.equal(g.state.notes.compose?.stage, 'error');
}

// The editor never opened ('.s' isn't understood): the body is never sent as commands.
{
  const { g, sent, say } = setup();
  g.writeNote({ to: 'Finch', subject: 'Test', body: 'quit' });
  say('Current forum changed to Personal.\r\n> ');
  await tick(250);
  say('What is the subject? ');
  await tick(700);
  say('Huh?\r\n> ');
  await tick();
  assert.ok(!sent.includes('quit'), 'body never sent');
  assert.equal(g.state.notes.compose?.stage, 'error');
}

// While writing, background lookups wait so they can't land in the note.
{
  const { g, sent, say } = setup();
  g.writeNote({ to: 'Finch', subject: 'S', body: 'b' });
  say('Current forum changed to Personal.\r\n> ');
  await tick(250);
  g.refreshMap(0); g.syncTime();
  await tick(50);
  assert.deepEqual(sent, ['forum personal', 'note write Finch']);
  g.cancelNoteWrite();
}

console.log('notewrite tests passed');
process.exit(0);
