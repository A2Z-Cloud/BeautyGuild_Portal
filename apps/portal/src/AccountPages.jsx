import React, {useState} from 'react';
import {Link, useSearchParams} from 'react-router-dom';
import {ArrowLeft,ArrowRight,CheckCircle2,KeyRound,Lock,Mail,Shield,UserRound,UserPlus} from 'lucide-react';
import {Logo,Notice,PageHeading} from './UiParts.jsx';
import {DEMO_USER} from './data/demo.js';
import {INTEGRATIONS} from './services/api.js';
import {CatalystSignIn,CatalystRegistration,CatalystAccountOverview} from './components/CatalystAuthViews.jsx';

const validReturn = path => ['/membership/new','/insurance/new','/accreditation/new'].includes(path) ? path : '/';
function useReturn(){
  const [params]=useSearchParams();
  const route=validReturn(params.get('returnTo'));
  const intent=params.get('intent')==='save'?'save':'complete';
  const tail='?returnTo='+encodeURIComponent(route)+'&intent='+intent;
  return {route,intent,tail};
}
function Unavailable({message}) {
  return <div className="auth-unavailable" role="status"><Lock size={17}/><span>{message}</span></div>;
}
function Shell({eyebrow,title,description,children}) {
  return <div className="auth-page"><div className="auth-intro">
    <Link to="/" className="auth-brand"><Logo/></Link><div className="auth-intro-copy"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>
    <div className="auth-feature"><Shield size={22}/><span>One Beauty Guild account for Membership, Accreditation and Insurance</span></div>
    {!INTEGRATIONS.catalystAuth&&<div className="auth-preview-disclaimer">Frontend development preview. No real account is created or authenticated.</div>}
  </div><div className="auth-panel">{children}</div></div>;
}
export function AccountCheckpoint() {
  const {route,intent,tail}=useReturn();
  const service=route.split('/')[1]||'application';
  return <Shell eyebrow="YOUR ACCOUNT" title={intent==='save'?'Save and finish later':'One more step before you finish'}
    description={intent==='save'?'You will be able to save your application and come back to it later. This is not available yet, but your answers stay on this page while you browse.':'Sign in or create an account to continue.'}>
    <div className="auth-card"><span className="eyebrow">{intent==='save'?'SAVE APPLICATION':'ACCOUNT CHECKPOINT'}</span><h2>How would you like to continue?</h2>
      <Notice title="Not available yet">Saving applications and submitting them online are coming soon. Nothing is submitted and no payment is taken.</Notice>
      <div className="account-options"><Link className="account-option" to={'/signup'+tail}><UserPlus size={25}/><strong>Create an account</strong><span>New to the Guild? Set up your account in a few minutes.</span><ArrowRight size={17}/></Link>
      <Link className="account-option" to={'/login'+tail}><KeyRound size={25}/><strong>Sign in</strong><span>Already a member? Continue using your Guild account.</span><ArrowRight size={17}/></Link></div>
      <div className="checkpoint-footer"><Link className="back-link" to={route}><ArrowLeft size={16}/> Return to your {service} answers</Link><Link className="auth-inline-link" to={'/checkout-preview/'+service}>Preview the payment screen (no real checkout)</Link></div>
    </div>
  </Shell>;
}
export function LoginPage() {
  const {route,tail}=useReturn();
  const [message,setMessage]=useState('');
  const submit=e=>{e.preventDefault();setMessage('Catalyst Authentication is not connected. No sign-in attempt was made. Your example journey is still available.');};
  if(INTEGRATIONS.catalystAuth)return <Shell eyebrow="WELCOME BACK" title="Sign in to your account" description="Access your Guild services and account details."><CatalystSignIn returnTo={route}/></Shell>;
  return <Shell eyebrow="WELCOME BACK" title="Sign in to your account" description="Access your Guild services, saved applications and account details.">
    <form className="auth-card" onSubmit={submit} autoComplete="off"><h2>Member sign in</h2>
      <label htmlFor="signin-email">Email address</label><input id="signin-email" type="email" placeholder="you@example.com" autoComplete="off" required/>
      <label htmlFor="signin-password">Password</label><input id="signin-password" type="password" placeholder="Your password" autoComplete="off" required/>
      <Link className="auth-inline-link" to={'/forgot-password'+tail}>Forgot your password?</Link>
      <button className="btn btn-primary btn-block" type="submit">Sign in <ArrowRight size={16}/></button>
      {message&&<Unavailable message={message}/>}
      <p className="auth-small">No account yet? <Link to={'/signup'+tail}>Create an account</Link></p>
      <Link className="auth-small" to={route}>Return to your application</Link>
    </form>
  </Shell>;
}
export function SignupPage() {
  const {route,tail}=useReturn();
  const [message,setMessage]=useState('');
  const [agreed,setAgreed]=useState(false);
  const submit=e=>{e.preventDefault();setMessage('Catalyst sign-up and CRM Contact matching are not connected. No account was registered or saved.');};
  if(INTEGRATIONS.catalystAuth)return <Shell eyebrow="JOIN THE GUILD" title="Create your account" description="Register once to manage your Membership, Accreditation and Insurance in one place."><CatalystRegistration returnTo={route}/></Shell>;
  return <Shell eyebrow="JOIN THE GUILD" title="Create your account" description="Complete your application first, then register once. You won't need to start your answers again.">
    <form className="auth-card" onSubmit={submit} autoComplete="off"><h2>Your account details</h2>
      <div className="auth-double"><div><label htmlFor="reg-first">First name</label><input id="reg-first" required placeholder="First name"/></div><div><label htmlFor="reg-last">Surname</label><input id="reg-last" required placeholder="Surname"/></div></div>
      <label htmlFor="reg-email">Email address</label><input id="reg-email" type="email" required placeholder="you@example.com" autoComplete="off"/>
      <label htmlFor="reg-mobile">Contact number</label><input id="reg-mobile" type="tel" placeholder="Mobile number"/>
      <label htmlFor="reg-password">Password</label><input id="reg-password" type="password" minLength={8} required placeholder="At least 8 characters" autoComplete="new-password"/>
      <label className="auth-checkbox"><input type="checkbox" checked={agreed} onChange={e=>setAgreed(e.target.checked)}/><span>I have reviewed the Guild terms and privacy information.</span></label>
      <button className="btn btn-primary btn-block" type="submit" disabled={!agreed}>Create account <ArrowRight size={16}/></button>
      {message&&<Unavailable message={message}/>}
      <p className="auth-small">Already have an account? <Link to={'/login'+tail}>Sign in</Link></p>
      <Link className="auth-small" to={route}>Return to your application</Link>
    </form>
  </Shell>;
}
export function ForgotPasswordPage() {
  const {tail}=useReturn();
  const [message,setMessage]=useState('');
  return <Shell eyebrow="ACCOUNT ACCESS" title="Reset your password" description="Password reset emails will be handled through the connected authentication service.">
    <form className="auth-card" onSubmit={e=>{e.preventDefault();setMessage('Password reset is unavailable in the frontend preview. No email has been sent.');}}>
      <h2>Reset instructions</h2><label htmlFor="reset-email">Account email</label><input id="reset-email" type="email" required placeholder="you@example.com"/>
      <button className="btn btn-primary btn-block">Request reset email <Mail size={16}/></button>
      {message&&<Unavailable message={message}/>}
      <Link className="auth-small" to={'/login'+tail}>Back to sign in</Link>
    </form>
  </Shell>;
}
export function AccountManagement() {
  const [tab,setTab]=useState('profile');
  const [notice,setNotice]=useState('');
  const [form,setForm]=useState({name:DEMO_USER.name,email:'alex@example.invalid',mobile:'',business:'',postcode:'',contactByEmail:true,marketing:false});
  const update=(key,value)=>setForm(old=>({...old,[key]:value}));
  const save=e=>{e.preventDefault();setNotice('Preview only. Changes are not saved to CRM or an account.');};
  if(INTEGRATIONS.catalystAuth)return <CatalystAccountOverview/>;
  return <div className="page account-page">
    <PageHeading eyebrow="MY ACCOUNT" title="Account management" description="Review the member profile, communication preferences and account access settings."/>
    <Notice title="Sample account">This is an illustrative member profile. You are not authenticated and no CRM Contact record is being loaded or updated.</Notice>
    <div className="account-profile-hero"><span className="profile-circle">{DEMO_USER.initials}</span><div><h2>{DEMO_USER.name}</h2><p>Example member · Account integration pending</p></div><Link className="btn btn-secondary" to="/login">Member sign in <ArrowRight size={16}/></Link></div>
    <div className="account-layout"><aside className="account-tabs" aria-label="Account settings">
      {[['profile','Personal details',UserRound],['preferences','Communication preferences',Mail],['security','Sign-in and security',Shield],['membership','Membership and services',CheckCircle2]].map(([key,label,Icon])=><button type="button" key={key} className={tab===key?'selected':''} onClick={()=>{setTab(key);setNotice('');}}><Icon size={18}/>{label}</button>)}
    </aside><section className="surface padded account-content">
      {tab==='profile'&&<form onSubmit={save}><h2>Personal details</h2><p>View and amend the sample fields that will be mapped to the verified CRM Contact.</p>
        <div className="auth-double"><div><label htmlFor="profile-name">Full name</label><input id="profile-name" value={form.name} onChange={e=>update('name',e.target.value)} required/></div><div><label htmlFor="profile-email">Email address</label><input id="profile-email" type="email" value={form.email} onChange={e=>update('email',e.target.value)} required/></div></div>
        <div className="auth-double"><div><label htmlFor="profile-mobile">Mobile</label><input id="profile-mobile" value={form.mobile} onChange={e=>update('mobile',e.target.value)} type="tel"/></div><div><label htmlFor="profile-postcode">Postcode</label><input id="profile-postcode" value={form.postcode} onChange={e=>update('postcode',e.target.value)}/></div></div>
        <label htmlFor="profile-business">Trading / business name</label><input id="profile-business" value={form.business} onChange={e=>update('business',e.target.value)}/>
        <button className="btn btn-primary" type="submit">Save changes (preview)</button></form>}
      {tab==='preferences'&&<form onSubmit={save}><h2>Communication preferences</h2><p>These sample preferences are local to this page and will require CRM confirmation.</p>
        <label className="auth-checkbox"><input type="checkbox" checked={form.contactByEmail} onChange={e=>update('contactByEmail',e.target.checked)}/>Service notifications by email</label>
        <label className="auth-checkbox"><input type="checkbox" checked={form.marketing} onChange={e=>update('marketing',e.target.checked)}/>Marketing and Guild news emails</label>
        <button className="btn btn-primary">Save preferences (preview)</button></form>}
      {tab==='security'&&<div><h2>Sign-in and security</h2><p>Catalyst Authentication will manage account access, identity checks and password resets.</p>
        <div className="security-row"><KeyRound size={20}/><div><strong>Password and sign-in</strong><span>No active account in preview</span></div><Link className="btn btn-secondary" to="/forgot-password">Reset password</Link></div>
        <div className="security-row"><Shield size={20}/><div><strong>Contact verification</strong><span>The backend will verify the Catalyst user and resolve the CRM Contact.</span></div></div></div>}
      {tab==='membership'&&<div><h2>Membership and services</h2><p>Subscription, policies, accreditations and invoices will be loaded securely from the backend.</p>
        <div className="account-options"><Link className="account-option" to="/membership"><strong>Membership</strong><span>Explore membership services</span><ArrowRight size={16}/></Link>
        <Link className="account-option" to="/insurance"><strong>Insurance</strong><span>Explore insurance services</span><ArrowRight size={16}/></Link>
        <Link className="account-option" to="/accreditation"><strong>Accreditation</strong><span>Explore centre accreditation</span><ArrowRight size={16}/></Link></div></div>}
      {notice&&<Unavailable message={notice}/>}
    </section></div>
  </div>;
}
