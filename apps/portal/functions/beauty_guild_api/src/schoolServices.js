'use strict';
const express=require('express');
const {HttpError}=require('./errors');
const {resolveContact}=require('./records');
const {isPaidStatus,isPayableAccreditation}=require('./catalogue');
const {assess}=require('./publicSchoolVerification');
const ID=/^\d{10,25}$/;
const esc=v=>encodeURIComponent(String(v));
const fail=(message,status=502,code='SERVICE_UNAVAILABLE')=>{throw new HttpError(status,code,message);};
function mapInvoice(r){
 const descriptor=r.product_description;
 return {id:String(r.ID),invoiceNumber:r.invoice_number||null,
  type:descriptor&&descriptor.length<=40?descriptor:r.crm_membership_id?'Membership':
   String(r.related_crm_records||'').includes('accreditation_id')?'Accreditation':null,
  invoiceDate:r.invoice_date||null,dueDate:r.due_date||null,paymentDate:r.payment_date||null,
  amount:r.payment_amount!==undefined&&r.payment_amount!==null?Number(r.payment_amount):null,
  status:r.invoice_status||null};
}
function createSchoolApi({getCrmHeaders,getCreatorHeaders,crmApiDomain,creatorApiDomain,creatorAccountOwner,creatorAppLinkName,creatorInvoiceReport,fetchImpl=fetch}){
 async function call(req,domain,path,headers){
  let r;
  try{r=await fetchImpl(domain+path,{headers,signal:AbortSignal.timeout(15000)});}
  catch{fail('The service could not be reached.');}
  if(r.status===204)return {data:[]};
  const body=await r.json().catch(()=>null);
  if(!r.ok||!body)fail('The service did not return the requested records.');
  return body;
 }
 const crm=async(req,path)=>{const r=await call(req,crmApiDomain,'/crm/v3/'+path,await getCrmHeaders(req));return r.data||[];};
 const creator=async(req,report,criteria)=>{
  const path='/creator/v2.1/data/'+esc(creatorAccountOwner)+'/'+esc(creatorAppLinkName)+'/report/'+esc(report)+'?field_config=all&max_records=200&criteria='+esc(criteria);
  let response;
  try{response=await fetchImpl(creatorApiDomain+path,{headers:await getCreatorHeaders(req),signal:AbortSignal.timeout(16000)});}
  catch{fail('Creator records are unavailable.');}
  const body=await response.json().catch(()=>null);
  if(body?.code===9280)return [];
  if(!response.ok||body?.code!==3000||!Array.isArray(body?.data))fail('Creator records are unavailable.');
  return body.data;
 };
 // Same identity rule as member records: the verified Catalyst email must match exactly one CRM Contact.
 async function contact(req,user){return resolveContact(req,crm,user);}
 async function acc(req,id,contactId){
  if(!ID.test(String(id)))fail('Training centre not found.',404,'NOT_FOUND');
  const r=(await crm(req,'Training_Centre_Accred/'+id+'?fields='+esc('Applicant_Contact,Account,Accreditation_Status,Accreditation_Level,Application_Stage,Valid_To,Number_of_Tutors,Payment_Status')))[0];
  if(!r||String(r.Applicant_Contact?.id)!==String(contactId))fail('Training centre not found.',404,'NOT_FOUND');
  return r;
 }
 async function deal(req,id,contactId){
  if(!ID.test(String(id)))fail('Membership not found.',404,'NOT_FOUND');
  const r=(await crm(req,'Deals/'+id+'?fields='+esc('Contact_Name,Deal_Name,Stage,Membership_Type,Membership_Branch,Expiry_Date,Start_Date,Amount,Payment_Status')))[0];
  if(!r||String(r.Contact_Name?.id)!==String(contactId))fail('Membership not found.',404,'NOT_FOUND');
  return r;
 }
 async function invoices(req,criteria){
  const rows=await creator(req,creatorInvoiceReport,criteria);
  return rows.map(mapInvoice).sort((a,b)=>Number(b.invoiceNumber||0)-Number(a.invoiceNumber||0));
 }

 async function crmCreate(req,module,data){
  const url=crmApiDomain+'/crm/v3/'+module;
  let response;
  try{response=await fetchImpl(url,{method:'POST',headers:{...(await getCrmHeaders(req)),'Content-Type':'application/json'},
    body:JSON.stringify({data:[data]}),signal:AbortSignal.timeout(15000)});}
  catch{fail('CRM could not save this record.');}
  const body=await response.json().catch(()=>null);
  const row=body?.data?.[0];
  if(!response.ok||row?.status!=='success'||!row?.details?.id)fail('CRM did not confirm the record was saved.');
  return row.details.id;
 }
 async function creatorCreate(req,form,data){
  const url=creatorApiDomain+'/creator/v2.1/data/'+esc(creatorAccountOwner)+'/'+esc(creatorAppLinkName)+'/form/'+esc(form);
  let response;
  try{response=await fetchImpl(url,{method:'POST',headers:{...(await getCreatorHeaders(req)),'Content-Type':'application/json'},
    body:JSON.stringify({data}),signal:AbortSignal.timeout(15000)});}
  catch{fail('Creator could not save this record.');}
  const body=await response.json().catch(()=>null);
  if(!response.ok||body?.code!==3000||!body.data?.ID)fail('Creator did not confirm the record was saved.');
  return String(body.data.ID);
 }
 return {crm,creator,contact,acc,deal,invoices,crmCreate,creatorCreate};
}
function registerSchoolRoutes(app,{enabled,writesEnabled,getCurrentUser,getCrmHeaders,getCreatorHeaders,config,fetchImpl=fetch}){
 const router=express.Router(),api=createSchoolApi({
  getCrmHeaders,getCreatorHeaders,crmApiDomain:config.crmApiDomain,
  creatorApiDomain:config.creatorApiDomain,creatorAccountOwner:config.creatorAccountOwner,
  creatorAppLinkName:config.creatorAppLinkName,creatorInvoiceReport:config.creatorInvoiceReport,fetchImpl
 });
 const handle=fn=>async(req,res,next)=>{try{await fn(req,res);}catch(e){next(e);}};
 router.use(express.json({limit:'24kb'}));
 // Server-side identity verification is required for every member/school/invoice route.
 router.use(async(req,res,next)=>{try{
  if(!enabled)fail('School and invoice services have not been configured.',503,'SCHOOL_DISABLED');
  req.memberContact=await api.contact(req,await getCurrentUser(req));
  next();
 }catch(e){next(e);}});
 router.get('/schools',handle(async(req,res)=>{
  const rows=await api.crm(req,'Training_Centre_Accred/search?criteria='+esc('(Applicant_Contact:equals:'+req.memberContact.id+')')+'&fields='+esc('Applicant_Contact,Account,Accreditation_Status,Accreditation_Level,Valid_To,Application_Stage')+'&per_page=200');
  const schools=rows.filter(x=>String(x.Applicant_Contact?.id)===String(req.memberContact.id))
  .map(a=>({id:String(a.id),name:a.Account?.name||'Training centre',accountId:a.Account?.id||null,
   status:a.Accreditation_Status||a.Application_Stage||'Unknown',level:a.Accreditation_Level||null,
   validTo:a.Valid_To||null}));
  res.json({schools});
 }));
 // Registered before the catch-all section route below, which would otherwise swallow it as an unknown section.
 router.get('/schools/:id/course-options',handle(async(req,res)=>{
  const a=await api.acc(req,req.params.id,req.memberContact.id);
  const offerings=await api.crm(req,'TC_Course_Offering/search?criteria='+esc('(Accreditation:equals:'+a.id+')')+'&fields='+esc('Course,Training_Centre,Accreditation'));
  const tutors=a.Account?.id?await api.crm(req,'Tutor_Relationships/search?criteria='+esc('((Account:equals:'+a.Account.id+')and(Status:equals:Active))')+'&fields='+esc('Tutor_Contact')):[];
  res.json({offerings:offerings.filter(o=>o.Course?.id&&o.Training_Centre?.id).map(o=>({id:o.id,name:o.Course.name,trainingCentre:o.Training_Centre.name})),
   tutors:tutors.filter(t=>t.Tutor_Contact?.id).map(t=>({id:t.id,name:t.Tutor_Contact.name}))});
 }));
 router.get('/schools/:id/:section',handle(async(req,res)=>{
  const {id,section}=req.params;
  const a=await api.acc(req,id,req.memberContact.id);
  const accountId=a.Account?.id;
  if(section==='profile'){
   const links=await api.crm(req,'Accreditation_Centre_Link/search?criteria='+esc('((Accreditation:equals:'+id+')and(Centre_Relationship_Type:equals:Main Centre))')+'&fields='+esc('Training_Centre'));
   const centreId=links[0]?.Training_Centre?.id;
   const centre=centreId?(await api.crm(req,'Training_Centres/'+centreId+'?fields='+esc('Name,Town,County,Country,Postcode,Centre_Status')))[0]:null;
   const account=accountId?(await api.crm(req,'Accounts/'+accountId+'?fields='+esc('Referral_Code,Referral_Code_Active')))[0]:null;
   return res.json({profile:{id,name:centre?.Name||a.Account?.name||'Training centre',town:centre?.Town||null,county:centre?.County||null,
    country:centre?.Country||null,postcode:centre?.Postcode||null,status:a.Accreditation_Status,expires:a.Valid_To,level:a.Accreditation_Level,
    referralCode:account?.Referral_Code||null,referralActive:account?.Referral_Code_Active||false,
    paymentStatus:a.Payment_Status||null,paid:isPaidStatus(a.Payment_Status),payable:isPayableAccreditation(a)}});
  }
  if(section==='courses'){
   const offerings=await api.crm(req,'TC_Course_Offering/search?criteria='+esc('(Accreditation:equals:'+id+')')+'&fields='+esc('Course,Training_Centre'));
   const unique=[...new Map(offerings.filter(o=>o.Course?.id).map(o=>[o.Course.id,{id:o.Course.id,name:o.Course.name||'Course'}])).values()];
   const active=await api.crm(req,'Courses/search?criteria='+esc('((Status:equals:Active)and(Course_Type:equals:GTI))')+'&fields='+esc('Name,Duration,CPD_Points,Course_Category,Treatment_Group'));
   const taken=new Set(unique.map(c=>String(c.id)));
   return res.json({courses:unique,available:active.filter(c=>!taken.has(String(c.id))).map(c=>({id:c.id,name:c.Name,duration:c.Duration,cpdPoints:c.CPD_Points,category:c.Course_Category||null,treatmentGroup:c.Treatment_Group||null}))});
  }
  if(section==='venues'){
   const links=await api.crm(req,'Accreditation_Centre_Link/search?criteria='+esc('(Accreditation:equals:'+id+')')+'&fields='+esc('Training_Centre,Centre_Relationship_Type'));
   const offerings=await api.crm(req,'TC_Course_Offering/search?criteria='+esc('(Accreditation:equals:'+id+')')+'&fields='+esc('Training_Centre,Course'));
   const centres=await Promise.all(links.filter(l=>l.Training_Centre?.id).map(async l=>{
    const c=(await api.crm(req,'Training_Centres/'+l.Training_Centre.id+'?fields='+esc('Name,Town,Centre_Status')))[0];
    return c?{id:c.id,name:c.Name,town:c.Town||null,isMain:l.Centre_Relationship_Type==='Main Centre',
     courseCount:offerings.filter(o=>o.Training_Centre?.id===c.id).length,visible:c.Centre_Status==='Verified'}:null;
   }));
   return res.json({venues:centres.filter(Boolean).sort((x,y)=>Number(y.isMain)-Number(x.isMain))});
  }
  if(section==='tutors'){
   if(!accountId)return res.json({tutors:[]});
   const relationships=await api.crm(req,'Tutor_Relationships/search?criteria='+esc('(Account:equals:'+accountId+')')+'&fields='+esc('Tutor_Contact,Tutor_Relationship,Status'));
   const tutorRows=await Promise.all(relationships.filter(t=>t.Tutor_Contact).slice(0,100).map(async t=>{
    const dealId=t.Tutor_Relationship?.id;
    let member=null;
    if(dealId){
     const deal=(await api.crm(req,'Deals/'+dealId+'?fields='+esc('Member_Profile')))[0];
     if(deal?.Member_Profile?.id)member=(await api.crm(req,'Membership/'+deal.Member_Profile.id+'?fields='+esc('Name,Current_Membership_Status,Current_Membership_Expiry')))[0];
    }
    const status=!member?'Pending membership':member.Current_Membership_Status==='Expired'?'Expired':member.Current_Membership_Status==='Current'?'Current':'Pending membership';
    return {id:t.id,name:t.Tutor_Contact.name||'Tutor',active:t.Status==='Active',membershipDealId:dealId||null,
      membershipNumber:member?.Name||null,membershipExpiry:member?.Current_Membership_Expiry||null,status};
   }));
   return res.json({tutors:tutorRows});
  }
  if(section==='qualifications'){
   const rows=await api.crm(req,'Qualifications/search?criteria='+esc('(Contact:equals:'+req.memberContact.id+')')+'&fields='+esc('Name,Primary_Accreditation,Date_Completed_Month,Date_Completed_Year,Verification_Status'));
   return res.json({qualifications:rows.filter(x=>String(x.Primary_Accreditation?.id)===String(id))
    .map(x=>({id:x.id,name:x.Name,month:x.Date_Completed_Month,year:x.Date_Completed_Year,status:x.Verification_Status}))});
  }
  if(section==='sessions'){
   if(!accountId)return res.json({sessions:[]});
   const rows=await api.creator(req,'Course_Sessions_Report','account1=="'+accountId+'"');
   const bookings=await api.creator(req,'All_Diary_Date_Bookings','training_school=="'+accountId+'"');
   const counts={};
   for(const b of bookings){
    if(['Cancelled','Refunded'].includes(b.booking_status))continue;
    const key=b.course_session?.ID;
    if(key)counts[key]=(counts[key]||0)+(Number(b.number_of_students)||1);
   }
   return res.json({sessions:rows.map(s=>({id:s.ID,name:s.course_session_name||null,
    availabilityType:s.availability_type||null,start:s.session_start_date_time||null,end:s.session_end_date_time||null,
    maximumPlaces:s.maximum_places==null?null:Number(s.maximum_places),placesBooked:counts[s.ID]||0,
    status:s.status||null,price:s.total_advertised_price||null,tutorName:s.tutor?.zc_display_value||null}))});
  }
  if(section==='invoices'){
   // Preserve V1 behaviour: the school invoice tab uses the member's Creator account invoices.
   return res.json({invoices:await api.invoices(req,'crm_contact_id == "'+req.memberContact.id+'"'),
    scope:'account',note:'This is the member account invoice list, as in V1.'});
  }
  if(section==='verification'){
   // The same assessment the public page uses, for this school's own accreditation records.
   if(!accountId)return res.json({school:{name:a.Account?.name||'Training centre',registrationNumber:null},verification:{status:'not_accredited',isCurrentlyAccredited:false,expiryDate:null,checkedAt:new Date().toISOString()}});
   const rows=await api.crm(req,'Training_Centre_Accred/search?criteria='+esc('(Account:equals:'+accountId+')')+'&fields='+esc('Name,Account,Accreditation_Status,Application_Stage,Valid_From,Valid_To'));
   const own=rows.filter(r=>String(r.Account?.id)===String(accountId));
   let registrationNumber=null;
   const field=config.schoolRegistrationField;
   if(field&&/^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(field)){
    if(config.schoolRegistrationModule==='Training_Centre_Accred'){
     // The reference is per accreditation record and changes at renewal: show the current one (latest end date among granted records).
     const granted=own.filter(r=>['verified','expired','closed'].includes(String(r.Accreditation_Status||'').toLowerCase())&&r[field])
      .sort((x,y)=>String(y.Valid_To||'').localeCompare(String(x.Valid_To||'')));
     registrationNumber=granted[0]?String(granted[0][field]).trim()||null:null;
    }else if(config.schoolRegistrationModule==='Accounts'){
     const acct=(await api.crm(req,'Accounts/'+accountId+'?fields='+esc(field)))[0];
     registrationNumber=acct&&acct[field]?String(acct[field]).trim()||null:null;
    }else if(config.schoolRegistrationModule==='Training_Centres'){
     const links=await api.crm(req,'Accreditation_Centre_Link/search?criteria='+esc('((Accreditation:equals:'+id+')and(Centre_Relationship_Type:equals:Main Centre))')+'&fields='+esc('Training_Centre'));
     const centreId=links[0]?.Training_Centre?.id;
     const centre=centreId&&ID.test(String(centreId))?(await api.crm(req,'Training_Centres/'+centreId+'?fields='+esc(field)))[0]:null;
     registrationNumber=centre&&centre[field]?String(centre[field]).trim()||null:null;
    }
   }
   const checkedAt=new Date();
   return res.json({school:{name:a.Account?.name||'Training centre',registrationNumber},
    verification:{...assess(own,checkedAt.toISOString().slice(0,10),config.schoolActiveStatus||'Verified'),checkedAt:checkedAt.toISOString()}});
  }
  fail('Unknown school section.',404,'NOT_FOUND');
 }));
 router.get('/schools/:id/sessions/:sessionId/bookings',handle(async(req,res)=>{
  const a=await api.acc(req,req.params.id,req.memberContact.id);
  if(!a.Account?.id||!ID.test(req.params.sessionId))fail('Session not found.',404,'NOT_FOUND');
  const rows=await api.creator(req,'All_Diary_Date_Bookings','course_session=='+req.params.sessionId);
  return res.json({bookings:rows.filter(b=>String(b.training_school?.ID)===String(a.Account.id))
   .map(b=>({id:b.ID,name:b.student_contact?.zc_display_value||null,places:Number(b.number_of_students)||1,
    status:b.booking_status||null,message:b.student_message_special_requirements||null}))});
 }));
 router.get('/invoices',handle(async(req,res)=>{
  res.json({invoices:await api.invoices(req,'crm_contact_id == "'+req.memberContact.id+'"')});
 }));
 router.get('/memberships/:id/invoices',handle(async(req,res)=>{
  await api.deal(req,req.params.id,req.memberContact.id);
  res.json({invoices:await api.invoices(req,'crm_membership_id == "'+req.params.id+'"')});
 }));
 router.get('/memberships/:id/extensions',handle(async(req,res)=>{
  await api.deal(req,req.params.id,req.memberContact.id);
  const rows=await api.crm(req,'Membership_Extension/search?criteria='+esc('(Membership_Extension:equals:'+req.params.id+')'));
  res.json({extensions:rows.map(x=>({id:x.id,type:x.Extension_Type||null,branch:typeof x.Membership_Branch==='string'?x.Membership_Branch:null,
   quantity:x.Quantity||null,basePrice:x.Base_Price||null,finalPrice:x.Final_Price||null,status:x.Status||null}))});
 }));

 // V1-verified WRITE subset. Disabled separately from read-side school services.
 const shortText=(v,max,label,code)=>{
  if(v===undefined||v===null||v==='')return undefined;
  if(typeof v!=='string'||v.trim().length>max)fail(label+' must be text of up to '+max+' characters.',422,code);
  return v.trim();
 };
 const validDate=(v,label)=>{
  const d=new Date(v);
  if(Number.isNaN(d.getTime()))fail(label+' is not a valid date.',422,'INVALID_DATE');
  return d;
 };
 const requireWrites=(req,res,next)=>writesEnabled?next():next(new HttpError(503,'SCHOOL_WRITES_DISABLED','School changes are not enabled.'));
 const DELIVERY=['Face to Face In the Classroom','Face to Face via Live Video Link','Online only','Other'];
 const ASSESS=['Face to Face In the Classroom','Face to Face via Live Video Link','Case Studies - Submitting Photographs','Case Studies - Submitting Videos','Other'];
 router.post('/schools/:id/qualifications',requireWrites,handle(async(req,res)=>{
  const acc=await api.acc(req,req.params.id,req.memberContact.id);
  if(!acc.Account?.id)fail('School account not found.',409,'ACCOUNT_REQUIRED');
  const body=req.body||{},name=String(body.name||'').trim(),month=String(body.month||'').trim(),year=Number(body.year);
  if(!name||name.length>180||!/^(?:[1-9]|1[0-2])$/.test(month)||!Number.isInteger(year)||year<1900||year>2200)
   fail('A qualification name and valid completion month and year are required.',422,'INVALID_QUALIFICATION');
  if(!Array.isArray(body.delivery)||!body.delivery.length||body.delivery.some(x=>!DELIVERY.includes(x))||
   !Array.isArray(body.assessment)||!body.assessment.length||body.assessment.some(x=>!ASSESS.includes(x)))
   fail('Choose valid practical delivery and assessment methods.',422,'INVALID_QUALIFICATION');
  const deliveryOther=shortText(body.deliveryOther,200,'The other delivery method','INVALID_QUALIFICATION');
  const assessmentOther=shortText(body.assessmentOther,200,'The other assessment method','INVALID_QUALIFICATION');
  if(body.delivery.includes('Other')&&!String(body.deliveryOther||'').trim())fail('Specify the other delivery method.',422,'INVALID_QUALIFICATION');
  if(body.assessment.includes('Other')&&!String(body.assessmentOther||'').trim())fail('Specify the other assessment method.',422,'INVALID_QUALIFICATION');
  const record={Name:name,Contact:req.memberContact.id,Account:acc.Account.id,Primary_Accreditation:acc.id,
   Date_Completed_Month:month,Date_Completed_Year:year,
   Practical_Delivery_Type:body.delivery,Practical_Delivery_Other:deliveryOther,
   Practical_Assessment_Type:body.assessment,Practical_Assessment_Other:assessmentOther,
   Verification_Status:'Not Verified'};
  // Refuse an identical qualification so a double click or retry cannot create it twice.
  const existing=await api.crm(req,'Qualifications/search?criteria='+esc('(Contact:equals:'+req.memberContact.id+')')+'&fields='+esc('Name,Primary_Accreditation,Date_Completed_Month,Date_Completed_Year'));
  if(existing.some(x=>String(x.Primary_Accreditation?.id)===String(acc.id)&&String(x.Name||'').trim().toLowerCase()===name.toLowerCase()&&
     String(x.Date_Completed_Month)===month&&String(x.Date_Completed_Year)===String(year)))
   fail('This qualification has already been added.',409,'DUPLICATE_QUALIFICATION');
  const id=await api.crmCreate(req,'Qualifications',record);
  res.status(201).json({qualification:{id,name,month,year,status:'Not Verified'}});
 }));
 function toCreatorDateTime(value){
  if(!value)return undefined;
  const d=value instanceof Date?value:new Date(value);if(Number.isNaN(d.getTime()))fail('Invalid session date.',422,'INVALID_DATE');
  const mon=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const pad=n=>String(n).padStart(2,'0');
  return pad(d.getDate())+'-'+mon[d.getMonth()]+'-'+d.getFullYear()+' '+pad(d.getHours())+':'+pad(d.getMinutes())+':'+pad(d.getSeconds());
 }
 router.post('/schools/:id/sessions',requireWrites,handle(async(req,res)=>{
  const acc=await api.acc(req,req.params.id,req.memberContact.id);
  if(!acc.Account?.id)fail('Accreditation is not linked to a school.',409,'ACCOUNT_REQUIRED');
  const body=req.body||{},offeringId=String(body.courseOfferingId||'');
  if(!ID.test(offeringId))fail('Choose an accredited course offering.',422,'INVALID_OFFERING');
  if(!['Fixed Date','Flexible Availability','Request-a-Date'].includes(body.availabilityType))
   fail('Choose a valid session type.',422,'INVALID_SESSION_TYPE');
  const offering=(await api.crm(req,'TC_Course_Offering/'+offeringId+'?fields='+esc('Course,Training_Centre,Accreditation')))[0];
  if(String(offering?.Accreditation?.id)!==String(acc.id)||!offering.Training_Centre?.id)
   fail('Course offering not found for this school.',404,'NOT_FOUND');
  let startAt,endAt;
  if(body.availabilityType==='Fixed Date'){
   if(!body.sessionStart)fail('A start date is required.',422,'INVALID_DATE');
   startAt=validDate(body.sessionStart,'The start date');
   if(startAt.getTime()<Date.now()-5*60*1000)fail('The start date cannot be in the past.',422,'INVALID_DATE');
   if(body.sessionEnd){endAt=validDate(body.sessionEnd,'The end date');if(endAt<=startAt)fail('The end date must be after the start date.',422,'INVALID_DATE');}
  }
  let price;
  if(body.totalAdvertisedPrice!==undefined&&body.totalAdvertisedPrice!==null&&body.totalAdvertisedPrice!==''){
   price=Number(body.totalAdvertisedPrice);
   if(!Number.isFinite(price)||price<0||price>100000)fail('Enter a price between 0 and 100000.',422,'INVALID_PRICE');
  }
  const flexibleDescription=shortText(body.flexibleDescription,500,'The availability description','INVALID_SESSION');
  let availableDays=[];
  if(body.availableDays!==undefined){
   if(!Array.isArray(body.availableDays)||body.availableDays.length>7||body.availableDays.some(d=>typeof d!=='string'||d.length>20))
    fail('Choose valid available days.',422,'INVALID_SESSION');
   availableDays=body.availableDays;
  }
  let bookingClosing;
  if(body.bookingClosing)bookingClosing=validDate(body.bookingClosing,'The booking closing date');
  const max=body.maximumPlaces==null||body.maximumPlaces===''?undefined:Number(body.maximumPlaces);
  if(max!==undefined&&(!Number.isInteger(max)||max<1||max>1000))fail('Invalid maximum places.',422,'INVALID_PLACES');
  if(body.tutorId){
   if(!ID.test(String(body.tutorId)))fail('Tutor selection is invalid.',422,'INVALID_TUTOR');
   const tutor=(await api.crm(req,'Tutor_Relationships/'+body.tutorId+'?fields='+esc('Account,Status')))[0];
   if(!tutor||String(tutor.Account?.id)!==String(acc.Account.id)||tutor.Status!=='Active')fail('Tutor is not linked to this school.',404,'NOT_FOUND');
  }
  const data={
   course_offering:offeringId,training_centre:offering.Training_Centre.id,account1:acc.Account.id,
   tutor:body.tutorId||undefined,availability_type:body.availabilityType,status:'Open',
   course_session_name:[offering.Training_Centre.name,offering.Course?.name].filter(Boolean).join(' - '),
   maximum_places:max,instant_booking_available:Boolean(body.instantBookingAvailable),
   request_a_date_available1:Boolean(body.requestADateAvailable),
   total_advertised_price:price
  };
  if(body.availabilityType==='Fixed Date'){
   data.session_start_date_time=toCreatorDateTime(startAt);
   data.session_end_date_time=toCreatorDateTime(endAt);
  }else{
   data.flexible_availability_description=flexibleDescription;
   data.available_days=availableDays;
   data.weekend_availability=Boolean(body.weekendAvailability);
   data.evening_availability1=Boolean(body.eveningAvailability);
   data.booking_closing_date_and_time=toCreatorDateTime(bookingClosing);
  }
  // Refuse an identical session (same name, type and start) so a retry cannot create it twice.
  const sameSchool=await api.creator(req,'Course_Sessions_Report','account1=="'+acc.Account.id+'"');
  if(sameSchool.some(x=>String(x.course_session_name||'')===data.course_session_name&&String(x.availability_type||'')===data.availability_type&&
     String(x.session_start_date_time||'')===String(data.session_start_date_time||'')))
   fail('This course date has already been added.',409,'DUPLICATE_SESSION');
  const id=await api.creatorCreate(req,'Course_Sessions',data);
  res.status(201).json({session:{id}});
 }));
 // ---- Tutors and student bookings (ported from V1, with ownership, validation, duplicate and capacity checks)
 const EMAIL=/^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
 const cleanName=(v,label)=>{
  const t=typeof v==='string'?v.replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim():'';
  if(t.length<2||t.length>120)fail(label+' must be between 2 and 120 characters.',422,'INVALID_NAME');
  return t;
 };
 const cleanEmail=v=>{
  const t=typeof v==='string'?v.trim().toLowerCase():'';
  if(t.length>254||!EMAIL.test(t))fail('Enter a valid email address.',422,'INVALID_EMAIL');
  return t;
 };
 const splitName=name=>{const [first,...rest]=name.split(' ');return {First_Name:first,Last_Name:rest.join(' ')||first};};
 // The Contact for an email: reuse the one that exists, refuse when several share it, create it when none does.
 async function findOrCreateContact(req,email,name){
  const rows=(await api.crm(req,'Contacts/search?email='+esc(email)+'&fields='+esc('Email'))).filter(c=>String(c.Email||'').trim().toLowerCase()===email);
  if(rows.length>1)fail('More than one record uses this email address. Please contact the Guild.',409,'CONTACT_AMBIGUOUS');
  if(rows.length===1)return {id:String(rows[0].id),existing:true};
  return {id:await api.crmCreate(req,'Contacts',{Email:email,...splitName(name)}),existing:false};
 }
 const TIERS=['associate','full','international'];
 const currentMembership=(deal,today)=>deal.Stage==='Active'&&TIERS.some(p=>String(deal.Membership_Type||'').toLowerCase().startsWith(p))&&
  !(deal.Start_Date&&deal.Start_Date>today)&&!(deal.Expiry_Date&&deal.Expiry_Date<today);
 router.post('/schools/:id/tutors',requireWrites,handle(async(req,res)=>{
  const acc=await api.acc(req,req.params.id,req.memberContact.id);
  if(!acc.Account?.id)fail('This school has no linked account yet.',409,'ACCOUNT_REQUIRED');
  const name=cleanName(req.body?.name,'The tutor name'),email=cleanEmail(req.body?.email);
  const tutor=await findOrCreateContact(req,email,name);
  if(tutor.existing){
   const already=(await api.crm(req,'Tutor_Relationships/search?criteria='+esc('((Account:equals:'+acc.Account.id+')and(Tutor_Contact:equals:'+tutor.id+'))')+'&fields='+esc('Status')))[0];
   if(already)return res.json({alreadyLinked:true,status:already.Status||null,tutor:{name}});
  }
  // A tutor becomes Active only if they already hold a current Guild membership; everyone else starts Inactive.
  let status='Inactive';
  if(tutor.existing){
   const today=new Date().toISOString().slice(0,10);
   const deals=await api.crm(req,'Deals/search?criteria='+esc('(Contact_Name:equals:'+tutor.id+')')+'&fields='+esc('Stage,Membership_Type,Start_Date,Expiry_Date'));
   if(deals.some(d=>currentMembership(d,today)))status='Active';
  }
  await api.crmCreate(req,'Tutor_Relationships',{Name:name,Account:acc.Account.id,Tutor_Contact:tutor.id,Status:status});
  res.status(201).json({alreadyLinked:false,status,tutor:{name}});
 }));
 function toCreatorDate(value,label){
  if(value===undefined||value===null||value==='')return undefined;
  const m=String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const d=m&&new Date(m[1]+'-'+m[2]+'-'+m[3]+'T00:00:00Z');
  if(!m||Number.isNaN(d.getTime())||d.toISOString().slice(0,10)!==value)fail(label+' is not a valid date.',422,'INVALID_DATE');
  return Number(m[3])+'-'+['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(m[2])-1]+'-'+m[1];
 }
 router.post('/schools/:id/sessions/:sessionId/bookings',requireWrites,handle(async(req,res)=>{
  const acc=await api.acc(req,req.params.id,req.memberContact.id);
  const sessionId=req.params.sessionId;
  if(!acc.Account?.id||!ID.test(sessionId))fail('Course date not found.',404,'NOT_FOUND');
  const body=req.body||{};
  const studentName=cleanName(body.studentName,'The student name'),studentEmail=cleanEmail(body.studentEmail);
  const places=body.numberOfStudents===undefined||body.numberOfStudents===''?1:Number(body.numberOfStudents);
  if(!Number.isInteger(places)||places<1||places>50)fail('Places must be a whole number from 1 to 50.',422,'INVALID_PLACES');
  const message=shortText(body.message,500,'The message','INVALID_BOOKING');
  const from=toCreatorDate(body.preferredDateFrom,'The earliest date'),to=toCreatorDate(body.preferredDateTo,'The latest date');
  let days;
  if(body.preferredDays!==undefined){
   if(!Array.isArray(body.preferredDays)||body.preferredDays.length>7||body.preferredDays.some(d=>typeof d!=='string'||d.length>20))fail('Choose valid days.',422,'INVALID_BOOKING');
   days=body.preferredDays;
  }
  const session=(await api.creator(req,'Course_Sessions_Report','ID=='+sessionId))[0];
  if(!session||String(session.account1?.ID)!==String(acc.Account.id))fail('Course date not found.',404,'NOT_FOUND');
  const existing=await api.creator(req,'All_Diary_Date_Bookings','course_session=='+sessionId);
  const live=existing.filter(b=>!['Cancelled','Refunded'].includes(b.booking_status)&&String(b.training_school?.ID)===String(acc.Account.id));
  const booked=live.reduce((n,b)=>n+(Number(b.number_of_students)||1),0);
  const max=session.maximum_places==null||session.maximum_places===''?null:Number(session.maximum_places);
  if(Number.isFinite(max)&&booked+places>max)fail('There are not enough places left on this course date.',409,'NO_PLACES');
  const student=await findOrCreateContact(req,studentEmail,studentName);
  if(live.some(b=>String(b.student_contact?.ID)===student.id))fail('This student already has a booking on this course date.',409,'DUPLICATE_BOOKING');
  const instant=session.availability_type==='Fixed Date'&&String(session.instant_booking_available)==='true';
  const data={training_school:acc.Account.id,course_session:sessionId,student_contact:student.id,number_of_students:places,
   student_message_special_requirements:message,booking_status:instant?'Confirmed':'Date Requested'};
  if(instant){
   const [d,t]=String(session.session_start_date_time||'').split(' ');
   data.agreed_course_date=d||undefined;data.agreed_start_time=t||undefined;
  }else{
   data.preferred_date_from=from;data.preferred_date_to1=to;data.preferred_days1=days;
  }
  const id=await api.creatorCreate(req,'Diary_Date_Bookings',data);
  res.status(201).json({booking:{id,status:data.booking_status}});
 }));
 app.use('/portal/management',router);
}
module.exports={registerSchoolRoutes,createSchoolApi,mapInvoice};
