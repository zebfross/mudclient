import assert from 'node:assert/strict';
import { applyQuestEvent, isActiveGoal, parseCampaign, parseGoalDetail, parseGoalList, questActive } from '../web/src/lib/objectives.ts';

// Real `goals` output (trimmed).
const list = parseGoalList([
  '                  Goal listing for levels 0 to 201',
  'Goal Name    Description                                     Lvl Rating Status',
  '~~~~~~~~~~~~ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ ~~~ ~~~~~~ ~~~~~~',
  'Academy      Graduate from the Aylorian Academy.               1      2   Open',
  'Believer     Can we really change the future?                  1      1 ',
  'Chaprenula   End the madness in Chaprenula\'s Laboratory!      10      2 Locked',
  'Ygg          Overcome Destiny and save Yggdrasil.            201      3 ',
  '[ 238 ] goals listed.',
]);
assert.deepEqual(list.map((g) => [g.name, g.level, g.status]), [['Academy', 1, 'Open'], ['Believer', 1, ''], ['Chaprenula', 10, 'Locked'], ['Ygg', 201, '']]);
assert.deepEqual(list.filter(isActiveGoal).map((g) => g.name), ['Academy']);

// Real `goal academy` output (trimmed).
const d = parseGoalDetail([
  '',
  '                     Goal information for: Aylorian Academy ',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  'Visit all trainers in the Aylorian Academy and complete the lessons presented',
  'by each trainer.',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  'Difficulty       : Medium              ',
  'Tasks:',
  ' 4 -  Complete Hunting / Combat training in the Aylorian Academy.  : Completed',
  ' 5 -  Complete Health training in the Aylorian Academy.            : Open',
]);
assert.equal(d.title, 'Aylorian Academy');
assert.equal(d.details, 'Visit all trainers in the Aylorian Academy and complete the lessons presented by each trainer.');
assert.deepEqual(d.tasks, [
  { n: 4, text: 'Complete Hunting / Combat training in the Aylorian Academy.', status: 'Completed' },
  { n: 5, text: 'Complete Health training in the Aylorian Academy.', status: 'Open' },
]);

assert.equal(parseCampaign(['You are not currently on a campaign.', 'You may take a campaign at this level.', '']).active, false);
assert.equal(parseCampaign(['The targets for this campaign are:', 'Find and kill 1 * a rat (Aylor)']).active, true);

let q = applyQuestEvent(null, { action: 'start', targ: 'a goblin', room: 'A cave', area: 'Goblin Hills', timer: 30 });
assert.ok(questActive(q));
q = applyQuestEvent(q, { action: 'killed', time: 12 });
assert.ok(questActive(q) && q.targ === 'a goblin');
q = applyQuestEvent(q, { action: 'comp', qp: 12, wait: 30 });
assert.ok(!questActive(q));
console.log('objectives tests passed');
