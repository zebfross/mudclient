import assert from 'node:assert/strict';
import { Game } from '../web/src/lib/store.ts';
import { plain } from '../web/src/lib/ansi.ts';

const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));
function setup() {
  const g = new Game();
  const sent: any[] = [];
  g.attach((m: any) => sent.push(m));
  g.refreshNotes = () => {}; g.syncTime = () => {}; // nothing answers background lookups here
  return { g, sent, cmds: () => sent.filter((m) => m.t === 'cmd').map((m) => m.d) };
}

// Happy path: sign in before connecting; connect, answer the name prompt, then the password prompt.
{
  const { g, sent, cmds } = setup();
  g.signIn('Testchar', 'not-a-real-password');
  assert.equal(sent[0].t, 'connect', 'connects first');
  g.onMessage({ t: 'status', connected: true });
  g.onMessage({ t: 'text', d: '\r\n  Welcome!\r\n\r\nWhat be thy name, adventurer? ' });
  await tick(300); // idle partial line counts as a prompt
  assert.deepEqual(cmds(), ['Testchar']);
  assert.equal(g.state.login.stage, 'name');
  g.onMessage({ t: 'text', d: 'Password: ' });
  g.onMessage({ t: 'echo', on: false });
  assert.deepEqual(cmds(), ['Testchar', 'not-a-real-password']);
  assert.ok(!g.state.lines.some((l) => plain(l.segs).includes('not-a-real-password')), 'password never shown');
  assert.equal((g as any).pendingLogin.password, '', 'password dropped from memory once sent');
  g.onMessage({ t: 'echo', on: true });
  g.onMessage({ t: 'text', d: '[ Press Return to continue ]\r\n' });
  await tick();
  assert.deepEqual(cmds(), ['Testchar', 'not-a-real-password', ''], 'presses return for you');
  g.onMessage({ t: 'gmcp', pkg: 'char.base', data: { name: 'Testchar' } });
  assert.equal(g.state.loggedIn, true);
  assert.equal(g.state.login.stage, 'idle');
  assert.equal((g as any).pendingLogin, null);
}

// Already at the name prompt when you sign in.
{
  const { g, cmds } = setup();
  g.onMessage({ t: 'status', connected: true });
  g.onMessage({ t: 'text', d: 'What be thy name, adventurer? ' });
  await tick(300);
  assert.deepEqual(cmds(), [], 'nothing sent without a sign-in');
  g.signIn('Testchar', 'pw');
  assert.deepEqual(cmds(), ['Testchar']);
}

// Wrong password.
{
  const { g, cmds } = setup();
  g.onMessage({ t: 'status', connected: true });
  g.signIn('Testchar', 'bad');
  g.onMessage({ t: 'text', d: 'What be thy name, adventurer? ' });
  await tick(300);
  g.onMessage({ t: 'echo', on: false });
  g.onMessage({ t: 'text', d: 'Wrong password.\r\n' });
  await tick();
  assert.deepEqual(cmds(), ['Testchar', 'bad']);
  assert.deepEqual(g.state.login, { stage: 'error', error: 'Wrong password.' });
}

// An unknown name: Aardwolf offers to create a character. Don't answer for the player.
{
  const { g, cmds } = setup();
  g.onMessage({ t: 'status', connected: true });
  g.signIn('Typoname', 'pw');
  g.onMessage({ t: 'text', d: 'What be thy name, adventurer? ' });
  await tick(300);
  g.onMessage({ t: 'text', d: 'Did I get that right, Typoname (Y/N)? ' });
  await tick(300);
  assert.deepEqual(cmds(), ['Typoname'], 'password not sent, nothing answered');
  assert.equal(g.state.login.stage, 'error');
}
// The real Aardwolf sequence, recorded 2026-11-08: Name → "Existing profile loaded" → Password (echo off) → in.
{
  const { g, cmds } = setup();
  g.onMessage({ t: 'status', connected: true });
  g.signIn('Testchar', 'pw');
  g.onMessage({ t: 'text', d: 'Name: ' });
  await tick(300);
  assert.deepEqual(cmds(), ['Testchar']);
  g.onMessage({ t: 'text', d: '\n\rExisting profile loaded - please enter your password.\n\r\n\rPassword: ' });
  g.onMessage({ t: 'echo', on: false });
  g.onMessage({ t: 'echo', on: true });
  g.onMessage({ t: 'text', d: '\n\rWelcome to Aardwolf. May your adventures be mystical, challenging and rewarding.\n\r' });
  g.onMessage({ t: 'gmcp', pkg: 'char.base', data: { name: 'Testchar' } });
  await tick();
  assert.deepEqual(cmds(), ['Testchar', 'pw']);
  assert.equal(g.state.loggedIn, true);
  assert.equal(g.state.login.stage, 'idle');
}

// Sign in before the banner arrives (reconnecting): the banner's "Enter your character name" line
// is not the question; only "What be thy name, adventurer?" is. (Real banner, 2026-11-08.)
{
  const { g, cmds } = setup();
  g.onMessage({ t: 'status', connected: true });
  g.signIn('Testchar', 'pw');
  g.onMessage({ t: 'text', d: "-----------------------------------------------------------------------------\n\r    Enter your character name or type 'NEW' to create a new character\n\r-----------------------------------------------------------------------------\n\r" });
  await tick();
  assert.deepEqual(cmds(), [], 'banner line ignored');
  g.onMessage({ t: 'text', d: 'What be thy name, adventurer? ' });
  await tick(300);
  assert.deepEqual(cmds(), ['Testchar']);
  assert.equal(g.state.login.stage, 'name', 'no "asked again" error');
}

// Aardwolf's real re-ask (seen live): "That name is not usable. Please try another." then "Name: ".
{
  const { g, cmds } = setup();
  g.onMessage({ t: 'status', connected: true });
  g.onMessage({ t: 'text', d: 'That name is not usable. Please try another.\r\nName: ' });
  await tick(300);
  g.signIn('Testchar', 'pw');
  assert.deepEqual(cmds(), ['Testchar'], 'the real Name: prompt is recognised');
}

// A server that sends GA after game prompts but not after the name question (the fake MUD).
{
  const { g, cmds } = setup();
  g.onMessage({ t: 'status', connected: true });
  g.onMessage({ t: 'prompt' }); // marks GA as in use
  g.signIn('Testchar', 'pw');
  g.onMessage({ t: 'text', d: 'What be thy name, adventurer? ' });
  assert.deepEqual(cmds(), ['Testchar'], 'answered as soon as it arrives');
  g.onMessage({ t: 'text', d: '\r\nPassword: ' });
  await tick();
  assert.equal(g.state.login.stage, 'name', 'the same question finishing its line is not a second ask');
}
// Page load: the relay says the old session is gone, so the client connects; signing in right
// away mustn't open a second connection (that would drop the first).
{
  const { g, sent } = setup();
  g.onSession(false);
  g.signIn('Testchar', 'pw');
  assert.equal(sent.filter((m) => m.t === 'connect').length, 1, 'one connection');
  assert.ok(g.state.sessionAt > 0);
}
// Pressing Disconnect cancels a sign-in and marks the drop as yours; connecting again clears it.
{
  const { g } = setup();
  g.onMessage({ t: 'status', connected: true });
  g.signIn('Testchar', 'pw');
  g.disconnect();
  assert.equal(g.state.manualDisconnect, true);
  assert.equal(g.state.login.stage, 'idle');
  g.connect();
  assert.equal(g.state.manualDisconnect, false);
}
// Reattached to a session already at the name prompt (the prompt arrived before this page): reconnect.
{
  const { g, sent, cmds } = setup();
  g.onMessage({ t: 'status', connected: true });
  g.signIn('Testchar', 'pw');
  await tick(2100);
  assert.equal(sent.filter((m) => m.t === 'connect').length, 1, 'asks for a fresh connection');
  g.onMessage({ t: 'status', connected: true });
  g.onMessage({ t: 'text', d: 'What be thy name, adventurer? ' });
  assert.deepEqual(cmds(), ['Testchar']);
}
// The game can't be reached while signing in: a retryable error, not a 30-second hang.
{
  const { g } = setup();
  g.signIn('Testchar', 'pw');
  g.onMessage({ t: 'status', connected: false, msg: 'Connecting to aardmud.org:4000…' }); // the relay's attempt notice
  assert.equal(g.state.login.stage, 'waiting', 'an attempt in progress is not a failure');
  g.onMessage({ t: 'status', connected: false, msg: 'connect ECONNREFUSED 127.0.0.1:4000' });
  assert.equal(g.state.login.stage, 'error');
  assert.equal(g.state.login.retry, true);
  assert.match(g.state.login.error ?? '', /ECONNREFUSED/);
}
// Background lookups queued before a drop are forgotten, not sent to the next login screen.
{
  const { g, cmds } = setup();
  g.onMessage({ t: 'status', connected: true });
  g.onMessage({ t: 'gmcp', pkg: 'char.base', data: { name: 'Testchar' } }); // logged in
  g.state = { ...g.state, loggedIn: true };
  g.refreshObjectives(); // queues campaign check, goals… (nothing answers here)
  const before = cmds().length;
  g.onMessage({ t: 'status', connected: false, msg: 'read ETIMEDOUT' });
  g.refreshInventory();
  await tick();
  g.onMessage({ t: 'status', connected: true });
  g.signIn('Testchar', 'pw');
  g.onMessage({ t: 'text', d: 'What be thy name, adventurer? ' });
  assert.deepEqual(cmds().slice(before), ['Testchar'], 'only the name goes to the login screen');
}
console.log('login tests passed');
process.exit(0);
