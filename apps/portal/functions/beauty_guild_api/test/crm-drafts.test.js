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

test('Journey_ID uniqueness is read the way CRM reports it',()=>{
 const make=unique=>['Application_Status','Journey_ID','Last_Completed_Journey_Step','Draft_State_Reference','Draft_Saved_At','Contact','Membership'].map(api_name=>({
  api_name,data_type:['Contact','Membership'].includes(api_name)?'lookup':'text',
  ...(api_name==='Journey_ID'?{unique}:{}),pick_list_values:api_name==='Application_Status'?[{actual_value:'Draft'}]:[]}));
 assert.throws(()=>checkMetadata('Insurance_Policy',make({}),{draftStatus:'Draft'}),'an empty object means duplicates are allowed');
 assert.throws(()=>checkMetadata('Insurance_Policy',make(null),{draftStatus:'Draft'}));
 assert.doesNotThrow(()=>checkMetadata('Insurance_Policy',make({casesensitive:true}),{draftStatus:'Draft'}));
 assert.doesNotThrow(()=>checkMetadata('Insurance_Policy',make(true),{draftStatus:'Draft'}));
});

test('Journey_ID may be non-unique only when explicitly allowed (test systems)',()=>{
 const fields=['Application_Status','Journey_ID','Last_Completed_Journey_Step','Draft_State_Reference','Draft_Saved_At','Contact','Membership'].map(api_name=>({
  api_name,data_type:['Contact','Membership'].includes(api_name)?'lookup':'text',unique:{},pick_list_values:api_name==='Application_Status'?[{actual_value:'Draft'}]:[]}));
 assert.throws(()=>checkMetadata('Insurance_Policy',fields,{draftStatus:'Draft'}));
 assert.throws(()=>checkMetadata('Insurance_Policy',fields,{draftStatus:'Draft',draftRequireUnique:true}));
 assert.doesNotThrow(()=>checkMetadata('Insurance_Policy',fields,{draftStatus:'Draft',draftRequireUnique:false}));
 assert.equal(require('../src/config').loadConfig({}).draftRequireUnique,true);
 assert.equal(require('../src/config').loadConfig({PORTAL_CRM_DRAFT_REQUIRE_UNIQUE:'false'}).draftRequireUnique,false);
});
test('the Deal draft stage is the configured one, even when the module-level Stage list does not show it',()=>{
 const dealFields=['Application_Status','Journey_ID','Last_Completed_Journey_Step','Draft_State_Reference','Draft_Saved_At','Contact_Name','Stage','Deal_Name'].map(api_name=>({
  api_name,data_type:api_name==='Contact_Name'?'lookup':api_name==='Stage'?'picklist':'text',unique:{id:'1'},
  pick_list_values:api_name==='Application_Status'?[{actual_value:'Draft'}]:api_name==='Stage'?[{actual_value:'Qualification'}]:[]}));
 assert.doesNotThrow(()=>checkMetadata('Deals',dealFields,{draftStatus:'Draft',dealStage:'Draft'}));
 assert.throws(()=>checkMetadata('Deals',dealFields,{draftStatus:'Draft',dealStage:''}));
});
