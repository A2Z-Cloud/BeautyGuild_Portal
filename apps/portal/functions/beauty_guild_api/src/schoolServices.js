'use strict';
const express=require('express');
const {HttpError}=require('./errors');
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
 async function contact(req,user){
  if(!user?.id)fail('Please sign in to continue.',401,'SIGN_IN_REQUIRED');
  const rows=await crm(req,'Contacts/search?criteria='+esc('(Catalyst_User_ID:equals:'+user.id+')')+'&fields='+esc('Catalyst_User_ID'));
  const matches=rows.filter(x=>String(x.Catalyst_User_ID)===String(user.id));
  if(matches.length!==1)fail('Your account must be linked to a unique Guild Contact.',403,'CONTACT_LINK_REQUIRED');
  return matches[0];
 }
 async function acc(req,id,contactId){
  if(!ID.test(String(id)))fail('Training centre not found.',404,'NOT_FOUND');
  const r=(await crm(req,'Training_Centre_Accred/'+id+'?fields='+esc('Applicant_Contact,Account,Accreditation_Status,Accreditation_Level,Application_Stage,Valid_To,Number_of_Tutors')))[0];
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
    referralCode:account?.Referral_Code||null,referralActive:account?.Referral_Code_Active||false}});
  }
  if(section==='courses'){
   const offerings=await api.crm(req,'TC_Course_Offering/search?criteria='+esc('(Accreditation:equals:'+id+')')+'&fields='+esc('Course,Training_Centre'));
   const unique=[...new Map(offerings.filter(o=>o.Course?.id).map(o=>[o.Course.id,{id:o.Course.id,name:o.Course.name||'Course'}])).values()];
   const active=await api.crm(req,'Courses/search?criteria='+esc('((Status:equals:Active)and(Course_Type:equals:GTI))')+'&fields='+esc('Name,Duration,CPD_Points'));
   const taken=new Set(unique.map(c=>String(c.id)));
   return res.json({courses:unique,available:active.filter(c=>!taken.has(String(c.id))).map(c=>({id:c.id,name:c.Name,duration:c.Duration,cpdPoints:c.CPD_Points}))});
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
   const relationships=await api.crm(req,'Tutor_Relationships/search?criteria='+esc('((Account:equals:'+accountId+')and(Status:equals:Active))')+'&fields='+esc('Tutor_Contact,Tutor_Relationship'));
   const tutorRows=[];
   for(const t of relationships.filter(t=>t.Tutor_Contact)){
    const dealId=t.Tutor_Relationship?.id;
    let member=null;
    if(dealId){
     const deal=(await api.crm(req,'Deals/'+dealId+'?fields='+esc('Member_Profile')))[0];
     if(deal?.Member_Profile?.id)member=(await api.crm(req,'Membership/'+deal.Member_Profile.id+'?fields='+esc('Name,Current_Membership_Status,Current_Membership_Expiry')))[0];
    }
    const status=!member?'Pending membership':member.Current_Membership_Status==='Expired'?'Expired':member.Current_Membership_Status==='Current'?'Current':'Pending membership';
    tutorRows.push({id:t.id,name:t.Tutor_Contact.name||'Tutor',membershipDealId:dealId||null,
      membershipNumber:member?.Name||null,membershipExpiry:member?.Current_Membership_Expiry||null,status});
   }
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
 const requireWrites=(req,res,next)=>writesEnabled?next():next(new HttpError(503,'SCHOOL_WRITES_DISABLED','School changes are not enabled.'));
 const DELIVERY=['Face to Face In the Classroom','Face to Face via Live Video Link','Online only','Other'];
 const ASSESS=['Face to Face In the Classroom','Face to Face via Live Video Link','Case Studies - Submitting Photographs','Case Studies - Submitting Videos','Other'];
 router.post('/schools/:id/qualifications',requireWrites,handle(async(req,res)=>{
  const acc=await api.acc(req,req.params.id,req.memberContact.id);
  if(!acc.Account?.id)fail('School account not found.',409,'ACCOUNT_REQUIRED');
  const body=req.body||{},name=String(body.name||'').trim(),month=String(body.month||'').trim(),year=Number(body.year);
  if(!name||name.length>180||!^(?:[1-9]|1[0-2])$/.test(month)||!Number.isInteger(year)||year<1900||year>2200)
   fail('A qualification name and valid completion month and year are required.',422,'INVALID_QUALIFICATION');
  if(!Array.isArray(body.delivery)||!body.delivery.length||body.delivery.some(x=>!DELIVERY.includes(x))||
   !Array.isArray(body.assessment)||!body.assessment.length||body.assessment.some(x=>!ASSESS.includes(x)))
   fail('Choose valid practical delivery and assessment methods.',422,'INVALID_QUALIFICATION');
  if(body.delivery.includes('Other')&&!String(body.deliveryOther||'').trim())fail('Specify the other delivery method.',422,'INVALID_QUALIFICATION');
  if(body.assessment.includes('Other')&&!String(body.assessmentOther||'').trim())fail('Specify the other assessment method.',422,'INVALID_QUALIFICATION');
  const record={Name:name,Contact:req.memberContact.id,Account:acc.Account.id,Primary_Accreditation:acc.id,
   Date_Completed_Month:month,Date_Completed_Year:year,
   Practical_Delivery_Type:body.delivery,Practical_Delivery_Other:body.deliveryOther||undefined,
   Practical_Assessment_Type:body.assessment,Practical_Assessment_Other:body.assessmentOther||undefined,
   Verification_Status:'Not Verified'};
  const id=await api.crmCreate(req,'Qualifications',record);
  res.status(201).json({qualification:{id,name,month,year,status:'Not Verified'}});
 }));
 function toCreatorDateTime(value){
  if(!value)return undefined;
  const d=new Date(value);if(Number.isNaN(d.getTime()))fail('Invalid session date.',422,'INVALID_DATE');
  const mon=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const pad=n=>String(n).padStart(2,'0');
  return pad(d.getDate())+'-'+mon[d.getMonth()]+'-'+d.getFullYear()+' '+pad(d.getHours())+':'+pad(d.getMinutes())+':'+pad(d.getSeconds());
 }
 router.get('/schools/:id/course-options',handle(async(req,res)=>{
  const a=await api.acc(req,req.params.id,req.memberContact.id);
  const offerings=await api.crm(req,'TC_Course_Offering/search?criteria='+esc('(Accreditation:equals:'+a.id+')')+'&fields='+esc('Course,Training_Centre,Accreditation'));
  const tutors=a.Account?.id?await api.crm(req,'Tutor_Relationships/search?criteria='+esc('((Account:equals:'+a.Account.id+')and(Status:equals:Active))')+'&fields='+esc('Tutor_Contact')):[];
  res.json({offerings:offerings.filter(o=>o.Course?.id&&o.Training_Centre?.id).map(o=>({id:o.id,name:o.Course.name,trainingCentre:o.Training_Centre.name})),
   tutors:tutors.filter(t=>t.Tutor_Contact?.id).map(t=>({id:t.id,name:t.Tutor_Contact.name}))});
 }));
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
  if(body.availabilityType==='Fixed Date'&&!body.sessionStart)fail('A start date is required.',422,'INVALID_DATE');
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
   total_advertised_price:body.totalAdvertisedPrice||undefined
  };
  if(body.availabilityType==='Fixed Date'){
   data.session_start_date_time=toCreatorDateTime(body.sessionStart);
   data.session_end_date_time=toCreatorDateTime(body.sessionEnd);
  }else{
   data.flexible_availability_description=body.flexibleDescription||undefined;
   data.available_days=Array.isArray(body.availableDays)?body.availableDays:[];
   data.weekend_availability=Boolean(body.weekendAvailability);
   data.evening_availability1=Boolean(body.eveningAvailability);
   data.booking_closing_date_and_time=toCreatorDateTime(body.bookingClosing);
  }
  const id=await api.creatorCreate(req,'Course_Sessions',data);
  res.status(201).json({session:{id}});
 }));
 app.use('/portal/management',router);
}
module.exports={registerSchoolRoutes,createSchoolApi,mapInvoice};
