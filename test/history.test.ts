import assert from 'node:assert/strict';
import { searchHistory } from '../web/src/lib/history.ts';

const h = ['look', 'kill rat', 'Look at board', 'north', 'kill rat', 'cast heal'];
assert.deepEqual(searchHistory(h, 'look'), ['look', 'Look at board'], 'case-insensitive, newest first');
assert.deepEqual(searchHistory(h, 'rat'), ['kill rat'], 'no repeats');
assert.deepEqual(searchHistory(h, ''), ['look', 'kill rat', 'Look at board', 'north', 'cast heal']);
assert.deepEqual(searchHistory(h, 'zzz'), []);
console.log('history tests passed');
