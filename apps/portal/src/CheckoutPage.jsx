import React,{useEffect,useState} from 'react';
import {ArrowLeft,LockKeyhole} from 'lucide-react';
import {Link,useParams,useSearchParams} from 'react-router-dom';
import {Notice,PageHeading} from './UiParts.jsx';
import {INTEGRATIONS,portalApi} from './services/api.js';

const ADDONS=[['bundle','Membership bundle'],['certificate','Additional certificate'],['badge','Additional badge'],['sticker','Additional window sticker']];
const money=pence=>'£'+(pence/100).toFixed(2);
const TITLES={accreditation:'Accreditation payment',additional_venue:'Additional venue payment',membership_addon:'Membership add-ons'};

// One page for every payable service. The server decides what is charged; this page only asks for a
// summary, shows it, and sends the member to Stripe. No amount is ever sent from here.
export default function CheckoutPage(){
  const {service,recordId}=useParams(),[query]=useSearchParams(),centreId=query.get('centreId')||'';
  const [addons,setAddons]=useState({}),[state,setState]=useState({loading:true,quote:null,error:'',busy:false});
  const isAddon=service==='membership_addon';
  const picked=Object.entries(addons).filter(([,n])=>n>0).map(([k,n])=>k+':'+n).join(',');
  useEffect(()=>{
    let alive=true;
    if(!INTEGRATIONS.stripeCheckout||!TITLES[service])return undefined;
    if(isAddon&&!picked){setState({loading:false,quote:null,error:'',busy:false});return undefined;}
    setState(s=>({...s,loading:true,error:''}));
    portalApi.checkoutQuote({service,recordId,...(centreId?{centreId}:{}),...(isAddon?{addons:picked}:{})})
      .then(quote=>alive&&setState({loading:false,quote,error:'',busy:false}))
      .catch(e=>alive&&setState({loading:false,quote:null,error:e.message,busy:false}));
    return()=>{alive=false;};
  },[service,recordId,centreId,picked,isAddon]);
  async function pay(){
    if(state.busy)return;
    setState(s=>({...s,busy:true,error:''}));
    try{
      const r=await portalApi.startCheckout({service,recordId,...(centreId?{centreId}:{}),...(isAddon?{addons}:{})});
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
      {state.loading?<p role="status">Preparing your summary…</p>:state.error?<Notice title="Payment unavailable">{state.error}</Notice>:q?.alreadyPaid?<Notice title="Already paid">This has already been paid. Nothing more is due.</Notice>:q?<>
        <div className="checkout-summary">{q.lines.map(l=><div key={l.name}><span>{l.name}{l.quantity>1?' × '+l.quantity:''}</span><strong>{money(l.totalPence)}{l.interval?' / '+l.interval:''}</strong></div>)}
          <div className="checkout-total"><span>Amount to pay</span><strong>{money(q.totalPence)}</strong></div></div>
        <button type="button" className="btn btn-primary btn-block" disabled={state.busy} onClick={pay}><LockKeyhole size={16}/>{state.busy?'Opening secure payment…':'Pay securely with Stripe'}</button>
      </>:null}
    </section>}</div>;
}
