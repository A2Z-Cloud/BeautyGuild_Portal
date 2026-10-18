'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {createApp} = require('../src/app');
const {loadConfig} = require('../src/config');
const {verifyStripe, money} = require('../src/billing');
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
 const quotes=rows(),payments=rows();
 const app=createApp({
  config:loadConfig({PORTAL_RECORDS_ENABLED:'true',PORTAL_BILLING_ENABLED:'true',PORTAL_DOCUMENTS_ENABLED:'true',STRIPE_SECRET_KEY:'sk_test_example_only',STRIPE_WEBHOOK_SECRET:'whsec_example_only',PORTAL_PUBLIC_ORIGIN:'https://preview.example.test'}),
  getCurrentUser:async()=>({id:'user-1',email:'alice@example.test'}),
  getCrmHeaders:async()=>({Authorization:'Bearer test'}),
  getWorkdriveHeaders:async()=>({Authorization:'Bearer wd-test'}),
  getQuoteTable:async()=>quotes,getPaymentTable:async()=>payments,
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
   await fn({call,quotes,payments});
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
test('Stripe signature verifies timestamp and cannot be forged or replayed late',()=>{
 const payload='{"type":"checkout.session.completed"}',secret='whsec_demo';
 const ts=Math.floor(Date.now()/1000);
 const signature=crypto.createHmac('sha256',secret).update(ts+'.'+payload).digest('hex');
 assert.equal(verifyStripe(payload,'t='+ts+',v1='+signature,secret),true);
 assert.equal(verifyStripe(payload,'t='+ts+',v1='+'f'.repeat(64),secret),false);
 assert.equal(verifyStripe(payload,'t=1,v1='+signature,secret),false);
});
test('Server refuses unapproved or malformed payable amounts',()=>{
 assert.equal(money({Amount_Pence:1250}),1250);
 assert.throws(()=>money({Amount_Pence:0}));
 assert.throws(()=>money({Amount_Pence:-20}));
 assert.throws(()=>money({Amount_Pence:'something'}));
});
test('Stripe quote is not payable when referral decision is not PASS',async()=>{
 await withApp({stripeKey:'sk_test_fake',webhookSecret:'whsec_fake',publicOrigin:'https://preview.example.test'},async({call,quotes})=>{
  const quote=await quotes.insertRow({Owner_User_ID:'user-1',Service:'insurance',Status:'APPROVED',Decision:'REFER',Amount_Pence:1234});
  const r=await call('/portal/billing/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({quoteId:quote.ROWID})});
  assert.equal(r.status,409);
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
