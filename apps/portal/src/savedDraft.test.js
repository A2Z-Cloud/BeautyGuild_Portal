import test from 'node:test';
import assert from 'node:assert/strict';
import {draftRef,finishPaidDraft,joinDraft,buyDraft,noConfirmations,restoreDraftToTab,saveDraft,takeSavePending,setSavePending} from './savedDraft.js';
import {readStored,writeStored} from './storedState.js';
import {CONFIRMATIONS} from './insuranceInputs.js';
import {startLimits} from './startDate.js';

function fakeStorage(){
  const data=new Map();
  return {get length(){return data.size;},key:i=>[...data.keys()][i]??null,getItem:k=>data.has(k)?data.get(k):null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k),data};
}
const ticked=Object.fromEntries(CONFIRMATIONS.map(k=>[k,true]));
const F={level:'full_salon',branch:'beauty',branches:['hair'],billing:'monthly',addons:{badge:2},insurance:false,accepted:true,start:'2099-01-01'};
const D={firstName:'Nia',lastName:'Bright',tradingName:'',tradingEdited:false,address1:'1 High St',address2:'',town:'Leeds',county:'',postcode:'LS1 1AA',manual:true,lookup:''};
const IV={insWorking:['salon'],insTurnover:1000,...ticked};
const fakeApi=(over={})=>{const calls=[];return {calls,
  createDraft:async b=>{calls.push(['create',b]);return {id:'111',journeyId:b.journeyId,revision:1};},
  updateDraft:async(s,id,b)=>{calls.push(['update',s,id,b]);return {id,journeyId:b.journeyId,revision:b.revision+1};},
  discardDraft:async(s,id)=>{calls.push(['discard',s,id]);return {discarded:true};},...over};};

test('the saved Join answers never include the agreement box, confirmations, payment data, or insurance answers without insurance',()=>{
  const m=joinDraft({f:F,d:D,iv:IV,country:'England'});
  assert.equal(m.service,'membership');assert.deepEqual(Object.keys(m.answers),['membership']);
  const text=JSON.stringify(m);
  assert.ok(!text.includes('accepted'));assert.ok(!text.includes('insInformationAccurate'));assert.ok(!/card|stripe|checkout/i.test(text));
  const c=joinDraft({f:{...F,insurance:true},d:D,iv:IV,country:'England'});
  assert.equal(c.service,'combined');
  assert.deepEqual(c.answers.insurance,{iv:{insWorking:['salon'],insTurnover:1000},country:'England'});
  assert.deepEqual(c.answers.membership.f,{level:'full_salon',branch:'beauty',branches:['hair'],billing:'monthly',addons:{badge:2},insurance:true,start:'2099-01-01'});
  assert.equal(c.answers.membership.d.postcode,'LS1 1AA');
});
test('the saved Buy insurance answers carry country, start date and answers without confirmations',()=>{
  const b=buyDraft({values:IV,country:'Wales',start:'2099-02-02'});
  assert.equal(b.service,'insurance');
  assert.deepEqual(b.answers.insurance,{iv:{insWorking:['salon'],insTurnover:1000},country:'Wales',start:'2099-02-02'});
  assert.deepEqual(noConfirmations(undefined),{});
});
test('resuming a Join draft restores the answers, clears agreement and confirmations, and keeps a reference for saving again',()=>{
  const s=fakeStorage();s.setItem('bg_buy_stale','x');
  const draft={id:'9',service:'combined',journeyId:'j',revision:3,answers:{membership:{f:{...F,insurance:true,accepted:true},d:D},insurance:{iv:IV,country:'England'}}};
  assert.equal(restoreDraftToTab(draft,s),'/membership/buy');
  const f=readStored('membership',{},s);
  assert.equal(f.accepted,false);assert.equal(f.insurance,true);assert.equal(f.level,'full_salon');assert.equal(f.start,'2099-01-01');
  assert.deepEqual(readStored('membership_details',{},s),D);
  const k=readStored('membership_insurance',{},s);
  assert.equal(k.country,'England');for(const c of CONFIRMATIONS)assert.equal(k.iv[c],undefined);
  assert.ok(!s.data.has('bg_buy_stale'),'earlier answers are cleared first');
  assert.deepEqual(draftRef(s),{id:'9',service:'combined',journeyId:'j',revision:3});
});
test('a membership-only draft turns insurance off, and a start date in the past is dropped',()=>{
  const s=fakeStorage(),draft={id:'9',service:'membership',journeyId:'j',revision:1,answers:{membership:{f:{...F,insurance:true,start:'2000-01-01'},d:D}}};
  restoreDraftToTab(draft,s);
  const f=readStored('membership',{},s);assert.equal(f.insurance,false);assert.equal(f.start,'');
  assert.ok(!s.data.has('bg_buy_membership_insurance'));
});
test('resuming an insurance draft opens Buy insurance with its answers; older drafts are left to the old form',()=>{
  const s=fakeStorage(),draft={id:'7',service:'insurance',journeyId:'j',revision:2,answers:{insurance:{iv:IV,country:'Wales',start:startLimits().min}}};
  assert.equal(restoreDraftToTab(draft,s),'/insurance/buy');
  const v=readStored('insurance',{},s);assert.equal(v.country,'Wales');assert.equal(v.values.insInformationAccurate,undefined);assert.equal(v.values.insTurnover,1000);
  assert.equal(restoreDraftToTab({id:'1',service:'membership',answers:{level:'x'}},fakeStorage()),null);
  assert.equal(restoreDraftToTab({id:'1',service:'insurance',answers:{a:1}},fakeStorage()),null);
});
test('the first save creates a draft with a fresh journey id and the name for a new Contact; the next save updates it with the revision',async()=>{
  const s=fakeStorage(),api=fakeApi(),payload={service:'insurance',answers:{insurance:{iv:{},country:'Wales',start:''}},names:{firstName:'Nia',lastName:'Bright'}};
  await saveDraft(api,payload,s);
  assert.equal(api.calls[0][0],'create');assert.match(api.calls[0][1].journeyId,/^[0-9a-f-]{36}$/);assert.deepEqual(api.calls[0][1].contact,{firstName:'Nia',lastName:'Bright'});
  assert.equal(draftRef(s).revision,1);
  await saveDraft(api,payload,s);
  assert.deepEqual(api.calls[1].slice(0,3),['update','insurance','111']);assert.equal(api.calls[1][3].revision,1);assert.equal(api.calls[1][3].journeyId,api.calls[0][1].journeyId);
  assert.equal(draftRef(s).revision,2);
});
test('a conflict is thrown for the page to explain, and the saved reference is kept',async()=>{
  const s=fakeStorage();writeStored('draft',{id:'5',service:'insurance',journeyId:'j',revision:1},s);
  const err=Object.assign(new Error('changed'),{status:409,code:'REVISION_CONFLICT'});
  await assert.rejects(saveDraft(fakeApi({updateDraft:async()=>{throw err;}}),{service:'insurance',answers:{}},s),e=>e.code==='REVISION_CONFLICT');
  assert.equal(draftRef(s).id,'5');
});
test('changing between membership and combined replaces the draft; a draft that is gone is started again',async()=>{
  const s=fakeStorage(),api=fakeApi();writeStored('draft',{id:'5',service:'membership',journeyId:'j',revision:1},s);
  await saveDraft(api,{service:'combined',answers:{}},s);
  assert.deepEqual(api.calls.map(c=>c[0]),['create','discard']);assert.deepEqual(api.calls[1],['discard','membership','5']);
  const gone=fakeApi({updateDraft:async()=>{throw Object.assign(new Error('x'),{status:404,code:'NOT_FOUND'});}});
  await saveDraft(gone,{service:'combined',answers:{}},s);
  assert.equal(gone.calls[0][0],'create');assert.notEqual(gone.calls[0][1].journeyId,'j');
});
test('the pending save after sign-in is taken once',()=>{
  const s=fakeStorage();assert.equal(takeSavePending(s),false);
  setSavePending(true,s);assert.equal(takeSavePending(s),true);assert.equal(takeSavePending(s),false);
});
test('after a successful payment the matching draft is discarded and the tab is cleared; a different kind is left',async()=>{
  const s=fakeStorage(),api=fakeApi();writeStored('draft',{id:'5',service:'combined',journeyId:'j',revision:1},s);writeStored('membership',{a:1},s);
  assert.equal(await finishPaidDraft(api,'membership',s),true);
  assert.deepEqual(api.calls,[['discard','combined','5']]);assert.equal(s.data.size,0);
  const other=fakeApi(),t=fakeStorage();writeStored('draft',{id:'6',service:'insurance',journeyId:'j',revision:1},t);
  assert.equal(await finishPaidDraft(other,'membership',t),false);assert.equal(other.calls.length,0);
  assert.equal(await finishPaidDraft(fakeApi({discardDraft:async()=>{throw new Error('x');}}),'insurance',(()=>{const u=fakeStorage();writeStored('draft',{id:'6',service:'insurance'},u);return u;})()),false);
});
