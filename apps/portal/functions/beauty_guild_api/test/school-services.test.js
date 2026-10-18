'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {loadConfig}=require('../src/config');
const {createApp}=require('../src/app');
const {mapInvoice}=require('../src/schoolServices');

const cfg=loadConfig({PORTAL_SCHOOL_SERVICES_ENABLED:'true'});
function upstream(url) {
 const str=String(url),u=decodeURIComponent(str);
 if(u.includes('Contacts/search'))return {data:[{id:'101',Catalyst_User_ID:'cat-1'}]};
 if(u.includes('Training_Centre_Accred/search'))return {data:[{id:'301',Applicant_Contact:{id:'101'},Account:{id:'201',name:'Grace School'},Accreditation_Status:'Accredited'}]};
 if(u.includes('Training_Centre_Accred/301'))return {data:[{id:'301',Applicant_Contact:{id:'101'},Account:{id:'201',name:'Grace School'},Accreditation_Status:'Accredited'}]};
 if(u.includes('Training_Centre_Accred/302'))return {data:[{id:'302',Applicant_Contact:{id:'other'},Account:{id:'202',name:'Other School'}}]};
 if(u.includes('Deals/1000000000401'))return {data:[{id:'1000000000401',Contact_Name:{id:'101'}}]};
 if(u.includes('Deals/1000000000402'))return {data:[{id:'1000000000402',Contact_Name:{id:'other'}}]};
 if(u.includes('Membership_Extension/search'))return {data:[{id:'100',Extension_Type:'Branch',Membership_Branch:'Nails',Status:'Active'}]};
 if(u.includes('/creator/'))return {code:3000,data:[{ID:'901',invoice_number:'123',payment_amount:'75.35',invoice_status:'Paid',crm_membership_id:'1000000000401'}]};
 return {data:[]};
}
async function withServer(args,action){
 const app=createApp({config:cfg,getCurrentUser:async()=>({id:'cat-1',email:'owner@example.test'}),
  getCrmHeaders:async()=>({Authorization:'Bearer crm'}),getCreatorHeaders:async()=>({Authorization:'Bearer creator'}),
  fetchImpl:async url=>({status:200,ok:true,json:async()=>upstream(url)}),
  ...args});
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 const base='http://127.0.0.1:'+server.address().port;
 try{
  await action(async path=>{const response=await fetch(base+path);return {status:response.status,body:await response.json()};});
 }finally{await new Promise(resolve=>server.close(resolve));}
}
test('invoice mapping follows V1 Creator data fields',()=>{
 assert.deepEqual(mapInvoice({ID:'1',invoice_number:'41',payment_amount:'80.25',invoice_status:'Paid',crm_membership_id:'555'}),
 {id:'1',invoiceNumber:'41',type:'Membership',invoiceDate:null,dueDate:null,paymentDate:null,amount:80.25,status:'Paid'});
});
test('requires Catalyst identity before any school or invoice data',async()=>{
 await withServer({getCurrentUser:async()=>null},async call=>{
  assert.equal((await call('/portal/management/schools')).status,1000000000401);
  assert.equal((await call('/portal/management/invoices')).status,1000000000401);
 });
});
test('school listing only includes owned accreditations',async()=>{
 await withServer({},async call=>{
  const r=await call('/portal/management/schools');
  assert.equal(r.status,200);assert.equal(r.body.schools[0].name,'Grace School');
 });
});
test('another Contact cannot open a school by changing its ID',async()=>{
 await withServer({},async call=>{
  assert.equal((await call('/portal/management/schools/302/profile')).status,404);
  assert.equal((await call('/portal/management/schools/abc/profile')).status,404);
 });
});
test('Creator invoices are scoped using verified Contact id, not a caller-provided id',async()=>{
 let url='';
 await withServer({fetchImpl:async u=>{url=String(u);return{status:200,ok:true,json:async()=>upstream(u)};}},async call=>{
  let r=await call('/portal/management/invoices?contactId=somebodyelse');
  assert.equal(r.status,200);
  assert.equal(r.body.invoices[0].amount,75.35);
  assert.ok(decodeURIComponent(url).includes('crm_contact_id == "101"'));
  assert.ok(!url.includes('somebodyelse'));
 });
});
test('specific membership invoicing requires owner match before calling Creator',async()=>{
 await withServer({},async call=>{
  assert.equal((await call('/portal/management/memberships/1000000000402/invoices')).status,404);
  const r=await call('/portal/management/memberships/1000000000401/invoices');
  assert.equal(r.status,200);assert.equal(r.body.invoices.length,1);
 });
});
test('invoice routes are disabled unless explicitly configured',async()=>{
 await withServer({config:loadConfig({})},async call=>{
  assert.equal((await call('/portal/management/invoices')).status,503);
 });
});
