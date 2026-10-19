import {startLimits} from './startDate.js';
import {phoneIssue} from './phones.js';
export const UK_COUNTRIES = new Set(['united kingdom','uk','england','scotland','wales','northern ireland']);
export function accreditationType(country){return UK_COUNTRIES.has(String(country||'').trim().toLowerCase())?'Standard Accreditation':'International Accreditation';}
export function validate(fields, values){
  const errors={};
  for(const f of fields){
    if(f.when&&!f.when(values))continue;
    const v=values[f.name];
    const required=typeof f.required==='function'?f.required(values):f.required;
    if(required&&(v===false||v===undefined||v===null||(Array.isArray(v)&&v.length===0)||(typeof v==='string'&&!v.trim()))){errors[f.name]='This field is required.';continue;}
    if(f.mustBe&&v!==undefined&&v!==''&&v!==f.mustBe){errors[f.name]='This must be confirmed as Yes to continue.';continue;}
    if(f.limit==='start'&&v){const {min,max}=startLimits();if(String(v)<min||String(v)>max)errors[f.name]='Choose a date between today and one month from today.';}
    if(f.type==='email'&&v&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v)))errors[f.name]='Enter a valid email address.';
    if(f.type==='tel'&&v){const issue=phoneIssue(v);if(issue){errors[f.name]=issue;continue;}}
    if(f.type==='tutors'){const issue=tutorIssue(v,values[f.countFrom]);if(issue){errors[f.name]=issue;continue;}}
    if(f.type==='number'&&v&&(!Number.isFinite(Number(v))||Number(v)<0))errors[f.name]='Enter a valid non-negative number.';
    if(f.type==='number'&&v&&f.max&&Number(v)>f.max)errors[f.name]='Enter a number up to '+f.max+'.';
  }
  return errors;
}
// The tutor rows must match the number given: a first name, surname and valid email each, no email twice.
export function tutorIssue(rows,count){
  const wanted=Number(count);
  if(!Number.isInteger(wanted)||wanted<1)return '';
  const list=Array.isArray(rows)?rows.slice(0,wanted):[];
  const seen=new Set();
  for(let i=0;i<wanted;i++){
    const r=list[i]||{},email=String(r.email||'').trim().toLowerCase();
    if(!String(r.firstName||'').trim()||!String(r.surname||'').trim()||!email)return 'Enter the first name, surname and email address of tutor '+(i+1)+'.';
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return 'Enter a valid email address for tutor '+(i+1)+'.';
    if(seen.has(email))return 'Each tutor needs a different email address.';
    seen.add(email);
  }
  return '';
}
