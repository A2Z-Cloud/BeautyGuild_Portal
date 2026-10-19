import test from 'node:test';
import assert from 'node:assert/strict';
import {isExpired} from './format.js';

test('a record is expired when its end date has passed or the Guild says so',()=>{
  assert.equal(isExpired({endDate:'2026-01-01',status:'Active'},'2026-10-19'),true);
  assert.equal(isExpired({endDate:'2027-01-01',status:'Active'},'2026-10-19'),false);
  assert.equal(isExpired({endDate:'2026-10-19',status:'Active'},'2026-10-19'),false,'the last day still counts');
  assert.equal(isExpired({endDate:null,status:'Lapsed'},'2026-10-19'),true);
  assert.equal(isExpired({status:'Cancelled'}),true);
  assert.equal(isExpired({status:'Active'}),false);
});
