// Replays real Aardwolf traffic recorded from a live session (page reload + reattach) and checks
// that background replies are parsed into panels and never leak into, or swallow, the log.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Game, promptRegExp } from '../web/src/lib/store.ts';
import { plain } from '../web/src/lib/ansi.ts';

const trace: { at: number; msg: any }[] = JSON.parse(fs.readFileSync(new URL('./fixtures/reattach.json', import.meta.url), 'utf8'));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function replay(knownPrompt: boolean) {
  const g = new Game();
  g.attach(() => {});
  // This recording predates item-detail lookups, so it holds no `invdetails` replies to match them.
  g.fetchItemDetails = () => {};
  g.refreshNotes = () => {}; // …nor note-board lookups
  g.syncTime = () => {}; // …nor the clock
  if (knownPrompt) (g as any).promptRe = promptRegExp('[*Daily Blessing*] [158/158hp 189/189mn 541/541mv 0qt 415tnl] >');
  g.resume(); // what the client does on reattach
  const t0 = trace[0].at;
  let refreshed = false;
  for (const e of trace) {
    await sleep(Math.max(0, e.at - t0 - (Date.now() - start)));
    g.onMessage(e.msg);
    // The Objectives tab (open at the time) refreshes as soon as the player is logged in.
    if (!refreshed && g.state.loggedIn) { refreshed = true; g.refreshObjectives(); }
  }
  await sleep(500);
  return g;
}
let start = Date.now();

for (const knownPrompt of [true, false]) {
  start = Date.now();
  const g = await replay(knownPrompt);
  const log = g.state.lines.map((l) => plain(l.segs));
  const label = `(prompt ${knownPrompt ? 'known' : 'unknown'})`;
  assert.ok(log.includes('Combat Training Room'), `look output shown ${label}`);
  const leaks = log.filter((t) => /Tag Name|Goal listing|Goal information|campaign|invdata|You tell Claire|MAPSTART/.test(t));
  assert.deepEqual(leaks, [], `no leaks ${label}`);
  assert.deepEqual(g.state.objectives.campaign?.lines, [
    'You are not currently on a campaign.', 'You have completed 0 campaigns today.', 'You may take a campaign at this level.',
  ], `campaign ${label}`);
  assert.equal(g.state.inventory.length, 2, `inventory ${label}`);
  assert.ok(g.state.tagsListing.some((l) => /^MAP\s/.test(l)), `tags listing ${label}`);
  const academy = g.state.objectives.goals.find((x) => x.name === 'Academy');
  assert.equal(academy?.tasks?.length, 5, `academy tasks ${label}`);
  assert.ok(g.state.chat.some((c) => plain(c.msg) === "You tell Claire 'D'"), `tell history ${label}`);
}
console.log('replay tests passed');
process.exit(0);
