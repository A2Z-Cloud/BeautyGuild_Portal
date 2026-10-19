import test from 'node:test';
import assert from 'node:assert/strict';
import {EMPTY_DETAILS,autoTradingName,tradingNameOf,missingDetails,detailsRequest} from './membershipDetails.js';
import {BRANCHES,branchName} from './branches.js';

test('the trading name fills in from the first and last name and can be changed',()=>{
  const d={...EMPTY_DETAILS,firstName:'Helen',lastName:'Delaney'};
  assert.equal(autoTradingName(d),'Helen Delaney');
  assert.equal(tradingNameOf(d),'Helen Delaney');
  assert.equal(tradingNameOf({...d,tradingEdited:true,tradingName:"Helen's Nails"}),"Helen's Nails");
  assert.equal(tradingNameOf({...d,lastName:'Smith'}),'Helen Smith');
});
test('every field except the second address line and county is required, and each missing one is named',()=>{
  assert.deepEqual(Object.keys(missingDetails(EMPTY_DETAILS)),['firstName','lastName','tradingName','address1','town','postcode']);
  const done={...EMPTY_DETAILS,firstName:'A',lastName:'B',address1:'1 High St',town:'Leeds',postcode:'LS1 1AA'};
  assert.deepEqual(missingDetails(done),{});
  assert.equal(missingDetails({...done,postcode:'  '}).postcode,'Enter your postcode.');
  assert.ok(missingDetails({...done,tradingEdited:true,tradingName:' '}).tradingName);
});
test('the request carries the trading name that is showing',()=>{
  const r=detailsRequest({...EMPTY_DETAILS,firstName:' A ',lastName:'B',postcode:'LS1 1AA'});
  assert.equal(r.businessName,'A B');assert.equal(r.firstName,'A');assert.equal(r.postcode,'LS1 1AA');
});
test('branches have no logo until one is set, and names resolve',()=>{
  assert.equal(BRANCHES.length,4);
  assert.ok(BRANCHES.every(b=>b.logo===null));
  assert.equal(branchName('nails'),'Nail Technicians');
});
