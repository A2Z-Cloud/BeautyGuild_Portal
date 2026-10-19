import React,{useEffect,useRef,useState} from 'react';
import {Field,Notice} from './UiParts.jsx';
import {COUNTRY_OPTIONS} from './JourneyConfig.js';
import {visibleSteps} from './insuranceInputs.js';
import {portalApi} from './services/api.js';

const money=pence=>'£'+(pence/100).toFixed(2);
// The insurance questions as sections of one page, for the buy pages. The answers are collected here;
// the server rates them, applies the STOP and REFER rules and decides whether they can be paid for online.
export function InsuranceForm({values,onChange,errors,country,onCountry,countryError}){
  return <>
    <div className="field"><label htmlFor="ins-country">Where are you based? *</label>
      <select id="ins-country" value={country} onChange={e=>onCountry(e.target.value)} aria-invalid={Boolean(countryError)}><option value="">Choose a country</option>{COUNTRY_OPTIONS.map(c=><option key={c} value={c}>{c}</option>)}</select>
      {countryError&&<small className="error" role="alert">{countryError}</small>}</div>
    {visibleSteps(values).map(step=><fieldset key={step.id} className="buy-fieldset ins-step"><legend>{step.title}</legend><p className="muted">{step.description}</p>
      <div className="fields-grid">{step.fields.filter(f=>!f.when||f.when(values)).map(f=><Field key={f.name} field={f} value={values[f.name]} onChange={onChange} error={errors[f.name]}/>)}</div></fieldset>)}
  </>;
}
// The server's price for the answers so far, refreshed shortly after they stop changing. `extra` is the rest of the request.
export function useInsuranceQuote({enabled,request,key}){
  const [state,setState]=useState({loading:false,quote:null,error:''}),latest=useRef(0);
  useEffect(()=>{
    if(!enabled){setState({loading:false,quote:null,error:''});return undefined;}
    const mine=++latest.current;setState(s=>({...s,loading:true,error:''}));
    const timer=setTimeout(()=>{portalApi.checkoutQuotePost(request()).then(quote=>mine===latest.current&&setState({loading:false,quote,error:''}))
      .catch(e=>mine===latest.current&&setState({loading:false,quote:null,error:e.message}));},500);
    return()=>clearTimeout(timer);
  },[enabled,key]);// eslint-disable-line react-hooks/exhaustive-deps
  return state;
}
export function BlockedNotice({quote}){
  if(!quote||quote.payable!==false)return null;
  const refer=quote.blocked?.status==='REFER',incomplete=quote.blocked?.status==='INCOMPLETE';
  return <Notice title={incomplete?'A few more answers needed':refer?'Our Insurance team needs to review this':'We cannot offer this cover online'}>
    {(quote.blocked?.reasons||[]).join(' ')}{!incomplete&&' You cannot pay for this cover online. Please contact the Guild Insurance team and we will help you.'}</Notice>;
}
export const InsuranceLines=({quote})=><>{(quote.lines||[]).map(l=><div key={l.name}><span>{l.name}</span><strong>{money(l.totalPence)}</strong></div>)}</>;
