import React,{useEffect,useId,useRef} from 'react';
import {Info} from 'lucide-react';
import {POLICY_WORDING} from './insuranceInputs.js';

const ext={target:'_blank',rel:'noopener noreferrer'};
const opts=f=>(f.options||[]).map(o=>typeof o==='string'?{value:o,label:o}:o);
// The customer's wording as text: a string is a paragraph, {list}, {before,link,href,after} a paragraph with a link, {doc} the named policy wording.
export function Blocks({blocks}){
  return <>{(blocks||[]).map((b,i)=>typeof b==='string'?<p key={i}>{b}</p>:b.list?<ul key={i}>{b.list.map((x,j)=><li key={j}>{x}</li>)}</ul>
    :b.doc?<p key={i} className="ins-doc">{POLICY_WORDING[b.doc].href?<a href={POLICY_WORDING[b.doc].href} {...ext}>Read the policy wording ({POLICY_WORDING[b.doc].ref})</a>:'Policy wording: '+POLICY_WORDING[b.doc].ref}</p>
    :<p key={i}>{b.before}{b.href?<a href={b.href} {...ext}>{b.link}</a>:b.link}{b.after}</p>)}</>;
}
// A small "i" button that opens its text beside the question. One is open at a time: a click anywhere else, or Escape, closes it.
export function InfoTip({label,blocks}){
  const [open,setOpen]=React.useState(false),ref=useRef(null),id=useId();
  useEffect(()=>{
    if(!open)return undefined;
    const away=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false);},esc=e=>{if(e.key==='Escape')setOpen(false);};
    document.addEventListener('pointerdown',away);document.addEventListener('keydown',esc);
    return()=>{document.removeEventListener('pointerdown',away);document.removeEventListener('keydown',esc);};
  },[open]);
  return <span className="ins-tip" ref={ref}><button type="button" className="ins-tip-btn" aria-expanded={open} aria-controls={open?id:undefined} aria-label={'More information: '+label} onClick={()=>setOpen(o=>!o)}><Info size={15}/></button>
    {open&&<span id={id} role="note" className="ins-tip-box"><Blocks blocks={blocks}/></span>}</span>;
}
// A checkbox label with its named documents as links.
function linked(label,links){
  const names=Object.keys(links||{});
  if(!names.length)return label;
  return label.split(new RegExp('('+names.map(x=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')+')')).map((part,i)=>links[part]?<a key={i} href={links[part]} {...ext}>{part}</a>:part);
}
// The employees and subcontractors rows. Add sits above the rows so it stays where the pointer is as rows are added (the page used to
// move under it), the new row takes focus, and Tab runs along the fields of every row (Remove is out of the tab order, still a click).
function PeopleRows({field:f,value,onChange,id}){
  const people=Array.isArray(value)?value:[],max=f.max||10,list=useRef(null),added=useRef(false);
  const set=(i,patch)=>onChange(f.name,people.map((p,j)=>j===i?{...p,...patch}:p));
  useEffect(()=>{
    if(!added.current)return;
    added.current=false;
    const rows=list.current&&list.current.querySelectorAll('.people-row');
    const input=rows&&rows.length&&rows[rows.length-1].querySelector('input');
    if(input)input.focus({preventScroll:true});
  },[people.length]);
  return <div className="people-list" ref={list} id={id}>
    {people.length<max&&<div><button type="button" className="btn btn-secondary" onClick={()=>{added.current=true;onChange(f.name,[...people,{type:'employee',firstName:'',lastName:''}]);}}>Add a person</button></div>}
    {people.map((p,i)=><div key={i} className="people-row"><select aria-label={'Person '+(i+1)+' type'} value={p.type||'employee'} onChange={e=>set(i,{type:e.target.value})}><option value="employee">Employee</option><option value="subcontractor">Subcontractor</option></select>
      <input aria-label={'Person '+(i+1)+' first name'} placeholder="First name" maxLength={60} autoComplete="off" value={p.firstName||''} onChange={e=>set(i,{firstName:e.target.value})}/>
      <input aria-label={'Person '+(i+1)+' surname'} placeholder="Surname" maxLength={60} autoComplete="off" value={p.lastName||''} onChange={e=>set(i,{lastName:e.target.value})}/>
      <button type="button" className="text-button" tabIndex={-1} aria-label={'Remove person '+(i+1)} onClick={()=>onChange(f.name,people.filter((_,j)=>j!==i))}>Remove</button></div>)}
  </div>;
}
const Choice=({o,checked,type,name,onChange,field,values})=><div className="ins-option"><label className={'radio-choice'+(checked?' selected':'')}><input type={type} name={name} value={o.value} checked={checked} onChange={onChange}/>
  <span>{o.label}{o.price&&<strong className="ins-price"> {o.price}<small> including IPT</small></strong>}</span></label>{o.info&&<InfoTip label={o.label} blocks={o.info}/>}</div>;

// One insurance question. Own renderer (not UiParts' Field) so the customer's pop-ups, notes and prices sit where they asked; the
// answers it reports are the same as Field's.
export function InsField({field:f,value,onChange,error,values={}}){
  const id='ins-'+f.name,common={id,name:f.name,required:Boolean(f.required),'aria-invalid':Boolean(error),'aria-describedby':error?id+'-error':undefined};
  const update=e=>onChange(f.name,f.type==='checkbox'?e.target.checked:e.target.value);
  const tip=f.info&&<InfoTip label={f.label} blocks={f.info}/>;
  const options=opts(f).filter(o=>!(f.optionWhen&&f.optionWhen[o.value]&&!f.optionWhen[o.value](values)));
  const group=f.type==='radio'||f.type==='multi',labelRow=f.type!=='checkbox'&&<div className="ins-label">{group?<span id={id+'-label'}>{f.label}{f.required?' *':''}</span>:<label htmlFor={id}>{f.label}{f.required?' *':''}</label>}{tip}</div>;
  let control;
  if(f.type==='checkbox')control=<div className="ins-check"><label className="check-choice"><input {...common} type="checkbox" checked={Boolean(value)} onChange={update}/><span>{linked(f.label,f.links)}</span></label>{tip}</div>;
  else if(f.type==='multi')control=<div className={f.list?'ins-list':'multi-grid'} role="group" aria-labelledby={id+'-label'}>{options.map(o=><Choice key={o.value} o={o} type="checkbox" name={f.name} checked={(value||[]).includes(o.value)}
    onChange={e=>{const cur=Array.isArray(value)?value:[];onChange(f.name,e.target.checked?[...cur,o.value]:cur.filter(x=>x!==o.value));}}/>)}</div>;
  else if(f.type==='radio')control=<div className={f.options.length>2||options.some(o=>o.info||o.price)?'ins-list':'radio-grid'} role="radiogroup" aria-labelledby={id+'-label'}>{options.map(o=><Choice key={o.value} o={o} type="radio" name={f.name} checked={String(value)===o.value} onChange={update}/>)}</div>;
  else if(f.type==='people')control=<PeopleRows field={f} value={value} onChange={onChange} id={id}/>;
  else if(f.type==='select')control=<select {...common} value={value||''} onChange={update}><option value="">Choose an option</option>{options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>;
  else control=<input {...common} type={f.type||'text'} min={f.type==='number'?0:undefined} inputMode={f.type==='number'?'decimal':undefined} value={value??''} onChange={update}/>;
  const stop=(f.stopOn&&value===f.stopOn)||(f.stopAbove&&Number(value)>f.stopAbove);
  return <div className={'field ins-field'+(error?' invalid':'')}>{labelRow}{control}
    {f.note&&<div className="ins-note"><Blocks blocks={f.note}/></div>}{f.yesNote&&value==='yes'&&<div className="ins-note"><Blocks blocks={f.yesNote}/></div>}
    {stop&&<small className="field-warning" role="alert">{f.stopMessage}</small>}{f.hint&&<small>{f.hint}</small>}{error&&<small id={id+'-error'} className="error" role="alert">{error}</small>}</div>;
}
