import {startLimits} from './startDate.js';
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
    if(f.type==='number'&&v&&(!Number.isFinite(Number(v))||Number(v)<0))errors[f.name]='Enter a valid non-negative number.';
  }
  return errors;
}
