'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {createApp} = require('../src/app');
const {loadConfig} = require('../src/config');
const {parsePath, folderIdFromLink} = require('../src/documents');

function rows() {
 const data = new Map();
 let seq = 10000000000001;
 return {
  async insertRow(row){const r={...row,ROWID:String(seq++)};data.set(r.ROWID,r);return r;},
  async getRow(id){return data.get(String(id))||null;},
  async updateRow(row){const r={...data.get(String(row.ROWID)),...row};data.set(String(row.ROWID),r);return r;},
  async deleteRow(id){data.delete(String(id));},
  async getPagedRows(){return {data:[...data.values()],nextToken:null};}
 };
}
async function withApp(overrides,fn){
 const app=createApp({
  config:loadConfig({PORTAL_RECORDS_ENABLED:'true',PORTAL_BILLING_ENABLED:'true',PORTAL_DOCUMENTS_ENABLED:'true',STRIPE_SECRET_KEY:'sk_test_example_only',PORTAL_PUBLIC_ORIGIN:'https://preview.example.test'}),
  getCurrentUser:async()=>({id:'user-1',email:'alice@example.test'}),
  getCrmHeaders:async()=>({Authorization:'Bearer test'}),
  getWorkdriveHeaders:async()=>({Authorization:'Bearer wd-test'}),
  ...overrides,
 });
 const server=await new Promise(resolve=>{
  const result=app.listen(0,'127.0.0.1',()=>resolve(result));
 });
 try{
   const call=async(path,init)=>{
    const response=await fetch('http://127.0.0.1:'+server.address().port+path,init);
    const body=await response.json();
    return {status:response.status,body};
   };
   await fn({call});
 }finally{await new Promise(resolve=>server.close(resolve));}
}
test('Record reads require an authenticated account and never accept a browser contactId',async()=>{
 await withApp({getCurrentUser:async()=>null},async({call})=>{
  assert.equal((await call('/portal/records/?kind=membership&contactId=someone-else')).status,401);
 });
});
test('CRM Contact must be an exact unique match for the authenticated email',async()=>{
 const fetchImpl=async()=>({status:200,ok:true,json:async()=>({data:[
  {id:'111',Email:'alice@example.test'},{id:'112',Email:'alice@example.test'}
 ]})});
 await withApp({fetchImpl},async({call})=>{
  assert.equal((await call('/portal/records/')).status,409);
 });
});
test('CRM listings filter out records whose owner is not the verified Contact',async()=>{
 const fetchImpl=async(url)=>{
  let entries=[];
  if(String(url).includes('Contacts/search'))entries=[{id:'111',Email:'alice@example.test'}];
  if(String(url).includes('Deals/search'))entries=[
   {id:'501',Deal_Name:'Alice',Contact_Name:{id:'111'},Stage:'Active'},
   {id:'502',Deal_Name:'Bob',Contact_Name:{id:'222'},Stage:'Active'}
  ];
  return {status:200,ok:true,json:async()=>({data:entries})};
 };
 await withApp({fetchImpl},async({call})=>{
   const result=await call('/portal/records/?kind=membership');
   assert.equal(result.status,200);
   assert.equal(result.body.records.length,1);
   assert.equal(result.body.records[0].title,'Alice');
 });
});
test('CRM individual record with mismatched owner returns 404',async()=>{
 const fetchImpl=async(url)=>{
  const entries=String(url).includes('Contacts/search')?[{id:'111',Email:'alice@example.test'}]:
   [{id:'501',Deal_Name:'Bob',Contact_Name:{id:'222'},Stage:'Active'}];
  return {status:200,ok:true,json:async()=>({data:entries})};
 };
 await withApp({fetchImpl},async({call})=>{
  assert.equal((await call('/portal/records/membership/501')).status,404);
 });
});
test('Documents reject traversal and non-WorkDrive roots',()=>{
 assert.deepEqual(parsePath('abc.def'),['abc','def']);
 assert.throws(()=>parsePath('abc...def'));
 assert.equal(folderIdFromLink('https://example.test/abc'),null);
 assert.equal(folderIdFromLink('https://workdrive.zoho.eu/folder/exampleABC'), 'exampleABC');
});
test('Document download denies unauthorized record even if fileId is known',async()=>{
 const fetchImpl=async(url)=>{
  const entries=String(url).includes('Contacts/search')?[{id:'111',Email:'alice@example.test'}]:
    [{id:'501',Contact_Name:{id:'222'},Workdrive_Link:'https://workdrive.zoho.eu/folder/exampleABC'}];
  return {status:200,ok:true,json:async()=>({data:entries})};
 };
 await withApp({fetchImpl},async({call})=>{
  const result=await call('/portal/documents/membership/501/file/ABC123');
  assert.equal(result.status,404);
 });
});
test('a Referred insurance application is shown to its owner read-only as With the Insurance team; Stopped stays hidden',async()=>{
 const owner={id:'1011174000000000001'},other={id:'1011174000000000009'};
 const rows={
  '1':{id:'1',Policy_Type:'Salon',Application_Status:'Active',Contact:owner},
  '2':{id:'2',Policy_Type:'Salon',Application_Status:'Referred',Risk_Status:'Referred',Quoted_Amount:120,Quote_Expiry:'2099-01-01',Stripe_Checkout_Session_ID:'cs_x',Contact:owner},
  '3':{id:'3',Policy_Type:'Salon',Application_Status:'Referred',Risk_Status:'Stopped',Contact:owner}};
 const fetchImpl=async url=>{
  url=String(url);
  const json=body=>({status:200,ok:true,json:async()=>body});
  if(url.includes('Contacts/search'))return json({data:[{id:owner.id,Email:'alice@example.test'}]});
  if(url.includes('Insurance_Policy/search'))return json({data:Object.values(rows)});
  const m=url.match(/Insurance_Policy\/(\d+)\?/);
  if(m)return json({data:[{...rows[m[1].slice(-1)]||rows['2'],id:m[1],Contact:m[1].endsWith('7')?other:owner,...(m[1].endsWith('3')?rows['3']:m[1].endsWith('2')?rows['2']:{})}]});
  return json({data:[]});
 };
 await withApp({fetchImpl},async({call})=>{
  const list=await call('/portal/records/?kind=insurance');
  assert.deepEqual(list.body.records.map(r=>[r.id,r.status]),[['1','Active'],['2','With the Insurance team']]);
  const review=list.body.records[1];
  assert.deepEqual([review.underReview,review.canPay,review.quotedAmount],[true,false,null]);
  const one=await call('/portal/records/insurance/1011174000000000002');
  assert.equal(one.status,200);
  assert.deepEqual([one.body.record.status,one.body.record.underReview,one.body.record.canPay],['With the Insurance team',true,false]);
  assert.equal((await call('/portal/records/insurance/1011174000000000003')).status,404);
  assert.equal((await call('/portal/records/insurance/1011174000000000007')).status,404);
  const summary=await call('/portal/records/summary');
  assert.equal(summary.body.summary.insurance,2);
 });
});
