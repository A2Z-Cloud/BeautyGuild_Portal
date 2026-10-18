import React,{useEffect,useState} from 'react';
import {BookOpen} from 'lucide-react';
import {portalApi,INTEGRATIONS} from '../services/api.js';

export function CourseCatalogue(){
  const [state,setState]=useState({loading:true,items:[],error:''});
  useEffect(()=>{
    if(!INTEGRATIONS.courses)return;
    let active=true;
    portalApi.listCourses().then(items=>{if(active)setState({loading:false,items,error:''});})
      .catch(err=>{if(active)setState({loading:false,items:[],error:err.message});});
    return ()=>{active=false;};
  },[]);
  if(!INTEGRATIONS.courses)return null;
  return <section className="surface padded live-courses"><div className="subheading"><BookOpen size={23}/><h2>GTi course catalogue</h2></div>
    <p>Current GTi courses, for reference only. They are not yet linked to an accreditation application.</p>
    {state.loading&&<p role="status">Retrieving course catalogue…</p>}
    {state.error&&<div className="notice" role="alert"><strong>Course service unavailable</strong><span>{state.error}</span></div>}
    {!state.loading&&!state.error&&(state.items.length?
      <div className="course-chip-list">{state.items.slice(0,40).map((item,i)=><div className="course-chip" key={item.id||i}><strong>{item.name||'Unnamed course'}</strong>{item.category&&<small>{item.category}</small>}</div>)}</div>
      :<p>No active GTi courses were returned.</p>)}
  </section>;
}
