import React,{useEffect,useState} from 'react';
import {Link,useParams,useSearchParams} from 'react-router-dom';
import {portalApi} from './services/api.js';
import {Notice,PageHeading,Status} from './UiParts.jsx';
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
      <option value="">All</option>{['membership','accreditation','insurance'].map(k=><option value={k} key={k}>{k}</option>)}</select></div>
    {data.busy?<p role="status">Loading your records…</p>:data.error?<Notice title="Unable to load records">{data.error}</Notice>:<section className="surface">
      {data.rows.length?<table className="record-table"><thead><tr><th>Record</th><th>Status</th><th>Last updated</th></tr></thead><tbody>
      {data.rows.map(x=><tr key={x.kind+x.id}><td><Link to={'/records/'+x.kind+'/'+x.id+'?from='+encodeURIComponent(kind||'all')} className="reference">{x.title}</Link><small>{x.kind}</small></td><td><Status value={x.status}/></td><td>{x.updated||'—'}</td></tr>)}</tbody></table>:<p className="padded">No records found for your account.</p>}</section>}
  </div>;
}
export function LiveRecordDetail({kindOverride}){
  const params=useParams(),kind=kindOverride||params.kind,id=params.id;
  const [record,setRecord]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  useEffect(()=>{let active=true;setLoading(true);portalApi.getRecord(kind,id).then(x=>{if(active){setRecord(x);setLoading(false);}}).catch(e=>{if(active){setError(e.message);setLoading(false);}});return()=>{active=false;};},[kind,id]);
  return <div className="page"><Link to="/records" className="back-link">← Back to records</Link>
    {loading?<p role="status">Loading record…</p>:error?<Notice title="Record unavailable">{error}</Notice>:record&&<><PageHeading eyebrow={record.kind.toUpperCase()} title={record.title} description="Your record details"/><div className="surface padded"><dl className="detail-list">
      {Object.entries({Reference:record.id,Service:record.kind,Status:record.status,Type:record.type,'Start date':record.startDate,'End date':record.endDate,'Payment status':record.paymentStatus}).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value||'—'}</dd></div>)}</dl></div><div style={{marginTop:24}}><DocumentsPanel kind={kind} id={id}/></div></>}
  </div>;
}
export function LiveDashboard(){
  const [data,setData]=useState(null),[error,setError]=useState('');
  useEffect(()=>{let active=true;portalApi.getDashboard().then(x=>active&&setData(x)).catch(e=>active&&setError(e.message));return()=>{active=false;};},[]);
  return <div className="page"><PageHeading eyebrow="YOUR GUILD" title="Member dashboard" description="A summary of your memberships, accreditations and insurance."/>
    {error?<Notice title="Dashboard unavailable">{error}</Notice>:!data?<p role="status">Loading dashboard…</p>:<>
    <div className="stat-row">{Object.entries(data.summary).map(([k,v])=><div className="stat" key={k}><span>{k}</span><strong>{v}</strong></div>)}</div>
    <h2>Recent records</h2><section className="surface padded">{data.recent.map(r=><p key={r.kind+r.id}><Link className="reference" to={'/records/'+r.kind+'/'+r.id}>{r.title}</Link> · {r.status}</p>)}{data.recent.length===0&&<p>No records yet.</p>}</section></>}
  </div>;
}
