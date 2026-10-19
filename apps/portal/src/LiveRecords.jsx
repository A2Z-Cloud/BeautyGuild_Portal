import React,{useEffect,useState} from 'react';
import {Link,useParams,useSearchParams} from 'react-router-dom';
import {portalApi} from './services/api.js';
import {Notice,PageHeading,Status} from './UiParts.jsx';
import {formatDate,serviceLabel} from './format.js';
import {DocumentsPanel} from './DocumentsPanel.jsx';
export function LiveRecords(){
  const [query,setQuery]=useSearchParams(),kind=query.get('type')||'';
  const [data,setData]=useState({busy:true,error:'',rows:[]});
  useEffect(()=>{let active=true;setData(x=>({...x,busy:true,error:''}));
    portalApi.listRecords(kind).then(rows=>active&&setData({busy:false,error:'',rows})).catch(e=>active&&setData({busy:false,error:e.message,rows:[]}));
    return()=>{active=false;};
  },[kind]);
  return <div className="page"><PageHeading eyebrow="MEMBER RECORDS" title="My Guild records" description="Your memberships, accreditations and insurance."/>
    <div className="filter-wrap"><label htmlFor="live-type">Service</label><select id="live-type" value={kind} onChange={e=>setQuery(e.target.value?{type:e.target.value}:{})}>
      <option value="">All</option>{['membership','accreditation','insurance'].map(k=><option value={k} key={k}>{serviceLabel(k)}</option>)}</select></div>
    {data.busy?<p role="status">Loading your records…</p>:data.error?<Notice title="Unable to load records">{data.error}</Notice>:<section className="surface">
      {data.rows.length?<table className="record-table"><thead><tr><th>Record</th><th>Status</th><th>Last updated</th></tr></thead><tbody>
      {data.rows.map(x=><tr key={x.kind+x.id}><td><Link to={'/records/'+x.kind+'/'+x.id+'?from='+encodeURIComponent(kind||'all')} className="reference">{x.title}</Link><small>{serviceLabel(x.kind)}</small></td><td><Status value={x.status}/></td><td>{formatDate(x.updated)}</td></tr>)}</tbody></table>:<p className="padded">No records found for your account.</p>}</section>}
  </div>;
}
export function LiveRecordDetail({kindOverride}){
  const params=useParams(),kind=kindOverride||params.kind,id=params.id;
  const [record,setRecord]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  useEffect(()=>{let active=true;setLoading(true);portalApi.getRecord(kind,id).then(x=>{if(active){setRecord(x);setLoading(false);}}).catch(e=>{if(active){setError(e.message);setLoading(false);}});return()=>{active=false;};},[kind,id]);
  return <div className="page"><Link to="/records" className="back-link">← Back to records</Link>
    {loading?<p role="status">Loading record…</p>:error?<Notice title="Record unavailable">{error}</Notice>:record&&<><PageHeading eyebrow={record.kind.toUpperCase()} title={record.title} description="Your record details"/><div className="surface padded"><dl className="detail-list">
      {Object.entries({Reference:record.id,Service:serviceLabel(record.kind),Status:record.status,Type:record.type,'Start date':formatDate(record.startDate),'End date':formatDate(record.endDate),'Payment status':record.paymentStatus}).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value||'—'}</dd></div>)}</dl></div><div style={{marginTop:24}}>{kind==='membership'&&<p><Link className="btn btn-secondary" to={'/membership/manage/'+id}>Manage membership and invoices</Link></p>}<DocumentsPanel kind={kind} id={id}/></div></>}
  </div>;
}
const SUMMARY_LABELS={total:'All records',memberships:'Memberships',accreditations:'Accreditations',insurance:'Insurance'};
// A summary of the member's records, shown under the service cards. A missing or unmatched record
// is explained in plain words and never replaces the rest of the dashboard.
export function RecordsSummary(){
  const [data,setData]=useState(null),[error,setError]=useState(null);
  useEffect(()=>{let active=true;portalApi.getDashboard().then(x=>active&&setData(x)).catch(e=>active&&setError(e));return()=>{active=false;};},[]);
  if(error){
    if(error.code==='NOT_AUTHENTICATED')return <Notice title="Sign in to see your records">Your memberships, accreditations and insurance will appear here once you are signed in.</Notice>;
    return <Notice title="Your records">{error.message}</Notice>;
  }
  if(!data)return <p role="status">Loading your records…</p>;
  return <section aria-label="Your records"><div className="section-row"><div><small className="eyebrow">YOUR RECORDS</small><h2>At a glance</h2></div><Link className="text-link" to="/records">All records</Link></div>
    <div className="stat-row">{Object.entries(data.summary).map(([k,v])=><div className="stat" key={k}><span>{SUMMARY_LABELS[k]||k}</span><strong>{v}</strong></div>)}</div>
    <section className="surface padded">{data.recent.map(r=><p key={r.kind+r.id}><Link className="reference" to={'/records/'+r.kind+'/'+r.id}>{r.title}</Link> · {r.status}</p>)}{data.recent.length===0&&<p>No records yet.</p>}</section></section>;
}
