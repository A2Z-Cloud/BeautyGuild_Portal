import React,{useEffect,useState} from 'react';
import {LEGAL} from './legal.js';
import {PolicyDocuments} from './LegalLinks.jsx';
import {ArrowLeft,LockKeyhole} from 'lucide-react';
import {Link,useSearchParams} from 'react-router-dom';
import {Notice,PageHeading} from './UiParts.jsx';
import {INTEGRATIONS,portalApi} from './services/api.js';
import PricePanel from './PricePanel.jsx';
import {useStoredState} from './storedState.js';
import {dueToday} from './priceSummary.js';
import {COUNTRY_OPTIONS} from './JourneyConfig.js';
import {countryFor} from './prefill.js';
import {START_WINDOW_DAYS,isFuture,startLimits} from './startDate.js';
import {formatDate} from './format.js';
import {validate} from './logic.mjs';
import {toRequest,visibleFields} from './insuranceInputs.js';
import {BlockedNotice,InsuranceForm,useInsuranceQuote} from './InsuranceForm.jsx';

const LEVELS=[['associate','Associate Member','Guild membership without insurance.'],['full_non_salon','Full Member (Non-Salon)','Full membership for practitioners who do not own a salon.'],['full_salon','Full Member (Salon)','Full membership for salon owners.']];
const BRANCHES=[['beauty','Beauty Therapists'],['holistic','Holistic Therapists'],['nails','Nail Technicians'],['hair','Hairdressers & Barbers']];
const ADDONS=[['bundle','Membership bundle'],['certificate','Additional certificate'],['badge','Additional badge'],['sticker','Additional window sticker']];
const money=pence=>'£'+(pence/100).toFixed(2);

// Buy or renew a membership. The server decides every amount from the Stripe prices; this page
// only sends choices, shows the server's summary, and sends the member to Stripe.
export default function BuyMembership(){
  const [query]=useSearchParams(),changeType=query.get('change')==='upgrade'?'upgrade':'renewal';
  const [who,setWho]=useState({state:'loading',firstName:'',lastName:''});
  // Renewing or upgrading needs the member's own account; a guest is always buying new.
  const previousId=who.state==='out'?'':(query.get('renew')||'');
  // The answers are kept in this tab, so a visitor can leave to sign in or sign up and come back to them. Consent is never restored.
  const [f,setF]=useStoredState('membership',{level:'',branch:'',branches:[],billing:'annual',addons:{},accepted:false,insurance:false,start:''},x=>({...x,accepted:false,start:x.start&&x.start>=startLimits().min?x.start:''}));
  const [kept,setKept]=useStoredState('membership_insurance',{iv:{},country:''});
  const iv=kept.iv,country=kept.country;
  const setIv=next=>setKept(o=>({...o,iv:typeof next==='function'?next(o.iv):next}));
  const setCountry=next=>setKept(o=>({...o,country:typeof next==='function'?next(o.country):next}));
  const [iErrors,setIErrors]=useState({}),[countryError,setCountryError]=useState('');
  const guest=who.state==='out'&&INTEGRATIONS.publicQuotes;
  const loginTo='/account/checkpoint?returnTo='+encodeURIComponent('/membership/buy')+'&intent=complete';
  const [q,setQ]=useState({loading:false,quote:null,error:''}),[busy,setBusy]=useState(false),[payError,setPayError]=useState('');
  useEffect(()=>{
    let alive=true;
    portalApi.getIdentity().then(u=>alive&&setWho(w=>({state:'in',firstName:u.firstName||w.firstName,lastName:u.lastName||w.lastName}))).catch(()=>alive&&setWho({state:'out',firstName:'',lastName:''}));
    return()=>{alive=false;};
  },[]);
  // Use what the Guild holds: the country for the insurance questions, and the name if the sign-in has none.
  useEffect(()=>{
    if(!INTEGRATIONS.crmRecords)return undefined;
    let alive=true;
    portalApi.getMyDetails().then(d=>{
      if(!alive)return;
      setCountry(c=>c||countryFor(d,COUNTRY_OPTIONS));
      setWho(w=>(w.firstName||w.lastName)?w:{...w,firstName:d.firstName,lastName:d.lastName});
    }).catch(()=>{});
    return()=>{alive=false;};
  },[]);
  const addonText=Object.entries(f.addons).filter(([,n])=>n>0).map(([k,n])=>k+':'+n).join(',');
  const ready=f.level&&f.branch;
  const base=()=>({service:'membership',level:f.level,branch:f.branch,billing:f.billing,...(f.branches.length?{branches:f.branches.join(',')}:{}),
    ...(f.start?{start:f.start}:{}),...(previousId?{previousId,changeType}:{})});
  useEffect(()=>{
    if(!INTEGRATIONS.stripeCheckout||(who.state!=='in'&&!guest)||!ready){setQ({loading:false,quote:null,error:''});return undefined;}
    let alive=true;setQ(s=>({...s,loading:true,error:''}));
    (guest?portalApi.publicQuote({...base(),addons:f.addons}):portalApi.checkoutQuote({...base(),...(addonText?{addons:addonText}:{})})).then(quote=>alive&&setQ({loading:false,quote,error:''})).catch(e=>alive&&setQ({loading:false,quote:null,error:e.message}));
    return()=>{alive=false;};
  },[who.state,f.level,f.branch,f.billing,f.start,f.branches.join(','),addonText,previousId,f.insurance]);// eslint-disable-line react-hooks/exhaustive-deps
  // With insurance the answers are too large for a query string, so the server prices them from a POST.
  const ins=toRequest(iv);
  const iq=useInsuranceQuote({enabled:INTEGRATIONS.stripeCheckout&&(who.state==='in'||guest)&&ready&&f.insurance&&Boolean(country)&&(iv.insWorking||[]).length>0,send:guest?portalApi.publicQuote:portalApi.checkoutQuotePost,
    request:()=>({...base(),addons:f.addons,country,insurance:toRequest(iv)}),key:JSON.stringify([f.level,f.branch,f.billing,f.start,f.branches,f.addons,previousId,country,ins])});
  const setI=(name,value)=>{setIv(v=>({...v,[name]:value}));setIErrors(e=>({...e,[name]:undefined}));};
  const set=patch=>setF(old=>({...old,...patch,...(patch.level==='associate'?{insurance:false}:{})}));
  const toggleBranch=id=>set({branches:f.branches.includes(id)?f.branches.filter(b=>b!==id):[...f.branches,id]});
  async function pay(){
    if(busy)return;
    if(f.insurance){
      const found=validate(visibleFields(iv),iv);setIErrors(found);setCountryError(country?'':'Choose where you are based.');
      if(Object.keys(found).length||!country){setPayError('Please answer the highlighted insurance questions.');return;}
    }
    setBusy(true);setPayError('');
    try{
      const r=await portalApi.startCheckout({...base(),addons:f.addons,accepted:'yes',firstName:who.firstName,lastName:who.lastName,...(f.insurance?{country,insurance:ins}:{})});
      if(!/^https:\/\/checkout\.stripe\.com\//.test(r.checkoutUrl))throw new Error('We could not open the payment page. Please try again.');
      window.location.assign(r.checkoutUrl);
    }catch(e){setPayError(e.message);setBusy(false);}
  }
  // With insurance ticked the payable price is the one that includes it; until that is ready the panel shows the membership alone.
  const priced=f.insurance?iq.quote:q.quote,quote=priced||q.quote,shown=quote,insuranceWaiting=f.insurance&&!iq.quote;
  return <div className="page buy-page"><Link to="/membership" className="back-link"><ArrowLeft size={16}/> Back to membership</Link>
    <PageHeading eyebrow="GUILD MEMBERSHIP" title={previousId?(changeType==='upgrade'?'Upgrade your membership':'Renew your membership'):'Join the Guild'} description="Choose your membership, then pay securely on Stripe. We never see your card details."/>
    {!INTEGRATIONS.stripeCheckout?<Notice title="Not available yet">Online membership purchase is not available yet.</Notice>:who.state==='loading'?<p role="status">Checking your account…</p>:
    who.state==='out'&&!INTEGRATIONS.publicQuotes?<Notice title="Please sign in">Sign in or create an account to buy a membership. <Link className="text-link" to="/login">Sign in</Link></Notice>:<div className="buy-layout"><div className="buy-main">
    {guest&&<Notice title="No account needed to look">Choose your membership and see the price as you go. You sign in or create an account when you are ready to pay, and your answers are kept while you do.</Notice>}
    <section className="surface padded buy-section"><h2>Your membership</h2>
      <div className="buy-options">{LEVELS.map(([id,name,hint])=><label key={id} className={'radio-choice'+(f.level===id?' selected':'')}><input type="radio" name="level" checked={f.level===id} onChange={()=>set({level:id})}/><span><strong>{name}</strong><small>{hint}</small></span></label>)}
        <p className="muted">International membership is priced individually. Please contact the Guild to join from outside the UK.</p></div>
      <div className="field"><label htmlFor="branch">Your professional branch</label><select id="branch" value={f.branch} onChange={e=>set({branch:e.target.value,branches:f.branches.filter(b=>b!==e.target.value)})}><option value="">Choose a branch</option>{BRANCHES.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></div>
      <fieldset className="buy-fieldset"><legend>Additional branches (optional)</legend>{BRANCHES.filter(([id])=>id!==f.branch).map(([id,name])=><label key={id} className="check-choice"><input type="checkbox" checked={f.branches.includes(id)} onChange={()=>toggleBranch(id)}/>{name}</label>)}</fieldset>
      <div className="field"><label htmlFor="start">Start date</label><input id="start" type="date" value={f.start||startLimits().min} min={startLimits().min} max={startLimits().max} onChange={e=>set({start:e.target.value===startLimits().min?'':e.target.value})}/>
        <small>Starts today unless you choose a later date, up to {START_WINDOW_DAYS} days ahead.{f.insurance?' Your insurance starts on the same date.':''} You pay now, and it shows as Coming soon until it starts.</small></div>
      <fieldset className="buy-fieldset"><legend>Pay</legend>{[['annual','Annually'],['monthly','Monthly']].map(([id,name])=><label key={id} className="check-choice"><input type="radio" name="billing" checked={f.billing===id} onChange={()=>set({billing:id})}/>{name}</label>)}</fieldset></section>
    <section className="surface padded buy-section"><h2>Extras (optional)</h2>{ADDONS.map(([key,label])=><label key={key} className="addon-row"><span>{label}</span>
      <input type="number" min="0" max="10" inputMode="numeric" value={f.addons[key]||0} onChange={e=>set({addons:{...f.addons,[key]:Math.max(0,Math.min(10,Number(e.target.value)||0))}})}/></label>)}</section>
    <section className="surface padded buy-section"><h2>Insurance (optional)</h2>
      <label className="check-choice"><input type="checkbox" checked={f.insurance} disabled={f.level==='associate'} onChange={e=>set({insurance:e.target.checked})}/><span>Add Beauty Guild insurance to my membership</span></label>
      {f.level==='associate'&&<p className="muted">Insurance is included with Full membership. Choose a Full membership level to add it.</p>}
      {f.insurance&&<InsuranceForm values={iv} onChange={setI} errors={iErrors} country={country} onCountry={v=>{setCountry(v);setCountryError('');}} countryError={countryError}/>}</section>
    <section className="surface padded buy-section"><h2>Review and pay</h2>
      {!ready?<p className="muted">Choose a membership level and branch to see your price.</p>:insuranceWaiting?<p className="muted">Answer the insurance questions, including where you are based, so your price includes them.</p>:!priced?<p className="muted" role="status">{(q.error)?q.error:'Working out your price…'}</p>:<>
        {f.insurance&&<BlockedNotice quote={priced}/>}
        <p className="muted">You pay {money(dueToday(priced))} today.</p>
        {f.insurance&&<PolicyDocuments values={iv}/>}
        <label className="check-choice"><input type="checkbox" checked={f.accepted} onChange={e=>set({accepted:e.target.checked})}/><span>I accept the <a href={LEGAL.ethics.href} target="_blank" rel="noopener noreferrer">Code of Ethics</a> and the Guild's <a href={LEGAL.terms.href} target="_blank" rel="noopener noreferrer">Terms of Business</a> and <a href={LEGAL.privacy.href} target="_blank" rel="noopener noreferrer">Privacy Policy</a>.</span></label>
        {payError&&<Notice title="Payment unavailable">{payError}</Notice>}
        {guest?<><p className="muted">To pay you need an account. Your answers are kept while you sign in or sign up. Final checks, including any insurance checks, are done when you pay.</p>
          <Link className="btn btn-primary btn-block" to={loginTo}><LockKeyhole size={16}/> Sign in or create an account to continue</Link></>:
        <button type="button" className="btn btn-primary btn-block" disabled={busy||!f.accepted||!(who.firstName||who.lastName)||priced.payable===false} onClick={pay}><LockKeyhole size={16}/>{busy?'Opening secure payment…':'Pay '+money(dueToday(priced))+' securely with Stripe'}</button>}
        {!guest&&!(who.firstName||who.lastName)&&<p className="muted">Add your name to your account before buying.</p>}</>}
    </section></div>
    <PricePanel quote={shown} loading={q.loading||(f.insurance&&iq.loading)} error={f.insurance&&iq.error?iq.error:q.error} ready={Boolean(ready)} emptyText="Choose a membership level and branch to see your price."
      note={insuranceWaiting?'Insurance is not included yet. Answer the insurance questions to add it.':''} billing={f.billing} onBilling={b=>set({billing:b})} start={f.start}/></div>}
  </div>;
}
