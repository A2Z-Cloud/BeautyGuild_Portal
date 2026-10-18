import React, {useEffect,useState} from 'react';
import {ArrowLeft,CreditCard,FileCheck2,LockKeyhole,ShieldCheck} from 'lucide-react';
import {Link,useParams,useSearchParams} from 'react-router-dom';
import {Notice,PageHeading} from './UiParts.jsx';
import {usePreviewState} from './journeys/previewState.jsx';
import {INTEGRATIONS,portalApi} from './services/api.js';
import {accreditationType} from './logic.mjs';

export function PaymentPreview(){
  if(INTEGRATIONS.stripeCheckout)return <LiveCheckout/>;
  const {kind}=useParams();
  const {answers}=usePreviewState();
  const [detail,setDetail]=useState('');
  if(!['membership','accreditation','insurance'].includes(kind))return <div className="page"><PageHeading eyebrow="PAYMENT" title="Invalid service"/></div>;
  const data=answers[kind]||{};
  const label=kind[0].toUpperCase()+kind.slice(1);
  const rows=kind==='accreditation'?
    [['Accreditation category',data.country?accreditationType(data.country):'Not selected'],['Accreditation fee','To be confirmed'],['Membership (if required)','To be confirmed'],['VAT','To be confirmed']]:
    kind==='insurance'?
    [['Selected cover','Requires underwriting'],['Insurance premium','To be confirmed'],['Insurance Premium Tax','To be confirmed'],['Frequency',data.frequency||'To be confirmed']]:
    [['Membership level',data.membershipLevel||'Not selected'],['Membership & add-ons','To be confirmed'],['Insurance (if selected)',data.insuranceWanted==='yes'?'Requires insurance quote':'Not selected'],['Payment frequency',data.frequency||'To be confirmed']];
  return <div className="page narrow-page">
    <Link to={'/'+kind+'/new'} className="back-link"><ArrowLeft size={16}/> Back to {label.toLowerCase()} journey</Link>
    <PageHeading eyebrow="FRONTEND PAYMENT PREVIEW" title="Your payment summary" description="This is a presentation-only payment step. No price, discount, account authorisation, Checkout session or insurance policy has been created."/>
    <div className="checkout-layout">
      <section className="surface padded">
        <h2>{label} order summary</h2><Notice title="Not a payable quote">All amounts must come from your backend after CRM eligibility and relevant insurance checks. This screen does not calculate or charge anything.</Notice>
        <div className="checkout-summary">{rows.map(([label,value])=><div key={label}><span>{label}</span><strong>{value}</strong></div>)}<div className="checkout-total"><span>Amount to pay</span><strong>Awaiting backend</strong></div></div>
        <div className="checkout-method"><CreditCard size={20}/><div><strong>Secure payment through Stripe</strong><span>Stripe Checkout is not connected. Card inputs are deliberately not displayed in this preview.</span></div></div>
        <button className="btn btn-primary btn-block" type="button" onClick={()=>setDetail('Payment is unavailable. No Stripe session was created, no bank card was charged, and no CRM record or policy was activated.')}>Continue to secure payment <LockKeyhole size={16}/></button>
        {detail&&<div className="auth-unavailable" role="status">{detail}</div>}
      </section>
      <aside className="checkout-aside">
        <div className="aside-card"><ShieldCheck size={23}/><h3>Protected checkout</h3><p>Authenticated CRM identity, server-calculated amounts and Stripe confirmation are required before a live payment.</p></div>
        <div className="aside-card"><FileCheck2 size={23}/><h3>Documents and confirmation</h3><p>Receipts, policy wording, schedules and certificates will be linked from the verified backend/WorkDrive records after the appropriate fulfilment step.</p></div>
      </aside>
    </div>
  </div>;
}

export function LiveCheckout(){
 const [params]=useSearchParams(),quoteId=params.get('quote');
 const [state,setState]=useState({loading:true,quote:null,error:'',busy:false});
 useEffect(()=>{
   let alive=true;
   if(!quoteId){setState({loading:false,quote:null,error:'Quote reference is missing.',busy:false});return;}
   portalApi.quote(quoteId).then(quote=>alive&&setState({loading:false,quote,error:'',busy:false}))
   .catch(e=>alive&&setState({loading:false,quote:null,error:e.message,busy:false}));
   return ()=>{alive=false;};
 },[quoteId]);
 async function openCheckout(){
   if(state.busy)return;setState(s=>({...s,busy:true,error:''}));
   try{
     const {checkoutUrl}=await portalApi.checkout(quoteId);
     if(!/^https:\/\/checkout\.stripe\.com\//.test(checkoutUrl))throw new Error('Unexpected payment URL.');
     window.location.assign(checkoutUrl);
   }catch(e){setState(s=>({...s,busy:false,error:e.message}));}
 }
 return <div className="page narrow-page"><PageHeading eyebrow="SERVER-APPROVED QUOTE" title="Secure checkout" description="Only backend-verified approved quotes can proceed. Payments and issuance must be confirmed independently."/>
 {state.loading?<p role="status">Loading the quote…</p>:state.error?<Notice title="Payment unavailable">{state.error}</Notice>:<section className="surface padded">
  <h2>{state.quote.service} quotation</h2><p>Status: {state.quote.status} · Decision: {state.quote.decision}</p>
  {state.quote.status==='APPROVED' && state.quote.decision==='PASS'?<><h2>£{(state.quote.amountPence/100).toFixed(2)}</h2><button type="button" className="btn btn-primary" disabled={state.busy} onClick={openCheckout}>{state.busy?'Opening checkout…':'Continue to Stripe'}</button></>:<Notice title="Under review">The Guild has not authorised this quote for payment. No cover is active.</Notice>}
 </section>}</div>;
}
export function PaymentReturn(){
 const [params]=useSearchParams(),result=params.get('result');
 return <div className="page narrow-page"><PageHeading eyebrow="PAYMENT STATUS" title="Payment verification pending"/><Notice title="Not a payment confirmation">Your return from Stripe does not establish a successful payment or active membership or insurance cover. Please wait for the Guild's confirmed payment record and any subsequent fulfilment.</Notice>
 <Link className="btn btn-secondary" to="/records">View my records</Link></div>;
}
