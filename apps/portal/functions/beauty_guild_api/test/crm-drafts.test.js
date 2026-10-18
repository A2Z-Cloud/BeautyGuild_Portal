'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {validateDraft,pack,unpack,ensureOwnership,checkMetadata}=require('../src/crmDrafts');
const uuid='b0fd218f-9ad6-4c13-9b78-2830f3e270b0';
test('four supported draft service payloads validate',()=>{
 for(const service of ['membership','insurance','accreditation','combined']){
  const answers=service==='combined'?{membership:{x:1},insurance:{y:2}}:{field:'value'};
  assert.equal(validateDraft({service,journeyId:uuid,step:3,answers}).service,service);
 }
});
test('draft state codec retains every nested conditional answer',()=>{
 const doc={version:1,journeyId:uuid,service:'combined',step:6,revision:2,
  answers:{insurance:{workingMethods:['salon','mobile'],floodHistory:'yes',premises:{postcode:'AB1 2CD'}},membership:{options:['Beauty','Nails']}}};
 assert.deepEqual(unpack(pack(doc)),doc);
});
test('record ownership and editable status are enforced',()=>{
 assert.throws(()=>ensureOwnership({id:'1000000000001',Contact:{id:'other'},Application_Status:'Draft'},'mine'));
 assert.throws(()=>ensureOwnership({id:'1000000000001',Contact:{id:'mine'},Application_Status:'Paid'},'mine'));
 assert.equal(ensureOwnership({id:'1000000000001',Contact:{id:'mine'},Application_Status:'Draft'},'mine').id,'1000000000001');
});
test('unconfigured status or non-unique Journey_ID cannot be enabled',()=>{
 const fields=['Application_Status','Journey_ID','Last_Completed_Journey_Step','Draft_State_Reference','Draft_Saved_At','Contact','Membership'].map(api_name=>({
  api_name,data_type:['Contact','Membership'].includes(api_name)?'lookup':'text',
  pick_list_values:api_name==='Application_Status'?[{actual_value:'Draft'}]:[]
 }));
 assert.throws(()=>checkMetadata('Insurance_Policy',fields,{draftStatus:'Draft'}));
 fields.find(x=>x.api_name==='Journey_ID').unique={id:'123'};
 assert.doesNotThrow(()=>checkMetadata('Insurance_Policy',fields,{draftStatus:'Draft'}));
});
test('invalid requests fail without a CRM write',()=>{
 assert.throws(()=>unpack('invalid'));
 assert.throws(()=>validateDraft({service:'insurance',journeyId:uuid,step:-1,answers:{}}));
 assert.throws(()=>validateDraft({service:'combined',journeyId:uuid,step:3,answers:{membership:{}}}));
});
