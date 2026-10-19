'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {mapRecord}=require('../src/records');
test('insurance policies get readable titles and other records keep theirs',()=>{
  assert.equal(mapRecord('insurance',{id:'1',Policy_Type:'Salon',Application_Status:'Completed'}).title,'Salon insurance');
  assert.equal(mapRecord('insurance',{id:'2',Policy_Type:'Non Salon',Application_Status:'Completed'}).title,'Non-salon insurance');
  assert.equal(mapRecord('insurance',{id:'3',Policy_Type:'Combined insurance'}).title,'Combined insurance');
  assert.equal(mapRecord('membership',{id:'4',Deal_Name:'The Tega Academy - Membership',Stage:'Active'}).title,'The Tega Academy - Membership');
  assert.equal(mapRecord('insurance',{id:'5'}).title,'insurance record');
  assert.equal(mapRecord('accreditation',{id:'9',Name:'ACC - 0140',Account:{name:'School'}}).reference,'ACC - 0140');
  assert.equal(mapRecord('accreditation',{id:'9',Account:{name:'School'}}).reference,'9');
  assert.equal(mapRecord('membership',{id:'8',Deal_Name:'M'}).reference,'8');
  const p=mapRecord('insurance',{id:'6',Policy_Type:'Salon',Policy_Start_Date:'2026-10-01',Policy_End_Date:'2027-09-30'});
  assert.equal(p.startDate,'2026-10-01');assert.equal(p.endDate,'2027-09-30');
});
