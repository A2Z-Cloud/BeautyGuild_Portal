// Preview fields grounded in V1's membership, accreditation and insurance journeys.
// The backend remains authoritative for prices, eligibility, underwriting and CRM status.
const f=(name,label,type='text',required=true,extra={})=>({name,label,type,required,...extra});
const list=x=>x.map(o=>typeof o==='string'?{value:o,label:o}:o);
const pick=(name,label,x,extra={})=>f(name,label,'radio',true,{options:list(x),...extra});
const multi=(name,label,x,required=false,extra={})=>f(name,label,'multi',required,{options:list(x),...extra});
const select=(name,label,x,required=true)=>f(name,label,'select',required,{options:list(x)});
const yn=(name,label,extra={})=>pick(name,label,[{value:'yes',label:'Yes'},{value:'no',label:'No'}],extra);
export const COUNTRY_OPTIONS=['United Kingdom','England','Scotland','Wales','Northern Ireland','Ireland','France','Spain','Other'];
const UK=COUNTRY_OPTIONS;
// Maps a country name from address lookup onto the form's dropdown ("Other" when not listed).
export function countryOption(name){
  const wanted=String(name||'').trim().toLowerCase();
  if(!wanted)return '';
  return COUNTRY_OPTIONS.find(o=>o.toLowerCase()===wanted)||'Other';
}
const yes=name=>v=>v[name]==='yes';
const salon=v=>(v.workingMethods||[]).includes('salon');
export const JOURNEYS={
membership:{title:'Membership',kicker:'GUILD MEMBERSHIP',intro:'Explore membership options, branches, add-ons and available cover.',steps:[
{id:'cover',title:'Your membership',description:'Tell us about the membership you need.',fields:[
pick('membershipPurpose','I am joining as',['Individual practitioner','Salon owner','Training professional']),
select('territory','Where are you based?',UK),yn('insuranceWanted','Would you like insurance with your membership?'),
pick('frequency','Preferred payment frequency',['Annual','Monthly'])]},
{id:'details',title:'Your details',description:'Identity and contact information for your membership.',fields:[
select('title','Title',['Mr','Mrs','Miss','Ms','Mx','Dr'],false),
f('firstName','First name'),f('lastName','Surname'),f('email','Email address','email'),f('mobile','Mobile','tel'),
f('business','Business name','text',false),f('address1','Address line 1'),f('address2','Address line 2','text',false),
f('town','Town / city'),f('county','County','text',false),f('postcode','Postcode')]},
{id:'options',title:'Membership options',description:'The Guild will confirm your eligibility and price.',fields:[
select('membershipLevel','Membership level',['Associate Membership','Full Membership','International Membership']),
multi('branches','Professional branches',['Beauty','Nails','Holistic','Hair','Spa'],true),
yn('newMember','Is this your first membership?'),yn('renewal','Are you renewing?',{required:false})]},
{id:'addons',title:'Add-ons',description:'Explore optional membership services.',fields:[
multi('additionalBranches','Additional branches',['Beauty','Nails','Holistic','Hair','Spa']),
yn('teaching','Do you provide teaching or training?'),yn('printedCertificate','Printed certificate?',{required:false}),
f('notes','Additional information','textarea',false)]},
{id:'insurance',title:'Insurance options',description:'Combined insurance needs some extra questions about your business.',when:yes('insuranceWanted'),fields:[
yn('liability','Include public liability?'),yn('professional','Include treatment cover?'),
yn('contents','Consider equipment / contents?',{required:false}),f('coverNotes','Describe cover requirements','textarea',false)]},
{id:'declarations',title:'Declarations',description:'Please review the statements below.',fields:[
f('accuracy','I confirm the details I have entered are accurate.','checkbox'),
f('ethics','I have reviewed the Guild Code of Ethics.','checkbox'),
f('privacy','I acknowledge the privacy information.','checkbox')]},
{id:'review',title:'Review and account',description:'Check your answers before you continue. Nothing is submitted yet.',fields:[]}
]},
accreditation:{title:'Accreditation',kicker:'TRAINING CENTRE ACCREDITATION',intro:'Training centre, tutor, course and evidence declarations.',steps:[
{id:'applicant',title:'Your details',description:'Contact information for the person applying.',fields:[
select('title','Title',['Mr','Mrs','Miss','Ms','Mx','Dr'],false),
f('firstName','First name'),f('lastName','Surname'),f('email','Email address','email'),f('phone','Telephone','tel'),
f('mobile','Mobile','tel',false)]},
{id:'contact-address',title:'Correspondence address',description:'This may differ from the teaching location.',fields:[
select('contactCountry','Country',UK),f('address1','Address line 1'),f('address2','Address line 2','text',false),
f('town','Town / city'),f('county','County','text',false),f('postcode','Postcode')]},
{id:'centre',title:'Training centre',description:'The country of your centre decides whether UK or international accreditation applies.',fields:[
f('centre','Training school name'),select('country','Training centre country',UK),
f('centreContact','Contact name'),f('centreEmail','Centre email','email'),f('centreMobile','Centre mobile','tel'),
f('centreAddress','Centre address line 1'),f('centreTown','Centre town'),f('centreCounty','Centre county','text',false),
f('centrePostcode','Centre postcode')]},
{id:'tutors',title:'Tutors and venues',description:'Indicate additional teaching staff and venues.',fields:[
yn('otherTutors','Do you engage other tutors?'),yn('tutorQualified','Do tutors hold relevant qualifications for six months?',{when:yes('otherTutors')}),
f('tutorCount','Number of tutors','number',true,{when:yes('otherTutors')}),
f('tutorDetails','Tutor names, qualifications and emails','textarea',true,{when:yes('otherTutors')}),
yn('additionalVenues','Do you teach at additional venues?'),
f('venueDetails','Other venue details','textarea',false,{when:yes('additionalVenues')})]},
{id:'courses',title:'Courses and delivery',description:'Select the subject areas you teach.',fields:[
multi('courses','Course subjects',['Beauty Therapy','Nail Technology','Holistic Therapy','Make-up','Massage','Lashes and Brows','Hair','Other'],true),
f('courseDetails','Course / qualification details','textarea'),
multi('delivery','Delivery methods',['Classroom','Live online','Blended','Self-paced'],true),
multi('assessment','Assessment methods',['Practical','Theory','Portfolio','Other'],true)]},
{id:'declarations',title:'Accreditation declarations',description:'Confirm training and qualification standards.',fields:[
yn('qualifiedSixMonths','Have you held the qualification for six months?'),
yn('teachingQualification','Do you hold a teaching qualification?'),
yn('evidenceAvailable','Can you provide evidence if requested?'),
f('terms','I accept the application terms and privacy information.','checkbox')]},
{id:'review',title:'Review and account',description:'Check your answers before you continue.',fields:[]}
]},
insurance:{title:'Insurance',kicker:'BEAUTY GUILD INSURANCE',intro:'Business, cover, property, declarations and quotation summary.',steps:[
{id:'about',title:'About you',description:'Applicant details for your insurance quotation.',fields:[
f('firstName','First name'),f('lastName','Surname'),f('email','Email address','email'),
f('mobile','Telephone','tel'),select('country','Territory',UK),f('postcode','Postcode'),
pick('frequency','Payment frequency',['Annual','Monthly'])]},
{id:'business',title:'How you work',description:'Select all applicable working arrangements.',fields:[
multi('workingMethods','How you work',[
{value:'home',label:'Working from home'},{value:'mobile',label:'Mobile therapist'},{value:'rented',label:'Rented salon room'},
{value:'subcontractor',label:'Subcontractor'},{value:'salon',label:'Salon / commercial premises'}],true),
f('business','Trading name'),f('turnover','Annual turnover (£)','number'),
yn('employees','Do you employ other people?'),f('employeeCount','Number of employees','number',true,{when:yes('employees')}),
yn('namedPeople','Insure named additional people?'),f('namedDetails','Additional people / roles','textarea',true,{when:yes('namedPeople')})]},
{id:'cover',title:'Your cover',description:'Select cover and specialist treatments.',fields:[
yn('liability','Include public liability?'),yn('treatmentCover','Include professional treatment cover?'),
multi('treatments','Specialist treatment extensions',['Microneedling','Dermaplaning','Microblading / SPMU','Advanced Electrolysis','Piercing','Other']),
yn('qualified','Are you qualified for the selected treatments?'),yn('patchTesting','Will you complete required patch testing?'),
yn('contents','Equipment / contents cover?'),f('contentsSum','Equipment or contents sum insured (£)','number',true,{when:yes('contents')}),
yn('businessInterruption','Business interruption cover?'),yn('buildingsCover','Buildings cover?')]},
{id:'property',title:'Property and premises',description:'Extra premises details for salon or selected property cover.',
when:v=>salon(v)||v.contents==='yes'||v.buildingsCover==='yes'||v.businessInterruption==='yes',fields:[
f('premisesAddress','Premises address'),f('premisesTown','Premises town'),f('premisesPostcode','Premises postcode'),
yn('soleOccupation','Sole occupation of premises?'),yn('standardConstruction','Standard construction?'),
yn('floodHistory','Flood history?'),yn('subsidenceHistory','Subsidence history?'),
f('buildingsSum','Buildings sum insured (£)','number',true,{when:yes('buildingsCover')}),
f('interruptionSum','Business interruption sum insured (£)','number',true,{when:yes('businessInterruption')})]},
{id:'declarations',title:'Your declarations',description:'Your answers help us decide whether we can offer you cover.',fields:[
yn('claimsHistory','Any claims or relevant losses?'),yn('bankruptcy','Any bankruptcy or insolvency?'),
yn('potentialClaims','Any circumstances that could lead to claims?'),yn('convictions','Relevant convictions?'),
yn('priorDecline','Previously declined or cancelled insurance?'),
yn('over18','Aged over 18 and domiciled in a supported territory?'),
yn('territorySupported','Services provided only in supported territories?'),
f('declaration','I confirm that the information is complete and accurate.','checkbox'),
f('nonAdvised','I understand this is a non-advised sale.','checkbox'),
f('demandsNeeds','I confirm the demands and needs statement.','checkbox')]},
{id:'review',title:'Review your quote',description:'No premium has been calculated and no cover is in place yet.',fields:[]}
]}
};
