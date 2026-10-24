import React,{useEffect,useRef,useState} from 'react';
import {Link,useNavigate} from 'react-router-dom';
import {Save} from 'lucide-react';
import {INTEGRATIONS,portalApi} from './services/api.js';
import {CHANGED_MESSAGE,SAVED_MESSAGE,clearWaiting,restoreWaiting,saveDraft,setSavePending,snapshotStored,takeSavePending,writeWaiting} from './savedDraft.js';

// Save my application. A signed-out visitor is sent to sign in or create an account and comes back to the same page with their answers;
// the draft is then saved once, automatically. `build()` returns {service,answers,names}; `hint` explains why saving is not yet possible.
export function useSaveApplication({signedIn,route,canSave,hint,build}){
  const navigate=useNavigate(),[s,setS]=useState({busy:false,ok:false,msg:''}),now=useRef();
  now.current={canSave,hint,build,busy:s.busy};
  const toCheckpoint=()=>{setSavePending(true);writeWaiting(route,snapshotStored());navigate('/account/checkpoint?returnTo='+encodeURIComponent(route)+'&intent=save');};
  async function save(){
    const c=now.current;
    if(c.busy)return;
    if(!c.canSave){setS({busy:false,ok:false,msg:c.hint});return;}
    if(!signedIn){toCheckpoint();return;}
    setS({busy:true,ok:false,msg:''});
    try{await saveDraft(portalApi,c.build());clearWaiting();setS({busy:false,ok:true,msg:SAVED_MESSAGE});}
    catch(e){
      if(e.status===401||e.code==='NOT_AUTHENTICATED'){toCheckpoint();return;}
      setS({busy:false,ok:false,msg:e.code==='REVISION_CONFLICT'?CHANGED_MESSAGE:e.status===422||e.status===409?e.message:'We could not save your application. Please try again.'});
    }
  }
  // Back from signing in with the save still pending: save once.
  // Opened in a new tab by the emailed link, the answers wait in localStorage: restore them and reload once so the page starts from them.
  useEffect(()=>{
    if(!signedIn)return;
    if(takeSavePending())save();
    else if(restoreWaiting(route))window.location.reload();
  },[signedIn]);// eslint-disable-line react-hooks/exhaustive-deps
  return {...s,save};
}
export default function SaveApplication({saver,className=''}){
  if(!INTEGRATIONS.crmDrafts)return null;
  return <div className={'save-card '+className}><button type="button" className="btn btn-secondary btn-block" disabled={saver.busy} onClick={saver.save}><Save size={16}/>{saver.busy?'Saving…':'Save my application'}</button>
    <p className="muted">Not ready to finish? Save your answers and come back later. We never save the boxes where you agree to our terms, or any payment details.</p>
    {saver.msg&&<p className={saver.ok?'save-ok':'error'} role={saver.ok?'status':'alert'}>{saver.msg}{saver.ok&&<> <Link className="text-link" to="/drafts">Saved applications</Link></>}</p>}</div>;
}
