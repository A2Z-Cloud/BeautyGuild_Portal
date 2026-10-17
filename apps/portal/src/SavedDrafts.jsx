import React, {useEffect, useState} from 'react';
import {ArrowRight, RotateCcw, Trash2} from 'lucide-react';
import {Link, useSearchParams} from 'react-router-dom';
import {Notice, PageHeading} from './UiParts.jsx';
import {DRAFT_CAPABILITIES, INTEGRATIONS, portalApi} from './services/api.js';

const KINDS = ['membership','insurance','accreditation'];
const label = kind => kind[0].toUpperCase() + kind.slice(1);

export default function SavedDrafts() {
  const [params,setParams] = useSearchParams();
  const kind = KINDS.includes(params.get('kind')) ? params.get('kind') : 'membership';
  const connected = INTEGRATIONS.identity && DRAFT_CAPABILITIES[kind];
  const [refresh,setRefresh] = useState(0);
  const [state,setState] = useState({loading:false, items:[], error:''});
  const [discarding,setDiscarding] = useState('');
  useEffect(() => {
    if (!connected) {
      setState({loading:false, items:[], error:''});
      return;
    }
    let cancelled = false;
    setState({loading:true,items:[],error:''});
    // A verified backend identity must be present before any CRM read.
    portalApi.getIdentity().then(user => {
      if (!user?.id) throw new Error('Sign in to view your saved applications.');
      return portalApi.listDrafts(kind);
    }).then(items => {
      if (!cancelled) setState({loading:false,items,error:''});
    }).catch(error => {
      if (!cancelled) setState({loading:false,items:[],error:error.message});
    });
    return () => {cancelled = true;};
  }, [kind,connected,refresh]);

  const discard = async item => {
    if (!connected || !window.confirm('Discard this saved draft? This cannot be undone.')) return;
    setDiscarding(item.id);
    try {
      const user = await portalApi.getIdentity();
      if (!user?.id) throw new Error('Sign in before discarding a draft.');
      await portalApi.discardDraft(kind,item.id,item.revision);
      setRefresh(previous => previous + 1);
    } catch (error) {
      setState(previous => ({...previous,error:error.message}));
    } finally {
      setDiscarding('');
    }
  };
  return <div className="page">
    <PageHeading eyebrow="YOUR APPLICATIONS" title="Saved drafts"
      description="Find and resume your saved Membership, Insurance and Accreditation applications.">
      <Link className="btn btn-secondary" to="/records">Browse sample records <ArrowRight size={16}/></Link>
    </PageHeading>
    <div className="surface padded">
      <div className="record-toolbar"><div><small className="eyebrow">DRAFTS BY SERVICE</small><h2>Applications in progress</h2></div>
        <div className="filter-wrap"><label htmlFor="draft-kind">Service</label>
          <select id="draft-kind" value={kind} onChange={event=>setParams({kind:event.target.value})}>
            {KINDS.map(item=><option value={item} key={item}>{label(item)}</option>)}
          </select>
        </div>
      </div>
      {!connected ? <>
        <Notice title="Demo mode: CRM drafts are not connected">
          No live draft listing, resume, save or discard is enabled. Nothing shown on the portal has been saved in CRM.
          Real drafts require confirmed backend routes, Catalyst identity and server-side Contact ownership checks.
        </Notice>
        <Link className="btn btn-primary" to={'/'+kind+'/new'}>Explore the {kind} journey <ArrowRight size={16}/></Link>
      </> : <>
        {state.error && <div className="auth-unavailable" role="alert">{state.error} <button className="text-button" onClick={()=>setRefresh(x=>x+1)}>Retry</button></div>}
        {state.loading ? <p role="status">Loading saved drafts...</p> :
          state.items.length ? <div className="table-scroll"><table className="record-table">
            <thead><tr><th>Draft reference</th><th>Status</th><th>Updated</th><th>Progress</th><th>Actions</th></tr></thead>
            <tbody>{state.items.map(item=><tr key={item.id}>
              <td>{item.id}</td><td>{item.status}</td><td>{item.updatedAt}</td>
              <td>{item.step || 'Not specified'}</td><td>
                <Link className="text-link" to={'/'+kind+'/new?draft='+encodeURIComponent(item.id)}>Resume <RotateCcw size={14}/></Link>
                {' '}
                <button type="button" className="text-button" disabled={discarding===item.id} onClick={()=>discard(item)}>
                  <Trash2 size={14}/> {discarding===item.id?'Discarding':'Discard'}
                </button>
              </td>
            </tr>)}</tbody>
          </table></div> : <div className="empty-state">No saved drafts were returned for {label(kind)}.</div>}
      </>}
    </div>
  </div>;
}
