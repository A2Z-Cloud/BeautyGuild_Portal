import React,{useEffect,useState} from 'react';
import {ArrowLeft,KeyRound,ShieldAlert} from 'lucide-react';
import {Link} from 'react-router-dom';
import {portalApi} from '../services/api.js';

export function CatalystSignIn({returnTo='/'}) {
  const [status,setStatus]=useState('loading'),[error,setError]=useState('');
  useEffect(()=>{
    let mounted=true;
    portalApi.signInEmbed('catalyst-login-widget').then(()=>{if(mounted)setStatus('ready');})
      .catch(err=>{if(mounted){setStatus('error');setError(err.message);}});
    return ()=>{mounted=false;};
  },[]);
  return <div className="auth-card"><h2>Secure Catalyst sign in</h2>
    <p>The authentication form below is provided by Zoho Catalyst, not by the React application.</p>
    {status==='loading'&&<p role="status">Loading the secure sign-in form…</p>}
    {status==='error'&&<div className="auth-unavailable" role="alert"><ShieldAlert size={17}/>{error}. Check Catalyst hosting, SDK initialisation and Authentication settings.</div>}
    <div id="catalyst-login-widget" className="catalyst-widget" aria-label="Catalyst sign-in form"/>
    <p className="auth-small">Signing in alone does not verify CRM Contact ownership. CRM records remain inaccessible until the backend mapping is complete.</p>
    <Link className="back-link" to={returnTo}><ArrowLeft size={16}/> Return to application</Link>
  </div>;
}
export function CatalystRegistration({returnTo='/'}) {
  const [message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const submit=async event=>{
    event.preventDefault();
    if(busy)return;
    const form=new FormData(event.currentTarget);
    setBusy(true);setMessage('');
    try{
      await portalApi.register({firstName:String(form.get('firstName')||''),lastName:String(form.get('lastName')||''),email:String(form.get('email')||'')});
      setMessage('The account registration request was sent to Catalyst. Check your email for the invitation or verification step. No CRM Contact or draft has been created by this action.');
    }catch(e){setMessage('Registration could not be completed: '+e.message);}
    finally{setBusy(false);}
  };
  return <form className="auth-card" onSubmit={submit}><h2>Create a Catalyst account</h2>
    <p>Catalyst manages the account invitation. We do not collect passwords in this frontend.</p>
    <div className="auth-double">
      <div><label htmlFor="live-first">First name</label><input id="live-first" name="firstName" required autoComplete="given-name"/></div>
      <div><label htmlFor="live-last">Surname</label><input id="live-last" name="lastName" required autoComplete="family-name"/></div>
    </div>
    <label htmlFor="live-email">Email address</label><input id="live-email" name="email" type="email" required autoComplete="email"/>
    <label className="auth-checkbox"><input type="checkbox" required/><span>I have reviewed the Guild terms and privacy information.</span></label>
    <button type="submit" className="btn btn-primary btn-block" disabled={busy}>{busy?'Requesting account…':'Request account'}</button>
    {message&&<div className="auth-unavailable" role="status">{message}</div>}
    <p className="auth-small">Public signup must be enabled in Catalyst Authentication settings for registration to work.</p>
    <Link className="back-link" to={returnTo}><ArrowLeft size={16}/> Return to application</Link>
  </form>;
}
export function CatalystAccountOverview(){
  const [result,setResult]=useState({loading:true,user:null,error:''}),[logoutError,setLogoutError]=useState('');
  useEffect(()=>{
    let active=true;
    portalApi.getIdentity().then(user=>{if(active)setResult({loading:false,user,error:''});})
      .catch(err=>{if(active)setResult({loading:false,user:null,error:err.message});});
    return ()=>{active=false;};
  },[]);
  const logout=async()=>{try{await portalApi.signOut();}catch(err){setLogoutError(err.message);}};
  return <div className="page account-page">
    <div className="page-heading"><div><small className="eyebrow">CATALYST IDENTITY</small><h1>My account</h1><p>Authenticated account identity from Zoho Catalyst. CRM profile editing remains unavailable until contact mapping is confirmed.</p></div></div>
    {result.loading&&<p role="status">Checking your signed-in session…</p>}
    {result.error&&<div className="notice" role="alert"><strong>Sign-in required</strong><span>{result.error}. <Link to="/login">Sign in</Link></span></div>}
    {result.user&&<div className="surface padded">
      <h2>{[result.user.firstName,result.user.lastName].filter(Boolean).join(' ')||'Guild account'}</h2>
      <dl className="detail-list"><div><dt>Email</dt><dd>{result.user.email}</dd></div><div><dt>Catalyst user ID</dt><dd>{result.user.userId}</dd></div></dl>
      <div className="notice"><strong>CRM linking pending</strong><span>No CRM Contact has been verified. Membership, insurance, accreditation and account updates are intentionally unavailable.</span></div>
      <button type="button" className="btn btn-secondary" onClick={logout}><KeyRound size={16}/> Sign out</button>
      <p className="auth-small">If you use Catalyst Slate on a separate origin, frontend sign-out may not invalidate the backend session. Confirm the logout design before Production.</p>
    </div>}
    {logoutError&&<div className="notice" role="alert"><strong>Sign-out unavailable</strong><span>{logoutError}</span></div>}
  </div>;
}
