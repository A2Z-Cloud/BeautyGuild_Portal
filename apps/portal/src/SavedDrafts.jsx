import React,{useEffect,useState} from 'react';
import {Link,useNavigate} from 'react-router-dom';
import {PageHeading,Notice} from './UiParts.jsx';
import {INTEGRATIONS,portalApi} from './services/api.js';
import {usePreviewState} from './journeys/previewState.jsx';

export default function SavedDrafts(){
 const navigate=useNavigate(),{restoreDraft}=usePreviewState();
 const [state,setState]=useState({loading:true,items:[],error:'',busy:''});
 async function reload(){
  try{const items=await portalApi.listDrafts();setState({loading:false,items,error:'',busy:''});}
  catch(e){setState({loading:false,items:[],error:e.message,busy:''});}
 }
 useEffect(()=>{if(INTEGRATIONS.crmDrafts)reload();else setState({loading:false,items:[],error:'',busy:''});},[]);
 async function resume(d){
  setState(s=>({...s,busy:d.id,error:''}));
  try{
   const full=await portalApi.getDraft(d.service,d.id);
   restoreDraft(full);
   navigate('/'+(d.service==='combined'?'membership':d.service)+'/new');
  }catch(e){setState(s=>({...s,busy:'',error:e.message}));}
 }
 async function discard(d){
  if(!window.confirm('Permanently discard this unfinished application?'))return;
  setState(s=>({...s,busy:d.id,error:''}));
  try{await portalApi.discardDraft(d.service,d.id);await reload();}
  catch(e){setState(s=>({...s,busy:'',error:e.message}));}
 }
 return <div className="page">
  <PageHeading eyebrow="MY APPLICATIONS" title="Saved applications" description="Pick up an unfinished application where you left off."/>
  {!INTEGRATIONS.crmDrafts?<Notice title="Coming soon">You will soon be able to save your applications and come back to them here.</Notice>:
   state.loading?<p role="status">Loading applications…</p>:<section className="surface padded">
    {state.error&&<Notice title="Could not load application">{state.error}</Notice>}
    {state.items.length===0?<p>You have no saved applications.</p>:state.items.map(d=><div className="security-row" key={d.service+d.id}>
     <div><strong>{d.service==='combined'?'Membership + Insurance':d.service==='accreditation'?'Accreditation'+(d.title?' · '+d.title:''):d.service}</strong>
      <span>Saved application · Reference {d.id} · Updated {d.updatedAt?new Date(d.updatedAt).toLocaleString('en-GB'):'recently'}</span></div>
     <button type="button" className="btn btn-primary" disabled={Boolean(state.busy)} onClick={()=>resume(d)}>{state.busy===d.id?'Loading…':'Resume'}</button>
     <button type="button" className="btn btn-secondary" disabled={Boolean(state.busy)} onClick={()=>discard(d)}>Discard</button>
    </div>)}
   </section>}
 </div>;
}
