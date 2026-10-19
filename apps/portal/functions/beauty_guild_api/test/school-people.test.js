'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {loadConfig}=require('../src/config');
const {createApp}=require('../src/app');

const SCHOOL='1000000000301',ACCOUNT='1000000000201',SESSION='1000000000601';
const OWNER={id:'1000000000101',Email:'owner@example.test'};
const cfg=loadConfig({PORTAL_SCHOOL_SERVICES_ENABLED:'true',PORTAL_SCHOOL_WRITES_ENABLED:'true'});
const ok=(body,status=200)=>({status,ok:status<300,json:async()=>body});

// Stand-in for CRM and Creator. `world` can be changed per test.
function fake(world={}){
  const calls=[];
  const w={contactsByEmail:{},relationships:[],deals:[],session:{ID:SESSION,account1:{ID:ACCOUNT},availability_type:'Fixed Date',instant_booking_available:'true',
    session_start_date_time:'01-Nov-2027 09:00:00',maximum_places:10},bookings:[],...world};
  const fetchImpl=async(url,opts={})=>{
    const u=decodeURIComponent(String(url)),method=opts.method||'GET',body=opts.body?JSON.parse(opts.body):null;
    calls.push({method,u,body});
    if(u.includes('/Contacts/search')){
      const e=(u.match(/email=([^&]+)/)||[])[1];
      if(e==='owner@example.test')return ok({data:[OWNER]});
      return ok({data:w.contactsByEmail[e]||[]});
    }
    if(method==='POST'&&u.endsWith('/crm/v3/Contacts'))return ok({data:[{status:'success',details:{id:'2000000000001'}}]});
    if(method==='POST'&&u.endsWith('/crm/v3/Tutor_Relationships'))return ok({data:[{status:'success',details:{id:'2000000000002'}}]});
    if(u.includes('Training_Centre_Accred/'+SCHOOL))return ok({data:[{id:SCHOOL,Applicant_Contact:{id:OWNER.id},Account:{id:ACCOUNT,name:'Grace School'}}]});
    if(u.includes('Training_Centre_Accred/search'))return ok({data:w.accreditations||[]});
    if(u.includes('/crm/v3/Accounts/'+ACCOUNT))return ok({data:[{id:ACCOUNT,School_Registration_Number:w.registration||null}]});
    if(u.includes('Tutor_Relationships/search'))return ok({data:w.relationships});
    if(u.includes('Deals/search'))return ok({data:w.deals});
    if(method==='POST'&&u.includes('/creator/'))return ok({code:3000,data:{ID:'booking1'}});
    if(u.includes('Course_Sessions_Report'))return ok({code:3000,data:w.session?[w.session]:[]});
    if(u.includes('All_Diary_Date_Bookings'))return ok({code:3000,data:w.bookings});
    return ok({data:[]});
  };
  return {fetchImpl,calls,writes:()=>calls.filter(c=>c.method==='POST')};
}
async function getJson(f,path,config=cfg){
  const app=createApp({config,getCurrentUser:async()=>({id:'cat-1',email:OWNER.Email}),getCrmHeaders:async()=>({}),getCreatorHeaders:async()=>({}),fetchImpl:f.fetchImpl,log:()=>{}});
  const server=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});
  try{const r=await fetch('http://127.0.0.1:'+server.address().port+path);return {status:r.status,body:await r.json()};}finally{await new Promise(r=>server.close(r));}
}
async function withApp(f,action,config=cfg){
  const app=createApp({config,getCurrentUser:async()=>({id:'cat-1',email:OWNER.Email}),getCrmHeaders:async()=>({}),getCreatorHeaders:async()=>({}),fetchImpl:f.fetchImpl,log:()=>{}});
  const server=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});
  try{await action(async(path,body)=>{const r=await fetch('http://127.0.0.1:'+server.address().port+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body||{})});return {status:r.status,body:await r.json()};});}
  finally{await new Promise(r=>server.close(r));}
}
const tutorUrl='/portal/management/schools/'+SCHOOL+'/tutors';
const bookUrl='/portal/management/schools/'+SCHOOL+'/sessions/'+SESSION+'/bookings';

test('adding a tutor creates the Contact and an Inactive link for someone new',async()=>{
  const f=fake();
  await withApp(f,async post=>{
    const r=await post(tutorUrl,{name:'Jo Tutor',email:'Jo@Example.test'});
    assert.equal(r.status,201);assert.equal(r.body.status,'Inactive');assert.equal(r.body.alreadyLinked,false);
    const contact=f.writes().find(c=>c.u.endsWith('/Contacts'));
    assert.deepEqual(contact.body.data[0],{Email:'jo@example.test',First_Name:'Jo',Last_Name:'Tutor'});
    const link=f.writes().find(c=>c.u.endsWith('/Tutor_Relationships'));
    assert.equal(link.body.data[0].Account,ACCOUNT);assert.equal(link.body.data[0].Status,'Inactive');
  });
});
test('an existing tutor is not duplicated, and one with a current membership becomes Active',async()=>{
  const existing={'jo@example.test':[{id:'3000000000001',Email:'jo@example.test'}]};
  const linked=fake({contactsByEmail:existing,relationships:[{id:'1',Status:'Active'}]});
  await withApp(linked,async post=>{
    const r=await post(tutorUrl,{name:'Jo Tutor',email:'jo@example.test'});
    assert.equal(r.status,200);assert.equal(r.body.alreadyLinked,true);assert.equal(linked.writes().length,0);
  });
  const member=fake({contactsByEmail:existing,deals:[{Stage:'Active',Membership_Type:'Associate Member',Expiry_Date:'2999-01-01'}]});
  await withApp(member,async post=>{
    const r=await post(tutorUrl,{name:'Jo Tutor',email:'jo@example.test'});
    assert.equal(r.status,201);assert.equal(r.body.status,'Active');
    assert.ok(!member.writes().some(c=>c.u.endsWith('/Contacts')),'the existing Contact is reused');
  });
  const expired=fake({contactsByEmail:existing,deals:[{Stage:'Active',Membership_Type:'Associate Member',Expiry_Date:'2001-01-01'}]});
  await withApp(expired,async post=>assert.equal((await post(tutorUrl,{name:'Jo Tutor',email:'jo@example.test'})).body.status,'Inactive'));
});
test('tutor input is validated and duplicate Contacts are refused before any write',async()=>{
  const f=fake({contactsByEmail:{'dup@example.test':[{id:'1',Email:'dup@example.test'},{id:'2',Email:'dup@example.test'}]}});
  await withApp(f,async post=>{
    assert.equal((await post(tutorUrl,{name:'J',email:'jo@example.test'})).status,422);
    assert.equal((await post(tutorUrl,{name:'Jo Tutor',email:'not-an-email'})).status,422);
    assert.equal((await post(tutorUrl,{name:'Jo Tutor',email:'dup@example.test'})).body.code,'CONTACT_AMBIGUOUS');
    assert.equal(f.writes().length,0);
  });
  await withApp(fake(),async post=>assert.equal((await post(tutorUrl,{name:'Jo Tutor',email:'jo@example.test'})).status,503),loadConfig({PORTAL_SCHOOL_SERVICES_ENABLED:'true'}));
});
test('a booking on an instant-booking date is confirmed and recorded for the school',async()=>{
  const f=fake();
  await withApp(f,async post=>{
    const r=await post(bookUrl,{studentName:'Sam Student',studentEmail:'sam@example.test',numberOfStudents:2,message:'Needs step-free access'});
    assert.equal(r.status,201);assert.equal(r.body.booking.status,'Confirmed');
    const create=f.writes().find(c=>c.u.includes('/form/Diary_Date_Bookings'));
    assert.equal(create.body.data.training_school,ACCOUNT);assert.equal(create.body.data.course_session,SESSION);
    assert.equal(create.body.data.number_of_students,2);assert.equal(create.body.data.agreed_course_date,'01-Nov-2027');
  });
});
test('a flexible date becomes a request with preferred dates',async()=>{
  const f=fake({session:{ID:SESSION,account1:{ID:ACCOUNT},availability_type:'Request-a-Date',maximum_places:null}});
  await withApp(f,async post=>{
    const r=await post(bookUrl,{studentName:'Sam Student',studentEmail:'sam@example.test',preferredDateFrom:'2027-03-01',preferredDateTo:'2027-03-31',preferredDays:['Monday']});
    assert.equal(r.body.booking.status,'Date Requested');
    const d=f.writes().find(c=>c.u.includes('Diary_Date_Bookings')).body.data;
    assert.equal(d.preferred_date_from,'1-Mar-2027');assert.equal(d.preferred_date_to1,'31-Mar-2027');
    assert.equal((await post(bookUrl,{studentName:'Sam Student',studentEmail:'sam2@example.test',preferredDateFrom:'2027-02-30'})).status,422);
  });
});
test('bookings refuse a full date, a repeat student, another school\'s date and bad input',async()=>{
  const full=fake({bookings:[{booking_status:'Confirmed',number_of_students:9,training_school:{ID:ACCOUNT},student_contact:{ID:'9'}}]});
  await withApp(full,async post=>{
    const r=await post(bookUrl,{studentName:'Sam Student',studentEmail:'sam@example.test',numberOfStudents:2});
    assert.equal(r.status,409);assert.equal(r.body.code,'NO_PLACES');assert.equal(full.writes().length,0);
  });
  const repeat=fake({contactsByEmail:{'sam@example.test':[{id:'2000000000001',Email:'sam@example.test'}]},
    bookings:[{booking_status:'Confirmed',number_of_students:1,training_school:{ID:ACCOUNT},student_contact:{ID:'2000000000001'}}]});
  await withApp(repeat,async post=>assert.equal((await post(bookUrl,{studentName:'Sam Student',studentEmail:'sam@example.test'})).body.code,'DUPLICATE_BOOKING'));
  const cancelled=fake({contactsByEmail:{'sam@example.test':[{id:'2000000000001',Email:'sam@example.test'}]},
    bookings:[{booking_status:'Cancelled',number_of_students:1,training_school:{ID:ACCOUNT},student_contact:{ID:'2000000000001'}}]});
  await withApp(cancelled,async post=>assert.equal((await post(bookUrl,{studentName:'Sam Student',studentEmail:'sam@example.test'})).status,201));
  const other=fake({session:{ID:SESSION,account1:{ID:'9999999999999'},availability_type:'Fixed Date'}});
  await withApp(other,async post=>{assert.equal((await post(bookUrl,{studentName:'Sam Student',studentEmail:'sam@example.test'})).status,404);assert.equal(other.writes().length,0);});
  await withApp(fake(),async post=>{
    assert.equal((await post(bookUrl,{studentName:'Sam Student',studentEmail:'sam@example.test',numberOfStudents:0})).status,422);
    assert.equal((await post(bookUrl,{studentName:'Sam Student',studentEmail:'bad'})).status,422);
    assert.equal((await post(bookUrl,{studentName:'Sam Student',studentEmail:'sam@example.test',message:'x'.repeat(501)})).status,422);
    assert.equal((await post('/portal/management/schools/'+SCHOOL+'/sessions/abc/bookings',{studentName:'Sam Student',studentEmail:'sam@example.test'})).status,404);
  });
});

const verified={id:'5000000000001',Account:{id:ACCOUNT},Accreditation_Status:'Verified',Application_Stage:'Approved',Valid_From:'2026-01-01',Valid_To:'2999-12-31'};
test('the school verification tab shows the public result and the registration number when one exists',async()=>{
  const regCfg=loadConfig({PORTAL_SCHOOL_SERVICES_ENABLED:'true',PUBLIC_SCHOOL_REGISTRATION_MODULE:'Accounts',PUBLIC_SCHOOL_REGISTRATION_FIELD:'School_Registration_Number'});
  const withNumber=await getJson(fake({accreditations:[verified],registration:'GTI-0042'}),'/portal/management/schools/'+SCHOOL+'/verification',regCfg);
  assert.equal(withNumber.status,200);
  assert.equal(withNumber.body.school.registrationNumber,'GTI-0042');assert.equal(withNumber.body.school.name,'Grace School');
  assert.equal(withNumber.body.verification.status,'accredited');assert.equal(withNumber.body.verification.expiryDate,'2999-12-31');
  const noField=await getJson(fake({accreditations:[verified]}),'/portal/management/schools/'+SCHOOL+'/verification');
  assert.equal(noField.body.school.registrationNumber,null);assert.equal(noField.body.verification.isCurrentlyAccredited,true);
  const suspended=await getJson(fake({accreditations:[{...verified,Accreditation_Status:'Suspended'},verified]}),'/portal/management/schools/'+SCHOOL+'/verification');
  assert.equal(suspended.body.verification.status,'suspended');
  const other=await getJson(fake({accreditations:[{...verified,Account:{id:'9999999999999'}}]}),'/portal/management/schools/'+SCHOOL+'/verification');
  assert.equal(other.body.verification.isCurrentlyAccredited,false);
});

test('with the accreditation reference, the school tab shows its current reference',async()=>{
  const cfgRef=loadConfig({PORTAL_SCHOOL_SERVICES_ENABLED:'true',PUBLIC_SCHOOL_REGISTRATION_MODULE:'Training_Centre_Accred',PUBLIC_SCHOOL_REGISTRATION_FIELD:'Name'});
  const rows=[{...verified,Name:'ACC-00007',Accreditation_Status:'Expired',Valid_To:'2025-01-01'},{...verified,Name:'ACC-00042'},{...verified,Name:'ACC-00050',Accreditation_Status:'Unverified',Application_Stage:'Draft',Valid_To:'2999-12-31'}];
  const r=await getJson(fake({accreditations:rows}),'/portal/management/schools/'+SCHOOL+'/verification',cfgRef);
  assert.equal(r.body.school.registrationNumber,'ACC-00042');
});
