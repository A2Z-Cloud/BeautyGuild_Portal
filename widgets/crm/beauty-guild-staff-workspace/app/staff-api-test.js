/* Development staff API test console. Calls CRM SDK only; never contains signing secrets. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
function parseResponse(response){
 let v=response;
 // CRM SDK may wrap the function return in details.output or details.
 for(let i=0;i<3;i++){
   if(typeof v==='string'){try{v=JSON.parse(v);continue;}catch{return {message:v};}}
   if(v&&typeof v==='object'&&v.details&&v.details.output!==undefined){v=v.details.output;continue;}
   if(v&&typeof v==='object'&&v.details&&v.details.response!==undefined){v=v.details.response;continue;}
   break;
 }
 return v;
}
function errorMessage(err){
 const v=parseResponse(err);
 return v?.message||v?.error||v?.details?.message||String(err);
}
async function call(action,body){
 if(!window.ZOHO?.CRM?.FUNCTIONS?.execute)throw Error('CRM SDK functions are unavailable. Open this workspace inside a Zoho CRM Web Tab.');
 const args={action,body:action==='ping'||action==='me'?'':JSON.stringify(body||{})};
 const raw=await ZOHO.CRM.FUNCTIONS.execute('staff_api_call',{arguments:JSON.stringify(args)});
 const value=parseResponse(raw);
 if(value?.status==='error'||value?.ok===false||value?.error||value?.code==='NOT_ACTIVE')throw Error(errorMessage(value));
 return value;
}
function renderResult(value,error=false){
 const out=$('staff-api-output');if(!out)return;
 out.dataset.error=error?'true':'false';
 out.textContent=typeof value==='string'?value:JSON.stringify(value,null,2);
}
function open(){
 const d=$('staff-api-dialog');if(!d)return;
 d.showModal?.();
 if(!d.open)d.setAttribute('open','');
 renderResult('Run Ping first, then Me. Quotes require a test Contact and valid Portal V2 inputs.');
}
async function run(action){
 const buttons=[...document.querySelectorAll('[data-staff-api-action]')];
 buttons.forEach(b=>b.disabled=true);
 renderResult('Executing '+action+' through the Zoho CRM SDK…');
 try{
   let body={};
   if(action==='quote'||action==='save_revision'){
     const raw=$('staff-api-payload').value.trim();
     if(!raw)throw Error('Enter the complete JSON request body from the Staff API contract.');
     try{body=JSON.parse(raw);}catch{throw Error('Request body must be valid JSON.');}
     if(!body||Array.isArray(body)||typeof body!=='object'||!/^[0-9]{10,25}$/.test(String(body.contactId||'')))throw Error('A numeric CRM contactId is required in the JSON body.');
     if(action==='save_revision'){
       if(body.service!=='insurance_change'||!body.recordId)throw Error('Revision save requires service insurance_change and recordId.');
       if(!$('staff-api-confirm-save').checked)throw Error('Tick the Development-only confirmation before saving any CRM revision.');
       if(!window.confirm('This writes an insurance revision and may create draft CRM rows. Continue only with a disposable Development test policy?'))return;
     }
   }
   const value=await call(action,body);
   renderResult(value);
   if(action==='save_revision'&&value?.auditNote===false){
     renderResult({warning:'Revision saved, but CRM audit Note failed. Reconcile this record before continuing.',response:value},true);
   }
 }catch(e){renderResult({action,error:errorMessage(e),hint:'NOT_ACTIVE: check the standalone function REST API activation. STAFF_IDENTITY_NOT_RESOLVED: correct the trusted CRM user ID. 401: verify HMAC signing and profile. 503: verify CRM connection scope or backend feature flags.'},true);}
 finally{buttons.forEach(b=>b.disabled=false);}
}
document.addEventListener('DOMContentLoaded',()=>{
 const d=$('staff-api-dialog'),openBtn=$('staff-api-open');
 if(!d||!openBtn)return;
 openBtn.addEventListener('click',open);
 $('staff-api-close').addEventListener('click',()=>d.close?.());
 document.querySelectorAll('[data-staff-api-action]').forEach(button=>button.addEventListener('click',()=>run(button.dataset.staffApiAction)));
});
window.BGStaffApi={call};
})();
