'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {mapRecord}=require('../src/records');
test('insurance policies get readable titles and other records keep theirs',()=>{
  assert.equal(mapRecord('insurance',{id:'1',Policy_Type:'Salon',Application_Status:'Completed'}).title,'Salon insurance');
  assert.equal(mapRecord('insurance',{id:'2',Policy_Type:'Non Salon',Application_Status:'Completed'}).title,'Non-salon insurance');
  assert.equal(mapRecord('insurance',{id:'3',Policy_Type:'Combined insurance'}).title,'Combined insurance');
  assert.equal(mapRecord('membership',{id:'4',Deal_Name:'The Tega Academy - Membership',Stage:'Active'}).title,'The Tega Academy - Membership');
  assert.equal(mapRecord('insurance',{id:'5'}).title,'insurance record');
});
