import assert from 'node:assert/strict';
import { addHistory, searchHistory } from '../web/src/lib/history.ts';

const h = ['look', 'kill rat', 'Look at board', 'north', 'kill rat', 'cast heal'];
assert.deepEqual(searchHistory(h, 'look'), ['look', 'Look at board'], 'case-insensitive, newest first');
assert.deepEqual(searchHistory(h, 'rat'), ['kill rat'], 'no repeats');
assert.deepEqual(searchHistory(h, ''), ['look', 'kill rat', 'Look at board', 'north', 'cast heal']);
assert.deepEqual(searchHistory(h, 'zzz'), []);
// Repeats move to the front instead of filling the history.
let hist: string[] = [];
for (const c of ['scan', 'look', 'scan', 'scan', 'north', 'scan']) hist = addHistory(hist, c);
assert.deepEqual(hist, ['scan', 'north', 'look']);
assert.equal(addHistory(Array.from({ length: 5 }, (_, i) => `c${i}`), 'new', 3).length, 3, 'capped');
console.log('history tests passed');
