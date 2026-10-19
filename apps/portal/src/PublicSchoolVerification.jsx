import React,{useEffect,useState} from 'react';
import {Link,useNavigate,useParams} from 'react-router-dom';
import {ArrowRight,CheckCircle2,Clock3,ExternalLink,Search,ShieldAlert,ShieldCheck,XCircle} from 'lucide-react';
import {Logo} from './UiParts.jsx';
import {integrationConfig} from './services/api.js';
import {createHttpClient} from './services/transport.mjs';

const VALID_NUMBER=/^[A-Za-z0-9][A-Za-z0-9 _-]{0,39}$/;
const AVAILABLE=new Set(['accredited','expired','suspended','revoked','not_accredited']);
const labels={
  accredited:'Currently accredited',expired:'Accreditation expired',
  suspended:'Accreditation suspended',revoked:'Accreditation no longer valid',
  not_accredited:'Not currently accredited'
};
const enabled=integrationConfig.mode==='api' &&
  integrationConfig.baseConfigured && import.meta.env.VITE_PUBLIC_SCHOOL_VERIFICATION==='true';
const request=enabled?createHttpClient({baseUrl:integrationConfig.apiBaseUrl}):null;

function normalise(payload){
  const school=payload?.school,verification=payload?.verification;
  if(!school||typeof school.name!=='string'||!school.name.trim()||
      typeof school.registrationNumber!=='string'||!verification||!AVAILABLE.has(verification.status)||
      typeof verification.isCurrentlyAccredited!=='boolean'||
      verification.isCurrentlyAccredited!==(verification.status==='accredited'))throw new Error('Invalid verification response');
  return {school,verification};
}
function date(value){
  if(!value||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
  const [y,m,d]=value.split('-');
  return d+'/'+m+'/'+y;
}
export function SchoolResult({data}){
  const {school,verification}=data;
  const ok=verification.status==='accredited';
  const Icon=ok?CheckCircle2:XCircle;
  return <div className="school-result" role="status">
    <div className={'school-verification-status '+(ok?'is-accredited':'not-accredited')}>
      <Icon size={26} aria-hidden="true"/>
      <div><strong>{labels[verification.status]}</strong><span>{ok?'The school holds a current accreditation in the Beauty Guild records.':'This school does not have a currently confirmed accreditation.'}</span></div>
    </div>
    <dl className="school-result-details">
      <div><dt>School</dt><dd>{school.name}</dd></div>
      <div><dt>School Registration Number</dt><dd>{school.registrationNumber}</dd></div>
      {verification.expiryDate&&<div><dt>Accreditation expiry</dt><dd>{date(verification.expiryDate)}</dd></div>}
      <div><dt>Checked at</dt><dd>{verification.checkedAt?new Date(verification.checkedAt).toLocaleString('en-GB',{timeZone:'Europe/London',dateStyle:'medium',timeStyle:'short'}):'Now'}</dd></div>
    </dl>
    <p className="school-verification-fineprint">This page checks the school's current accreditation record. It does not establish the authenticity of a particular PDF certificate or certify an individual course.</p>
  </div>;
}
export default function PublicSchoolVerification(){
  const navigate=useNavigate();
  const {number}=useParams();
  const [input,setInput]=useState(number||'');
  const [state,setState]=useState({kind:'idle'});
  useEffect(()=>{setInput(number||'');},[number]);
  useEffect(()=>{
    if(!number){setState({kind:'idle'});return;}
    if(!VALID_NUMBER.test(number)){setState({kind:'invalid'});return;}
    if(!enabled){setState({kind:'unavailable'});return;}
    const controller=new AbortController();
    setState({kind:'loading'});
    request('/public/verify/'+encodeURIComponent(number),{signal:controller.signal})
      .then(payload=>{if(!controller.signal.aborted)setState({kind:'success',data:normalise(payload)});})
      .catch(error=>{
        if(controller.signal.aborted)return;
        setState({kind:error.status===404?'not-found':error.status===400?'invalid':
          error.status===429?'rate-limit':'unavailable'});
      });
    return ()=>controller.abort();
  },[number]);
  const submit=e=>{
    e.preventDefault();
    const value=input.trim();
    if(!VALID_NUMBER.test(value)){setState({kind:'invalid'});return;}
    navigate('/verify/'+encodeURIComponent(value.replace(/\s+/g,'')));
  };
  return <div className="school-verify-page">
    <header className="school-verify-header"><Link to="/" aria-label="Beauty Guild portal dashboard"><Logo/></Link>
      <span className="school-verify-official"><ShieldCheck size={17}/> School accreditation verification</span></header>
    <main className="school-verify-main">
      <span className="eyebrow">BEAUTY GUILD SCHOOL REGISTER</span>
      <h1>Verify a school's accreditation</h1>
      <p className="school-verify-lead">Enter the School Registration Number shown on a certificate to check whether the school currently holds accreditation.</p>
      <form onSubmit={submit} className="school-verify-form" noValidate>
        <label htmlFor="school-number">School Registration Number</label>
        <div className="school-verify-input-row"><input id="school-number" type="text" autoComplete="off" inputMode="text"
          maxLength={40} placeholder="For example, 12345" value={input} onChange={e=>setInput(e.target.value)} required/>
          <button className="btn btn-primary" type="submit"><Search size={17}/> Verify school</button></div>
      </form>
      {state.kind==='loading'&&<div className="school-verify-message" role="status"><Clock3 size={20}/> Checking the latest accreditation status...</div>}
      {state.kind==='success'&&<SchoolResult data={state.data}/>}
      {state.kind==='invalid'&&<div className="school-verify-message is-error" role="alert">Enter a valid School Registration Number, using letters, numbers, hyphens or underscores.</div>}
      {state.kind==='not-found'&&<div className="school-verify-message" role="status"><ShieldAlert size={21}/> No school was found with that registration number. Please check the number and try again.</div>}
      {state.kind==='rate-limit'&&<div className="school-verify-message is-error" role="alert">There have been too many verification attempts. Please try again later.</div>}
      {state.kind==='unavailable'&&<div className="school-verify-message is-error" role="alert"><ShieldAlert size={21}/> Verification is temporarily unavailable. Please try again later or contact the Beauty Guild. No accreditation status can be confirmed at present.</div>}
      <div className="school-verify-support"><h2>About this service</h2>
        <p>Accreditation can change after a certificate is issued. This service checks the current record, rather than the original certificate date. A school that was previously accredited may now be expired or suspended.</p>
        <p>When a QR code is added to a certificate, it can open this same permanent registration-number page.</p>
        <a href="https://www.beautyguild.com/" target="_blank" rel="noopener noreferrer">Visit Beauty Guild <ExternalLink size={14}/></a>
      </div>
    </main>
    <footer className="school-verify-footer"><ShieldCheck size={17}/> Beauty Guild school accreditation verification</footer>
  </div>;
}
