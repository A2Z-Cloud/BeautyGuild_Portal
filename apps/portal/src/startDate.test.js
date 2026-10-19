import test from 'node:test';
import assert from 'node:assert/strict';
import {START_WINDOW_DAYS,isFuture,startLimits} from './startDate.js';
import {comingSoon} from './format.js';

const NOW=Date.parse('2026-10-19T12:00:00Z');
test('the picker allows today up to 30 days ahead, in UTC like the server',()=>{
  assert.equal(START_WINDOW_DAYS,30);
  assert.deepEqual(startLimits(NOW),{min:'2026-10-19',max:'2026-11-18'});
  assert.deepEqual(startLimits(Date.parse('2026-10-19T23:30:00Z')),{min:'2026-10-19',max:'2026-11-18'});
});
test('a record that starts after today is Coming soon with its start date; today and past are not',()=>{
  assert.equal(isFuture('2026-10-20',NOW),true);
  assert.equal(isFuture('2026-10-19',NOW),false);
  assert.equal(isFuture('2026-01-01',NOW),false);
  assert.equal(isFuture(null,NOW),false);
  assert.deepEqual(comingSoon({startDate:'2026-11-05'},NOW),{label:'Coming soon',note:'Starts 5 Nov 2026'});
  assert.equal(comingSoon({startDate:'2026-10-19'},NOW),null);
  assert.equal(comingSoon({},NOW),null);
});
