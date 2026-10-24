'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const APP=path.resolve(__dirname,'../app');
const read=p=>fs.readFileSync(path.join(APP,p),'utf8');
const js=name=>{const w={};vm.runInNewContext(read(name),{window:w,console,Intl,Date,Map,Set,Promise});return w.BGCRM12};
test('Slate entry serves V1.2 modules without changing framework',()=>{
 const html=read('index.html');
 for(const f of ['v12.css','v12-crm.js','v12-journeys.mjs','widget.js'])assert.match(html,new RegExp(f.replace('.','\\.')));
 assert.match(read('.catalyst/slate-config.toml'),/framework = "static"/);
});
test('CRM metadata respects invisible fields and provides related-list navigator',async()=>{
 const renderer=js('v12-crm.js');
 const crm={META:{
  getFields:async()=>({fields:[{api_name:'Name',field_label:'Policy reference',visible:true},{api_name:'Application_Status',field_label:'Application status',visible:true},{api_name:'Secret',field_label:'Restricted',visible:false}]}),
  getLayouts:async()=>({layouts:[{name:'Default',sections:[{display_label:'Policy information',fields:[{api_name:'Name'},{api_name:'Secret'},{api_name:'Application_Status'}]}]}]}),
  getRelatedList:async()=>({related_lists:[{api_name:'Risk_Screenings',display_label:'Risk screenings',visible:true,module:{api_name:'Risk_Screenings'}}]})
 },API:{}};
 await renderer.prime('Insurance_Policy',crm,()=>{});
 const html=renderer.detailPage('Insurance_Policy',{id:'10000000001',Name:'Policy 1',Application_Status:'Pending',Secret:'PRIVATE'},{
  crm,rerender:()=>{},title:(e,r)=>r.Name,summary:()=>'',actions:()=>'',processing:()=>''});
 assert.match(html,/Policy reference/);
 assert.match(html,/Related Lists/);
 assert.match(html,/Risk screenings/);
 assert.doesNotMatch(html,/PRIVATE/);
});
test('The widget uses live CRM SDK and does not contain test payment calls',()=>{
 const widget=read('widget.js');
 assert.match(widget,/ZOHO\.embeddedApp\.init/);
 assert.match(widget,/BGCRM12\.detailPage/);
 assert.match(widget,/BGJourney12\.render/);
 assert.match(widget,/searchBrowse/);
 assert.doesNotMatch(read('v12-journeys.mjs'),/stripe\.checkout\.sessions\.create|createCheckoutSession/);
});
test('Staff questionnaire imports the same Portal V2 question sources',()=>{
 const journey=read('v12-journeys.mjs');
 const insurance=read('portal-defs/insuranceInputs.js');
 const accreditation=read('portal-defs/accreditationInputs.js');
 assert.match(journey,/import \{INSURANCE_STEPS,visibleSteps,stopMessages\} from '\.\/portal-defs\/insuranceInputs\.js'/);
 assert.match(journey,/import \{accreditationSteps,resolveFields,COPY_HOME_MAP\} from '\.\/portal-defs\/accreditationInputs\.js'/);
 assert.match(insurance,/export const INSURANCE_STEPS/);
 assert.match(accreditation,/export function accreditationSteps/);
 assert.match(journey,/customer.*confirmation|customer.*acceptance/i);
 assert.match(journey,/No cover or accreditation is active/);
});
test('No secrets are embedded in new frontend modules',()=>{
 for(const name of ['v12-crm.js','v12-journeys.mjs']){
  const txt=read(name);
  assert.doesNotMatch(txt,/sk_test_[A-Za-z0-9]{8}|sk_live_[A-Za-z0-9]{8}|Authorization\s*:\s*Bearer\s+[A-Za-z0-9_-]+/);
 }
});
