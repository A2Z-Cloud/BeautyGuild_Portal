'use strict';
const express=require('express');
const {HttpError}=require('./errors');
const ID=/^\d{10,25}$/;
const DEFINITIONS={
 membership:{module:'Deals',owner:'Contact_Name',fields:['Deal_Name','Stage','Membership_Type','Membership_Branch','Expiry_Date','Start_Date','Contact_Name','Amount','Payment_Status','Created_Time'],label:'Deal_Name',status:'Stage'},
 accreditation:{module:'Training_Centre_Accred',owner:'Applicant_Contact',fields:['Name','Account','Accreditation_Status','Application_Stage','Accreditation_Level','Valid_From','Valid_To','Applicant_Contact','Payment_Status','Created_Time'],label:'Account',status:'Accreditation_Status'},
 insurance:{module:'Insurance_Policy',owner:'Contact',fields:['Application_Status','Policy_Type','Policy_Start_Date','Policy_End_Date','Contact','Created_Time'],label:'Policy_Type',status:'Application_Status'}
};
const uri=(s)=>encodeURIComponent(String(s));
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
function mapRecord(kind,r){
  const d=DEFINITIONS[kind];
  return {id:String(r.id),kind,title:recordTitle(kind,(typeof r[d.label]==='object'?r[d.label]?.name:r[d.label])),reference:kind==='accreditation'&&r.Name?String(r.Name):String(r.id),
    status:r[d.status]||r.Application_Stage||'Unknown',
    updated:r.Modified_Time||r.Created_Time||null,
    startDate:r.Start_Date||r.Valid_From||r.Policy_Start_Date||null,
    endDate:r.Expiry_Date||r.Valid_To||r.Policy_End_Date||null,
    paymentStatus:r.Payment_Status||null,type:r.Membership_Type||r.Accreditation_Level||r.Policy_Type||null};
}
function registerRecordRoutes(app,{enabled,getCurrentUser,getCrmHeaders,crmApiDomain,fetchImpl=fetch,hideDrafts=false,draftStatus='Draft'}){
  // Saved drafts live in the same CRM modules; they are never shown as real memberships, policies or accreditations.
  const isDraft=row=>hideDrafts&&row&&row.Application_Status===draftStatus;
  const fieldList=d=>[...new Set([...d.fields,'Modified_Time',...(hideDrafts?['Application_Status']:[])])];
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
      for(const record of result)if(String(record[d.owner]?.id)===String(req.portalContact.id)&&!isDraft(record))items.push(mapRecord(kind,record));
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
  router.get('/:kind/:id',safe(async(req,res)=>{
    const {kind,id}=req.params;
    if(!DEFINITIONS[kind]||!ID.test(id))throw new HttpError(404,'NOT_FOUND','Record not found.');
    const d=DEFINITIONS[kind];
    const rows=await call(req,d.module+'/'+id+'?fields='+uri(fieldList(d).join(',')));
    const row=rows[0];
    if(!row || String(row[d.owner]?.id)!==String(req.portalContact.id) || isDraft(row))throw new HttpError(404,'NOT_FOUND','Record not found.');
    res.json({record:mapRecord(kind,row)});
  }));
  app.use('/portal/records',router);
}
module.exports={registerRecordRoutes,resolveContact,mapRecord,DEFINITIONS,createCrmClient};
