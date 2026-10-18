'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {loadConfig}=require('../src/config');
const {createApp}=require('../src/app');

const JOURNEY='b0fd218f-9ad6-4c13-9b78-2830f3e270b0';
const ME={id:'cat-1',email:'owner@example.test'};
const env={PORTAL_CRM_DRAFTS_ENABLED:'true',PORTAL_RECORDS_ENABLED:'true',PORTAL_CRM_DRAFT_STATUS:'Draft',PORTAL_CRM_DRAFT_DEAL_STAGE:'Draft'};
const FIELDS=['Application_Status','Journey_ID','Last_Completed_Journey_Step','Draft_State_Reference','Draft_Saved_At','Contact','Membership','Contact_Name','Stage','Deal_Name']
 .map(api_name=>({api_name,data_type:['Contact','Contact_Name','Membership'].includes(api_name)?'lookup':api_name==='Stage'||api_name==='Application_Status'?'picklist':'text',
  unique:api_name==='Journey_ID'?{id:'1'}:undefined,pick_list_values:[{actual_value:'Draft'}]}));

// A small stateful stand-in for Zoho CRM, recording every call.
function fakeCrm({contacts=[{id:'1000000000101',Email:ME.email}],deals=[]}={}){
  const calls=[],store={Insurance_Policy:[],Deals:deals,Notes:[]};let seq=2000000000000;
  const json=(body,status=200)=>({status,ok:status<300,json:async()=>body});
  const fetchImpl=async(url,opts={})=>{
    const u=decodeURIComponent(String(url)),method=opts.method||'GET',body=opts.body?JSON.parse(opts.body):null;
    calls.push({method,u,body});
    if(u.includes('/Contacts/search'))return json({data:contacts});
    if(u.includes('/settings/fields'))return json({fields:FIELDS});
    const m=u.match(/\/crm\/v3\/([A-Za-z_]+)(?:\/(\d+))?(\/Notes)?(?:\/search|\?|$)/);
    const mod=m&&m[1],id=m&&m[2];
    if(u.includes('/search')&&store[mod]){
      const j=u.match(/Journey_ID:equals:([0-9a-f-]+)/);
      return json({data:store[mod].filter(r=>!j||r.Journey_ID===j[1])});
    }
    if(method==='POST'&&m&&m[3]){const note={id:String(++seq),...body.data[0]};store.Notes.push(note);return json({data:[{status:'success',details:{id:note.id}}]});}
    if(method==='POST'&&store[mod]){
      const row=body.data[0];
      if(store[mod].some(r=>r.Journey_ID===row.Journey_ID))return json({data:[{status:'error',code:'DUPLICATE_DATA'}]},400);
      const rec={id:String(++seq),...row};store[mod].push(rec);return json({data:[{status:'success',details:{id:rec.id}}]});
    }
    if(method==='PUT'&&mod==='Notes'){const n=store.Notes.find(x=>x.id===id);Object.assign(n,body.data[0]);return json({data:[{status:'success'}]});}
    if(method==='PUT'&&store[mod]){Object.assign(store[mod].find(x=>x.id===id),body.data[0]);return json({data:[{status:'success'}]});}
    if(method==='GET'&&mod==='Notes')return json({data:[store.Notes.find(x=>x.id===id)]});
    if(method==='GET'&&store[mod]&&id){const r=store[mod].find(x=>x.id===id);return json({data:r?[r]:[]});}
    return json({data:[]});
  };
  return {fetchImpl,calls,store};
}
async function withApp(crm,action,user=ME){
  const app=createApp({config:loadConfig(env),getCurrentUser:async()=>user,getCrmHeaders:async()=>({Authorization:'t'}),
    getCreatorHeaders:async()=>({}),fetchImpl:crm.fetchImpl,log:()=>{}});
  const server=await new Promise(ok=>{const s=app.listen(0,'127.0.0.1',()=>ok(s));});
  const base='http://127.0.0.1:'+server.address().port;
  try{await action(async(path,init)=>{const r=await fetch(base+path,init);return {status:r.status,body:await r.json()};});}
  finally{await new Promise(ok=>server.close(ok));}
}
const send=(method,body)=>({method,headers:{'content-type':'application/json'},body:JSON.stringify(body)});
const draft=(extra={})=>({service:'insurance',journeyId:JOURNEY,step:2,answers:{a:1},...extra});

test('drafts identify the Contact by verified email, never by a Catalyst user field',async()=>{
  const crm=fakeCrm();
  await withApp(crm,async call=>{
    assert.equal((await call('/portal/drafts/',send('POST',draft()))).status,201);
    const search=crm.calls.find(c=>c.u.includes('/Contacts/search'));
    assert.ok(search.u.includes('email=owner@example.test'));
    assert.ok(!crm.calls.some(c=>c.u.includes('Catalyst_User_ID')));
  });
  await withApp(fakeCrm({contacts:[]}),async call=>assert.equal((await call('/portal/drafts/',send('POST',draft()))).status,404));
  await withApp(fakeCrm({contacts:[{id:'1000000000101',Email:ME.email},{id:'1000000000102',Email:ME.email}]}),
    async call=>assert.equal((await call('/portal/drafts/',send('POST',draft()))).status,409));
});

test('a first save is a plain create, never an upsert, and a repeat journey is rejected',async()=>{
  const crm=fakeCrm();
  await withApp(crm,async call=>{
    const first=await call('/portal/drafts/',send('POST',draft()));
    assert.equal(first.status,201);assert.equal(first.body.draft.revision,1);
    assert.ok(!crm.calls.some(c=>c.u.includes('/upsert')),'no upsert is used');
    assert.ok(crm.calls.some(c=>c.method==='POST'&&/\/crm\/v3\/Insurance_Policy$/.test(c.u)));
    // saving the same journey again without a revision must not silently overwrite it
    const again=await call('/portal/drafts/',send('POST',draft()));
    assert.equal(again.status,422);assert.equal(again.body.code,'REVISION_REQUIRED');
  });
});

test('updating a draft needs the current revision',async()=>{
  const crm=fakeCrm();
  await withApp(crm,async call=>{
    const made=(await call('/portal/drafts/',send('POST',draft()))).body.draft;
    const url='/portal/drafts/insurance/'+made.id;
    const noRev=await call(url,send('PUT',draft({step:3})));
    assert.equal(noRev.status,422);assert.equal(noRev.body.code,'REVISION_REQUIRED');
    const stale=await call(url,send('PUT',draft({step:3,revision:5})));
    assert.equal(stale.status,409);assert.equal(stale.body.code,'REVISION_CONFLICT');
    const ok=await call(url,send('PUT',draft({step:3,revision:1})));
    assert.equal(ok.status,200);assert.equal(ok.body.draft.revision,2);
  });
});

test('saved drafts are never listed as real memberships when CRM drafts are on',async()=>{
  const owner={id:'1000000000101'};
  const deals=[
    {id:'3000000000001',Deal_Name:'Real membership',Stage:'Closed Won',Contact_Name:owner,Application_Status:'Paid',Modified_Time:'2026-10-02'},
    {id:'3000000000002',Deal_Name:'Membership application b0fd218f',Stage:'Draft',Contact_Name:owner,Application_Status:'Draft',Modified_Time:'2026-10-03'},
  ];
  const crm=fakeCrm({deals});
  await withApp(crm,async call=>{
    const list=await call('/portal/records/?kind=membership');
    assert.equal(list.status,200);
    assert.deepEqual(list.body.records.map(r=>r.id),['3000000000001']);
    assert.equal((await call('/portal/records/membership/3000000000002')).status,404);
    assert.equal((await call('/portal/records/membership/3000000000001')).status,200);
    assert.ok(crm.calls.some(c=>c.u.includes('Application_Status')&&c.u.includes('Deals')),'the status field is requested so drafts can be told apart');
  });
});
