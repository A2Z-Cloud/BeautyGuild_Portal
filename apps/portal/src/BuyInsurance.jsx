import React,{useEffect,useState} from 'react';
import {ArrowLeft,LockKeyhole} from 'lucide-react';
import {Link} from 'react-router-dom';
import {Notice,PageHeading} from './UiParts.jsx';
import {INTEGRATIONS,portalApi} from './services/api.js';
import {START_WINDOW_DAYS,isFuture,startLimits} from './startDate.js';
import {formatDate} from './format.js';
import {validate} from './logic.mjs';
import {toRequest,visibleFields} from './insuranceInputs.js';
import {BlockedNotice,InsuranceForm,InsuranceLines,useInsuranceQuote} from './InsuranceForm.jsx';

const money=pence=>'£'+(pence/100).toFixed(2);

// Buy Beauty Guild insurance on its own. Premiums are rated by the server from these answers; cover that
// needs the Insurance team, or cannot be offered online, is explained here and cannot be paid for.
export default function BuyInsurance(){
  const [who,setWho]=useState({state:'loading',firstName:'',lastName:''});
  const [values,setValues]=useState({}),[country,setCountry]=useState(''),[accepted,setAccepted]=useState(false),[start,setStart]=useState('');
  const [errors,setErrors]=useState({}),[countryError,setCountryError]=useState(''),[busy,setBusy]=useState(false),[payError,setPayError]=useState('');
  useEffect(()=>{
    let alive=true;
    portalApi.getIdentity().then(u=>alive&&setWho({state:'in',firstName:u.firstName,lastName:u.lastName})).catch(()=>alive&&setWho({state:'out',firstName:'',lastName:''}));
    return()=>{alive=false;};
  },[]);
  const ins=toRequest(values),enabled=INTEGRATIONS.stripeCheckout&&who.state==='in'&&Boolean(country)&&(values.insWorking||[]).length>0;
  const q=useInsuranceQuote({enabled,request:()=>({service:'insurance',country,...(start?{start}:{}),insurance:toRequest(values)}),key:JSON.stringify([country,start,ins])});
  const set=(name,value)=>{setValues(v=>({...v,[name]:value}));setErrors(e=>({...e,[name]:undefined}));};
  async function pay(){
    if(busy)return;
    const found=validate(visibleFields(values),values);setErrors(found);setCountryError(country?'':'Choose where you are based.');
    if(Object.keys(found).length||!country){setPayError('Please answer the highlighted questions.');return;}
    setBusy(true);setPayError('');
    try{
      const r=await portalApi.startCheckout({service:'insurance',country,...(start?{start}:{}),insurance:ins,accepted:'yes',firstName:who.firstName,lastName:who.lastName});
      if(!/^https:\/\/checkout\.stripe\.com\//.test(r.checkoutUrl))throw new Error('We could not open the payment page. Please try again.');
      window.location.assign(r.checkoutUrl);
    }catch(e){setPayError(e.message);setBusy(false);}
  }
  const quote=q.quote,payable=quote&&quote.payable;
  return <div className="page narrow-page"><Link to="/insurance" className="back-link"><ArrowLeft size={16}/> Back to insurance</Link>
    <PageHeading eyebrow="BEAUTY GUILD INSURANCE" title="Buy insurance" description="Answer a few questions, see your price, then pay securely on Stripe. We never see your card details."/>
    {!INTEGRATIONS.stripeCheckout?<Notice title="Not available yet">Online insurance purchase is not available yet.</Notice>:who.state==='loading'?<p role="status">Checking your account…</p>:
    who.state==='out'?<Notice title="Please sign in">Sign in or create an account to buy insurance. <Link className="text-link" to="/login">Sign in</Link></Notice>:<>
    <section className="surface padded buy-section"><h2>About your business</h2><InsuranceForm values={values} onChange={set} errors={errors} country={country} onCountry={v=>{setCountry(v);setCountryError('');}} countryError={countryError}/></section>
    <section className="surface padded buy-section"><h2>When should your cover start?</h2>
      <div className="field"><label htmlFor="ins-start">Start date</label><input id="ins-start" type="date" value={start||startLimits().min} min={startLimits().min} max={startLimits().max} onChange={e=>setStart(e.target.value===startLimits().min?'':e.target.value)}/>
        <small>Cover starts today unless you choose a later date, up to {START_WINDOW_DAYS} days ahead. You pay now, and it shows as Coming soon until it starts.</small></div></section>
    <section className="surface padded buy-section"><h2>Summary</h2>
      {!enabled?<p className="muted">Choose where you are based and how you work to see your price.</p>:q.loading?<p role="status">Working out your price…</p>:q.error?<Notice title="Unable to price this">{q.error}</Notice>:quote?<>
        <BlockedNotice quote={quote}/>
        {isFuture(start)&&<p className="muted">Cover starts on {formatDate(start)}. It shows as Coming soon until then.</p>}
        {quote.lines.length>0&&<div className="checkout-summary"><InsuranceLines quote={quote}/><div className="checkout-total"><span>Total including Insurance Premium Tax</span><strong>{money(quote.totalPence)}</strong></div></div>}
        {payable&&<>
          <label className="check-choice"><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)}/><span>I accept the <a href="https://www.beautyguild.com/Membership/Code-Of-Ethics" target="_blank" rel="noopener noreferrer">Code of Ethics</a> and the Guild's terms and privacy information.</span></label>
          {payError&&<Notice title="Payment unavailable">{payError}</Notice>}
          <button type="button" className="btn btn-primary btn-block" disabled={busy||!accepted||!(who.firstName||who.lastName)} onClick={pay}><LockKeyhole size={16}/>{busy?'Opening secure payment…':'Pay '+money(quote.totalPence)+' securely with Stripe'}</button>
          {!(who.firstName||who.lastName)&&<p className="muted">Add your name to your account before buying.</p>}</>}</>:null}</section></>}
  </div>;
}
