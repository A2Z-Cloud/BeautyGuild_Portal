// Frontend demonstration checks only, not backend eligibility or underwriting.
export const STEPS={
 membership:['Your details','Membership','Preferences','Review'],
 accreditation:['Your details','Training centre','Courses','Tutors & venues','Declarations','Review'],
 insurance:['About you','Your business','Your cover','Property','Important information','Your quote']
};
const INITIAL={
 membership:{firstName:'',lastName:'',email:'',territory:'United Kingdom',insuranceWanted:'',membershipLevel:'',primaryBranch:'',billing:'annual',declaration:false},
 accreditation:{firstName:'',lastName:'',email:'',phone:'',schoolName:'',centreCountry:'England',postcode:'',town:'',courses:[],tutorCount:'1',venueType:'',declaration:false},
 insurance:{firstName:'',lastName:'',email:'',phone:'',territory:'United Kingdom',workingMethods:[],businessName:'',turnover:'',coverPeriod:'annual',teachingCover:false,propertyCover:false,treatments:[],premisesAddress:'',premisesPostcode:'',claimsHistory:'',priorDecline:'',declaration:false}
};
export function newJourney(service){return INITIAL[service]?JSON.parse(JSON.stringify(INITIAL[service])):null;}
export function accreditationClass(country){return ['United Kingdom','England','Scotland','Wales','Northern Ireland'].includes(country)?'Standard Accreditation (UK)':'International Accreditation';}
export function insuranceRoute(methods=[]){return methods.includes('salon')?'Salon':'Non-Salon';}
export function membershipLevels(state){
 if(state.territory==='Other')return [{value:'international',label:'International Member'}];
 const levels=[{value:'associate',label:'Associate Member'}];
 if(state.insuranceWanted==='yes') levels.push({value:'full_non_salon',label:'Full Member (Non-Salon)'},{value:'full_salon',label:'Full Member (Salon)'});
 return levels;
}
export function validateStep(service,step,state){
 const errors={};
 if(!STEPS[service]||step<0||step>=STEPS[service].length)return {_page:'Unknown journey step.'};
 const req=(key,label)=>{if(!String(state[key]??'').trim()) errors[key]=label+' is required.';};
 if(step===0){
  req('firstName','First name');req('lastName','Last name');req('email','Email address');
  if(state.email?.trim()&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.email.trim()))errors.email='Enter a valid email address.';
 }
 if(service==='membership'){
  if(step===1){
   req('insuranceWanted','Insurance preference');req('membershipLevel','Membership level');
   if(state.membershipLevel&&!membershipLevels(state).some(x=>x.value===state.membershipLevel))errors.membershipLevel='Choose an available membership level.';
  }
  if(step===2){req('primaryBranch','Membership branch');if(!state.declaration)errors.declaration='Please confirm your details.';}
 }
 if(service==='accreditation'){
  if(step===1){req('schoolName','Training centre');req('centreCountry','Country');req('town','Town or city');req('postcode','Postcode');}
  if(step===2&&!state.courses.length)errors.courses='Select an example course.';
  if(step===3){req('tutorCount','Number of tutors');req('venueType','Venue type');if(Number(state.tutorCount)<1)errors.tutorCount='Enter one or more tutors.';}
  if(step===4&&!state.declaration)errors.declaration='Please confirm the declaration.';
 }
 if(service==='insurance'){
  if(step===1){if(!state.workingMethods.length)errors.workingMethods='Select how you work.';req('businessName','Trading name');}
  if(step===3&&insuranceRoute(state.workingMethods)==='Salon'){
   req('premisesAddress','Premises address');req('premisesPostcode','Premises postcode');req('turnover','Annual turnover');
   if(state.turnover&&(!Number.isFinite(Number(state.turnover))||Number(state.turnover)<0))errors.turnover='Enter a valid turnover.';
  }
  if(step===4){req('claimsHistory','Claims history');req('priorDecline','Previous insurance decision');if(!state.declaration)errors.declaration='Please confirm the declaration.';}
 }
 return errors;
}
