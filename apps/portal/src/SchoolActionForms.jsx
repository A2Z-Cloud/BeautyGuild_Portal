import React,{useState} from 'react';
import {portalApi} from './services/api.js';
import {Notice} from './UiParts.jsx';

const DELIVERY=['Face to Face In the Classroom','Face to Face via Live Video Link','Online only','Other'];
const ASSESS=['Face to Face In the Classroom','Face to Face via Live Video Link','Case Studies - Submitting Photographs','Case Studies - Submitting Videos','Other'];
const formField=(k,v,set)=><input value={v||''} onChange={e=>set(k,e.target.value)}/>;
function MultiOptions({label,values,options,onChange}){
 return <fieldset className="school-multi"><legend>{label}</legend>{options.map(o=><label key={o}>
 <input type="checkbox" checked={values.includes(o)} onChange={e=>onChange(e.target.checked?[...values,o]:values.filter(v=>v!==o))}/>{o}
 </label>)}</fieldset>;
}
export function QualificationForm({schoolId,onDone}){
 const [values,setValues]=useState({name:'',month:'',year:'',delivery:[],assessment:[],deliveryOther:'',assessmentOther:''});
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const set=(key,value)=>setValues(p=>({...p,[key]:value}));
 async function submit(e){
  e.preventDefault();if(busy)return;setBusy(true);setError('');
  try{await portalApi.saveSchoolQualification(schoolId,values);onDone();}
  catch(err){setError(err.message||'Qualification could not be saved.');}
  finally{setBusy(false);}
 }
 return <form className="school-ops-form" onSubmit={submit}>
 <h3>Add a qualification</h3><p>Qualifications are submitted for Guild verification; they are not automatically approved.</p>
 <label>Qualification name *{formField('name',values.name,set)}</label>
 <div className="auth-double">
  <label>Completion month *<select value={values.month} onChange={e=>set('month',e.target.value)} required>
   <option value="">Choose month</option>{Array.from({length:12},(_,i)=><option value={i+1} key={i}>{i+1}</option>)}</select></label>
  <label>Completion year *<input required type="number" min="1900" max="2200" value={values.year} onChange={e=>set('year',e.target.value)}/></label>
 </div>
 <MultiOptions label="Practical delivery *" values={values.delivery} options={DELIVERY} onChange={v=>set('delivery',v)}/>
 {values.delivery.includes('Other')&&<label>Other delivery{formField('deliveryOther',values.deliveryOther,set)}</label>}
 <MultiOptions label="Practical assessment *" values={values.assessment} options={ASSESS} onChange={v=>set('assessment',v)}/>
 {values.assessment.includes('Other')&&<label>Other assessment{formField('assessmentOther',values.assessmentOther,set)}</label>}
 {error&&<Notice title="Not saved">{error}</Notice>}
 <button type="submit" className="btn btn-primary" disabled={busy||!values.name||!values.month||!values.year||!values.delivery.length||!values.assessment.length}>{busy?'Saving…':'Save qualification'}</button>
 </form>;
}
export function SessionForm({schoolId,onDone}){
 const [state,setState]=useState({loading:true,offerings:[],tutors:[],error:''});
 React.useEffect(()=>{let active=true;portalApi.getCourseOptions(schoolId).then(r=>active&&setState({loading:false,offerings:r.offerings||[],tutors:r.tutors||[],error:''}))
 .catch(e=>active&&setState({loading:false,offerings:[],tutors:[],error:e.message}));return()=>{active=false;};},[schoolId]);
 const [values,setValues]=useState({courseOfferingId:'',tutorId:'',availabilityType:'Fixed Date',sessionStart:'',sessionEnd:'',maximumPlaces:'',totalAdvertisedPrice:'',
 instantBookingAvailable:true,requestADateAvailable:true,flexibleDescription:'',availableDays:[]});
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const set=(key,value)=>setValues(p=>({...p,[key]:value}));
 async function submit(e){
  e.preventDefault();if(busy)return;setBusy(true);setError('');
  try{await portalApi.createCourseSession(schoolId,values);onDone();}
  catch(err){setError(err.message||'Session could not be saved.');}
  finally{setBusy(false);}
 }
 return <form className="school-ops-form" onSubmit={submit}>
 <h3>Publish a course session</h3>
 {state.loading?<p>Loading approved course offerings…</p>:state.error?<Notice title="Unable to load options">{state.error}</Notice>:<>
 <label>Accredited course *<select required value={values.courseOfferingId} onChange={e=>set('courseOfferingId',e.target.value)}>
  <option value="">Choose a course</option>{state.offerings.map(o=><option value={o.id} key={o.id}>{o.name} · {o.trainingCentre}</option>)}
 </select></label>
 <label>Tutor <select value={values.tutorId} onChange={e=>set('tutorId',e.target.value)}><option value="">Not assigned</option>
  {state.tutors.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
 <label>Availability type *<select value={values.availabilityType} onChange={e=>set('availabilityType',e.target.value)}>
 {['Fixed Date','Flexible Availability','Request-a-Date'].map(v=><option key={v}>{v}</option>)}</select></label>
 {values.availabilityType==='Fixed Date'?<div className="auth-double">
 <label>Start date and time *<input type="datetime-local" required value={values.sessionStart} onChange={e=>set('sessionStart',e.target.value)}/></label>
 <label>End date and time <input type="datetime-local" value={values.sessionEnd} onChange={e=>set('sessionEnd',e.target.value)}/></label>
 </div>:<label>Availability description{formField('flexibleDescription',values.flexibleDescription,set)}</label>}
 <div className="auth-double"><label>Maximum places <input type="number" min="1" max="1000" value={values.maximumPlaces} onChange={e=>set('maximumPlaces',e.target.value)}/></label>
 <label>Advertised price (£) <input type="number" min="0" step=".01" value={values.totalAdvertisedPrice} onChange={e=>set('totalAdvertisedPrice',e.target.value)}/></label></div>
 <label className="auth-checkbox"><input type="checkbox" checked={values.instantBookingAvailable} onChange={e=>set('instantBookingAvailable',e.target.checked)}/>Instant booking available</label>
 {error&&<Notice title="Not saved">{error}</Notice>}
 <button className="btn btn-primary" type="submit" disabled={busy||!values.courseOfferingId}>{busy?'Publishing…':'Create session'}</button>
 </>}
 </form>;
}
