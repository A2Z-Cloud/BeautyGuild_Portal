'use strict';
const express=require('express');
const {HttpError}=require('./errors');
const ID=/^\d{10,25}$/;
const DEFINITIONS={
 membership:{module:'Deals',draftField:'Application_Status',owner:'Contact_Name',fields:['Deal_Name','Stage','Membership_Type','Membership_Branch','Expiry_Date','Start_Date','Contact_Name','Amount','Payment_Status','Created_Time'],label:'Deal_Name',status:'Stage'},
 accreditation:{module:'Training_Centre_Accred',draftField:'Application_Stage',owner:'Applicant_Contact',fields:['Name','Account','Accreditation_Status','Application_Stage','Accreditation_Level','Valid_From','Valid_To','Applicant_Contact','Payment_Status','Created_Time'],label:'Account',status:'Accreditation_Status'},
 insurance:{module:'Insurance_Policy',draftField:'Application_Status',owner:'Contact',fields:['Application_Status','Policy_Type','Policy_Start_Date','Policy_End_Date','Contact','Created_Time','Quoted_Amount','Quote_Expiry','Stripe_Checkout_Session_ID'],label:'Policy_Type',status:'Application_Status'}
};
const DRAFT_STAGE='Draft';
const uri=(s)=>encodeURIComponent(String(s));
// The member's own contact details, used to fill in forms. Same Contact fields V1 read for its wizards.
const MY_FIELDS=['Salutation','First_Name','Last_Name','Email','Phone','Mobile','Interests','Correspondence_Address_Line_1','Correspondence_Address_Line_2',
  'Correspondence_Address_Line_3','Correspondence_Town','Correspondence_County','Correspondence_Postcode','Correspondence_Country'];
const text=v=>(v==null?'':String(v).trim());
function mapDetails(row){
  return {title:text(row.Salutation),firstName:text(row.First_Name),lastName:text(row.Last_Name),email:text(row.Email),phone:text(row.Phone),mobile:text(row.Mobile),
    addressLine1:text(row.Correspondence_Address_Line_1),addressLine2:text(row.Correspondence_Address_Line_2),addressLine3:text(row.Correspondence_Address_Line_3),
    town:text(row.Correspondence_Town),county:text(row.Correspondence_County),postcode:text(row.Correspondence_Postcode),country:text(row.Correspondence_Country),
    interests:Array.isArray(row.Interests)?row.Interests.map(text).filter(Boolean):[]};
}
function createCrmClient({getCrmHeaders,crmApiDomain,fetchImpl=fetch}){
  async function call(req,path){
    const headers=await getCrmHeaders(req);
    let r;
    try{r=await fetchImpl(crmApiDomain+'/crm/v3/'+path,{headers,signal:AbortSignal.timeout(10000)});}
    catch{throw new HttpError(502,'CRM_UNAVAILABLE','Records are temporarily unavailable.');}
    if(r.status===204)return [];
    if(!r.ok){throw new HttpError(502,'CRM_UNAVAILABLE','Records are temporarily unavailable.');}
    let body;
    try{body=await r.json();}catch{throw new HttpError(502,'CRM_UNAVAILABLE','Records are temporarily unavailable.');}
    if(!Array.isArray(body?.data))throw new HttpError(502,'CRM_UNAVAILABLE','Records are temporarily unavailable.');
    return body.data;
  }
  return {call};
}
async function resolveContact(req,call,user){
  if(!user?.id || !user.email)throw new HttpError(401,'SIGN_IN_REQUIRED','Sign in to see your records.');
  const rows=await call(req,'Contacts/search?email='+uri(user.email)+'&fields=Email,First_Name,Last_Name');
  const matches=rows.filter(x=>String(x.Email||'').trim().toLowerCase()===user.email.toLowerCase());
  if(matches.length===0)throw new HttpError(404,'CONTACT_UNLINKED','No Guild contact is linked to your account.');
  if(matches.length!==1)throw new HttpError(409,'CONTACT_AMBIGUOUS','Your account needs manual verification before records can be shown.');
  return matches[0];
}
// Insurance policies are named by their type in CRM ("Salon", "Non Salon"); give them a readable title.
function recordTitle(kind,base){
  const text=String(base||'').trim();
  if(!text)return kind+' record';
  if(kind==='insurance'&&!/insurance/i.test(text))return text.replace(/^Non[ -]?Salon$/i,'Non-salon')+' insurance';
  return text;
}
// A quote waiting for payment: what was quoted, whether its payment link can still be used, and Expired once the day has passed.
// The CRM status changes to Expired when someone tries to pay for a quote whose Stripe session has run out.
function insuranceQuoteFields(r){
  const waiting=r.Application_Status==='Ready for Payment',lapsed=waiting&&r.Quote_Expiry&&String(r.Quote_Expiry)<new Date().toISOString().slice(0,10);
  const amount=r.Quoted_Amount==null||r.Quoted_Amount===''?null:Number(r.Quoted_Amount);
  return {quotedAmount:Number.isFinite(amount)?amount:null,quoteExpiry:r.Quote_Expiry||null,
    ...(lapsed?{status:'Expired'}:{}),canPay:Boolean(waiting&&!lapsed&&r.Stripe_Checkout_Session_ID)};
}
function mapRecord(kind,r){
  const d=DEFINITIONS[kind];
  return {id:String(r.id),kind,title:recordTitle(kind,(typeof r[d.label]==='object'?r[d.label]?.name:r[d.label])),reference:kind==='accreditation'&&r.Name?String(r.Name):String(r.id),
    status:r[d.status]||r.Application_Stage||'Unknown',
    updated:r.Modified_Time||r.Created_Time||null,
    startDate:r.Start_Date||r.Valid_From||r.Policy_Start_Date||null,
    endDate:r.Expiry_Date||r.Valid_To||r.Policy_End_Date||null,
    paymentStatus:r.Payment_Status||null,type:r.Membership_Type||r.Accreditation_Level||r.Policy_Type||null,
    ...(kind==='insurance'?insuranceQuoteFields(r):{})};
}
function registerRecordRoutes(app,{enabled,getCurrentUser,getCrmHeaders,crmApiDomain,fetchImpl=fetch,hideDrafts=false,draftStatus='Draft'}){
  // Saved drafts live in the same CRM modules; they are never shown as real memberships, policies or accreditations.
  // Each module marks a draft in its own field: Deals and Insurance_Policy use Application_Status, Training_Centre_Accred uses
  // Application_Stage. V1 saves accreditation applications at stage Draft, so those are hidden even before V2 drafts are switched on.
  // Insurance applications the Insurance team is reviewing (Referred) are not shown to the member as a policy.
  const reviewing=(row,d)=>d.module==='Insurance_Policy'&&row.Application_Status==='Referred';
  const isDraft=(row,d)=>Boolean(row)&&(reviewing(row,d)||(d.draftField==='Application_Stage'?row.Application_Stage===DRAFT_STAGE:hideDrafts&&row[d.draftField]===draftStatus));
  const fieldList=d=>[...new Set([...d.fields,'Modified_Time',...(hideDrafts||d.draftField==='Application_Stage'||d.module==='Insurance_Policy'?[d.draftField]:[])])];
  const router=express.Router();
  const {call}=createCrmClient({getCrmHeaders,crmApiDomain,fetchImpl});
  router.use(async(req,res,next)=>{try{
    if(!enabled)throw new HttpError(503,'RECORDS_DISABLED','Member records are not configured.');
    const user=await getCurrentUser(req);
    req.portalContact=await resolveContact(req,call,user);
    next();
  }catch(e){next(e);}});
  async function list(req,kind){
    const d=DEFINITIONS[kind],items=[];
    const criteria='('+d.owner+':equals:'+req.portalContact.id+')';
    for(let page=1;page<=10;page++){
      const result=await call(req,d.module+'/search?criteria='+uri(criteria)+'&fields='+uri(fieldList(d).join(','))+'&page='+page+'&per_page=200');
      for(const record of result)if(String(record[d.owner]?.id)===String(req.portalContact.id)&&!isDraft(record,d))items.push(mapRecord(kind,record));
      if(result.length<200)return items;
    }
    throw new HttpError(503,'RECORDS_PAGE_LIMIT','This record list requires further pagination.');
  }
  const safe=fn=>async(req,res,next)=>{try{await fn(req,res);}catch(e){next(e);}};
  router.get('/',safe(async(req,res)=>{
    const kind=req.query.kind;
    if(kind && !DEFINITIONS[kind])throw new HttpError(400,'INVALID_SERVICE','Unknown service.');
    const kinds=kind?[kind]:Object.keys(DEFINITIONS);
    const groups=await Promise.all(kinds.map(k=>list(req,k)));
    const records=groups.flat().sort((a,b)=>String(b.updated).localeCompare(String(a.updated)));
    res.json({records});
  }));
  router.get('/summary',safe(async(req,res)=>{
    const groups=await Promise.all(Object.keys(DEFINITIONS).map(k=>list(req,k)));
    const records=groups.flat();
    res.json({summary:{total:records.length,
      memberships:groups[0].length,accreditations:groups[1].length,insurance:groups[2].length},
      recent:records.sort((a,b)=>String(b.updated).localeCompare(String(a.updated))).slice(0,8)});
  }));
  router.get('/me',safe(async(req,res)=>{
    const row=(await call(req,'Contacts/'+req.portalContact.id+'?fields='+uri(MY_FIELDS.join(','))))[0];
    if(!row||String(row.id)!==String(req.portalContact.id))throw new HttpError(404,'NOT_FOUND','Details not found.');
    res.json({details:mapDetails(row)});
  }));
  router.get('/:kind/:id',safe(async(req,res)=>{
    const {kind,id}=req.params;
    if(!DEFINITIONS[kind]||!ID.test(id))throw new HttpError(404,'NOT_FOUND','Record not found.');
    const d=DEFINITIONS[kind];
    const rows=await call(req,d.module+'/'+id+'?fields='+uri(fieldList(d).join(',')));
    const row=rows[0];
    if(!row || String(row[d.owner]?.id)!==String(req.portalContact.id) || isDraft(row,d))throw new HttpError(404,'NOT_FOUND','Record not found.');
    res.json({record:mapRecord(kind,row)});
  }));
  app.use('/portal/records',router);
}
module.exports={mapDetails,registerRecordRoutes,resolveContact,mapRecord,DEFINITIONS,createCrmClient};
