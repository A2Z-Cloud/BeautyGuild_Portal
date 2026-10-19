'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {loadConfig}=require('../src/config');
const {createApp}=require('../src/app');
const json=(body,status=200)=>({status,ok:status<300,json:async()=>body});
const FIELDS={fields:[{api_name:'School_Registration_Number',field_label:'School Registration Number',data_type:'text',custom_field:true,unique:{id:'1'},
  record_value:'SECRET-SHOULD-NOT-APPEAR',pick_list_values:[]},{api_name:'Email',field_label:'Email',data_type:'email'}]};
async function withApp(env,user,action){
  const calls=[];
  const app=createApp({config:loadConfig(env),getCurrentUser:async()=>user,getCrmHeaders:async()=>({Authorization:'t'}),getCreatorHeaders:async()=>({}),log:()=>{},
    fetchImpl:async u=>{calls.push(String(u));return json(String(u).includes('settings/modules')?{modules:[{api_name:'Accounts',plural_label:'Accounts',generated_type:'default'}]}:FIELDS);}});
  const server=await new Promise(ok=>{const s=app.listen(0,'127.0.0.1',()=>ok(s));});
  try{await action(async p=>{const r=await fetch('http://127.0.0.1:'+server.address().port+p);return {status:r.status,body:await r.json()};},calls);}
  finally{await new Promise(ok=>server.close(ok));}
}
const on={PORTAL_DIAGNOSTICS_ENABLED:'true',PORTAL_DIAGNOSTICS_EMAILS:'Owner@Example.test'};
test('diagnostics are invisible unless enabled and the user is on the allow list',async()=>{
  await withApp({},{id:'1',email:'owner@example.test'},async(get,calls)=>{assert.equal((await get('/portal/diagnostics/modules')).status,404);assert.equal(calls.length,0);});
  await withApp(on,{id:'2',email:'someone@example.test'},async(get,calls)=>{assert.equal((await get('/portal/diagnostics/fields?module=Accounts')).status,404);assert.equal(calls.length,0);});
  await withApp(on,null,async(get)=>assert.equal((await get('/portal/diagnostics/modules')).status,404));
  await withApp({PORTAL_DIAGNOSTICS_ENABLED:'true'},{id:'1',email:'owner@example.test'},async(get)=>assert.equal((await get('/portal/diagnostics/modules')).status,404));
});
test('an allowed user gets field metadata only, never record values',async()=>{
  await withApp(on,{id:'1',email:'owner@example.test'},async(get,calls)=>{
    const r=await get('/portal/diagnostics/fields?module=Accounts');
    assert.equal(r.status,200);assert.equal(r.body.fields[0].api_name,'School_Registration_Number');assert.equal(r.body.fields[0].unique,true);
    assert.ok(!JSON.stringify(r.body).includes('SECRET'));
    assert.ok(calls[0].includes('settings/fields?module=Accounts'));
    const f=await get('/portal/diagnostics/find?modules=Accounts&q=registration');
    assert.equal(f.body.found.Accounts.length,1);
    assert.equal((await get('/portal/diagnostics/fields?module=bad/../x')).status,400);
    assert.equal((await get('/portal/diagnostics/modules')).body.modules[0].api_name,'Accounts');
  });
});
test('the risk diagnostics return names and freshness only, never list or postcode values',async()=>{
 const env={...on,PORTAL_RISK_SANCTIONS:'true',ANALYTICS_ORG_ID:'555',ANALYTICS_WORKSPACE_ID:'W1'};
 const text=body=>({status:200,ok:true,json:async()=>body,text:async()=>String(body)});
 const app=createApp({config:loadConfig(env),getCurrentUser:async()=>({id:'1',email:'owner@example.test'}),getCrmHeaders:async()=>({}),getAnalyticsHeaders:async()=>({}),getCreatorHeaders:async()=>({}),log:()=>{},
  fetchImpl:async u=>{
   u=String(u);
   if(u.endsWith('/orgs'))return text({data:{orgs:[{orgId:'555',orgName:'Guild'}]}});
   if(u.includes('/views?CONFIG'))return text({data:{views:[{viewId:'V1',viewName:'UK-Sanctions-List'}]}});
   if(u.endsWith('/views/V1'))return text({data:{views:{lastModifiedTime:'1760000000000'}}});
   if(u.includes('/data?CONFIG='))return text({data:{jobId:decodeURIComponent(u).includes('COUNT')?'JC':'JS'}});
   if(u.endsWith('/exportjobs/JC/data'))return text('n\n58609');
   if(u.endsWith('/exportjobs/JS/data'))return text('Unique ID,Name 6\nA1,SECRET-NAME');
   if(u.includes('/exportjobs/'))return text({data:{jobCode:1004}});
   if(u.includes('/creator/v2.1/'))return text({code:3000,data:[{Postcode_Key:'SECRET-POSTCODE',Outcome:'Refer'}]});
   return text({},404);
  }});
 const server=await new Promise(ok=>{const s=app.listen(0,'127.0.0.1',()=>ok(s));});
 try{
  const get=async p=>{const r=await fetch('http://127.0.0.1:'+server.address().port+p);return {status:r.status,body:await r.json()};};
  const a=await get('/portal/diagnostics/analytics');
  assert.equal(a.status,200);
  assert.deepEqual(a.body.columns,['Unique ID','Name 6']);
  assert.equal(a.body.rows,58609);
  assert.equal(a.body.orgs[0].orgId,'555');
  const c=await get('/portal/diagnostics/creator-report?report=All_Flood_Postcodes');
  assert.deepEqual(c.body.fields,['Postcode_Key','Outcome']);
  assert.ok(!JSON.stringify([a.body,c.body]).includes('SECRET'));
  assert.equal((await get('/portal/diagnostics/creator-report?report=Other_Report')).status,400);
 }finally{await new Promise(ok=>server.close(ok));}
});
