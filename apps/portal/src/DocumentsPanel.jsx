import React,{useEffect,useState} from 'react';
import {portalApi,INTEGRATIONS} from './services/api.js';
import {Notice} from './UiParts.jsx';
export function DocumentsPanel({kind,id}){
 const [path,setPath]=useState([]),[data,setData]=useState({loading:true,items:[],error:'',message:''});
 const value=path.join('.');
 useEffect(()=>{
   if(!INTEGRATIONS.workdrive)return;
   let active=true;setData({loading:true,items:[],error:'',message:''});
   portalApi.getDocuments(kind,id,value).then(x=>active&&setData({loading:false,items:x.items||[],error:'',message:x.message||''}))
    .catch(e=>active&&setData({loading:false,items:[],error:e.message,message:''}));
   return()=>{active=false;};
 },[kind,id,value]);
 if(!INTEGRATIONS.workdrive)return <Notice title="Documents coming soon">You will be able to view and download your documents here soon.</Notice>;
 return <section className="surface padded"><h2>Documents</h2><p>Documents for this record.</p>
   {path.length>0&&<button className="btn btn-secondary" onClick={()=>setPath(p=>p.slice(0,-1))}>← Up one folder</button>}
   {data.loading?<p role="status">Loading documents…</p>:data.error?<Notice title="Documents unavailable">{data.error}</Notice>:
   data.items.length?data.items.map(x=><div className="security-row" key={x.id}>
      <div><strong>{x.name}</strong><span>{x.isFolder?'Folder':'File'} {x.modifiedAt||''}</span></div>
      {x.isFolder?<button type="button" className="btn btn-secondary" onClick={()=>setPath(p=>[...p,x.id])}>Open folder</button>:
        <button type="button" className="btn btn-secondary" onClick={()=>{const url=portalApi.getDocumentDownloadUrl(kind,id,x.id,value);if(url)window.location.assign(url);}}>Download</button>}
   </div>):<p>{data.message||'No documents found.'}</p>}
 </section>;
}
