'use strict';
// Read-only CRM METADATA lookup (module and field names, types and picklist values) for the owner
// while connecting the portal to the CRM. It returns no record data. It is off by default and, when
// on, answers only to signed-in users whose verified email is on an explicit allow list; everyone
// else gets a plain 404 so its existence is not revealed. Switch it off again when finished.
const express=require('express');
const {HttpError}=require('./errors');
const {createAnalyticsClient}=require('./analytics');
const NAME=/^[A-Za-z][A-Za-z0-9_]{0,49}$/;
const trimField=f=>({
  api_name:f.api_name,label:f.field_label||null,type:f.data_type||null,custom:f.custom_field===true,
  mandatory:f.system_mandatory===true||f.required===true,
  unique:Boolean(f.unique===true||(f.unique&&typeof f.unique==='object'&&Object.keys(f.unique).length>0)),
  lookup:f.lookup?.module?.api_name||null,
  unique_raw:f.unique===undefined?null:f.unique,
  options:Array.isArray(f.pick_list_values)?f.pick_list_values.slice(0,40).map(o=>o.actual_value||o.display_value).filter(Boolean):undefined,
});
function registerDiagnosticsRoutes(app,{enabled,allowedEmails=[],allowedDomains=[],getCurrentUser,getCrmHeaders,crmApiDomain,fetchImpl=fetch,risk=null,getAnalyticsHeaders,getCreatorHeaders}){
  const router=express.Router();
  const notFound=()=>new HttpError(404,'NOT_FOUND','Not found.');
  // An exact address, or an address on a listed domain or one of its subdomains. Never a "contains" match:
  // anyone can sign up to the portal, and beautyguild.attacker.test would contain "beautyguild".
  const permitted=email=>{
    if(allowedEmails.includes(email))return true;
    const domain=email.split('@').pop();
    return email.split('@').length===2&&allowedDomains.some(d=>domain===d||domain.endsWith('.'+d));
  };
  router.use(async(req,res,next)=>{
    try{
      if(!enabled||!(allowedEmails.length||allowedDomains.length))throw notFound();
      const user=await getCurrentUser(req);
      if(!user?.email||!permitted(String(user.email).toLowerCase()))throw notFound();
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
  // Risk-check sources (names only, never values): the sanctions table's columns and freshness, and the
  // fields of the flood and subsidence reports, so the checks can be pointed at the right names.
  if(risk){
    const analytics=createAnalyticsClient({getAnalyticsHeaders,apiDomain:risk.analytics.apiDomain,orgId:risk.analytics.orgId,workspaceId:risk.analytics.workspaceId,fetchImpl});
    const table=risk.analytics.table;
    router.get('/analytics',run(async(req,res)=>{
      try{
        const orgs=(await analytics.orgs(req)).map(o=>({orgId:o.orgId,orgName:o.orgName}));
        const view=await analytics.view(req,table);
        const sample=await analytics.sql(req,'SELECT * FROM "'+table+'" LIMIT 1');
        const count=await analytics.sql(req,'SELECT COUNT(*) AS n FROM "'+table+'"');
        res.json({orgs,workspaceId:risk.analytics.workspaceId,table,viewId:view.id,lastModified:view.lastModified?view.lastModified.toISOString():null,
          detailKeys:Object.keys(view.details||{}),listedKeys:Object.keys(view.listed||{}),listedTimes:Object.fromEntries(Object.entries(view.listed||{}).filter(([k])=>/time|modified|updated/i.test(k))),times:{created:view.details?.createdTime||null,lastDesignModified:view.details?.lastDesignModifiedTime||null},columns:Object.keys(sample[0]||{}),rows:Number(Object.values(count[0]||{})[0])});
      }catch(e){throw new HttpError(502,'ANALYTICS_UNAVAILABLE','Analytics said: '+String(e.message).slice(0,200));}
    }));
    router.get('/creator-report',run(async(req,res)=>{
      const report=String(req.query.report||'');
      if(![risk.creator.floodReport,risk.creator.subsidenceReport].includes(report))throw new HttpError(400,'INVALID_REQUEST','Use the flood or subsidence report name.');
      // Optional test criteria (e.g. Active==true && Postcode_Key=="AB101AU"): plain comparison characters only.
      const criteria=String(req.query.criteria||'');
      if(criteria&&!/^[A-Za-z0-9_=&|()". ]{1,120}$/.test(criteria))throw new HttpError(400,'INVALID_REQUEST','Use a simple criteria.');
      const url=risk.creator.apiDomain+'/creator/v2.1/data/'+encodeURIComponent(risk.creator.owner)+'/'+encodeURIComponent(risk.creator.app)+'/report/'+encodeURIComponent(report)+'?field_config=all&max_records=200'+(criteria?'&criteria='+encodeURIComponent(criteria):'');
      let r,body;
      try{r=await fetchImpl(url,{headers:await getCreatorHeaders(req),signal:AbortSignal.timeout(15000)});body=await r.json().catch(()=>null);}
      catch{throw new HttpError(502,'CREATOR_UNAVAILABLE','Creator could not be reached.');}
      res.json({report,status:r.status,code:body?.code??null,message:body?.message||null,fields:Object.keys((body?.data||[])[0]||{}),returned:Array.isArray(body?.data)?body.data.length:null});
    }));
  }
  app.use('/portal/diagnostics',router);
}
module.exports={registerDiagnosticsRoutes,trimField};
