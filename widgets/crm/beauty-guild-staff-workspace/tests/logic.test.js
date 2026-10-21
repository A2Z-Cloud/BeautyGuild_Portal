const assert=require('node:assert/strict');
const w=require('../app/widget.js');
assert.equal(w.esc('<script>"hello" &'), '&lt;script&gt;&quot;hello&quot; &amp;');
assert.deepEqual(w.asRows({data:[{id:'1'}]}),[{id:'1'}]);
assert.deepEqual(w.asRows({code:'NO_CONTENT'}),[]);
assert.deepEqual(w.matchContext({Entity:'Contacts',EntityId:['1011174000000000001']}),{entity:'Contacts',id:'1011174000000000001'});
assert.equal(w.matchContext({Entity:'Contacts',EntityId:['wrong']}),null);
assert.equal(w.matchContext({Entity:'Fake',EntityId:'1011174000000000001'}),null);
assert.equal(w.queryCriterion('Applicant_Contact','1011174000000000001'),'(Applicant_Contact:equals:1011174000000000001)');
assert.throws(()=>w.queryCriterion('Field;drop','1234567890123'),/Invalid/);
assert.equal(w.refId({id:'1011174000000000001'}),'1011174000000000001');
assert.equal(w.statusClass('Manual Review (REC)'),'attention');
assert.equal(w.isQueueItem('insurance','Insurance_Policy',{Underwriting_Status:'Refer'}),true);
assert.equal(w.isQueueItem('insurance','Insurance_Policy',{Underwriting_Status:'Clear',Application_Status:'Completed',Finance_Sync_Status:'Complete'}),false);
assert.equal(w.isQueueItem('accreditation','Training_Centre_Accred',{Application_Stage:'Needs Processing'}),true);
assert.equal(w.contactLookup('Training_Centre_Accred',{Applicant_Contact:{id:'1011174000000000001'}}),'1011174000000000001');
assert.equal(Object.keys(w.DEMO_RECORDS).length,0); // no mock data in live build
console.log('PASS 14 core logic assertions');