import React, {useMemo, useState} from 'react';
import {ArrowLeft, ArrowRight, CreditCard, FileText, LockKeyhole, MapPin, Save, ShieldAlert} from 'lucide-react';
import {Link, useNavigate} from 'react-router-dom';
import {JOURNEYS,countryOption} from './JourneyConfig.js';
import {Field,Notice,PageHeading,Stages} from './UiParts.jsx';
import {accreditationType,validate} from './logic.mjs';
import {usePreviewState} from './journeys/previewState.jsx';
import AddressLookup from './components/AddressLookup.jsx';
import {INTEGRATIONS,portalApi} from './services/api.js';

function ReviewDetails({steps,values,kind}){
  const all=steps.flatMap(s=>s.fields).filter(f=>!f.when||f.when(values));
  const entries=all.filter(f=>f.type!=='checkbox'&&values[f.name]!==undefined&&values[f.name]!==''&&values[f.name]!==false&&!(Array.isArray(values[f.name])&&!values[f.name].length));
  const concern=kind==='insurance'&&([1,2,3,4,5].some(i=>values['insDecl'+i]==='yes')||[6,7].some(i=>values['insDecl'+i]==='no'));
  return <div className="review-box">
    <div className="review-head"><h3>Your answers</h3><span>Not yet submitted</span></div>
    {kind==='accreditation'&&values.country&&<div className="classification"><strong>{accreditationType(values.country)}</strong><small>Your centre's country decides which accreditation route applies. The Guild confirms eligibility and prices when your application is reviewed.</small></div>}
    {kind==='membership'&&<Notice title="Membership and fees">Your membership type, joining fee, optional cover and any monthly instalments will be confirmed by the Guild. No price has been calculated yet.</Notice>}
    {kind==='insurance'&&<Notice title="Insurance quotation not yet calculated">Your cover choices and declarations are shown here for review only. No quote has been calculated and no cover is in place.</Notice>}
    {concern&&<div className="classification"><strong>Manual review may be required</strong><small>You answered yes to one of the declarations. The Guild's insurance team may need to review your application before offering cover.</small></div>}
    <dl className="review-list">{entries.map(f=><div key={f.name}><dt>{f.label}</dt><dd>{Array.isArray(values[f.name])?values[f.name].map(x=>typeof x==='object'?[x.type,x.firstName,x.lastName].filter(Boolean).join(' '):x).join(', '):String(values[f.name])}</dd></div>)}</dl>
    <div className="review-docs"><h3><FileText size={18}/> Information and documents</h3>
      <div className="doc-list"><a href="https://www.beautyguild.com/Membership/Code-Of-Ethics" target="_blank" rel="noopener noreferrer">Guild Code of Ethics <ArrowRight size={15}/></a>
      {kind==='insurance'&&<a href="https://www.beautyguild.com/Membership/Treatments-We-Cover" target="_blank" rel="noopener noreferrer">Treatments We Cover <ArrowRight size={15}/></a>}
      <span>Your policy documents will be available here once your application is complete.</span></div>
    </div>
  </div>;
}
function CheckpointNotice({kind}) {
  return <div className="journey-checkpoint"><div><LockKeyhole size={26}/><h3>Account checkpoint</h3><p>Create an account or sign in to continue with your application.</p></div>
    <div className="checkpoint-steps"><span>1. Review</span><ArrowRight size={14}/><span>2. Account</span><ArrowRight size={14}/><span>3. {kind==='insurance'?'Cover decision and payment':'Payment or submission'}</span></div>
  </div>;
}
export function Journey({kind}){
  const navigate=useNavigate();
  const config=JOURNEYS[kind];
  const {answers,steps:storedSteps,draftMeta,setDraft,setAnswer,setJourneyStep,clearAnswers}=usePreviewState();
  const values=answers[kind]||{};
  const visible=useMemo(()=>config.steps.filter(step=>!step.when||step.when(values)),[config,values]);
  const index=Math.min(storedSteps[kind]||0,visible.length-1);
  const current=visible[index];
  const last=index===visible.length-1;
  const [errors,setErrors]=useState({});
  const [saving,setSaving]=useState(false),[saveStatus,setSaveStatus]=useState('');
  async function saveDraft(){
    if(!INTEGRATIONS.crmDrafts){checkpoint('save');return;}
    if(saving)return;
    setSaving(true);setSaveStatus('');
    try{
      const old=draftMeta[kind],service=kind==='membership'&&values.insuranceWanted==='yes'?'combined':kind;
      const journeyId=old?.journeyId||crypto.randomUUID();
      if(!old?.journeyId)setDraft(kind,{journeyId,service,revision:0});
      const payload={service,journeyId,step:index,answers:service==='combined'?{membership:values,insurance:{insuranceWanted:values.insuranceWanted,liability:values.liability,professional:values.professional,contents:values.contents,coverNotes:values.coverNotes}}:values,...(old?{revision:old.revision}:{})};
      const next=old?.id&&old.service===service?await portalApi.updateDraft(service,old.id,payload):await portalApi.createDraft(payload);
      setDraft(kind,{id:next.id,revision:next.revision,journeyId:next.journeyId,service});
      setSaveStatus('Your application has been saved. You can finish it later from Saved applications.');
    }catch(e){if(e.status===401||e.code==='NOT_AUTHENTICATED'){checkpoint('save');return;}setSaveStatus(e.code==='REVISION_CONFLICT'?'This application has changed elsewhere. Please reload the page before saving.':'We could not save your application. Please try again.');}
    finally{setSaving(false);}
  }
  const update=(name,value)=>{setAnswer(kind,name,value);setErrors(previous=>({...previous,[name]:undefined}));};
  const move=position=>{setJourneyStep(kind,position);setErrors({});window.scrollTo({top:0,behavior:'smooth'});};
  const checkpoint=intent=>navigate('/account/checkpoint?returnTo='+encodeURIComponent('/'+kind+'/new')+'&intent='+intent);
  const next=()=>{
    const errors=validate(current.fields,values);
    setErrors(errors);
    if(Object.keys(errors).length){document.getElementById('journey-fields')?.scrollIntoView({behavior:'smooth',block:'start'});return;}
    if(last){checkpoint('complete');return;}
    move(index+1);
  };
  const addressBindings=kind==='membership'?{
    postcode:{line1:'address1',line2:'address2',town:'town',county:'county',postcode:'postcode',country:'country'}
  }:kind==='accreditation'?{
    postcode:{line1:'address1',line2:'address2',town:'town',county:'county',postcode:'postcode',country:'contactCountry'},
    centrePostcode:{line1:'centreAddress',town:'centreTown',county:'centreCounty',postcode:'centrePostcode'}
  }:{
    insPremPostcode:{line1:'insPremL1',town:'insPremTown',county:'insPremCounty',postcode:'insPremPostcode'}
  };
  const applyAddress=(key,address)=>{
    const map=addressBindings[key]; if(!map)return;
    for(const [from,to] of Object.entries(map)){
      const source=from==='line1'?'addressLine1':from==='line2'?'addressLine2':from;
      const resolved=from==='country'?countryOption(address.country):address[source];
      if(resolved && typeof resolved==='string')update(to,resolved);
    }
  };
  const mayNeedLocation=['contact-address','centre','about','property','details'].includes(current.id);
  return <div className="page journey-page">
    <Link className="back-link" to={'/'+kind}><ArrowLeft size={17}/> Back to {config.title.toLowerCase()}</Link>
    <PageHeading eyebrow={config.kicker} title={config.title+' application'} description={config.intro}>
      <span className="journey-counter">Step {index+1} of {visible.length}</span>
    </PageHeading>
    <Notice title={INTEGRATIONS.crmDrafts?'Save your application':'Applications are opening soon'}>{INTEGRATIONS.crmDrafts?'Saving keeps your answers so you can finish later. It does not submit your application or take payment.':'You can complete this form to see the questions, but your answers are not submitted or saved, and nothing is charged.'}</Notice>
    <div className="journey-shell">
      <section className="journey-card">
        <Stages steps={visible} current={index}/>
        <div className="journey-body" id="journey-fields"><span className="eyebrow">STEP {String(index+1).padStart(2,'0')}</span>
          <h2>{current.title}</h2><p className="journey-intro">{current.description}</p>
          {last?<><ReviewDetails steps={visible} values={values} kind={kind}/><CheckpointNotice kind={kind}/></>:<>
            {mayNeedLocation&&<div className="address-hint"><MapPin size={17}/><span>{INTEGRATIONS.address?'Enter your postcode and choose Find address, or type your address yourself.':'Address fields can be entered manually in this preview. Live postcode/address suggestions will use the Loqate backend.'}</span></div>}
            <div className="fields-grid">{current.fields.filter(f=>!f.when||f.when(values)).map(f=><React.Fragment key={f.name}><Field field={f} value={values[f.name]} onChange={update} error={errors[f.name]}/>{INTEGRATIONS.address&&addressBindings[f.name]&&<AddressLookup query={values[f.name]||""} onSelect={address=>applyAddress(f.name,address)}/>}</React.Fragment>)}</div>
          </>}
          <div className="journey-footer"><div className="journey-footer-left">{index>0?<button type="button" className="btn btn-secondary" onClick={()=>move(index-1)}><ArrowLeft size={16}/> Previous</button>:<span className="muted">Fields marked * are required</span>}</div>
            <button type="button" className="btn btn-primary" onClick={next}>{last?'Continue to account':'Continue'}<ArrowRight size={16}/></button></div>
        </div>
      </section>
      <aside className="journey-aside">
        <div className="aside-card"><span className="eyebrow">YOUR PROGRESS</span><div className="progress-track"><div style={{width:Math.round(((index+1)/visible.length)*100)+'%'}}/></div>
          <strong>{Math.round(((index+1)/visible.length)*100)}% through this journey</strong><p>Your answers stay in this browser tab only. They are not saved or submitted.</p></div>
        <div className="aside-card muted-card"><LockKeyhole size={22}/><h3>Save and finish later</h3><p>{INTEGRATIONS.crmDrafts?'Sign in to save your application and finish it later.':'You will soon be able to save your application and come back to it later. This is not available yet.'}</p>
          <button type="button" className="text-button" disabled={saving} onClick={saveDraft}><Save size={15}/>{saving?'Saving…':INTEGRATIONS.crmDrafts?'Save my application':'Create an account or sign in'}</button>{saveStatus&&<p role="status">{saveStatus}</p>}</div>
        <div className="aside-card"><CreditCard size={21}/><h3>Payment information</h3><p>Prices and payment are not available yet. You will not be charged.</p></div>
        <button type="button" className="text-button restart-button" onClick={()=>{clearAnswers(kind);setErrors({});}}>Clear my answers and start again</button>
        <div className="aside-help"><ShieldAlert size={18}/><span>Please do not enter card details or confidential information yet.</span></div>
      </aside>
    </div>
  </div>;
}
