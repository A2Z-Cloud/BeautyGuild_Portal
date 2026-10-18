'use strict';
const express = require('express');
const {HttpError} = require('./errors');
const SERVICE = new Set(['membership','accreditation','insurance']);
const IDENTIFIER = /^\d{10,25}$/;
const MAX_ANSWERS = 45000;
const LIMIT = 200;

function validInput(body) {
  if(!body || !SERVICE.has(body.service) || !Number.isSafeInteger(body.step) || body.step<0 || body.step>100 ||
     !body.answers || typeof body.answers!=='object' || Array.isArray(body.answers))
    throw new HttpError(422,'INVALID_DRAFT','A service, step and answers object are required.');
  const answers=JSON.stringify(body.answers);
  if(answers.length>MAX_ANSWERS)throw new HttpError(413,'DRAFT_TOO_LARGE','This application is too large to save.');
  return {service:body.service,step:body.step,answers};
}
function own(row,user) {
  if(!row || String(row.Owner_User_ID)!==String(user.id))throw new HttpError(404,'NOT_FOUND','Draft not found.');
  return row;
}
function result(row,withAnswers=true) {
  return {id:String(row.ROWID),service:row.Service,step:Number(row.Step||0),
    revision:Number(row.Revision||1),updatedAt:row.Updated_At||null,status:row.Status||'Draft',
    ...(withAnswers?{answers:JSON.parse(row.Payload||'{}')}:{})};
}
async function allRows(table) {
  let token,rows=[],pages=0;
  do {
    const p=await table.getPagedRows({maxRows:LIMIT,...(token?{nextToken:token}:{})});
    rows.push(...(p?.data||[]));
    token=p?.nextToken||p?.next_token||null;
    pages++;
  } while(token && pages<25);
  // Fail closed rather than silently hiding records when the table outgrows bounded scans.
  if(token)throw new HttpError(503,'DRAFT_QUERY_LIMIT','Draft search is temporarily unavailable.');
  return rows;
}
function registerDraftRoutes(app,{enabled,getCurrentUser,getDraftTable}) {
  const router=express.Router();
  router.use(express.json({limit:'64kb'}));
  router.use(async(req,res,next)=>{
    try {
      if(!enabled)throw new HttpError(503,'DRAFTS_DISABLED','Draft storage is not configured.');
      if(typeof getCurrentUser!=='function'||typeof getDraftTable!=='function')throw new HttpError(503,'DRAFTS_DISABLED','Draft storage is unavailable.');
      const user=await getCurrentUser(req);
      if(!user?.id)throw new HttpError(401,'SIGN_IN_REQUIRED','Please verify your account before saving.');
      req.portalUser=user;
      req.portalDraftTable=await getDraftTable(req);
      next();
    }catch(e){next(e);}
  });
  const run=fn=>async(req,res,next)=>{try{await fn(req,res);}catch(e){next(e);}};
  router.get('/',run(async(req,res)=>{
    const rows=await allRows(req.portalDraftTable);
    const results=rows.filter(row=>row.Owner_User_ID===req.portalUser.id && row.Status==='Draft')
      .map(row=>result(row,false)).sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)));
    res.json({drafts:results});
  }));
  router.post('/',run(async(req,res)=>{
    const input=validInput(req.body);
    const now=new Date().toISOString();
    const row=await req.portalDraftTable.insertRow({
      Owner_User_ID:req.portalUser.id,Service:input.service,Step:input.step,
      Payload:input.answers,Status:'Draft',Revision:1,Updated_At:now,
    });
    res.status(201).json({draft:result(row)});
  }));
  router.param('id',(req,res,next,id)=>{
    if(!IDENTIFIER.test(id))return next(new HttpError(404,'NOT_FOUND','Draft not found.'));
    next();
  });
  router.get('/:id',run(async(req,res)=>{
    const row=own(await req.portalDraftTable.getRow(req.params.id),req.portalUser);
    if(row.Status!=='Draft')throw new HttpError(404,'NOT_FOUND','Draft not found.');
    res.json({draft:result(row)});
  }));
  router.put('/:id',run(async(req,res)=>{
    const old=own(await req.portalDraftTable.getRow(req.params.id),req.portalUser);
    if(old.Status!=='Draft')throw new HttpError(409,'CLOSED_DRAFT','This draft can no longer be edited.');
    const input=validInput(req.body);
    if(input.service!==old.Service)throw new HttpError(422,'SERVICE_MISMATCH','Draft service cannot be changed.');
    if(req.body.revision!==Number(old.Revision))throw new HttpError(409,'REVISION_CONFLICT','This draft changed elsewhere. Reload it before editing.');
    const updated=await req.portalDraftTable.updateRow({ROWID:old.ROWID,Owner_User_ID:req.portalUser.id,
      Service:old.Service,Payload:input.answers,Step:input.step,Revision:Number(old.Revision)+1,
      Status:'Draft',Updated_At:new Date().toISOString()});
    res.json({draft:result(updated)});
  }));
  router.delete('/:id',run(async(req,res)=>{
    const old=own(await req.portalDraftTable.getRow(req.params.id),req.portalUser);
    if(old.Status!=='Draft')throw new HttpError(409,'CLOSED_DRAFT','Draft is not editable.');
    await req.portalDraftTable.deleteRow(old.ROWID);
    res.json({discarded:true});
  }));
  app.use('/portal/drafts',router);
}
module.exports={registerDraftRoutes,validInput,own,result};
