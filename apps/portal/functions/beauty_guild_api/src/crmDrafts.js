'use strict';
// CRM is the only persistent draft store. No Catalyst DataStore or browser-supplied Contact ID.
const express=require('express');
const crypto=require('node:crypto');
const {HttpError}=require('./errors');
const {resolveContact}=require('./records');
const SERVICES={membership:'Deals',insurance:'Insurance_Policy',accreditation:'Training_Centre_Accred'};
const CRMID=/^\d{10,25}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DRAFT_TITLE='Beauty Guild Portal draft v1';
const MAX_PAYLOAD=60000;
const quote=v=>encodeURIComponent(String(v));
const fail=(code,message,status=422)=>{throw new HttpError(status,code,message);};

function validateDraft(body){
 if(!body||!['membership','insurance','accreditation','combined'].includes(body.service))fail('INVALID_SERVICE','Select a valid application.');
 if(!UUID.test(String(body.journeyId||'')))fail('INVALID_JOURNEY','An application reference is required.');
 if(!Number.isInteger(body.step)||body.step<0||body.step>50)fail('INVALID_STEP','The current step is invalid.');
 if(!body.answers||typeof body.answers!=='object'||Array.isArray(body.answers))fail('INVALID_ANSWERS','Application answers are missing.');
 const raw=JSON.stringify(body.answers);
 if(raw.length>MAX_PAYLOAD)fail('PAYLOAD_TOO_LARGE','The application is too large.',413);
 if(body.service==='combined' && (!body.answers.membership||!body.answers.insurance))fail('INVALID_COMBINED','Both components are required.');
 return {service:body.service,journeyId:body.journeyId,step:body.step,answers:body.answers,revision:body.revision};
}
function pack(doc){return 'BGPORTALv1:'+Buffer.from(JSON.stringify(doc),'utf8').toString('base64');}
function unpack(value){
 if(typeof value!=='string'||!value.startsWith('BGPORTALv1:'))fail('INVALID_DRAFT_STATE','This draft could not be restored.',409);
 try{
   const v=JSON.parse(Buffer.from(value.slice(11),'base64').toString('utf8'));
   if(v?.version!==1||!UUID.test(v?.journeyId)||!Number.isSafeInteger(v.revision)||v.revision<1)throw Error('invalid');
   return v;
 }catch{fail('INVALID_DRAFT_STATE','This draft could not be restored.',409);}
}
function ensureOwnership(row,contactId){
 const owner=row?.Contact_Name||row?.Contact||row?.Applicant_Contact;
 if(!row?.id||String(owner?.id)!==String(contactId))fail('NOT_FOUND','Application not found.',404);
 if(row.Application_Status!=='Draft')fail('NOT_DRAFT','This application can no longer be edited.',409);
 return row;
}
function metaField(fields,name){
 return fields.find(f=>f.api_name===name);
}
function textField(fields,name){
 const f=metaField(fields,name);
 if(!f||!['text','textarea','integer','bigint','datetime','lookup','multiselectpicklist','picklist'].includes(String(f.data_type||'').toLowerCase()))fail('FIELD_NOT_READY','CRM draft metadata requires review: '+name,503);
 return f;
}
// CRM reports an empty object for a field that allows duplicates and a populated object for a unique one.
function isUnique(u){return u===true||Boolean(u&&typeof u==='object'&&Object.keys(u).length>0);}
function checkMetadata(module,fields,config){
 for(const name of ['Application_Status','Journey_ID','Last_Completed_Journey_Step','Draft_State_Reference','Draft_Saved_At'])textField(fields,name);
 const status=metaField(fields,'Application_Status');
 const options=(status.pick_list_values||[]).map(x=>x.actual_value||x.display_value);
 if(!options.includes(config.draftStatus))fail('STATUS_NOT_READY','CRM draft status is not configured.',503);
 const j=metaField(fields,'Journey_ID');
 if(config.draftRequireUnique!==false&&!isUnique(j.unique))fail('JOURNEY_UNIQUE_REQUIRED','Journey_ID must be a CRM unique field to prevent duplicate saves.',503);
 if(module==='Deals'){
  textField(fields,'Contact_Name');textField(fields,'Stage');textField(fields,'Deal_Name');
  // The module-level Stage list does not show every stage a layout or pipeline offers (it omits Active and Paid, for example), so the
  // configured stage is trusted here. CRM itself refuses a stage it does not know, and the save then fails without writing anything.
  if(!config.dealStage)fail('DEAL_STAGE_REQUIRED','Configure the Deal Stage used for CRM drafts.',503);
 }
 if(module==='Insurance_Policy'){textField(fields,'Contact');textField(fields,'Membership');}
 if(module==='Training_Centre_Accred')textField(fields,'Applicant_Contact');
}
function registerDraftRoutes(app,{enabled,getCurrentUser,getCrmHeaders,crmApiDomain,config,fetchImpl=fetch}){
 const router=express.Router();
 router.use(express.json({limit:'100kb'}));
 const request=async(req,method,path,payload)=>{
  const headers={...(await getCrmHeaders(req)),Accept:'application/json'};
  if(payload!==undefined)headers['Content-Type']='application/json';
  let response;
  try{response=await fetchImpl(crmApiDomain+'/crm/v3/'+path,{method,headers,
    ...(payload!==undefined?{body:JSON.stringify(payload)}:{}),signal:AbortSignal.timeout(20000)});}
  catch{fail('CRM_UNAVAILABLE','CRM could not be reached. Nothing has been confirmed saved.',502);}
  if(response.status===204)return {data:[]};
  const json=await response.json().catch(()=>null);
  if(!response.ok||json?.data?.[0]?.status==='error'){
    const error=json?.data?.[0]?.code||json?.code||'CRM_WRITE_FAILED';
    if(error==='DUPLICATE_DATA')fail('REVISION_CONFLICT','This application is already being saved. Please reload it.',409);
    fail('CRM_'+String(error).replace(/[^A-Z_]/gi,''),'CRM did not confirm the operation. Please retry.',502);
  }
  return json||{};
 };
 const detail=async(req,module,id)=>{
  if(!CRMID.test(String(id)))fail('NOT_FOUND','Application not found.',404);
  const res=await request(req,'GET',module+'/'+id);
  return res.data?.[0]||null;
 };
 const fields=async(req,module)=>{
  const r=await request(req,'GET','settings/fields?module='+quote(module));
  if(!Array.isArray(r.fields))fail('FIELD_NOT_READY','CRM fields could not be checked.',503);
  checkMetadata(module,r.fields,config);
  return r.fields;
 };
 // Same identity rule as member records: the verified Catalyst email must match exactly one CRM Contact.
 const contact=async(req)=>resolveContact(req,async(r,path)=>(await request(r,'GET',path)).data||[],await getCurrentUser(req));
 const findByJourney=async(req,module,journeyId,contactId)=>{
  const r=await request(req,'GET',module+'/search?criteria='+quote('(Journey_ID:equals:'+journeyId+')'));
  const rows=(r.data||[]).filter(v=>v.Journey_ID===journeyId);
  if(rows.length>1)fail('JOURNEY_CONFLICT','Multiple CRM records have the same journey reference.',409);
  if(!rows.length)return null;
  return ensureOwnership(rows[0],contactId);
 };
 const saveNote=async(req,module,row,state)=>{
  const noteId=row.Draft_State_Reference?.id||row.Draft_State_Reference;
  const payload={Note_Title:DRAFT_TITLE,Note_Content:pack(state)};
  if(noteId&&CRMID.test(String(noteId))){
   const out=await request(req,'PUT','Notes/'+noteId,{data:[payload]});
   if(out.data?.[0]?.status!=='success')fail('NOTE_FAILED','CRM did not confirm draft state.',502);
   return String(noteId);
  }
  const out=await request(req,'POST',module+'/'+row.id+'/Notes',{data:[payload]});
  const id=out.data?.[0]?.details?.id;
  if(!id)fail('NOTE_FAILED','CRM did not confirm draft state.',502);
  const link=await request(req,'PUT',module+'/'+row.id,{data:[{Draft_State_Reference:String(id)}]});
  if(link.data?.[0]?.status!=='success')fail('NOTE_LINK_FAILED','Draft was partially written; retry with the same reference.',502);
  return String(id);
 };
 const loadState=async(req,row)=>{
  const id=row.Draft_State_Reference?.id||row.Draft_State_Reference;
  if(!id||!CRMID.test(String(id)))fail('INCOMPLETE_DRAFT','Draft save is incomplete. Retry using its journey reference.',409);
  const note=await request(req,'GET','Notes/'+id);
  const state=unpack(note.data?.[0]?.Note_Content);
  if(state.journeyId!==row.Journey_ID)fail('DRAFT_MISMATCH','CRM draft references do not match.',409);
  return state;
 };
 const saveParent=async(req,module,journey,person,old,more={})=>{
  const status=config.draftStatus;
  const data={Journey_ID:journey,Application_Status:status,
    Last_Completed_Journey_Step:0,Draft_Saved_At:new Date().toISOString(),...more};
  if(module==='Deals'){data.Contact_Name={id:person.id};data.Deal_Name='Membership application '+journey.slice(0,8);data.Stage=config.dealStage;}
  if(module==='Insurance_Policy')data.Contact={id:person.id};
  if(module==='Training_Centre_Accred')data.Applicant_Contact={id:person.id};
  // Plain create, never an upsert: if the unique Journey_ID already exists, CRM rejects it (409) rather than updating that record.
  const r=await request(req,'POST',module,{data:[data]});
  const id=r.data?.[0]?.details?.id;
  if(!id)fail('CREATE_UNCONFIRMED','CRM did not confirm draft creation.',502);
  return ensureOwnership(await detail(req,module,id),person.id);
 };
 const writeOne=async(req,module,body,person,component,refId)=>{
  await fields(req,module);
  let row=refId?ensureOwnership(await detail(req,module,refId),person.id):await findByJourney(req,module,body.journeyId,person.id);
  if(!row)row=await saveParent(req,module,body.journeyId,person,null,component);
  if(row.Journey_ID!==body.journeyId)fail('JOURNEY_MISMATCH','This record belongs to a different application.',409);
  let previous;
  if(row.Draft_State_Reference)previous=await loadState(req,row);
  const revision=previous?.revision||0;
  if(previous||refId){
   if(!Number.isInteger(body.revision))fail('REVISION_REQUIRED','Reload your application before saving.',422);
   if(body.revision!==revision)fail('REVISION_CONFLICT','This draft has changed. Reload before saving.',409);
  }
  const next={version:1,journeyId:body.journeyId,service:body.service,step:body.step,
    revision:revision+1,answers:body.answers,savedAt:new Date().toISOString()};
  await saveNote(req,module,row,next);
  const update=await request(req,'PUT',module+'/'+row.id,{data:[{
    Last_Completed_Journey_Step:body.step,Draft_Saved_At:next.savedAt
  }]});
  if(update.data?.[0]?.status!=='success')fail('SAVE_INCOMPLETE','CRM did not confirm the last step.',502);
  return {id:row.id,service:body.service,journeyId:body.journeyId,revision:next.revision,step:body.step,savedAt:next.savedAt,answers:body.answers};
 };
 const withAuth=fn=>async(req,res,next)=>{try{
  if(!enabled)fail('DRAFTS_DISABLED','CRM drafts are not enabled.',503);
  req.draftContact=await contact(req);
  await fn(req,res);
 }catch(e){next(e);}};
 const kind=x=>{if(!SERVICES[x])fail('INVALID_SERVICE','Unknown application type.',400);return SERVICES[x];};
 router.post('/',withAuth(async(req,res)=>{
  const d=validateDraft(req.body);
  if(d.service==='accreditation')fail('ACCREDITATION_ADAPTER_REQUIRED','Accreditation must retain its existing CRM related records. The V1 adapter has not been migrated.',503);
  if(d.service==='combined'){
   await fields(req,'Deals');await fields(req,'Insurance_Policy');
   const membership=await writeOne(req,'Deals',d,req.draftContact);
   const insurance=await writeOne(req,'Insurance_Policy',d,req.draftContact,{Membership:{id:membership.id}});
   return res.status(201).json({draft:{...membership,membershipId:membership.id,insuranceId:insurance.id}});
  }
  const result=await writeOne(req,kind(d.service),d,req.draftContact);
  res.status(201).json({draft:result});
 }));
 router.get('/',withAuth(async(req,res)=>{
  const drafts=[],perModule={};
  for(const [service,module] of Object.entries(SERVICES)){
   const rows=[];
   for(let page=1;page<=10;page++){
    const response=await request(req,'GET',module+'/search?criteria='+quote('('+(service==='membership'?'Contact_Name':service==='insurance'?'Contact':'Applicant_Contact')+':equals:'+req.draftContact.id+')')+'&page='+page+'&per_page=200');
    const batch=response.data||[];
    rows.push(...batch);
    if(batch.length<200)break;
    if(page===10)fail('DRAFT_LIST_LIMIT','Too many drafts to list safely.',503);
   }
   perModule[service]=rows.filter(row=>String((row.Contact_Name||row.Contact||row.Applicant_Contact)?.id)===String(req.draftContact.id)&&row.Application_Status==='Draft');
  }
  const linked=new Set();
  for(const m of perModule.membership){
   const i=perModule.insurance.find(x=>x.Journey_ID&&x.Journey_ID===m.Journey_ID&&String(x.Membership?.id)===String(m.id));
   if(i)linked.add(i.id);
   drafts.push({id:String(m.id),service:i?'combined':'membership',journeyId:m.Journey_ID,
     step:Number(m.Last_Completed_Journey_Step||0),updatedAt:m.Draft_Saved_At||null,status:'Draft'});
  }
  for(const i of perModule.insurance)if(!linked.has(i.id)){
   drafts.push({id:String(i.id),service:'insurance',journeyId:i.Journey_ID,
     step:Number(i.Last_Completed_Journey_Step||0),updatedAt:i.Draft_Saved_At||null,status:'Draft'});
  }
  for(const a of perModule.accreditation){
   drafts.push({id:String(a.id),service:'accreditation',journeyId:a.Journey_ID,
     step:Number(a.Last_Completed_Journey_Step||0),updatedAt:a.Draft_Saved_At||null,status:'Draft'});
  }
  res.json({drafts:drafts.sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)))});
 }));
 async function combined(req,id){
  const membership=ensureOwnership(await detail(req,'Deals',id),req.draftContact.id);
  const insurance=await findByJourney(req,'Insurance_Policy',membership.Journey_ID,req.draftContact.id);
  if(!insurance||String(insurance.Membership?.id)!==String(id))fail('INCOMPLETE_COMBINED','This linked insurance application needs reconciliation.',409);
  return {membership,insurance};
 }
 router.get('/:service/:id',withAuth(async(req,res)=>{
  if(req.params.service==='combined'){
   const {membership,insurance}=await combined(req,req.params.id);
   const left=await loadState(req,membership),right=await loadState(req,insurance);
   if(left.journeyId!==right.journeyId||left.revision!==right.revision)fail('REVISION_CONFLICT','The combined application is out of sync.',409);
   return res.json({draft:{id:String(membership.id),service:'combined',...left,membershipId:String(membership.id),insuranceId:String(insurance.id)}});
  }
  const module=kind(req.params.service),row=ensureOwnership(await detail(req,module,req.params.id),req.draftContact.id);
  res.json({draft:{id:String(row.id),service:req.params.service,...await loadState(req,row)}});
 }));
 router.put('/:service/:id',withAuth(async(req,res)=>{
  const d=validateDraft(req.body);
  if(d.service!==req.params.service)fail('SERVICE_MISMATCH','Application type cannot change.');
  if(d.service==='accreditation')fail('ACCREDITATION_ADAPTER_REQUIRED','Accreditation CRM relationship adapter has not yet been migrated.',503);
  if(d.service==='combined'){
   const {membership,insurance}=await combined(req,req.params.id);
   if(d.journeyId!==membership.Journey_ID)fail('JOURNEY_MISMATCH','Application references do not match.',409);
   const left=await loadState(req,membership),right=await loadState(req,insurance);
   if(d.revision!==left.revision||d.revision!==right.revision)fail('REVISION_CONFLICT','Reload before changing this application.',409);
   const m=await writeOne(req,'Deals',d,req.draftContact,{},membership.id);
   const i=await writeOne(req,'Insurance_Policy',d,req.draftContact,{Membership:{id:membership.id}},insurance.id);
   return res.json({draft:{...m,insuranceId:i.id}});
  }
  const module=kind(req.params.service);
  res.json({draft:await writeOne(req,module,d,req.draftContact,{},req.params.id)});
 }));
 const remove=async(req,module,id)=>{
  const out=await request(req,'DELETE',module+'?ids='+quote(id));
  if(!Array.isArray(out.data)||out.data[0]?.status!=='success')fail('DELETE_UNCONFIRMED','CRM did not confirm discard.',502);
 };
 router.delete('/:service/:id',withAuth(async(req,res)=>{
  if(req.params.service==='combined'){
   const {membership,insurance}=await combined(req,req.params.id);
   await remove(req,'Insurance_Policy',insurance.id);
   await remove(req,'Deals',membership.id);
   return res.json({discarded:true});
  }
  const module=kind(req.params.service),row=ensureOwnership(await detail(req,module,req.params.id),req.draftContact.id);
  if(req.params.service==='accreditation')fail('ACCREDITATION_ADAPTER_REQUIRED','Accreditation discard requires established related-record cleanup.',503);
  await remove(req,module,row.id);
  res.json({discarded:true});
 }));
 app.use('/portal/drafts',router);
}
module.exports={registerDraftRoutes,validateDraft,pack,unpack,ensureOwnership,checkMetadata};
