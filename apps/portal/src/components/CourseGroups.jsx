import React,{useMemo,useState} from 'react';
import {ChevronDown,Search} from 'lucide-react';
import {groupCourses} from '../courseGroups.js';

// GTi courses grouped by category in collapsible sections, with an optional search, so a long
// catalogue takes a few lines instead of a wall of cards.
export default function CourseGroups({courses,searchable=false,emptyText='No courses to show.',groupBy='category',selectable=false,selected=[],onToggle}){
  const [query,setQuery]=useState(''),[open,setOpen]=useState({});
  const groups=useMemo(()=>groupCourses(courses,query,groupBy),[courses,query,groupBy]);
  const total=groups.reduce((n,g)=>n+g.items.length,0);
  return <div className="course-groups">
    {searchable&&<label className="course-search"><Search size={16} aria-hidden="true"/><span className="visually-hidden">Search courses</span>
      <input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search courses" autoComplete="off"/></label>}
    {total===0?<p className="course-empty">{query?'No courses match your search.':emptyText}</p>:groups.map(g=>
      <details key={g.category} className="course-group" open={Boolean(query)||Boolean(open[g.category])}
        onToggle={e=>{const isOpen=e.currentTarget.open;setOpen(o=>o[g.category]===isOpen?o:({...o,[g.category]:isOpen}));}}>
        <summary><span className="course-group-name">{g.category}</span><span className="course-group-count">{selectable?g.items.filter(c=>selected.includes(String(c.id))).length+' of '+g.items.length:g.items.length}</span><ChevronDown size={18} aria-hidden="true"/></summary>
        <ul className="course-group-list">{g.items.map((c,i)=><li key={c.id||c.name+i}>
          {selectable?<label className="course-check"><input type="checkbox" checked={selected.includes(String(c.id))} onChange={()=>onToggle(String(c.id))}/><span className="course-name">{c.name}</span></label>:<span className="course-name">{c.name}</span>}
          <span className="course-meta">{[groupBy==='category'?c.treatmentGroup:c.category,c.duration,c.cpdPoints!=null&&c.cpdPoints!==''?c.cpdPoints+' CPD':null].filter(Boolean).join(' · ')}</span>
        </li>)}</ul>
      </details>)}
  </div>;
}
