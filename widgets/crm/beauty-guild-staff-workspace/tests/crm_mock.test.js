const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');
const makeEl=()=>({textContent:'',innerHTML:'',hidden:false,value:'',required:false,disabled:false,dataset:{},callbacks:{},classList:{add(){},toggle(){}},setAttribute(){},addEventListener(n,fn){this.callbacks[n]=fn},showModal(){this.open=true},close(){this.open=false},focus(){}});
const ids={contact:'1011174000000000001',profile:'1011174000000000002',deal:'1011174000000000003',policy:'1011174000000000004',accred:'1011174000000000008'};
const rows={Contacts:[{id:ids.contact,Full_Name:'Live Example',Email:'live@example.invalid'}],Membership:[{id:ids.profile,Contact:{id:ids.contact},Current_Membership_Status:'Current'}],Deals:[{id:ids.deal,Deal_Name:'Member Deal',Contact_Name:{id:ids.contact},Payment_Status:'Paid'}],Insurance_Policy:[{id:ids.policy,Name:'POL-1',Contact:{id:ids.contact},Underwriting_Status:'Refer'}],Training_Centre_Accred:[{id:ids.accred,Name:'ACC-1',Applicant_Contact:{id:ids.contact},Application_Stage:'Under Review'}],Insurance_Extension:[{id:'1011174000000000123',Policy:{id:ids.policy},Cover_Type:'Treatment'}]};
const el={};for(const id of ['pageTitle','pageSubtitle','notice','contentArea','searchResults','connectionDot','connectionLabel','identityLabel','searchBtn','globalSearch','refreshBtn','cancelModal','cancelModal2','actionForm','actionModal','modalTitle','modalContext','actionSubject','actionDescription','actionSubjectLabel','actionDescriptionLabel','dueRow','actionDue','saveAction'])el['#'+id]=makeEl();
const nav=['processing','queue','overview','membership','insurance','accreditation','create'].map(v=>{let n=makeEl();n.dataset.view=v;return n});
const document={querySelector(s){return el[s]||makeEl()},querySelectorAll(sel){return sel==='[data-view]'?nav:[]},addEventListener(k,cb){if(k==='DOMContentLoaded')this.ready=cb}};
const calls={notes:[],tasks:[],open:[],search:[],related:[]};let contextCB=()=>{};
const sdk={embeddedApp:{on(name,cb){if(name==='PageLoad')contextCB=cb},async init(){queueMicrotask(()=>contextCB({Entity:'Contacts',EntityId:[ids.contact]}));return true}},CRM:{CONFIG:{async getCurrentUser(){return{users:[{full_name:'Staff Example'}]}}},UI:{Record:{async open(args){calls.open.push(args)}}},API:{async getRecord({Entity,RecordID}){return{data:(rows[Entity]||[]).filter(x=>x.id===RecordID)}},async searchRecord({Entity,Type,Query}){calls.search.push([Entity,Type,Query]);if(Type==='email')return{data:(rows[Entity]||[]).filter(r=>r.Email===Query)};if(Type==='word')return{data:(rows[Entity]||[]).filter(r=>JSON.stringify(r).toLowerCase().includes(Query.toLowerCase()))};const m=/^\((\w+):equals:(.*)\)$/.exec(Query);return{data:(rows[Entity]||[]).filter(r=>m&&(r[m[1]]&&r[m[1]].id||r[m[1]])===m[2])}},async getAllRecords({Entity}){return{data:rows[Entity]||[]}},async getRelatedRecords({Entity,RecordID,RelatedList}){calls.related.push([Entity,RecordID,RelatedList]);if(RelatedList==='Notes')return{data:[{id:'1011174000000000199',Note_Title:'Verified contact'}]};return {code:'NO_CONTENT'}},async addNotes(x){calls.notes.push(x);return{code:'SUCCESS'}},async insertRecord(x){calls.tasks.push(x);return{data:[{status:'success',code:'SUCCESS'}]}}}}};
const ctx={window:{ZOHO:sdk},ZOHO:sdk,document,location:{search:''},console,Date,Set,Map,Promise,Intl,URLSearchParams,setTimeout};vm.createContext(ctx);vm.runInContext(fs.readFileSync(require.resolve('../app/widget.js'),'utf8'),ctx);document.ready();
const nap=()=>new Promise(resolve=>setTimeout(resolve,70));
function delegate(action,entity,id){let t={dataset:{action,entity,id},closest:()=>t};el['#contentArea'].callbacks.click({target:t})}
(async()=>{
 await nap();assert.match(el['#contentArea'].innerHTML,/Live Example/);assert.match(el['#contentArea'].innerHTML,/Member profiles/);assert.ok(calls.search.some(x=>x[0]==='Insurance_Policy'));
 nav[4].callbacks.click();await nap();assert.match(el['#contentArea'].innerHTML,/POL-1/);assert.match(el['#contentArea'].innerHTML,/All records/);assert.match(el['#contentArea'].innerHTML,/Underwriting Status/);assert.match(el['#contentArea'].innerHTML,/Live Example/);delegate('select','Insurance_Policy',ids.policy);await nap();assert.match(el['#contentArea'].innerHTML,/Insurance covers/);assert.ok(calls.related.some(x=>x[2]==='Risk_Screenings'));assert.match(el['#contentArea'].innerHTML,/Treatment/);
 delegate('note','Insurance_Policy',ids.policy);assert.equal(el['#actionModal'].open,true);el['#actionSubject'].value='Policy follow-up';el['#actionDescription'].value='Review cover';await el['#actionForm'].callbacks.submit({preventDefault(){}});await nap();assert.equal(calls.notes.length,1);assert.equal(calls.notes[0].RecordID,ids.policy);
 delegate('task','Insurance_Policy',ids.policy);el['#actionSubject'].value='Call member';el['#actionDue'].value='2026-10-23';await el['#actionForm'].callbacks.submit({preventDefault(){}});await nap();assert.equal(calls.tasks.length,1);assert.equal(calls.tasks[0].APIData.What_Id.id,ids.policy);assert.equal(calls.tasks[0].APIData.Who_Id.id,ids.contact);assert.equal(calls.tasks[0].APIData.$se_module,'Insurance_Policy');
 delegate('open','Insurance_Policy',ids.policy);await nap();assert.equal(calls.open.length,1);delegate('email','Insurance_Policy',ids.policy);await nap();assert.equal(calls.open.length,2);delegate('crm-actions','Insurance_Policy',ids.policy);await nap();assert.equal(calls.open.length,3);
 // Processing is delegated to native CRM: no invented checklist or workflow changes.
 assert.match(el['#contentArea'].innerHTML,/Open in CRM/);
 assert.match(el['#contentArea'].innerHTML,/Underwriting attention/);
 const before=calls.notes.length;
 delegate('refresh-record','Insurance_Policy',ids.policy);await nap();
 assert.equal(calls.notes.length,before);
 // New application walkthrough is interactive but stops before payment.
 nav[6].callbacks.click();await nap();
 assert.match(el['#contentArea'].innerHTML,/Select application type/);
 let t={dataset:{action:'journey-type',kind:'insurance'},closest:()=>t};el['#contentArea'].callbacks.click({target:t});await nap();
 assert.match(el['#contentArea'].innerHTML,/Journey preview only/);
 assert.match(el['#contentArea'].innerHTML,/Continue with customer/);
 // Check a full preview journey reaches a disabled payment step without CRM application writes.
 let type={dataset:{action:'journey-type',kind:'membership'},closest:()=>type};el['#contentArea'].callbacks.click({target:type});
 delegate('journey-next');await nap();assert.match(el['#contentArea'].innerHTML,/Membership options/);
 const setField=(name,value,type='text',checked=false)=>{const input={dataset:{journeyField:name},value,type,checked};el['#contentArea'].callbacks.input({target:input});};
 setField('membershipLevel','associate');setField('membershipBranch','beauty');setField('billing','annual');setField('joinType','new');
 delegate('journey-next');await nap();assert.match(el['#contentArea'].innerHTML,/Applicant details/);
 delegate('journey-next');await nap();assert.match(el['#contentArea'].innerHTML,/Additional branches/);
 setField('insuranceWanted','no');delegate('journey-next');await nap();assert.match(el['#contentArea'].innerHTML,/Declarations/);
 setField('codeAccepted','yes');setField('termsAccepted','yes');delegate('journey-next');await nap();
 assert.match(el['#contentArea'].innerHTML,/Application preview complete/);
 assert.match(el['#contentArea'].innerHTML,/Generate payment link · Coming soon/);
 assert.doesNotMatch(el['#contentArea'].innerHTML,/checkoutUrl/);
 assert.equal(calls.tasks.length,1);
 console.log('PASS CRM mock SDK, browse-first lists, records, related lists, Notes/Tasks, native CRM actions and payment-stopped journey');
})().catch(e=>{console.error(e);process.exit(1)});