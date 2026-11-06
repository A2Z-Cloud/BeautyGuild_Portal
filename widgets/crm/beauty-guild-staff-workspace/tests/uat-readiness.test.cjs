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
  assert.match(html,/widget\.js\?v=20261106-uatfix22/);
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
  assert.match(src,/relatedActivityTimeline\(entity,record,api,rerender,'<p class="v12-muted" role="status">The full CRM timeline could not be loaded/);
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
  const run=global.BGCRM12.timelineEvents([{audited_time:'2026-11-05T17:31:00Z',action:'function_executed',related_record:{name:'BG000143',module:{api_name:'Insurance_Policy'}},automation_details:{type:'workflow rule',rule:{name:'A2Z - INS Retroactive Date'}}}]);
  assert.equal(run[0].title,'Automation ran: A2Z - INS Retroactive Date');assert.equal(run[0].auto,true);assert.equal(run[0].automation,'Workflow rule: A2Z - INS Retroactive Date');
  assert.equal(ev[1].kind,'fields');assert.equal(ev[1].auto,false);
  assert.equal(ev[2].kind,'activity');
  const src=fs.readFileSync(path.join(app,'v12-crm.js'),'utf8');
  assert.match(src,/data-action="v12-timeline-filter"/);
  assert.match(src,/function latestActivity/);
  assert.match(src,/selection==='overview'\|\|selection==='details'\)main=latestActivity/);
  assert.match(src,/\['timeline','Timeline'\],\['details','All CRM fields'\]/);
});

test('the My tasks pager is allowed by the paginate action',()=>{
  const js=fs.readFileSync(path.join(app,'widget.js'),'utf8');
  const m=/action==='paginate'\)\{const key=el\.dataset\.key,n=Number\(el\.dataset\.page\);if\((\/.*?\/)\.test\(key/.exec(js);
  assert.ok(m,'paginate guard not found');
  const re=eval(m[1]);
  assert.equal(re.test('tasks'),true);
  assert.equal(re.test('browse:insurance'),true);
  assert.equal(re.test('something-else'),false);
});

test('the Emails related list reads CRM emails through the connection and shows sender, recipient, time and status',()=>{
  global.window=global;delete require.cache[require.resolve('../app/v12-crm.js')];require('../app/v12-crm.js');
  const rows=global.BGCRM12.emailRows([{message_id:'m1',subject:'Your policy is ready',from:{user_name:'Beauty Guild',email:'info@bg.test'},to:[{user_name:'Sam',email:'sam@x.test'}],sent:true,time:'2026-11-05T10:00:00+00:00',status:[{type:'sent'},{type:'opened'},{type:'sent'}]},{message_id:'m2',from:{email:'a@b.test'},sent:false}]);
  assert.equal(rows[0].Subject,'Your policy is ready');
  assert.equal(rows[0].From,'Beauty Guild <info@bg.test>');
  assert.equal(rows[0].To,'Sam <sam@x.test>');
  assert.equal(rows[0].Direction,'Sent');
  assert.equal(rows[0].Status,'Sent, Opened');
  assert.equal(rows[1].Subject,'(no subject)');assert.equal(rows[1].Direction,'Received');
  const src=fs.readFileSync(path.join(app,'v12-crm.js'),'utf8');
  assert.match(src,/\/Emails'/);
  assert.match(src,/email_related_list/);
  assert.match(src,/if\(status===204\|\|!body\)return\{rows:\[\],more:false\}/);
});

test('journeys use the page dialog (browser confirm is blocked in the CRM frame) and show policy documents and legal links',()=>{
  const js=fs.readFileSync(path.join(app,'widget.js'),'utf8');
  const clickAction=js.slice(js.indexOf('async function clickAction'),js.indexOf('async function clickAction')+60000);
  const journeyPart=clickAction.slice(clickAction.indexOf("action==='journey-save'"),clickAction.indexOf("action==='journey-exit'"));
  assert.doesNotMatch(journeyPart,/window\.confirm\(/);
  assert.match(journeyPart,/title:'Create a payment link\?'/);
  assert.match(js,/data-action="new-customer"/);
  assert.match(js,/function createContactRecord/);
  assert.match(js,/A customer with this email already exists\./);
  const j=fs.readFileSync(path.join(app,'v12-journeys.js'),'utf8');
  assert.match(j,/import \{LEGAL,policyDocuments\} from '\.\/portal-defs\/legal\.js'/);
  assert.match(j,/documentsPanel\(j\)\+'<\/aside>'/);
  const legal=fs.readFileSync(path.join(app,'portal-defs/legal.js'),'utf8');
  for(const u of ['Terms-Of-Business','Legal/Privacy','Treatments-We-Cover','Code-Of-Ethics'])assert.ok(legal.includes(u),u);
});

test('the stylesheet no longer hides New application or the journey buttons',()=>{
  const css=fs.readFileSync(path.join(app,'staff-ux.css'),'utf8');
  const rule=/\{\s*display:none !important;?\s*\}/;
  const hidden=css.split('}').filter(r=>/display:\s*none\s*!important/.test(r)).join('}');
  assert.doesNotMatch(hidden,/data-view="create"/);
  assert.doesNotMatch(hidden,/data-action\^="journey-"/);
  assert.doesNotMatch(hidden,/\.create-cta/);
  assert.match(hidden,/data-action\^="membership-cancel-"/);
  assert.match(hidden,/data-staff-addon="mta"/);
});

test('module files are plain .js, because Slate serves .mjs as application/octet-stream and browsers refuse to run it',()=>{
  const html=fs.readFileSync(path.join(app,'index.html'),'utf8');
  assert.match(html,/type="module" src="v12-journeys\.js\?v=/);
  assert.doesNotMatch(html,/\.mjs/);
  assert.ok(fs.existsSync(path.join(app,'v12-journeys.js')));assert.ok(fs.existsSync(path.join(app,'portal-defs/logic.js')));
  assert.ok(!fs.existsSync(path.join(app,'v12-journeys.mjs')));assert.ok(!fs.existsSync(path.join(app,'portal-defs/logic.mjs')));
  for(const f of ['v12-journeys.js','portal-defs/accreditationInputs.js','portal-defs/insuranceInputs.js'])assert.doesNotMatch(fs.readFileSync(path.join(app,f),'utf8'),/from '[^']*\.mjs'/,f);
  const w=fs.readFileSync(path.join(app,'widget.js'),'utf8');
  const err=w.slice(w.indexOf('The application form did not load'),w.indexOf('The application form did not load')+700);
  assert.match(err,/data-action="journey-back"/);assert.match(err,/data-action="journey-exit"/);
});

test('the live quotation button explains itself for Accreditation, and slow pricing calls time out instead of leaving it greyed',()=>{
  const j=fs.readFileSync(path.join(app,'v12-journeys.js'),'utf8');
  assert.match(j,/Save the application to CRM with/);
  assert.match(j,/The Submit button appears here once the application is saved to CRM\./);
  assert.match(j,/title="Save and submit the Accreditation application first"/);
  const w=fs.readFileSync(path.join(app,'widget.js'),'utf8');
  assert.match(w,/withTimeout\(window\.BGStaffApi\.call\('quote',payload\),60000/);
  assert.match(w,/withTimeout\(window\.BGStaffApi\.call\('payment_link',body\),60000/);
});

test('staff-facing wording is final: no internal system names, and table rows are labelled so narrow frames can stack them',()=>{
  const files=['widget.js','v12-crm.js','v12-journeys.js'].map(f=>fs.readFileSync(path.join(app,f),'utf8'));
  const visible=files.join('\n').split('\n').filter(l=>!/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  for(const bad of ['Portal V2 form module','signed Catalyst API','Authoritative Catalyst quotation','Generate test payment link','Open Stripe Checkout','Signed staff API integration unavailable','No authoritative quote returned by the Staff API','Operational UAT: existing customer'])
    assert.ok(!(bad==='Operational UAT: existing customer'?false:visible.includes(bad)),bad);
  assert.match(files[2],/Create payment link/);
  assert.match(files[2],/Quoted by the Portal/);
  assert.match(files[1],/<td data-label="/);
  assert.match(files[0],/<td data-label="Related to">/);
  const css=fs.readFileSync(path.join(app,'staff-ux.css'),'utf8');
  assert.match(css,/@media\(max-width:700px\)\{\s*\.v12-table-wrap\{border-top:0/);
  assert.match(css,/td\[data-label\]:before\{content:attr\(data-label\)/);
  assert.match(css,/v12-action-cell \.v12-link:not\(\.v12-cell-link\)\{white-space:nowrap/);
});
