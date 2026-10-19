import React,{useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {ArrowRight} from 'lucide-react';
import {INTEGRATIONS,portalApi} from './services/api.js';
import {IconFor,ServiceArrow} from './UiParts.jsx';
import {accreditationState} from './accreditationState.js';

// The member's applications and saved drafts, reduced to what the Accreditation card should say. Quiet when signed out or
// unmatched: the card then shows the ordinary invitation to apply.
export function useAccreditationState(enabled=true){
  const [state,setState]=useState(null);
  useEffect(()=>{
    if(!enabled)return undefined;
    if(!INTEGRATIONS.crmRecords){setState(accreditationState());return undefined;}
    let alive=true;
    const safe=p=>Promise.resolve(p).then(x=>Array.isArray(x)?x:[]).catch(()=>[]);
    Promise.all([INTEGRATIONS.schoolServices?safe(portalApi.listSchools()):[],INTEGRATIONS.crmDrafts?safe(portalApi.listDrafts().then(d=>(d||[]).filter(x=>x.service==='accreditation'))):[]])
      .then(([schools,drafts])=>alive&&setState(accreditationState({schools,drafts})));
    return()=>{alive=false;};
  },[enabled]);
  return state;
}
// The status banner at the top of the Accreditation page.
export function AccreditationStatusBanner({state}){
  if(!state||state.key==='none')return null;
  return <section className={'accreditation-status status-'+state.key} aria-label="Accreditation status"><div><strong>{state.title}</strong><p>{state.text}</p></div>
    <Link className="btn btn-primary" to={state.to}>{state.action} <ArrowRight size={16}/></Link></section>;
}
// The Accreditation card on the dashboard: it says where the member's application stands and links to the next step.
export function AccreditationDashboardCard({service}){
  const state=useAccreditationState();
  const active=state&&state.key!=='none';
  const go=active&&state.key!=='approved'?{to:state.to,action:state.action}:{to:'/accreditation',action:active?'Go to accreditation':service.action};
  return <Link className={'service-card '+service.theme} to={go.to}><span className="service-icon"><IconFor kind="accreditation"/></span><small>GUILD SERVICES</small>
    <strong>{active?state.title:service.title}</strong><p>{active?state.text:service.description}</p><ServiceArrow>{go.action}</ServiceArrow></Link>;
}
