'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const app=path.resolve(__dirname,'../app');
const source=name=>fs.readFileSync(path.join(app,name),'utf8');
const widget=require('../app/widget.js');

test('operational UAT blocks excluded workflow entry points, retaining routine record actions',()=>{
 for(const action of ['journey-start','journey-save','membership-cancel-open','membership-cancel-confirm','membership-upgrade','membership-renew']){
   assert.equal(widget.isExcludedAction(action),true,action);
 }
 for(const action of ['select','open','edit','note','task','browse','paginate']){
   assert.equal(widget.isExcludedAction(action),false,action);
 }
});

test('CRM view COQL is scoped by CVID and paginated without client-side substitution',()=>{
 const query=widget.customViewQuery('Deals','1234567890123',['id','Deal_Name','Stage'],2);
 assert.match(query,/from Deals#1234567890123 where id is not null limit 100, 100/);
 assert.equal((query.match(/\bid\b/g)||[]).length>=1,true);
 assert.throws(()=>widget.customViewQuery('Deals','invalid',['id'],1),/Invalid CRM custom view/);
 assert.throws(()=>widget.customViewQuery('Deals','1234567890123',['Name'],21),/2,000/);
 assert.throws(()=>widget.customViewQuery('Deals; DROP','1234567890123',['Name'],1),/Invalid CRM module/);
 assert.throws(()=>widget.customViewQuery('Deals','1234567890123',['Name;DROP'],1),/Invalid custom-view column/);
});

test('CRM field editing and transaction workflows are retained but gated in UAT',()=>{
 const code=source('widget.js');
 const html=source('index.html');
 assert.match(code,/function workflowFieldEditor\(/);
 assert.match(code,/function askWorkflowEdit\(/);
 assert.match(code,/async function saveWorkflowEdit\(/);
 assert.match(code,/Trigger:\['workflow'\]/);
 assert.match(code,/UAT_EDIT_FIELDS/);
 assert.match(html,/data-view="create" hidden/);
 assert.match(html,/id="staff-api-open" hidden/);
});

test('record renderer offers a separate field-update tab without replacing record details',async()=>{
 const window={};
 vm.runInNewContext(source('v12-crm.js'),{window,console,Intl,Date,Map,Set,Promise});
 const crm={META:{
   getFields:async()=>({fields:[{api_name:'Name',visible:true,field_label:'Policy'},{api_name:'Application_Status',visible:true,field_label:'Application status'}]}),
   getLayouts:async()=>({layouts:[]}),
   getRelatedList:async()=>({related_lists:[]})
 },API:{}};
 await window.BGCRM12.prime('Insurance_Policy',crm,()=>{});
 const record={id:'1234567890123',Name:'Test policy',Application_Status:'In Progress'};
 const html=window.BGCRM12.detailPage('Insurance_Policy',record,{crm,rerender:()=>{},title:(e,r)=>r.Name,summary:()=>'',actions:()=>'',editableFields:()=>'<select data-wf-edit="true"></select>',operationalUat:true});
 assert.match(html,/data-tab="updates"/);
 assert.match(html,/data-tab="details"/);
 assert.match(html,/data-tab="timeline"/);
 assert.doesNotMatch(html,/data-wf-edit="true"/); // Not shown while another tab is selected.
 assert.doesNotMatch(html,/Manage changes \(MTA\)/);
});

test('CRM custom-view selection cannot silently become unfiltered search',()=>{
 const code=source('widget.js');
 assert.match(code,/META\.getCustomViews/);
 assert.match(code,/getCustomViewPage/);
 assert.match(code,/if\(selectedCustomView\(kind\)\)\{data\.error=/);
 assert.match(code,/data\.generation/);
 assert.match(code,/reloadPending/);
});
