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
  assert.match(html,/widget\.js\?v=20261104-uatfix5/);
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

test('Edit in CRM remembers where the user was and the widget restores it on return',()=>{
  const js=fs.readFileSync(path.join(app,'widget.js'),'utf8');
  assert.match(js,/saveReturnPoint\(\);\s*await ZOHO\.CRM\.UI\.Record\.edit/);
  assert.match(js,/function takeReturnPoint\(\)/);
  assert.match(js,/else if\(back\)restoreReturnPoint\(back\)/);
  assert.match(js,/sessionStorage\.removeItem\(RETURN_KEY\)/);
});

test('table headings wrap instead of being clipped, and a finished list says all records are loaded',()=>{
  const css=fs.readFileSync(path.join(app,'staff-ux.css'),'utf8');
  assert.match(css,/\.v12-table th\{white-space:normal/);
  const js=fs.readFileSync(path.join(app,'widget.js'),'utf8');
  assert.match(js,/are loaded\. CRM reports no more pages\./);
});
