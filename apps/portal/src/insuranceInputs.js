// The insurance questions, with the V1 wizard's inputs (beautyguildclient public/membership-quote.js).
// One list drives the saved-application journey and the buy pages. The server rates and rules on these
// answers and decides what is payable; this file only collects them. toRequest() maps the flat form
// answers onto the ins* shape the function expects. The wording is the customer's, from the UAT action log (AL-INS-*).
// Extra keys the buy pages read (InsuranceFields.jsx): `info` (a pop-up next to the label), `note` (text under the question),
// `yesNote` (text once the answer is yes), `stopOn` / `stopAbove` (a call-the-office message that blocks paying), `price` on an option.
import {LEGAL} from './legal.js';
export const GUILD_PHONE='01332 224830';
export const CALL_OFFICE='Please call the office to discuss your application';
export const WAGE_ROLL_LIMIT=125000;
export const PROPERTY_AWAY_ITEM_LIMIT=10000;
const IPT=1.12;
const yn=(name,label,extra={})=>({name,label,type:'radio',required:true,options:[{value:'yes',label:'Yes'},{value:'no',label:'No'}],...extra});
const sum=(name,label,extra={})=>({name,label,type:'number',required:false,...extra});
const yes=name=>v=>v[name]==='yes';
const working=v=>v.insWorking||[];
export const isSalon=v=>working(v).includes('insSalon');
const tier=v=>!isSalon(v)&&Number(v.insEquipmentTier)>0;
const salonAnd=name=>v=>isSalon(v)&&v[name]==='yes';
const propertyCover=v=>isSalon(v)&&['insContents','insMoneyCover','insBuildingsCover','insBiCover','insPropertyAwayCover'].some(k=>v[k]==='yes');
const treatments=v=>(v.insTreatmentExtensions||[]).length>0;
const tiers=[[0,'None'],[5000,'Up to £5,000'],[10000,'Up to £10,000'],[15000,'Up to £15,000'],[20000,'Up to £20,000']].map(([value,label])=>({value:String(value),label}));
// What the customer pays for a net premium once Insurance Premium Tax is added (12%), as pounds and pence.
export const withIpt=net=>'£'+(Math.round(net*100*IPT)/100).toFixed(2);
export const gbp=n=>'£'+Number(n||0).toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2});

// The policy wordings the customer has supplied. The links wait for the customer's documents (AL-INS-039); until an href is set the
// wording is named but not linked.
export const POLICY_WORDING={
  MEDMAL:{ref:'1. Medmal policy wording',href:''},NON_SALON_CONTENTS:{ref:'2. Non-salon contents cover wording',href:''},NON_SALON_EL:{ref:'3. Non-salon EL cover wording',href:''},
  SALON_EL:{ref:'6. Salon Employers Liability Cover Policy Summary & Wording',href:''},SALON_CONTENTS:{ref:'7. Salon Contents Cover Policy Summary & Wording',href:''},
  SALON_MONEY:{ref:'8. Salon Money Cover Policy Summary & Wording',href:''},SALON_BUILDINGS:{ref:'9. Salon Buildings Cover Policy Summary & Wording',href:''},
  SALON_BI:{ref:'10. Salon Business Interruption Cover Policy Summary & Wording',href:''},SALON_PROPERTY_AWAY:{ref:'11. Salon Property Away Cover Policy Summary & Wording',href:''},
};
const doc=key=>({doc:key});
const EMPLOYMENT_STATUS_URL='https://www.gov.uk/guidance/check-employment-status-for-tax';
const signedOff=what=>'It is important that you choose cover to accurately reflect '+what+' as if you under-estimate this, you could find yourself significantly out of pocket if you have to make a claim and cannot recover the full amount from the insurer.';
const STANDARD_CONSTRUCTION=['Standard construction is built of brick, stone or concrete and roofed with slate, tiles, concrete, metal, asbestos or any other non-combustible material.'];
const CONTENTS_WORDING='This covers you for damage to your business stock and equipment from fire, flood or theft up to the value chosen. This would include your business tools and equipment which are items such as scissors, hair straighteners, make-up brushes, waxing strips, and specialist beauty therapy equipment. It would also include any computer equipment used in connection with your business and your stock, i.e. the goods you sell, and materials you use to provide your services.';

// Prices include IPT: the net premiums are the function's TREATMENT_EXTENSIONS and teaching rows (insurance.js).
export const TREATMENT_OPTIONS=[
  {value:'advanced_electrolysis',label:'Red Veins, Skin Tags, Milia, Warts & Moles by Advanced Electrolysis',net:28},
  {value:'microneedling',label:'Microneedling or Dermarolling',net:179.25},
  {value:'piercing',label:'Nose and Cartilage Piercing',net:14.15},
  {value:'spmu',label:'Microblading, Semi-Permanent Make Up & Micropigmentation',net:179.25},
  {value:'dermaplaning',label:'Dermaplaning',net:179.25}].map(o=>({...o,price:withIpt(o.net)}));
export const DECLARATION_STATEMENTS=[
  'I have not made any claims in the past 5 years and I have never had any claims for any laser or IPL treatments.',
  'I have not been declared bankrupt, become insolvent, made any voluntary arrangement with creditors or been subject to enforcement of a judgement debt either in a personal capacity or as a business.',
  'I am not aware of any potential claims or losses, or circumstances that might lead to a claim or claims.',
  'I have not been convicted of or charged with any offence, other than a motoring offence or conviction spent under the Rehabilitation of Offenders Act 1974 or any equivalent legislation.',
  'I have not had any insurance or proposal cancelled, withdrawn, declined or made subject to special terms.',
  'I am domiciled in the United Kingdom of Great Britain and Northern Ireland, the Channel Islands or Isle of Man and I am over the age of 18.',
  'I do not conduct any business or have clients outside of the United Kingdom of Great Britain and Northern Ireland, the Channel Islands or Isle of Man.'];
// The answer the function expects to each declaration (anything else is a REFER). A statement the customer agrees with is the expected answer.
export const DECLARATION_EXPECTED=['no','no','no','no','no','yes','yes'];
const agreeOptions=[{value:'agree',label:'I agree'},{value:'disagree',label:'I do not agree'}];
const DEMANDS_INTRO='I understand that this product meets the demands and needs of a business in the hair or beauty industry (e.g. beauty therapists, nail technicians, holistic therapists, hairdressers, therapy lecturers and students) wishing to insure against;';
// The demands and needs statement follows the cover chosen: only the covers on the quote are listed, and not the added treatments.
export function demandsAndNeeds(v){
  const salon=isSalon(v),items=['Public, Products and Professional Treatment liability risks'];
  if(salon?v.insSalonEL==='yes':v.insNonSalonEL==='yes')items.push('Employers Liability');
  if(salon){
    if(v.insContents==='yes')items.push('Contents up to '+gbp(['insComputers','insEquipment','insStock','insGeneralContents','insTenantImprovements','insRentPayable'].reduce((t,k)=>t+(Number(v[k])||0),0)));
    if(v.insMoneyCover==='yes')items.push('Money Cover');
    if(v.insBuildingsCover==='yes')items.push('Buildings Cover');
    if(v.insBiCover==='yes')items.push('Business Interruption Cover');
    if(v.insPropertyAwayCover==='yes')items.push('Property Away and in Transit Cover');
  }else if(Number(v.insEquipmentTier)>0)items.push('Contents up to '+gbp(v.insEquipmentTier));
  return {intro:DEMANDS_INTRO,items};
}
const salonSum=(name,label,info,when)=>sum(name,label+' (£)',{when,info:[info]});

export const INSURANCE_STEPS=[
 {id:'business',title:'How you work',description:'Select every way that you work.',fields:[
  {name:'insWorking',label:'How you work',type:'multi',required:true,options:[{value:'insWorkingFromHome',label:'I work from home'},{value:'insMobile',label:'I work on a mobile basis'},
    {value:'insRentedRoom',label:'I solely occupy a treatment room within a salon, fitness/leisure or other commercial establishment'},
    {value:'insSubcontractor',label:'I am a self-employed subcontractor within a multi-therapist salon'},{value:'insSalon',label:'I own/operate a salon in a commercial/retail premises'}]},
  {name:'insTurnover',label:'Estimated annual turnover for the next 12 months',type:'radio',numeric:true,required:true,when:isSalon,
    options:[{value:'100000',label:'£0–£100,000'},{value:'175000',label:'£100,001–£175,000'},{value:'250000',label:'£175,001–£250,000'}],
    info:['Please select the band that best reflects your estimated annual business turnover for the next 12 months. If this is your first year of trading, use your estimated turnover for your first year.','If your estimated annual turnover exceeds £250,000, please call the office on '+GUILD_PHONE+'.']},
  yn('insWageRollOver125k','Does your estimated gross annual wage roll for the next 12 months exceed £125,000?',{when:isSalon,stopOn:'yes',stopMessage:CALL_OFFICE}),
  {name:'insSalonCount',label:'Number of salons',type:'number',required:true,when:isSalon}]},
 {id:'people',title:'Employees and subcontractors',description:'Tell us about anyone who works in your business.',fields:[
  yn('insNamedPeopleCover','Do you employ staff or engage subcontractors on a full time, part time or "as and when needed" basis?',{
    info:['People working in your business will generally be classed as being employed if:',{list:['You decide what tasks they do.','You say how the work should be done.','You set their hours of work.','You provide the equipment and materials required to do the job.','You pay them an hourly rate or a fixed amount for each job done.']},
      {before:"You can do a detailed check on a person's employment status by using an online tool on the Government website using ",link:'this link',href:EMPLOYMENT_STATUS_URL,after:'.'}],
    note:['Please note that your policy will provide treatment, product and public liability for all employees you list. Anyone you list as a subcontractor e.g. someone who is renting a space in your salon, trading in their own name, is not covered under this policy for their own treatment, public and product liability and they must obtain their own cover.']}),
  {name:'insNamedPeople',label:'Employees and subcontractors',type:'people',required:true,when:yes('insNamedPeopleCover'),max:4,
    hint:'This policy covers a maximum of 5 including the policy holder. If you would like to add more employees, contact the office on '+GUILD_PHONE+'.'}]},
 {id:'standardTreatments',title:'Treatments we cover',description:'',fields:[],intro:[
  {before:'Our standard ',link:'insurance policy',href:POLICY_WORDING.MEDMAL.href,after:' covers all of the most popular beauty, nails, hair and holistic treatments in the event you injure a client, including:'},
  {list:['Massage, Reflexology, Healing, Reiki, Yoga, Relaxation Techniques, Stress Management','Hair Cutting, hairdressing, hairstyling, washing, tinting, dyeing, bleaching, drying, barbering',
    'Hair Extensions - Fusion Bond, Nano Rings, Weaves, Clip in Hair, Mesh and Micro Rings/Links, Tape and Weft. (excludes hair replacement treatments)','Face and Body Treatments - Facials, masks, steaming, microcurrent, oxygen treatments, light therapy',
    'Eyebrow treatments - lamination, perming, henna, HD, threading, tinting, waxing, tweezing','Eyelash treatments - perming, tinting, eyelash extensions, eyelash lifting','Face and body painting including henna art and su-do body art',
    'Make-up application','Nails Treatments - manicure, e-filing, foils, pedicure, callus peel, gel polish, nail art, acrylic/fibreglass/Gel Nail extensions','Tanning and Sunbed UV treatment (maximum of 2 sunbeds)','Waxing, body sugaring, bleaching and hair removal creams']},
  {before:'If the treatment you offer is not listed above, you can ',link:'click here',href:LEGAL.treatments.href,after:' to see the full list of treatments we cover.'}]},
 {id:'treatments',title:'Additional treatments',description:'Choose any additional treatments you want to be covered for.',intro:['All prices include IPT.'],fields:[
  {name:'insTreatmentExtensions',label:'Additional treatments',type:'multi',required:false,list:true,options:TREATMENT_OPTIONS},
  yn('insQualifiedForTreatments','Do you and your employees hold the relevant qualification(s) for the treatment(s) you perform from a recognised and accredited UK college or company?',{when:treatments,
    note:['You and your employees, must hold the appropriate qualification(s) for any treatment(s) you wish to be covered for. Cover can be provided for online courses, where the practical training and assessment were done through a live video link with the course tutor, e.g. Zoom, Whatsapp.','You and everyone that works for you, will be required to provide proof of your qualification(s) if a claim should arise.']}),
  yn('insPatchTesting','Do you agree to always carry out a Sensitivity Patch Test for all relevant treatments?',{when:treatments,info:['You must ensure that:','At least 24 hours prior to:',
    {list:['The application of false eyelashes;','Any eyelash or eyebrow tinting;','Any eyelash perming treatment; or',"The application of any other chemicals to the skin or hair where, the manufacturer's instructions for the product being used, requires a patch test,"]},
    'A skin patch test must be performed on:',{list:['New clients to be treated;','Existing clients, where a year has passed since their last patch test; or',"Where the product applied has been changed since the client's last treatment of that kind."]},
    "The results of each patch test must be recorded in writing on the client's records."]})]},
 {id:'teaching',title:'Teaching and student cover',description:'Choose a level of teaching cover if you teach.',intro:['All prices include IPT.'],fields:[
  {name:'insTeachingCover',label:'Teaching and student cover',type:'radio',required:true,optionWhen:{additional:treatments},options:[{value:'none',label:'None'},
    {value:'standard',label:'Teaching + Student Cover',price:withIpt(75),info:['Select this level of cover if you are only teaching treatments that are on our Standard Treatment list.']},
    {value:'additional',label:'Teaching + Student Cover + Additional Treatments',price:withIpt(150),info:['Select this level of cover if you are teaching any of the treatments in our advanced treatment list that you have paid an additional premium to be covered for i.e. Dermaplaning, Microblading & Semi-Permanent Make Up, Microneedling or Dermarolling, Micropigmentation, Nose and Cartilage Piercing or Red Veins, Skin Tags, Milia, Warts & Moles by Advanced Electrolysis.']}]}]},
 {id:'equipment',title:'Business equipment',description:'',when:v=>!isSalon(v),intro:[CONTENTS_WORDING,signedOff('of the value of your contents'),doc('NON_SALON_CONTENTS')],fields:[
  {name:'insEquipmentTier',label:'Business equipment sum insured',type:'select',required:true,options:tiers,when:v=>!isSalon(v)},
  yn('insStandardConstruction','Is the building of standard construction?',{when:tier,info:STANDARD_CONSTRUCTION}),
  yn('insNonStandardOver15','Is more than 15% of the building non-standard construction?',{when:v=>tier(v)&&v.insStandardConstruction==='no'}),
  yn('insMultipleAddresses','Is the equipment kept at more than one address?',{when:tier})]},
 {id:'el',title:"Employers' Liability",description:'',intro:v=>["Employers' Liability covers the compensation and legal costs you must pay if an employee is injured or becomes ill because of the work they do for you. Please note that this cover is legally required if you have employees.",
  'You will be covered for up to £10 million for each and every occurrence including costs.',doc(isSalon(v)?'SALON_EL':'NON_SALON_EL')],fields:[
  yn('insNonSalonEL',"Do you need Employers' Liability?",{when:v=>!isSalon(v)}),
  {name:'insNonSalonELTier',label:"How many employees do you need Employers' Liability for?",type:'select',required:true,when:v=>!isSalon(v)&&v.insNonSalonEL==='yes',options:[{value:'1',label:'1 employee'},{value:'3',label:'Up to 3 employees'},{value:'5',label:'Up to 5 employees'}]},
  yn('insSalonEL',"Do you need Employers' Liability?",{when:isSalon}),
  {name:'insWageRoll',label:'Estimated gross annual wage roll for the next 12 months (£)',type:'number',required:true,when:salonAnd('insSalonEL'),stopAbove:WAGE_ROLL_LIMIT,stopMessage:CALL_OFFICE}]},
 {id:'contents',title:'Contents',description:'',when:isSalon,intro:[CONTENTS_WORDING,doc('SALON_CONTENTS')],fields:[
  yn('insContents','Do you need Contents cover?',{when:isSalon,yesNote:['We can cover up to a maximum of £250,000 across all contents headings listed below. It is important that you provide an accurate reflection of the value of your contents as if you under-estimate the total value of your contents, you could find yourself significantly out of pocket if you have to make a claim and cannot recover the full amount from the insurer.']}),
  salonSum('insComputers','Computers And Ancillary Equipment Sum To Be Insured','This would include any tech such as laptops, mobile phones, tablets, tills or any other electrical items. Calculate the sum insured as the cost to repair or replace the items as new.',salonAnd('insContents')),
  salonSum('insEquipment','Beauty Therapist/Styling Equipment and Tools Sum To Be Insured','Include things such as wax pots, make-up brushes, waxing strips, scissors, hairdryers, hair straighteners and any other specialist beauty therapist equipment. Calculate the sum insured as the cost to repair or replace the items as new.',salonAnd('insContents')),
  salonSum('insStock','Business Stock Sum To Be Insured','Your stock i.e. the items you sell or anything you use to provide your services such as lotions, creams, nail varnishes etc. Calculate the sum insured as the cost of repair or replacement at the cost price to you.',salonAnd('insContents')),
  salonSum('insGeneralContents','General Contents Sum To Be Insured','Include things such as your couches, chairs, nail desks or any other furniture. Calculate the sum insured as the cost to repair or replace the items as new.',salonAnd('insContents')),
  salonSum('insTenantImprovements','Tenants Improvements Sum To Be Insured','Include anything for a property you rent, where you have spent money to improve the property such as window coverings, new flooring, shopfronts or fixed air conditioning units. Calculate the sum insured as the cost to repair or replace the items as new.',salonAnd('insContents')),
  salonSum('insRentPayable','Rent Payable Sum To Be Insured','Calculate this amount as the annual rent for the insured premises that you must legally pay while the insured premises or any part of it is unusable as a result of damage insured by this cover.',salonAnd('insContents'))]},
 {id:'money',title:'Money',description:'',when:isSalon,intro:['This covers all forms of money such as cash, cheques, current postage stamps etc. stolen from your premises, in transit, from a safe, or in the personal possession of you or anyone working for the business. It also covers compensation costs for injury to you or anyone working for the business as a result of money being stolen or someone attempting to steal money. You will be covered for up to £5,000 for each and every incident of loss.',doc('SALON_MONEY')],fields:[
  yn('insMoneyCover','Do you need Money cover?',{when:isSalon})]},
 {id:'buildings',title:'Buildings',description:'',when:isSalon,intro:['Covers damage to your building, including rebuilding it if it was damaged beyond repair.',doc('SALON_BUILDINGS')],fields:[
  yn('insBuildingsCover','Do you need Buildings cover?',{when:isSalon,yesNote:[signedOff('of the value of your buildings')+' We can only provide buildings cover for up to £500,000.']}),
  salonSum('insBuildingsSI','Buildings Sum To Be Insured','Calculate as the sum of rebuilding the property if it was completely destroyed.',salonAnd('insBuildingsCover')),
  salonSum('insFixturesSI','Fixtures and Fittings Sum To Be Insured','Include all permanent internal fixtures and fittings e.g. kitchen units, toilets, sinks and internal doors.',salonAnd('insBuildingsCover')),
  salonSum('insRentReceivableSI','Rent Receivable Sum To Be Insured','Calculate as the rent that you are not legally entitled to recover from your tenants while the buildings or any part are unusable as a result of insured damage.',salonAnd('insBuildingsCover')),
  yn('insBuildingsSubsidenceDeclaration','Is the building free from subsidence, heave and landslip, with no known cause for concern?',{when:salonAnd('insBuildingsCover')})]},
 {id:'bi',title:'Business Interruption',description:'',when:isSalon,intro:["This covers the reduction in turnover if you can't trade because of an insured event such as damage to premises you use (e.g. a fire).",doc('SALON_BI')],fields:[
  yn('insBiCover','Do you need Business Interruption cover?',{when:isSalon,yesNote:['Select the level of business interruption you require',signedOff('your business')+' We can only provide cover up to a maximum of £300,000.']}),
  salonSum('insBiIncome','Loss of income including increased costs of working sum to be insured','Would cover your loss of income if you were unable to work as a result of an insured event. It would also cover the costs and expenses necessarily and reasonably incurred by you for the sole purpose of minimising the reduction in income from your activities during the indemnity period, but not exceeding the reduction in income saved.',salonAnd('insBiCover')),
  salonSum('insBiDebts','Outstanding Debts','This would cover any of your outstanding debts which you are unable to recover following loss of your accounting records as a direct result of insured damage or insured failure.',salonAnd('insBiCover'))]},
 {id:'propertyAway',title:'Property Away in Transit',description:'',when:isSalon,intro:['Property away and in transit insurance protects you when your business equipment is damaged while away from the insured premises.',doc('SALON_PROPERTY_AWAY')],fields:[
  yn('insPropertyAwayCover','Do You Require Property Away in Transit cover? Anywhere in UK, Northern Ireland, Channel Islands and Isle of Man.',{when:isSalon,yesNote:[signedOff('of the value of your property')]}),
  sum('insPropertyAwaySI','What is the total value you require for all property away in transit? (£)',{when:salonAnd('insPropertyAwayCover'),info:['Cover can be provided for up to £25,000']}),
  sum('insPropertyAwayMaxItem','What is the value of the highest single item to be insured? (£)',{required:true,when:salonAnd('insPropertyAwayCover'),info:['We cannot provide cover if the value of any single item exceeds £10,000'],
    stopAbove:PROPERTY_AWAY_ITEM_LIMIT,stopMessage:'We cannot provide cover if the value of any single item exceeds £10,000'})]},
 {id:'property',title:'Your premises',description:'We need the address and some details of the premises you are insuring.',when:propertyCover,fields:[
  {name:'insPremL1',label:'Premises address line 1',type:'text',required:true},{name:'insPremL2',label:'Premises address line 2',type:'text',required:false},
  {name:'insPremTown',label:'Town / city',type:'text',required:true},{name:'insPremCounty',label:'County',type:'text',required:false},{name:'insPremPostcode',label:'Postcode',type:'text',required:true},
  yn('insSoleOccupation','Do you solely occupy the premises?'),yn('insStandardConstruction','Is the building of standard construction?',{info:STANDARD_CONSTRUCTION}),
  yn('insNonStandardOver15','Is more than 15% of the building non-standard construction?',{when:v=>v.insStandardConstruction==='no'}),
  yn('insUnoccupiedDeclaration','Will the premises be occupied, never empty for more than 30 days in a row?'),
  yn('insFlatRoof','Is your premises constructed with a flat roof?',{yesNote:['We will not make any payment for damage caused by any deficiency of a flat roof unless:',{list:['the roof is inspected once every 2 years by a competent person; and','any defects are rectified within 14 days.']}]}),
  yn('insFloodHistory','Are you aware that the address or property has suffered previously from flooding?'),yn('insBasement','Does the property have a basement?'),
  yn('insSubsidenceHistory','Are you aware that the address or property has suffered previously from subsidence?')]},
 {id:'declarations',title:'Declarations',description:'Your answers help us decide whether we can offer cover online.',intro:[
  'You must provide a fair presentation of the risk and must take care when answering any questions we ask by ensuring that all information provided is accurate and complete. A fair presentation is one which clearly discloses, in a reasonably clear and accessible manner, all material facts which you know, or ought to know, following a reasonable search.',
  'If information is not true, accurate and complete and you do not tell us, it could affect the validity of the policy or our ability to pay a claim.'],fields:[
  ...DECLARATION_STATEMENTS.map((label,i)=>({name:'insDecl'+(i+1),label,type:'radio',required:true,decl:i,options:agreeOptions})),
  {name:'insInformationAccurate',label:'I declare that the information provided is correct to the best of my knowledge and the provision of false or misleading information could prejudice or invalidate the insurance cover.',type:'checkbox',required:true},
  {name:'insEthicsAccepted',label:'I accept the Beauty Guild Code of Ethics.',type:'checkbox',required:true,links:{'Beauty Guild Code of Ethics':LEGAL.ethics.href}}]},
 {id:'demands',title:'Your Demands and Needs',description:'',demands:true,fields:[
  {name:'insDemandsNeedsAccepted',label:'I understand that this product meets the demands and needs set out above.',type:'checkbox',required:true},
  {name:'insNonAdvisedAccepted',label:'I understand that the sale is non-advised and that no personal recommendation has been made.',type:'checkbox',required:true}]},
];
export const visibleSteps=v=>INSURANCE_STEPS.filter(s=>!s.when||s.when(v));
export const visibleFields=v=>visibleSteps(v).flatMap(s=>s.fields).filter(f=>!f.when||f.when(v));
const FLAGS=['insNamedPeopleCover','insContents','insMoneyCover','insBuildingsCover','insBiCover','insPropertyAwayCover','insSalonEL','insNonSalonEL'];
export const CONFIRMATIONS=['insInformationAccurate','insEthicsAccepted','insDemandsNeedsAccepted','insNonAdvisedAccepted'];
// "Additional" teaching cover is only offered with an additional treatment; a stale choice is treated as none.
export const effective=v=>v.insTeachingCover==='additional'&&!treatments(v)?{...v,insTeachingCover:''}:v;
// The call-the-office messages that stop the customer going on (a wage roll over £125,000, a single item over £10,000).
export function stopMessages(v){
  return visibleFields(v).flatMap(f=>(f.stopOn&&v[f.name]===f.stopOn)||(f.stopAbove&&Number(v[f.name])>f.stopAbove)?[f.stopMessage]:[]);
}

// Flat form answers -> the request body's `insurance` object. Only answers to questions still on screen are sent.
export function toRequest(raw){
  const v=effective(raw),shown=new Set(visibleFields(v).map(f=>f.name)),has=k=>shown.has(k),out={};
  for(const f of visibleFields(v)){
    const x=v[f.name];
    if(f.decl!==undefined)continue;
    if(f.type==='number'||f.type==='select'||f.numeric)out[f.name]=Number(x)||0;
    else if(f.type==='radio'&&f.options.some(o=>o.value==='yes'))out[f.name]=x==='yes'||x==='no'?x:'';
    else if(f.type!=='checkbox'&&f.type!=='multi'&&f.type!=='people'&&f.type!=='text')out[f.name]=x;
  }
  for(const k of FLAGS)out[k]=has(k)&&v[k]==='yes';
  for(const k of working(v).filter(k=>['insWorkingFromHome','insMobile','insRentedRoom','insSubcontractor','insSalon'].includes(k)))out[k]=true;
  out.insTeachingCover=v.insTeachingCover==='standard'||v.insTeachingCover==='additional'?v.insTeachingCover:'';
  out.insTreatmentExtensions=v.insTreatmentExtensions||[];
  out.insNamedPeople=has('insNamedPeople')?(v.insNamedPeople||[]).filter(p=>p.firstName||p.lastName):[];
  out.insPremisesAddress=has('insPremL1')?{l1:v.insPremL1||'',l2:v.insPremL2||'',town:v.insPremTown||'',county:v.insPremCounty||'',postcode:v.insPremPostcode||''}:{};
  out.insDeclarations=DECLARATION_EXPECTED.map((expected,i)=>{const a=v['insDecl'+(i+1)];return a==='agree'?expected:a==='disagree'?(expected==='yes'?'no':'yes'):'';});
  for(const k of CONFIRMATIONS)out[k]=v[k]===true?'yes':'';
  return out;
}

// The quote summary can edit or remove a cover without going back through the questions. A quote line is
// "Insurance - <label>" (catalogue.js); this maps it to the answers that remove it and the section to edit.
const personRow=(v,name)=>(v.insNamedPeople||[]).findIndex(p=>((p.firstName||'')+' '+(p.lastName||'')).trim()===name);
const flagOff=(key,section)=>({section,remove:()=>({[key]:'no'})});
export function coverAction(lineName,v){
  const name=String(lineName).replace(/^Insurance - /,'');
  if(name==='Medical Malpractice')return {section:'business'};
  const person=name.match(/^Named (?:employee|subcontractor) cover \((.*)\)$/);
  if(person){const i=personRow(v,person[1]);return {section:'people',remove:i<0?undefined:()=>({insNamedPeople:(v.insNamedPeople||[]).filter((_,j)=>j!==i)})};}
  const t=TREATMENT_OPTIONS.find(o=>o.label===name);
  if(t)return {section:'treatments',remove:()=>({insTreatmentExtensions:(v.insTreatmentExtensions||[]).filter(x=>x!==t.value)})};
  if(name.startsWith('Teaching + Student Cover'))return {section:'teaching',remove:()=>({insTeachingCover:'none'})};
  if(name.startsWith('Business Equipment'))return {section:'equipment',remove:()=>({insEquipmentTier:'0'})};
  if(name==="Employers' Liability")return isSalon(v)?flagOff('insSalonEL','el'):flagOff('insNonSalonEL','el');
  const flag={Contents:['insContents','contents'],Money:['insMoneyCover','money'],Buildings:['insBuildingsCover','buildings'],'Business Interruption':['insBiCover','bi'],'Property Away':['insPropertyAwayCover','propertyAway']}[name];
  return flag?flagOff(...flag):null;
}
