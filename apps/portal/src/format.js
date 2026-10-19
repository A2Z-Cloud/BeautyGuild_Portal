// Customer-friendly dates. Accepts ISO dates and date-times ("2026-10-15", "2026-10-15T11:26:51+01:00")
// and Creator dates ("18-Aug-2026", "01-Nov-2026 09:00:00"). Anything else is returned as it came.
import {isFuture} from './startDate.js';
const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const pad=n=>String(n).padStart(2,'0');
export function formatDate(value,{time=false}={}){
  if(value===null||value===undefined||value==='')return '—';
  const text=String(value).trim();
  let y,m,d,hh,mm;
  let match=text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if(match){[,y,m,d,hh,mm]=match;m=Number(m)-1;}
  else if((match=text.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})(?:\s+(\d{2}):(\d{2}))?/))){
    [,d,,y,hh,mm]=match;m=MONTHS.findIndex(x=>x.toLowerCase()===match[2].toLowerCase());
    if(m<0)return text;
  }else return text;
  const out=Number(d)+' '+MONTHS[m]+' '+y;
  return time&&hh!==undefined?out+', '+pad(hh)+':'+pad(mm):out;
}
const SERVICE_LABELS={membership:'Membership',accreditation:'Accreditation',insurance:'Insurance'};
export const serviceLabel=kind=>SERVICE_LABELS[kind]||String(kind||'');

// A record that has been paid for but does not start yet shows as "Coming soon" with its start date.
export function comingSoon(record,now=Date.now()){
  return isFuture(record?.startDate,now)?{label:'Coming soon',note:'Starts '+formatDate(record.startDate)}:null;
}
