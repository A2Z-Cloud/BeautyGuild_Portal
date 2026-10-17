import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, CloudOff, LockKeyhole, Save, ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { JOURNEYS } from './JourneyConfig.js';
import { Field, Notice, PageHeading, Stages } from './UiParts.jsx';
import {accreditationType,validate} from './logic.mjs';

function ReviewDetails({config,values,kind}) {
  const entries=config.steps.flatMap(s=>s.fields).filter(f=>f.type!=='checkbox' && values[f.name]!==undefined && values[f.name]!=='' && values[f.name]!==false);
  return <div className="review-box"><div className="review-head"><h3>Your example responses</h3><span>Preview only</span></div>
    {kind==='accreditation' && values.country && <div className="classification"><strong>{accreditationType(values.country)}</strong><small>Indicative route based on centre country; eligibility is not checked.</small></div>}
    <dl className="review-list">{entries.map(f=><div key={f.name}><dt>{f.label}</dt><dd>{String(values[f.name])}</dd></div>)}</dl>
    {kind==='insurance' && <Notice title="Not an insurance quotation">No live premium calculation, underwriting determination, referral, cover or payment will be generated.</Notice>}
  </div>;
}
export function Journey({kind}) {
  const config=JOURNEYS[kind];
  const [step,setStep]=useState(0);
  const [values,setValues]=useState({});
  const [errors,setErrors]=useState({});
  const [modal,setModal]=useState('');
  const current=config.steps[step];
  const last=step===config.steps.length-1;
  const update=(name,value)=>{setValues(previous=>({...previous,[name]:value}));setErrors(prev=>({...prev,[name]:undefined}));};
  const next=()=>{const invalid=validate(current.fields,values);setErrors(invalid);if(Object.keys(invalid).length){document.getElementById('journey-fields')?.scrollIntoView({behavior:'smooth',block:'start'});return;}if(last) setModal('Submission and payment are not connected in Milestone 1. Your answers have not been stored, no account has been created and no record has been submitted.');else {setStep(s=>s+1);window.scrollTo({top:0,behavior:'smooth'});}};
  return <div className="page journey-page">
    <Link className="back-link" to={'/'+kind}><ArrowLeft size={17}/> Back to {config.title.toLowerCase()}</Link>
    <PageHeading eyebrow={config.kicker} title={config.title+' application'} description={config.intro}><span className="journey-counter">Step {step+1} of {config.steps.length}</span></PageHeading>
    <Notice title="Frontend demonstration">Inputs remain in this page only. Saving, account creation, CRM records, approved pricing, underwriting and payment require backend services.</Notice>
    <div className="journey-shell">
      <section className="journey-card">
        <Stages steps={config.steps} current={step}/>
        <div className="journey-body" id="journey-fields"><span className="eyebrow">STEP {String(step+1).padStart(2,'0')}</span><h2>{current.title}</h2><p className="journey-intro">{current.description}</p>
          {last && <ReviewDetails kind={kind} config={config} values={values}/>}
          <div className="fields-grid">{current.fields.map(f=><Field key={f.name} field={f} value={values[f.name]} onChange={update} error={errors[f.name]}/>)}</div>
          <div className="journey-footer"><div className="journey-footer-left">{step>0?<button type="button" className="btn btn-secondary" onClick={()=>{setStep(s=>s-1);setErrors({});}}><ArrowLeft size={16}/> Previous</button>:<span className="muted">Fields marked * are required</span>}</div><button type="button" className="btn btn-primary" onClick={next}>{last?'Finish preview':'Continue'} <ArrowRight size={16}/></button></div>
        </div>
      </section>
      <aside className="journey-aside">
        <div className="aside-card"><span className="eyebrow">YOUR PROGRESS</span><div className="progress-track"><div style={{width:Math.round(((step+1)/config.steps.length)*100)+'%'}}/></div><strong>{Math.round(((step+1)/config.steps.length)*100)}% through this preview</strong><p>Complete each step to explore the journey. We do not save any of this information.</p></div>
        <div className="aside-card muted-card"><LockKeyhole size={22}/><h3>Save and finish later</h3><p>Secure CRM-backed drafts will become available after account sign-in and API integration.</p><button type="button" className="text-button" onClick={()=>setModal('Save and finish later is not connected. No CRM record or browser draft has been created.')}><Save size={15}/> Why can't I save?</button></div>
        <div className="aside-help"><ShieldAlert size={18}/><span>No card details, private documents or real customer information should be entered during testing.</span></div>
      </aside>
    </div>
    {modal && <div className="dialog-shade" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setModal('');}}><div className="dialog" role="dialog" aria-modal="true" aria-labelledby="preview-dialog-title"><CloudOff size={28}/><h2 id="preview-dialog-title">Integration not connected</h2><p>{modal}</p><button className="btn btn-primary" type="button" autoFocus onClick={()=>setModal('')}>Understood</button></div></div>}
  </div>;
}
