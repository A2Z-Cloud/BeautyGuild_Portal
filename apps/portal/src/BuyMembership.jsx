import React,{useEffect,useState} from 'react';
import {ArrowLeft,LockKeyhole} from 'lucide-react';
import {Link,useSearchParams} from 'react-router-dom';
import {Notice,PageHeading} from './UiParts.jsx';
import {INTEGRATIONS,portalApi} from './services/api.js';

const LEVELS=[['associate','Associate Member','Guild membership without insurance.'],['full_non_salon','Full Member (Non-Salon)','Full membership for practitioners who do not own a salon.'],['full_salon','Full Member (Salon)','Full membership for salon owners.']];
const BRANCHES=[['beauty','Beauty Therapists'],['holistic','Holistic Therapists'],['nails','Nail Technicians'],['hair','Hairdressers & Barbers']];
const ADDONS=[['bundle','Membership bundle'],['certificate','Additional certificate'],['badge','Additional badge'],['sticker','Additional window sticker']];
const money=pence=>'£'+(pence/100).toFixed(2);

// Buy or renew a membership. The server decides every amount from the Stripe prices; this page
// only sends choices, shows the server's summary, and sends the member to Stripe.
export default function BuyMembership(){
  const [query]=useSearchParams(),previousId=query.get('renew')||'',changeType=query.get('change')==='upgrade'?'upgrade':'renewal';
  const [who,setWho]=useState({state:'loading',firstName:'',lastName:''});
  const [f,setF]=useState({level:'',branch:'',branches:[],billing:'annual',addons:{},accepted:false});
  const [q,setQ]=useState({loading:false,quote:null,error:''}),[busy,setBusy]=useState(false),[payError,setPayError]=useState('');
  useEffect(()=>{
    let alive=true;
    portalApi.getIdentity().then(u=>alive&&setWho({state:'in',firstName:u.firstName,lastName:u.lastName})).catch(()=>alive&&setWho({state:'out',firstName:'',lastName:''}));
    return()=>{alive=false;};
  },[]);
  const addonText=Object.entries(f.addons).filter(([,n])=>n>0).map(([k,n])=>k+':'+n).join(',');
  const ready=f.level&&f.branch;
  const base=()=>({service:'membership',level:f.level,branch:f.branch,billing:f.billing,...(f.branches.length?{branches:f.branches.join(',')}:{}),
    ...(previousId?{previousId,changeType}:{})});
  useEffect(()=>{
    if(!INTEGRATIONS.stripeCheckout||who.state!=='in'||!ready){setQ({loading:false,quote:null,error:''});return undefined;}
    let alive=true;setQ(s=>({...s,loading:true,error:''}));
    portalApi.checkoutQuote({...base(),...(addonText?{addons:addonText}:{})}).then(quote=>alive&&setQ({loading:false,quote,error:''})).catch(e=>alive&&setQ({loading:false,quote:null,error:e.message}));
    return()=>{alive=false;};
  },[who.state,f.level,f.branch,f.billing,f.branches.join(','),addonText,previousId]);// eslint-disable-line react-hooks/exhaustive-deps
  const set=patch=>setF(old=>({...old,...patch}));
  const toggleBranch=id=>set({branches:f.branches.includes(id)?f.branches.filter(b=>b!==id):[...f.branches,id]});
  async function pay(){
    if(busy)return;setBusy(true);setPayError('');
    try{
      const r=await portalApi.startCheckout({...base(),addons:f.addons,accepted:'yes',firstName:who.firstName,lastName:who.lastName});
      if(!/^https:\/\/checkout\.stripe\.com\//.test(r.checkoutUrl))throw new Error('We could not open the payment page. Please try again.');
      window.location.assign(r.checkoutUrl);
    }catch(e){setPayError(e.message);setBusy(false);}
  }
  const quote=q.quote,firstPay=quote?.lines.filter(l=>!l.interval).reduce((t,l)=>t+l.totalPence,0)||0,recurring=quote?.lines.find(l=>l.interval);
  return <div className="page narrow-page"><Link to="/membership" className="back-link"><ArrowLeft size={16}/> Back to membership</Link>
    <PageHeading eyebrow="GUILD MEMBERSHIP" title={previousId?(changeType==='upgrade'?'Upgrade your membership':'Renew your membership'):'Join the Guild'} description="Choose your membership, then pay securely on Stripe. We never see your card details."/>
    {!INTEGRATIONS.stripeCheckout?<Notice title="Not available yet">Online membership purchase is not available yet.</Notice>:who.state==='loading'?<p role="status">Checking your account…</p>:
    who.state==='out'?<Notice title="Please sign in">Sign in or create an account to buy a membership. <Link className="text-link" to="/login">Sign in</Link></Notice>:<>
    <section className="surface padded buy-section"><h2>Your membership</h2>
      <div className="buy-options">{LEVELS.map(([id,name,hint])=><label key={id} className={'radio-choice'+(f.level===id?' selected':'')}><input type="radio" name="level" checked={f.level===id} onChange={()=>set({level:id})}/><span><strong>{name}</strong><small>{hint}</small></span></label>)}
        <p className="muted">International membership is priced individually. Please contact the Guild to join from outside the UK.</p></div>
      <div className="field"><label htmlFor="branch">Your professional branch</label><select id="branch" value={f.branch} onChange={e=>set({branch:e.target.value,branches:f.branches.filter(b=>b!==e.target.value)})}><option value="">Choose a branch</option>{BRANCHES.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></div>
      <fieldset className="buy-fieldset"><legend>Additional branches (optional)</legend>{BRANCHES.filter(([id])=>id!==f.branch).map(([id,name])=><label key={id} className="check-choice"><input type="checkbox" checked={f.branches.includes(id)} onChange={()=>toggleBranch(id)}/>{name}</label>)}</fieldset>
      <fieldset className="buy-fieldset"><legend>Pay</legend>{[['annual','Annually'],['monthly','Monthly']].map(([id,name])=><label key={id} className="check-choice"><input type="radio" name="billing" checked={f.billing===id} onChange={()=>set({billing:id})}/>{name}</label>)}</fieldset></section>
    <section className="surface padded buy-section"><h2>Extras (optional)</h2>{ADDONS.map(([key,label])=><label key={key} className="addon-row"><span>{label}</span>
      <input type="number" min="0" max="10" inputMode="numeric" value={f.addons[key]||0} onChange={e=>set({addons:{...f.addons,[key]:Math.max(0,Math.min(10,Number(e.target.value)||0))}})}/></label>)}</section>
    <section className="surface padded buy-section"><h2>Summary</h2>
      {!ready?<p className="muted">Choose a membership level and branch to see your price.</p>:q.loading?<p role="status">Working out your price…</p>:q.error?<Notice title="Unable to price this">{q.error}</Notice>:quote?<>
        <div className="checkout-summary">{quote.lines.map(l=><div key={l.name}><span>{l.name}{l.quantity>1?' × '+l.quantity:''}</span><strong>{money(l.totalPence)}{l.interval?' / '+l.interval:''}</strong></div>)}
          <div className="checkout-total"><span>Due today</span><strong>{money(quote.totalPence)}</strong></div></div>
        {recurring&&<p className="muted">Then {money(recurring.unitPence)} each {recurring.interval}, until you cancel. Prices include VAT where it applies.</p>}
        <label className="check-choice"><input type="checkbox" checked={f.accepted} onChange={e=>set({accepted:e.target.checked})}/><span>I accept the <a href="https://www.beautyguild.com/Membership/Code-Of-Ethics" target="_blank" rel="noopener noreferrer">Code of Ethics</a> and the Guild's terms and privacy information.</span></label>
        {payError&&<Notice title="Payment unavailable">{payError}</Notice>}
        <button type="button" className="btn btn-primary btn-block" disabled={busy||!f.accepted||!(who.firstName||who.lastName)} onClick={pay}><LockKeyhole size={16}/>{busy?'Opening secure payment…':'Pay '+money(firstPay||quote.totalPence)+' securely with Stripe'}</button>
        {!(who.firstName||who.lastName)&&<p className="muted">Add your name to your account before buying.</p>}</>:null}</section></>}
  </div>;
}
