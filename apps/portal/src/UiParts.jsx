import React from 'react';
import { BadgeCheck, BookOpen, ShieldCheck, ArrowUpRight } from 'lucide-react';
import CoursePicker from './components/CoursePicker.jsx';
import {startLimits} from './startDate.js';
import {DIALS,dialLabel,isoForCountry,splitPhone,joinPhone} from './phones.js';

export function Logo() {
  return <div className="brand">beauty<span>guild</span><small>Member portal</small></div>;
}
export function PreviewLabel() {
  return <span className="preview-label"><i/> Development preview · Sample data</span>;
}
export function IconFor({kind,size=22}) {
  return kind === 'insurance' ? <ShieldCheck size={size}/> : kind === 'accreditation' ? <BookOpen size={size}/> : <BadgeCheck size={size}/>;
}
export function Status({value}) {
  return <span className="status"><i/>{value}</span>;
}
export function PageHeading({eyebrow,title,description,children}) {
  return <div className="page-heading"><div><small className="eyebrow">{eyebrow}</small><h1>{title}</h1>{description && <p>{description}</p>}</div>{children}</div>;
}
// Country code beside the number. Until a number is typed the code follows the country chosen on the form.
function PhoneInput({common,value,onChange,countryName,placeholder}){
  const parsed=splitPhone(value),iso=parsed.iso||isoForCountry(countryName);
  const set=(nextIso,local)=>onChange(joinPhone(nextIso,local));
  return <div className="phone-input">
    <select aria-label={(common['aria-label']||common.name)+' country code'} value={iso} onChange={e=>set(e.target.value,parsed.local)}>{DIALS.map(d=><option key={d[0]} value={d[0]}>{dialLabel(d)}</option>)}</select>
    <input {...common} type="tel" inputMode="tel" autoComplete="tel-national" value={parsed.local} placeholder={placeholder||''} onChange={e=>set(iso,e.target.value)}/></div>;
}
function TutorRows({field,value,count,onChange,error}){
  const n=Math.min(Math.max(Number(count)||0,0),20),rows=Array.from({length:n},(_,i)=>(Array.isArray(value)?value[i]:null)||{firstName:'',surname:'',email:''});
  const set=(i,patch)=>onChange(field.name,rows.map((r,j)=>j===i?{...r,...patch}:r));
  return <div className="tutor-rows">{rows.map((r,i)=><fieldset key={i} className="tutor-row"><legend>Tutor {i+1}</legend>
    <input aria-label={'Tutor '+(i+1)+' first name'} placeholder="First name" maxLength={60} autoComplete="off" value={r.firstName} onChange={e=>set(i,{firstName:e.target.value})}/>
    <input aria-label={'Tutor '+(i+1)+' surname'} placeholder="Surname" maxLength={60} autoComplete="off" value={r.surname} onChange={e=>set(i,{surname:e.target.value})}/>
    <input aria-label={'Tutor '+(i+1)+' email address'} placeholder="Email address" type="email" maxLength={254} autoComplete="off" value={r.email} onChange={e=>set(i,{email:e.target.value})}/></fieldset>)}</div>;
}
// A checkbox label with its named documents as links.
function linkedLabel(label,links){
  const names=Object.keys(links||{});
  if(!names.length)return label;
  return label.split(new RegExp('('+names.map(x=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')+')')).map((part,i)=>links[part]?<a key={i} href={links[part]} target="_blank" rel="noopener noreferrer">{part}</a>:part);
}
export function Field({field,value,onChange,error,values={}}) {
  const id='field-'+field.name;
  const common={ id, name:field.name, required:Boolean(field.required), 'aria-invalid':Boolean(error), 'aria-describedby':error?id+'-error':undefined };
  const update=e=>onChange(field.name,field.type==='checkbox'?e.target.checked:e.target.value);
  const options=(field.options||[]).map(o=>typeof o==='string'?{value:o,label:o}:o);
  let control;
  if(field.type==='checkbox') control=<label className="check-choice"><input {...common} type="checkbox" checked={Boolean(value)} onChange={update}/><span>{linkedLabel(field.label,field.links)}</span></label>;
  else if(field.type==='multi') control=<div className="multi-grid" role="group" aria-label={field.label}>{options.map(o=><label key={o.value} className={'radio-choice'+((value||[]).includes(o.value)?' selected':'')}><input type="checkbox" name={field.name} checked={(value||[]).includes(o.value)} onChange={e=>{const current=Array.isArray(value)?value:[];onChange(field.name,e.target.checked?[...current,o.value]:current.filter(x=>x!==o.value));}}/><span>{o.label}</span></label>)}</div>;
  else if(field.type==='radio') control=<div className="radio-grid" role="radiogroup" aria-label={field.label}>{options.map(o=><label key={o.value} className={'radio-choice'+(value===o.value?' selected':'')}><input name={field.name} type="radio" checked={value===o.value} value={o.value} onChange={update}/><span>{o.label}</span></label>)}</div>;
  else if(field.type==='people'){const people=Array.isArray(value)?value:[],set=(i,patch)=>onChange(field.name,people.map((p,j)=>j===i?{...p,...patch}:p));
    control=<div className="people-list">{people.map((p,i)=><div key={i} className="people-row"><select aria-label={'Person '+(i+1)+' type'} value={p.type||'employee'} onChange={e=>set(i,{type:e.target.value})}><option value="employee">Employee</option><option value="subcontractor">Subcontractor</option></select>
      <input aria-label={'Person '+(i+1)+' first name'} placeholder="First name" maxLength={60} value={p.firstName||''} onChange={e=>set(i,{firstName:e.target.value})}/>
      <input aria-label={'Person '+(i+1)+' surname'} placeholder="Surname" maxLength={60} value={p.lastName||''} onChange={e=>set(i,{lastName:e.target.value})}/>
      <button type="button" className="text-button" onClick={()=>onChange(field.name,people.filter((_,j)=>j!==i))}>Remove</button></div>)}
      {people.length<10&&<button type="button" className="btn btn-secondary" onClick={()=>onChange(field.name,[...people,{type:'employee',firstName:'',lastName:''}])}>Add a person</button>}</div>;}
  else if(field.type==='tel'&&field.countryFrom) control=<PhoneInput common={{...common,'aria-label':field.label}} value={value} onChange={v=>onChange(field.name,v)} placeholder={field.placeholder} countryName={values[field.countryFrom]==='Other'?values[field.countryFrom+'Other']:values[field.countryFrom]}/>;
  else if(field.type==='tutors') control=<TutorRows field={field} value={value} count={values[field.countFrom]} onChange={onChange}/>;
  else if(field.type==='courses') control=<CoursePicker value={value} onChange={v=>onChange(field.name,v)}/>;
  else if(field.type==='date'){const {min,max}=startLimits();control=<input {...common} type="date" value={value||''} min={min} max={max} onChange={update}/>;}
  else if(field.type==='select') control=<select {...common} value={value||''} onChange={update}><option value="">Choose an option</option>{options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>;
  else if(field.type==='textarea') control=<textarea {...common} value={value||''} onChange={update} rows={4} placeholder={field.placeholder||''}/>;
  else control=<input {...common} readOnly={Boolean(field.readOnly&&value)} value={value??''} type={field.type||'text'} min={field.type==='number'?0:undefined} placeholder={field.placeholder||''} onChange={update}/>;
  return <div className={'field'+(error?' invalid':'')}>{field.type!=='checkbox'&&<label htmlFor={id}>{field.label}{field.required?' *':''}</label>}{control}{field.noMessage&&value==='no'&&<small className="field-warning" role="alert">{field.noMessage}</small>}{field.hint&&<small>{field.hint}</small>}{error&&<small id={id+'-error'} className="error" role="alert">{error}</small>}</div>;
}
export function Notice({title,children}) {
  return <div className="notice"><strong>{title}</strong><span>{children}</span></div>;
}
export function Stages({steps,current}) {
  return <ol className="stages" aria-label="Journey steps">{steps.map((s,i)=><li key={s.title} className={i===current?'active':i<current?'done':''} aria-current={i===current?'step':undefined}><b>{i<current?'✓':i+1}</b><span>{s.title}</span></li>)}</ol>;
}
export function ServiceArrow({children}) {return <span className="service-arrow">{children} <ArrowUpRight size={17}/></span>}
