// The accreditation application questions, from the V1 wizard and the UAT decisions (AL-ACC-016, 025, 030, 032, 046, 059).
// The server maps these answers onto the same CRM records V1 writes (functions/beauty_guild_api/src/accreditationDrafts.js).
import {UK_COUNTRIES} from './logic.mjs';
import {startLimits} from './startDate.js';

const f=(name,label,type='text',required=true,extra={})=>({name,label,type,required,...extra});
const list=x=>x.map(o=>typeof o==='string'?{value:o,label:o}:o);
const yn=(name,label,extra={})=>f(name,label,'radio',true,{options:list([{value:'yes',label:'Yes'},{value:'no',label:'No'}]),...extra});
const yes=name=>v=>v[name]==='yes';
const PHONE_HINT='Include the country code, for example +44 1332 224830.';

// The country that decides the accreditation level is the training centre's, never the applicant's home address.
export const centreCountry=v=>String(v.country==='Other'?v.countryOther||'':v.country||'').trim();
export const isUkCentre=v=>UK_COUNTRIES.has(centreCountry(v).toLowerCase());
const contactCountryName=v=>String(v.contactCountry==='Other'?v.contactCountryOther||'':v.contactCountry||'').trim();
const isUkContact=v=>UK_COUNTRIES.has(contactCountryName(v).toLowerCase());

export const DECLARATIONS=[
  ['qualifiedSixMonths','I am qualified in the subjects I wish to teach and have held my qualifications for at least 6 months.',
    'You need to be qualified in the areas you want to teach and have at least 6 months of experience in each subject or treatment.'],
  ['teachingQualification','I hold a recognised teaching qualification.',
    'You need to hold a recognised teaching qualification to apply for accreditation. We recommend the GTi Teaching Certificate.'],
  ['evidenceAvailable','I will be able to provide copies of my qualifications if required at any point.',
    'You must hold copies of your qualifications if you wish to apply for Guild Accreditation.'],
];
export const DECLARATIONS_WARNING='All declarations must be confirmed as Yes to apply for accreditation. If you need to discuss anything, please call us on 01332 224830.';

export function accreditationSteps(countries){
  const country=(name,label,extra={})=>f(name,label,'select',true,{options:list(countries),...extra});
  return [
    {id:'applicant',title:'Your details',description:'The person applying. When you are signed in, we fill in what the Guild already holds for you.',fields:[
      f('title','Title','select',false,{options:list(['Mr','Mrs','Miss','Ms','Mx','Dr'])}),
      f('firstName','First name'),f('lastName','Surname'),f('email','Email address','email',true,{readOnly:true,hint:'This is the email you signed in with.'}),
      f('phone','Telephone','tel',true,{hint:PHONE_HINT,placeholder:'+44'}),f('mobile','Mobile','tel',false,{hint:PHONE_HINT,placeholder:'+44'})]},
    {id:'contact-address',title:'Correspondence address',description:'This may differ from the teaching location.',fields:[
      country('contactCountry','Country'),f('contactCountryOther','Country name','text',true,{when:v=>v.contactCountry==='Other'}),
      f('address1','Address line 1'),f('address2','Address line 2','text',false),f('address3','Address line 3','text',false),
      f('town','Town / city'),f('county','County','text',false),f('postcode','Postcode','text',isUkContact,{hint:'Not needed outside the UK.'})]},
    {id:'centre',title:'Training centre',description:'The country of your centre decides whether UK or international accreditation applies.',fields:[
      f('centre','Training school name'),country('country','Training centre country'),
      f('countryOther','Country name','text',true,{when:v=>v.country==='Other'}),
      f('centreEmail','Centre email','email',false),f('centrePhone','Centre telephone','tel',false,{hint:PHONE_HINT,placeholder:'+44'}),f('centreMobile','Centre mobile','tel',false,{hint:PHONE_HINT,placeholder:'+44'}),
      f('centreAddress1','Centre address line 1'),f('centreAddress2','Centre address line 2','text',false),f('centreAddress3','Centre address line 3','text',false),
      f('centreTown','Centre town / city'),f('centreCounty','Centre county','text',false),
      f('centrePostcode','Centre postcode','text',isUkCentre,{hint:'Not needed for centres outside the UK.'})]},
    {id:'tutors',title:'Tutors and venues',description:'Tell us how many tutors you use. Your tutors are invited to join your school after your application, so you do not need their names now.',fields:[
      yn('otherTutors','Do you use other tutors?'),
      yn('tutorQualified','Do your other tutors hold the relevant qualifications and have at least six months of experience?',{when:yes('otherTutors')}),
      f('tutorCount','How many other tutors?','number',true,{when:yes('otherTutors')}),
      yn('additionalVenues','Do you teach at additional venues?',{hint:'Additional venues are added separately from your school page.'})]},
    {id:'courses',title:'Courses',description:'Choose the GTi courses you plan to teach. Courses are grouped by treatment group.',fields:[
      f('courseIds','GTi courses you teach','courses',true)]},
    {id:'declarations',title:'Declarations and start date',description:'Confirm the training and qualification standards, and choose when your accreditation starts.',fields:[
      ...DECLARATIONS.map(([name,label,message])=>yn(name,label,{mustBe:'yes',noMessage:message})),
      f('startDate','Start date','date',true,{limit:'start',hint:'Today, or up to one month ahead.'}),
      f('terms','I accept the application terms and privacy information.','checkbox')]},
    {id:'review',title:'Review and submit',description:'Check your answers. Submitting sends your application to the Guild and takes you to payment.',fields:[]},
  ];
}

// An application restored from the CRM shows a country the form does not list as "Other" plus its name, and drops a start date
// that has passed.
export function restoreAccreditationAnswers(answers,countries,now=Date.now()){
  const a={...(answers||{})};
  for(const [key,other] of [['country','countryOther'],['contactCountry','contactCountryOther']]){
    const wanted=String(a[key]||'').trim();
    if(!wanted)continue;
    const match=countries.find(c=>c!=='Other'&&c.toLowerCase()===wanted.toLowerCase());
    if(match)a[key]=match;else{a[key]='Other';a[other]=wanted;}
  }
  if(a.title){const t=String(a.title).replace(/\.$/,'').trim().toLowerCase();a.title=['Mr','Mrs','Miss','Ms','Mx','Dr'].find(x=>x.toLowerCase()===t)||'';}
  if(a.startDate&&a.startDate<startLimits(now).min)a.startDate='';
  return a;
}
// Where to resume: the first step that still has a required answer missing, or the review step when everything is complete.
export function firstIncompleteStep(steps,answers,validate){
  const visible=steps.filter(s=>!s.when||s.when(answers));
  for(let i=0;i<visible.length-1;i++){
    if(Object.keys(validate(resolveFields(visible[i].fields,answers),answers)).length)return i;
  }
  return visible.length-1;
}
// A field whose `required` is a rule is resolved against the answers, so the form and the validator agree.
export const resolveFields=(fields,values)=>fields.filter(x=>!x.when||x.when(values)).map(x=>typeof x.required==='function'?{...x,required:Boolean(x.required(values))}:x);
export const prefillable=['title','firstName','lastName','email','phone','mobile','address1','address2','address3','town','county','postcode','contactCountry'];
