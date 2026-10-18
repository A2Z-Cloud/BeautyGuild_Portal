import React,{useEffect,useState} from 'react';
import {Link,useNavigate} from 'react-router-dom';
import {PageHeading,Notice} from './UiParts.jsx';
import {INTEGRATIONS,portalApi} from './services/api.js';
import {usePreviewState} from './journeys/previewState.jsx';
export default function DraftsPage(){
  const navigate=useNavigate(),{restoreDraft}=usePreviewState();
  const [data,setData]=useState({loading:true,items:[],error:''});
  const load=()=>portalApi.listDrafts().then(items=>setData({loading:false,items,error:''})).catch(e=>setData({loading:false,items:[],error:e.message}));
  useEffect(()=>{if(INTEGRATIONS.crmDrafts)load();else setData({loading:false,items:[],error:''});},[]);
  const resume=async item=>{try{restoreDraft(await portalApi.getDraft(item.id));navigate('/'+item.service+'/new');}catch(e){setData(p=>({...p,error:e.message}));}};
  const discard=async item=>{
    if(!window.confirm('Discard this draft permanently?'))return;
    try{await portalApi.discardDraft(item.id);await load();}catch(e){setData(p=>({...p,error:e.message}));}
  };
  return <div className="page"><PageHeading eyebrow="MY APPLICATIONS" title="Saved drafts" description="Continue an unfinished membership, accreditation or insurance application."/>
    {!INTEGRATIONS.crmDrafts?<Notice title="Drafts not enabled">The backend has not been configured for authenticated draft storage. <Link to="/login">Sign in</Link> when available.</Notice>:
      data.loading?<p role="status">Loading your drafts…</p>:<section className="surface padded">{data.error&&<div className="notice" role="alert">{data.error}</div>}
      {data.items.length?data.items.map(d=><div className="security-row" key={d.id}><div><strong>{d.service}</strong><span>Updated {d.updatedAt} · Step {d.step+1}</span></div><button className="btn btn-secondary" onClick={()=>resume(d)}>Resume</button><button className="text-button" onClick={()=>discard(d)}>Discard</button></div>):<p>No saved drafts for this account.</p>}</section>}
  </div>;
}
