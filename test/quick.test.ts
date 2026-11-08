import assert from 'node:assert/strict';
import { DEFAULT_QUICK, loadQuick, move, quickLabel, splitCommands } from '../web/src/lib/quick.ts';

assert.deepEqual(splitCommands('get all corpse; sac corpse ;; '), ['get all corpse', 'sac corpse']);
assert.deepEqual(splitCommands('look'), ['look']);
assert.equal(quickLabel({ id: 'a', label: ' Loot ', cmd: 'get all corpse' }), 'Loot');
assert.equal(quickLabel({ id: 'a', label: '', cmd: 'scan' }), 'scan');
assert.deepEqual(move(['a', 'b', 'c', 'd'], 0, 2), ['b', 'c', 'a', 'd']);
assert.deepEqual(move(['a', 'b', 'c'], 2, 0), ['c', 'a', 'b']);
assert.deepEqual(move(['a', 'b'], 1, 1), ['a', 'b']);
assert.equal(loadQuick(), DEFAULT_QUICK, 'no storage in node: defaults');
console.log('quick tests passed');
