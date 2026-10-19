import React, {useState} from 'react';
import {ArrowLeft,CreditCard,FileCheck2,LockKeyhole,ShieldCheck} from 'lucide-react';
import {Link,useParams,useSearchParams} from 'react-router-dom';
import {Notice,PageHeading} from './UiParts.jsx';
import {usePreviewState} from './journeys/previewState.jsx';
import {accreditationType} from './logic.mjs';

export function PaymentPreview(){
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

export function PaymentReturn(){
 const [params]=useSearchParams(),cancelled=params.get('result')==='cancelled';
 return <div className="page narrow-page"><PageHeading eyebrow="PAYMENT STATUS" title={cancelled?'Payment cancelled':'Thank you'}/>
 {cancelled?<Notice title="Nothing was charged">You left the payment page before paying. You can try again whenever you are ready.</Notice>
 :<Notice title="Payment received">We are confirming your payment with the Guild. Your records update shortly and we will confirm by email.</Notice>}
 <Link className="btn btn-secondary" to="/records">View my records</Link></div>;
}
