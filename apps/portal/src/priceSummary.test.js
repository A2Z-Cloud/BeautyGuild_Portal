import test from 'node:test';
import assert from 'node:assert/strict';
import {dueToday,thenCharge} from './priceSummary.js';

const annual={totalPence:6500,lines:[{name:'Associate Member membership (annual)',quantity:1,unitPence:5500,totalPence:5500,interval:'year'},{name:'Membership joining fee',quantity:1,unitPence:1000,totalPence:1000,interval:null}]};
const monthly={totalPence:1458,lines:[{name:'Associate Member membership (monthly)',quantity:1,unitPence:458,totalPence:458,interval:'month'},{name:'Membership joining fee',quantity:1,unitPence:1000,totalPence:1000,interval:null}]};
const oneOff={totalPence:15780,lines:[{name:'Insurance - Medical Malpractice',quantity:1,unitPence:3250,totalPence:3250,interval:null}]};

test('due today is the whole first charge, including the first subscription payment and the one-off fees',()=>{
  assert.equal(dueToday(annual),6500);
  assert.equal(dueToday(monthly),1458);
  assert.equal(dueToday(oneOff),15780);
  assert.equal(dueToday(null),0);
});
test('after the first payment a subscription charges its own price, with the yearly equivalent for monthly',()=>{
  assert.deepEqual(thenCharge(annual),{pence:5500,interval:'year',yearly:null});
  assert.deepEqual(thenCharge(monthly),{pence:458,interval:'month',yearly:5496});
});
test('a purchase with nothing recurring has no later charge',()=>{
  assert.equal(thenCharge(oneOff),null);
  assert.equal(thenCharge(null),null);
});
