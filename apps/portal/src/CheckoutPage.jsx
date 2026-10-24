import React,{useEffect,useState} from 'react';
import {LegalLinks} from './LegalLinks.jsx';
import {ArrowLeft,LockKeyhole} from 'lucide-react';
import {Link,useParams,useSearchParams} from 'react-router-dom';
import {Notice,PageHeading} from './UiParts.jsx';
import {INTEGRATIONS,portalApi} from './services/api.js';
import {planSummary,thenCharge} from './priceSummary.js';

const ADDONS=[['bundle','Membership bundle'],['certificate','Certificate'],['badge','Badge'],['sticker','Window sticker']];
const money=pence=>'£'+(pence/100).toFixed(2);
const TITLES={accreditation:'Accreditation payment',additional_venue:'Additional venue payment',membership_addon:'Membership add-ons'};

// One page for every payable service. The server decides what is charged; this page only asks for a
// summary, shows it, and sends the member to Stripe. No amount is ever sent from here.
export default function CheckoutPage(){
  const {service,recordId}=useParams(),[query]=useSearchParams(),centreId=query.get('centreId')||'';
  const [addons,setAddons]=useState({}),[state,setState]=useState({loading:true,quote:null,error:'',busy:false});
  // An accreditation is paid yearly or monthly and renews by itself either way.
  const [billing,setBilling]=useState('annual');
  const isAddon=service==='membership_addon',isAccreditation=service==='accreditation';
  const picked=Object.entries(addons).filter(([,n])=>n>0).map(([k,n])=>k+':'+n).join(',');
  useEffect(()=>{
    let alive=true;
    if(!INTEGRATIONS.stripeCheckout||!TITLES[service])return undefined;
    if(isAddon&&!picked){setState({loading:false,quote:null,error:'',busy:false});return undefined;}
    setState(s=>({...s,loading:true,error:''}));
    portalApi.checkoutQuote({service,recordId,...(centreId?{centreId}:{}),...(isAddon?{addons:picked}:{}),...(isAccreditation?{billing}:{})})
      .then(quote=>alive&&setState({loading:false,quote,error:'',busy:false}))
      .catch(e=>alive&&setState({loading:false,quote:null,error:e.message,busy:false}));
    return()=>{alive=false;};
  },[service,recordId,centreId,picked,isAddon,isAccreditation,billing]);
  async function pay(){
    if(state.busy)return;
    setState(s=>({...s,busy:true,error:''}));
    try{
      const r=await portalApi.startCheckout({service,recordId,...(centreId?{centreId}:{}),...(isAddon?{addons}:{}),...(isAccreditation?{billing}:{})});
      if(r.alreadyPaid){setState(s=>({...s,busy:false,quote:{...s.quote,alreadyPaid:true}}));return;}
      if(!/^https:\/\/checkout\.stripe\.com\//.test(r.checkoutUrl))throw new Error('We could not open the payment page. Please try again.');
      window.location.assign(r.checkoutUrl);
    }catch(e){setState(s=>({...s,busy:false,error:e.message}));}
  }
  const q=state.quote;
  return <div className="page narrow-page"><Link to="/records" className="back-link"><ArrowLeft size={16}/> Back to records</Link>
    <PageHeading eyebrow="SECURE PAYMENT" title={TITLES[service]||'Payment'} description="You will pay on Stripe's secure page. We never see your card details."/>
    {!INTEGRATIONS.stripeCheckout||!TITLES[service]?<Notice title="Not available yet">Online payment is not available yet.</Notice>:<section className="surface padded">
      {isAddon&&<div className="addon-picker"><h2>Choose your add-ons</h2>{ADDONS.map(([key,label])=><label key={key} className="addon-row"><span>{label}</span>
        <input type="number" min="0" max="10" inputMode="numeric" value={addons[key]||0} onChange={e=>setAddons(a=>({...a,[key]:Math.max(0,Math.min(10,Number(e.target.value)||0))}))}/></label>)}</div>}
      {isAccreditation&&<div className="price-toggle" role="group" aria-label="Payment frequency">
        {[['annual','Annual'],['monthly','Monthly']].map(([id,label])=><button key={id} type="button" className={billing===id?'on':''} aria-pressed={billing===id} onClick={()=>setBilling(id)}>{label}</button>)}</div>}
      {state.loading?<p role="status">Preparing your summary…</p>:state.error?<Notice title="Payment unavailable">{state.error}</Notice>:q?.alreadyPaid?<Notice title="Already paid">This has already been paid. Nothing more is due.</Notice>:q?<>
        <div className="checkout-summary">{q.lines.map(l=><div key={l.name}><span>{l.name}{l.quantity>1?' × '+l.quantity:''}</span><strong>{money(l.totalPence)}{l.interval?' / '+l.interval:''}</strong></div>)}
          <div className="checkout-total"><span>{q.plan?'Amount to pay now':'Amount to pay'}</span><strong>{money(q.totalPence)}</strong></div></div>
        {planSummary(q)&&<p className="muted">{'Monthly plan: '+money(planSummary(q).firstPence)+' a month, renewing automatically. It includes a monthly admin fee of '+money(planSummary(q).adminPence)+'.'}</p>}
        {thenCharge(q)&&<p className="muted">Then {money(thenCharge(q).pence)} each {thenCharge(q).interval}, renewing automatically until you cancel.</p>}
        <button type="button" className="btn btn-primary btn-block" disabled={state.busy} onClick={pay}><LockKeyhole size={16}/>{state.busy?'Opening secure payment…':'Pay securely with Stripe'}</button>
        <p className="muted legal-note">By paying you accept the Guild's <LegalLinks keys={['terms','privacy']}/>.</p>
      </>:null}
    </section>}</div>;
}
