import React from 'react';
import {FileText} from 'lucide-react';
import {LEGAL,policyDocuments} from './legal.js';

const ext={target:'_blank',rel:'noopener noreferrer'};
// A row of the Guild's information pages. `keys` picks which.
export function LegalLinks({keys=['terms','privacy','ethics'],className='legal-links'}){
  return <span className={className}>{keys.map(k=><a key={k} href={LEGAL[k].href} {...ext}>{LEGAL[k].label}</a>)}</span>;
}
// "I have reviewed the Guild's Terms of Business and Privacy Policy." for the account pages.
export function ReviewedLabel(){
  return <span>I have reviewed the Guild's <a href={LEGAL.terms.href} {...ext}>Terms of Business</a> and <a href={LEGAL.privacy.href} {...ext}>Privacy Policy</a>.</span>;
}
// The policy documents that come with the cover chosen, plus the information pages (V1 quote summary).
export function PolicyDocuments({values}){
  const docs=policyDocuments(values);
  return <div className="policy-docs"><h3><FileText size={17}/> Your policy documents</h3>
    <ul>{docs.map(d=><li key={d.code}><span>{d.name}</span><small>Included</small></li>)}</ul>
    <p className="muted">Read before you buy: <LegalLinks keys={['terms','privacy','treatments']}/>. Your policy documents are available from your Guild records once your cover starts.</p></div>;
}
