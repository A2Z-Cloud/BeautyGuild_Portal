export const UK_COUNTRIES = new Set(['united kingdom','uk','england','scotland','wales','northern ireland']);
export function accreditationType(country){return UK_COUNTRIES.has(String(country||'').trim().toLowerCase())?'Standard Accreditation':'International Accreditation';}
export function validate(fields, values){
  const errors={};
  for(const f of fields){
    if(f.when&&!f.when(values))continue;
    const v=values[f.name];
    if(f.required&&(v===false||v===undefined||v===null||(Array.isArray(v)&&v.length===0)||(typeof v==='string'&&!v.trim()))){errors[f.name]='This field is required.';continue;}
    if(f.type==='email'&&v&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v)))errors[f.name]='Enter a valid email address.';
    if(f.type==='number'&&v&&(!Number.isFinite(Number(v))||Number(v)<0))errors[f.name]='Enter a valid non-negative number.';
  }
  return errors;
}
