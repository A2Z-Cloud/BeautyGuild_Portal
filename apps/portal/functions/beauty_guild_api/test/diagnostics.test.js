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
