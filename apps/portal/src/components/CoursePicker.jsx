import React,{useEffect,useState} from 'react';
import {portalApi,INTEGRATIONS} from '../services/api.js';
import CourseGroups from './CourseGroups.jsx';

// Pick GTi courses from the live catalogue, grouped by treatment group. The value is the list of CRM course ids; the server
// checks each one against the active GTi list before anything is saved.
export default function CoursePicker({value,onChange}){
  const [state,setState]=useState({loading:true,items:[],error:''});
  const selected=Array.isArray(value)?value.map(String):[];
  useEffect(()=>{
    if(!INTEGRATIONS.courses){setState({loading:false,items:[],error:'The course list is not available yet. Please try again later.'});return undefined;}
    let active=true;
    portalApi.listCourses().then(items=>{if(active)setState({loading:false,items,error:''});})
      .catch(()=>{if(active)setState({loading:false,items:[],error:'We could not load the course list. Please try again.'});});
    return()=>{active=false;};
  },[]);
  const toggle=id=>onChange(selected.includes(id)?selected.filter(x=>x!==id):[...selected,id]);
  return <div className="course-picker">
    {state.loading&&<p role="status">Loading courses…</p>}
    {state.error&&<div className="notice" role="alert"><strong>Courses unavailable</strong><span>{state.error}</span></div>}
    {!state.loading&&!state.error&&<>
      <p className="course-picker-count" role="status">{selected.length} {selected.length===1?'course':'courses'} selected</p>
      <CourseGroups courses={state.items} searchable groupBy="treatmentGroup" selectable selected={selected} onToggle={toggle} emptyText="No active GTi courses were returned."/>
    </>}
    <details className="course-help"><summary>Can't find the course you want to teach?</summary>
      <p>Most Guild Accredited Schools deliver courses using our ready-made GTi course programmes. If you offer a course that is not available as a GTi course, you may be able to apply to have your own course accredited. Your course materials will need to be submitted separately and additional fees may apply. Call our accreditation team on 01332 224830.</p></details>
  </div>;
}
