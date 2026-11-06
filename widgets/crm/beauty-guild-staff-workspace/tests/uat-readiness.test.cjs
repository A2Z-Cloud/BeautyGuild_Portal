'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const w=require('../app/widget.js');
const app=path.resolve(__dirname,'../app');

test('status colours use whole words: negative words are never read as positive ones',()=>{
  for(const s of ['Incomplete','Unpaid','Not Paid','Not Checked','Not Assessed'])assert.equal(w.statusClass(s),'attention',s);
  assert.equal(w.statusClass('Inactive'),'neutral');
  assert.equal(w.statusClass('Not recorded'),'neutral');
  for(const s of ['Block','Blocked','Error','Stop','Declined','Failed','Cancelled (REC)','Part Refunded'])assert.equal(w.statusClass(s),'danger',s);
  for(const s of ['Paid','Active','Clear','Completed','Verified','Approved','Issued'])assert.equal(w.statusClass(s),'ok',s);
  assert.equal(w.statusClass('Manual Review (REC)'),'attention');
  assert.equal(w.statusClass('Awaiting Payment'),'info');
  assert.equal(w.statusClass('Draft'),'draft');
});

test('the table status mapper treats Block as bad and unchecked or incomplete as waiting',()=>{
  const src=fs.readFileSync(path.join(app,'v12-crm.js'),'utf8');
  const fn=/function iconStatus\(x\)\{[\s\S]*?\n  \}/.exec(src)[0];
  const iconStatus=new Function(fn+';return iconStatus;')();
  assert.equal(iconStatus('Block'),'bad');
  assert.equal(iconStatus('Blocked'),'bad');
  assert.equal(iconStatus('Not Checked'),'waiting');
  assert.equal(iconStatus('Incomplete'),'waiting');
  assert.equal(iconStatus('Unpaid'),'waiting');
  assert.equal(iconStatus('Paid'),'good');
});

test('a stopped or blocked policy is flagged for attention, whatever else looks fine',()=>{
  const fine={Underwriting_Status:'Clear',Application_Status:'Completed',Payment_Status:'Paid',Policy_Status:'Active'};
  assert.equal(w.isQueueItem('insurance','Insurance_Policy',fine),false);
  for(const extra of [{Underwriting_Status:'Stop'},{Underwriting_Status:'Declined'},{Sanctions_Status:'Block'},{Sanctions_Status:'Review'},{Sanctions_Status:'Error'},{Member_Gate_Result:'Blocked'},{Member_Gate_Result:'Review'},{Document_Status:'Failed'},{Reprice_Required:true}]){
    assert.equal(w.isQueueItem('insurance','Insurance_Policy',{...fine,...extra}),true,JSON.stringify(extra));
  }
});

test('a Paid, Active policy with Underwriting Stop is no longer silent',()=>{
  const signals=w.reviewSignals('insurance',{id:'1',Contact:{id:'2'},Payment_Status:'Paid',Policy_Status:'Active',Underwriting_Status:'Stop'});
  assert.ok(signals.some(s=>s.label==='Underwriting stop'));
  assert.equal(w.insuranceBlocks({Underwriting_Status:'Stop'})[0].severity,'stop');
  assert.equal(w.insuranceBlocks({Sanctions_Status:'Review'})[0].severity,'review');
});

test('blank screening on a paid or active policy is reported as not recorded, not as clear',()=>{
  const labels=w.reviewSignals('insurance',{id:'1',Contact:{id:'2'},Payment_Status:'Paid',Policy_Status:'Active'}).map(s=>s.label);
  assert.ok(labels.includes('Underwriting not recorded'));
  assert.ok(labels.includes('Sanctions not recorded'));
});

test('payment wording says it is the CRM field, not a provider check',()=>{
  const s=w.reviewSignals('insurance',{id:'1',Contact:{id:'2'},Payment_Status:'Pending',Policy_Status:'Draft'}).find(x=>x.label==='Not recorded as paid');
  assert.ok(s);
  assert.match(s.reason,/CRM payment status: Pending/);
  assert.doesNotMatch(JSON.stringify(w.reviewSignals('insurance',{id:'1',Contact:{id:'2'}})),/Payment not verified/);
});

test('in Operational UAT only an early-state Application Status can be edited, and other fields are plain text',()=>{
  for(const from of [undefined,null,'','Draft','In Progress','Quote Saved','Referred'])assert.equal(w.uatEditable('Insurance_Policy','Application_Status',from),true,String(from));
  for(const from of ['Awaiting Payment','Ready for Payment','Completed','Withdrawn (REC)','Expired'])assert.equal(w.uatEditable('Insurance_Policy','Application_Status',from),false,from);
  for(const key of ['Payment_Status','Policy_Status','Manual_Review_Outcome','Document_Status'])assert.equal(w.uatEditable('Insurance_Policy',key,'Pending'),false,key);
  assert.equal(w.uatEditable('Training_Centre_Accred','Application_Stage','Under Review'),true);
  assert.equal(w.uatEditable('Training_Centre_Accred','Accreditation_Status','Unverified'),false);
});

test('table status text does not break mid-word, and the stop banner is styled',()=>{
  const css=fs.readFileSync(path.join(app,'staff-ux.css'),'utf8');
  assert.match(css,/\.v12-table td \.bg-state\{white-space:nowrap\}/);
  assert.match(css,/\.v12-stop-banner--stop/);
  const html=fs.readFileSync(path.join(app,'index.html'),'utf8');
  assert.match(html,/widget\.js\?v=20261106-uatfix8/);
});

test('buttons that only open the CRM record say so, and the note dialog names the record and hides the due date',()=>{
  const js=fs.readFileSync(path.join(app,'widget.js'),'utf8');
  assert.doesNotMatch(js,/Send email in CRM|CRM buttons \/ actions/);
  assert.match(js,/Send email \(opens CRM\)/);
  assert.match(js,/More CRM actions \(opens CRM\)/);
  assert.match(js,/\$\('#modalContext'\)\.textContent=target\?/);
  const css=fs.readFileSync(path.join(app,'staff-ux.css'),'utf8');
  assert.match(css,/#dueRow\[hidden\]\{display:none!important\}/);
});

test('wide tables keep the first column and the Open button in view, and the first cell opens the record',()=>{
  const css=fs.readFileSync(path.join(app,'staff-ux.css'),'utf8');
  assert.match(css,/\.v12-table th:first-child,\.v12-table td:first-child\{position:sticky;left:0/);
  assert.match(css,/td\.v12-action-cell\{position:sticky;right:0/);
  const v12=fs.readFileSync(path.join(app,'v12-crm.js'),'utf8');
  assert.match(v12,/v12-cell-link/);
  assert.match(v12,/class="v12-action-cell"/);
});

test('switching record sections returns to the top of the record, so a shorter section never leaves a blank band',()=>{
  const v12=fs.readFileSync(path.join(app,'v12-crm.js'),'utf8');
  assert.match(v12,/chosen\.set\(key,tab\);rerender\(\);try\{const top=document\.querySelector\('\.v12-record'\)/);
});

test('Operational UAT no longer mentions MTA, renewals or cancellations on membership and policy records',()=>{
  const js=fs.readFileSync(path.join(app,'widget.js'),'utf8');
  assert.match(js,/OPERATIONAL_UAT\?'View policy':'View policy \/ MTA'/);
  assert.match(js,/OPERATIONAL_UAT\?'Open a policy to review its cover and status\.'/);
  assert.match(js,/OPERATIONAL_UAT\?'Current transaction':'Renewal and service actions'/);
  assert.match(js,/window\.BG_OPERATIONAL_UAT=OPERATIONAL_UAT/);
  const v12=fs.readFileSync(path.join(app,'v12-crm.js'),'utf8');
  assert.match(v12,/ctx\.operationalUat\|\|global\.BG_OPERATIONAL_UAT/);
  assert.match(v12,/cancell\|voucher\|waive/);
});

test('Notes and Activities related lists show the title, content, subject and due date',()=>{
  const v12=fs.readFileSync(path.join(app,'v12-crm.js'),'utf8');
  assert.match(v12,/Notes:\['Note_Title','Note_Content','Owner','Modified_Time'\]/);
  assert.match(v12,/Tasks:\['Subject','Status','Priority','Due_Date','Owner'\]/);
  assert.match(v12,/Open_Activities:\['Subject','Activity_Type','Status','Due_Date','Owner','Modified_Time'\]/);
  assert.match(v12,/function cellMarkup\(k,v\)/);
});

test('Edit in CRM asks for confirmation before leaving the workspace',()=>{
  const js=fs.readFileSync(path.join(app,'widget.js'),'utf8');
  assert.match(js,/if\(!await confirmLeaveForEdit\(\)\)return;\s*await ZOHO\.CRM\.UI\.Record\.edit/);
  assert.match(js,/Leave the workspace to edit\?/);
  assert.match(js,/Continue to CRM/);
  assert.doesNotMatch(js,/saveReturnPoint|takeReturnPoint/);
  const css=fs.readFileSync(path.join(app,'staff-ux.css'),'utf8');
  assert.match(css,/\.bg-leave-dialog/);
});

test('table headings wrap instead of being clipped, and a finished list says all records are loaded',()=>{
  const css=fs.readFileSync(path.join(app,'staff-ux.css'),'utf8');
  assert.match(css,/\.v12-table th\{white-space:normal/);
  const js=fs.readFileSync(path.join(app,'widget.js'),'utf8');
  assert.match(js,/are loaded\. CRM reports no more pages\./);
});

test('My tasks lists only the signed-in user\'s open tasks, with plain due dates',()=>{
  const q=w.openTasksQuery('1011174000000099001',200);
  assert.match(q,/from Tasks where \(Owner = '1011174000000099001' and Status != 'Completed'\)/);
  assert.match(q,/order by Due_Date asc limit 200/);
  assert.match(w.openTasksQuery('1011174000000099001',200,false),/^select Subject, Status, Priority, Due_Date, What_Id, Who_Id from Tasks/);
  assert.throws(()=>w.openTasksQuery("1' or '1'='1"));
  const now=new Date('2026-11-06T09:00:00');
  assert.equal(w.taskDueInfo('2026-11-04',now).label,'Overdue by 2 days');
  assert.equal(w.taskDueInfo('2026-11-06',now).label,'Due today');
  assert.equal(w.taskDueInfo('2026-11-07',now).label,'Due tomorrow');
  assert.equal(w.taskDueInfo('',now).text,'No due date');
  assert.deepEqual(w.taskRelated({What_Id:{id:'1',name:'POL-1'},$se_module:'Insurance_Policy'}),{name:'POL-1',entity:'Insurance_Policy',id:'1'});
  assert.equal(w.taskRelated({Who_Id:{id:'2',name:'Sam'}}).entity,'Contacts');
  assert.equal(w.taskRelated({}),null);
  const html=fs.readFileSync(path.join(app,'index.html'),'utf8');
  assert.match(html,/data-view="tasks"/);
  const js=fs.readFileSync(path.join(app,'widget.js'),'utf8');
  assert.match(js,/tasks:\['My tasks'/);
  assert.doesNotMatch(js.slice(js.indexOf('async function loadTasks'),js.indexOf('const TASK_STATUSES')),/insertRecord|updateRecord|deleteRecord/);
});

test('the record timeline reads the CRM v8 timeline and falls back to related activity when it is not connected',()=>{
  global.window=global;delete require.cache[require.resolve('../app/v12-crm.js')];require('../app/v12-crm.js');
  const ev=global.BGCRM12.timelineEvents([
    {audited_time:'2026-11-05T10:42:00+00:00',action:'updated',done_by:{name:'Sam'},field_history:[{api_name:'Application_Status',field_label:'Application Status',_value:{old:'Draft',new:'In Progress'}}]},
    {audited_time:'2026-11-05T09:00:00+00:00',action:'added',related_record:{name:'Call member',module:{api_name:'Tasks'}},done_by:{name:'Sam'}},
    {audited_time:'2026-11-04T09:00:00+00:00',action:'added',done_by:{name:'Sam'}}]);
  assert.equal(ev[0].title,'Application Status updated');
  assert.deepEqual(ev[0].changes[0],{label:'Application Status',from:'Draft',to:'In Progress'});
  assert.equal(ev[1].title,'Task added: Call member');
  assert.equal(ev[2].title,'Record created');
  assert.deepEqual(global.BGCRM12.timelineBody({details:{statusMessage:'{"__timeline":[]}'}}),{__timeline:[]});
  const src=fs.readFileSync(path.join(app,'v12-crm.js'),'utf8');
  assert.match(src,/\/__timeline/);
  assert.match(src,/crm\/v8\//);
  assert.match(src,/Open full timeline in CRM/);
  assert.match(src,/relatedActivityTimeline\(entity,record,api,rerender,'<p class="v12-muted" role="status">The full CRM timeline is not connected yet/);
});

test('a task opens inside the workspace, can be updated or completed, and completing asks first',()=>{
  const js=fs.readFileSync(path.join(app,'widget.js'),'utf8');
  assert.match(js,/data-action="task-open"/);
  assert.match(js,/action==='task-save'\)await saveTask\(false\)/);
  assert.match(js,/action==='task-complete'\)await saveTask\(true\)/);
  assert.match(js,/if\(complete&&!await confirmDialog\(\{title:'Mark this task complete\?'/);
  assert.match(js,/updateRecord\(\{Entity:'Tasks',APIData:data,Trigger:\['workflow'\]\}\)/);
  assert.match(js,/data-action="select" data-entity="\$\{esc\(x\.entity\)\}"/);
  const rows=[{id:'1',Due_Date:'2026-12-01'},{id:'2'},{id:'3',Due_Date:'2026-11-01'}];
  assert.deepEqual(w.sortTasks(rows).map(r=>r.id),['3','1','2']);
});

test('the timeline separates emails and automatic changes, and the record page shows latest activity first',()=>{
  global.window=global;delete require.cache[require.resolve('../app/v12-crm.js')];require('../app/v12-crm.js');
  const ev=global.BGCRM12.timelineEvents([
    {audited_time:'2026-11-05T10:42:00Z',action:'added',related_record:{name:'Your policy is ready',module:{api_name:'Emails'}},automation_details:{type:'workflow',rule:{name:'Send welcome email'}}},
    {audited_time:'2026-11-05T10:00:00Z',action:'updated',field_history:[{api_name:'Stage',field_label:'Stage',_value:{old:'A',new:'B'}}]},
    {audited_time:'2026-11-05T09:00:00Z',action:'added',related_record:{name:'Call',module:{api_name:'Tasks'}}}]);
  assert.equal(ev[0].kind,'email');assert.equal(ev[0].auto,true);assert.match(ev[0].automation,/Send welcome email/);
  assert.equal(ev[1].kind,'fields');assert.equal(ev[1].auto,false);
  assert.equal(ev[2].kind,'activity');
  const src=fs.readFileSync(path.join(app,'v12-crm.js'),'utf8');
  assert.match(src,/data-action="v12-timeline-filter"/);
  assert.match(src,/function latestActivity/);
  assert.match(src,/selection==='overview'\|\|selection==='details'\)main=latestActivity/);
  assert.match(src,/\['timeline','Timeline'\],\['details','All CRM fields'\]/);
});
