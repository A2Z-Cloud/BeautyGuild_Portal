import {clearStored,readStored,writeStored} from './storedState.js';
import {CONFIRMATIONS} from './insuranceInputs.js';
import {startLimits} from './startDate.js';

// Save and finish later for the Join the Guild and Buy insurance pages. The answers go to the CRM against the signed-in account
// (portalApi drafts); the tab keeps only a small reference to the draft. Agreement boxes and insurance confirmations are never saved
// or restored, so the customer agrees again, and nothing about payment is stored.
export const SAVED_MESSAGE='Your application has been saved. You can finish it later from Saved applications.';
export const CHANGED_MESSAGE='This application has changed elsewhere. Please reload the page before saving.';
const REF='draft',PENDING='save_pending';
export const noConfirmations=iv=>{const o={...(iv||{})};for(const k of CONFIRMATIONS)delete o[k];return o;};
export const validStart=start=>start&&start>=startLimits().min?start:'';
export const draftRef=storage=>{const r=readStored(REF,null,storage);return r&&r.id?r:null;};
export const forgetDraftRef=(id,storage)=>{const r=draftRef(storage);if(r&&(!id||String(r.id)===String(id)))writeStored(REF,{},storage);};
export const setSavePending=(on,storage)=>writeStored(PENDING,{pending:Boolean(on)},storage);
export const takeSavePending=storage=>{const on=readStored(PENDING,null,storage)?.pending===true;if(on)setSavePending(false,storage);return on;};

// What is saved. Join: membership choices and details, plus the insurance answers when insurance is chosen (a combined draft).
export const joinDraft=({f,d,iv,country})=>{
  const membership={f:{level:f.level,branch:f.branch,branches:f.branches,billing:f.billing,addons:f.addons,insurance:Boolean(f.insurance),start:f.start||''},d};
  return {service:f.insurance?'combined':'membership',answers:f.insurance?{membership,insurance:{iv:noConfirmations(iv),country}}:{membership}};
};
export const buyDraft=({values,country,start})=>({service:'insurance',answers:{insurance:{iv:noConfirmations(values),country,start:start||''}}});

// Turns a draft from the CRM into the tab's stored answers. Returns the page to open, or null for a draft made by the older step-by-step form.
export function restoreDraftToTab(draft,storage){
  const a=draft?.answers,page=draft?.service==='insurance'?(a?.insurance?.iv?'/insurance/buy':null):(a?.membership?.f?'/membership/buy':null);
  if(!page)return null;
  clearStored(storage);
  if(draft.service==='insurance'){
    const {iv,country,start}=a.insurance;
    writeStored('insurance',{values:noConfirmations(iv),country:country||'',start:validStart(start)},storage);
  }else{
    const {f,d}=a.membership,insured=draft.service==='combined'&&a.insurance;
    writeStored('membership',{...f,insurance:Boolean(insured),accepted:false,start:validStart(f.start)},storage);
    writeStored('membership_details',d||{},storage);
    if(insured)writeStored('membership_insurance',{iv:noConfirmations(a.insurance.iv),country:a.insurance.country||''},storage);
  }
  writeStored(REF,{id:draft.id,service:draft.service,journeyId:draft.journeyId,revision:draft.revision},storage);
  return page;
}

// Creates the draft, or updates the one this tab already holds. A draft of another kind (insurance added or removed) is replaced,
// and one that no longer exists or is no longer a draft is started again. A conflict is thrown for the page to explain.
export async function saveDraft(api,{service,answers,names},storage){
  const ref=draftRef(storage),body=(journeyId,revision)=>({service,journeyId,step:0,answers,...(revision!==undefined?{revision}:{})});
  const remember=(r,journeyId)=>writeStored(REF,{id:r.id,service,journeyId:r.journeyId||journeyId,revision:r.revision},storage);
  const create=async()=>{const journeyId=globalThis.crypto.randomUUID(),r=await api.createDraft({...body(journeyId),...(names?{contact:names}:{})});remember(r,journeyId);return r;};
  if(!ref)return create();
  if(ref.service!==service){const r=await create();api.discardDraft(ref.service,ref.id).catch(()=>{});return r;}
  try{const r=await api.updateDraft(service,ref.id,body(ref.journeyId,ref.revision));remember(r,ref.journeyId);return r;}
  catch(e){if(e?.status===404||e?.code==='NOT_FOUND'||e?.code==='NOT_DRAFT'){forgetDraftRef(ref.id,storage);return create();}throw e;}
}

// After a successful payment the saved draft is removed, so the paid purchase is the only record. Read before the answers are cleared.
export function finishPaidDraft(api,paidService,storage){
  const ref=draftRef(storage);
  clearStored(storage);
  const match=paidService==='insurance'?ref?.service==='insurance':paidService==='membership'&&(ref?.service==='membership'||ref?.service==='combined');
  return match?api.discardDraft(ref.service,ref.id).then(()=>true,()=>false):Promise.resolve(false);
}
