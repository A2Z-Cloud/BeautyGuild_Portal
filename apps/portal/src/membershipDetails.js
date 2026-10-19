// The member's own details on the Join page. Everything is needed except the second address line and the county.
export const EMPTY_DETAILS={firstName:'',lastName:'',tradingName:'',tradingEdited:false,address1:'',address2:'',town:'',county:'',postcode:'',manual:false,lookup:''};
// The trading name follows the first and last name until the member types their own.
export const autoTradingName=d=>[d.firstName,d.lastName].map(x=>String(x||'').trim()).filter(Boolean).join(' ');
export const tradingNameOf=d=>d.tradingEdited?d.tradingName:autoTradingName(d);
export const DETAIL_LABELS={firstName:'First name',lastName:'Last name',tradingName:'Business or trading name',address1:'Address line 1',town:'Town or city',postcode:'Postcode'};
const blank=v=>!String(v||'').trim();
// Returns {field: message} for each missing field, so the page can highlight exactly what is left to do.
export function missingDetails(d){
  const out={};
  for(const k of Object.keys(DETAIL_LABELS)){
    const value=k==='tradingName'?tradingNameOf(d):d[k];
    if(blank(value))out[k]='Enter your '+DETAIL_LABELS[k].toLowerCase()+'.';
  }
  return out;
}
// The fields sent with the order. Blank optional lines are left out by the server.
export const detailsRequest=d=>({firstName:d.firstName.trim(),lastName:d.lastName.trim(),businessName:tradingNameOf(d).trim(),address1:d.address1.trim(),address2:d.address2.trim(),town:d.town.trim(),county:d.county.trim(),postcode:d.postcode.trim()});
