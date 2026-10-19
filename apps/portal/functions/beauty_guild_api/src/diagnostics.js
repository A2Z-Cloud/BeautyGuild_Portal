'use strict';
// Read-only CRM METADATA lookup (module and field names, types and picklist values) for the owner
// while connecting the portal to the CRM. It returns no record data. It is off by default and, when
// on, answers only to signed-in users whose verified email is on an explicit allow list; everyone
// else gets a plain 404 so its existence is not revealed. Switch it off again when finished.
const express=require('express');
const {HttpError}=require('./errors');
const NAME=/^[A-Za-z][A-Za-z0-9_]{0,49}$/;
const trimField=f=>({
  api_name:f.api_name,label:f.field_label||null,type:f.data_type||null,custom:f.custom_field===true,
  mandatory:f.system_mandatory===true||f.required===true,
  unique:Boolean(f.unique===true||(f.unique&&typeof f.unique==='object'&&Object.keys(f.unique).length>0)),
  lookup:f.lookup?.module?.api_name||null,
  unique_raw:f.unique===undefined?null:f.unique,
  options:Array.isArray(f.pick_list_values)?f.pick_list_values.slice(0,40).map(o=>o.actual_value||o.display_value).filter(Boolean):undefined,
});
function registerDiagnosticsRoutes(app,{enabled,allowedEmails=[],getCurrentUser,getCrmHeaders,crmApiDomain,fetchImpl=fetch}){
  const router=express.Router();
  const notFound=()=>new HttpError(404,'NOT_FOUND','Not found.');
  router.use(async(req,res,next)=>{
    try{
      if(!enabled||!allowedEmails.length)throw notFound();
      const user=await getCurrentUser(req);
      if(!user?.email||!allowedEmails.includes(String(user.email).toLowerCase()))throw notFound();
      next();
    }catch(e){next(e);}
  });
  async function crm(req,path){
    let r;
    try{r=await fetchImpl(crmApiDomain+'/crm/v3/'+path,{headers:await getCrmHeaders(req),signal:AbortSignal.timeout(15000)});}
    catch{throw new HttpError(502,'CRM_UNAVAILABLE','The CRM could not be reached.');}
    if(r.status===204)return {};
    const body=await r.json().catch(()=>null);
    if(!r.ok||!body)throw new HttpError(502,'CRM_UNAVAILABLE','The CRM did not return metadata ('+r.status+').');
    return body;
  }
  const run=fn=>async(req,res,next)=>{try{await fn(req,res);}catch(e){next(e);}};
  router.get('/modules',run(async(req,res)=>{
    const body=await crm(req,'settings/modules');
    res.json({modules:(body.modules||[]).filter(m=>m.api_supported!==false).map(m=>({api_name:m.api_name,label:m.plural_label||m.singular_label||null,custom:m.generated_type==='custom'}))});
  }));
  router.get('/fields',run(async(req,res)=>{
    const module=String(req.query.module||'');
    if(!NAME.test(module))throw new HttpError(400,'INVALID_REQUEST','Give a module API name.');
    const body=await crm(req,'settings/fields?module='+encodeURIComponent(module));
    res.json({module,fields:(body.fields||[]).map(trimField)});
  }));
  // Convenience: /find?modules=Accounts,Training_Centres&q=registration lists matching field names.
  router.get('/find',run(async(req,res)=>{
    const q=String(req.query.q||'').trim().toLowerCase();
    const modules=String(req.query.modules||'').split(',').map(s=>s.trim()).filter(Boolean).slice(0,12);
    if(q.length<2||!modules.length||modules.some(m=>!NAME.test(m)))throw new HttpError(400,'INVALID_REQUEST','Give a search word and module API names.');
    const found={};
    for(const module of modules){
      const body=await crm(req,'settings/fields?module='+encodeURIComponent(module));
      found[module]=(body.fields||[]).filter(f=>String(f.api_name||'').toLowerCase().includes(q)||String(f.field_label||'').toLowerCase().includes(q)).map(trimField);
    }
    res.json({found});
  }));
  app.use('/portal/diagnostics',router);
}
module.exports={registerDiagnosticsRoutes,trimField};
