// The insurance questions, with the V1 wizard's inputs (beautyguildclient public/membership-quote.js).
// One list drives the saved-application journey and the buy pages. The server rates and rules on these
// answers and decides what is payable; this file only collects them. toRequest() maps the flat form
// answers onto the ins* shape the function expects.
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

export const TREATMENT_OPTIONS=[{value:'advanced_electrolysis',label:'Advanced Electrolysis'},{value:'microneedling',label:'Microneedling / Dermarolling'},{value:'piercing',label:'Nose / Cartilage Piercing'},
  {value:'spmu',label:'Microblading / SPMU / Micropigmentation'},{value:'dermaplaning',label:'Dermaplaning'}];
export const DECLARATION_LABELS=['Any claims, losses or incidents in the past that could affect this insurance?','Have you ever been bankrupt or insolvent?','Are you aware of any circumstances that could lead to a claim?',
  'Any criminal convictions that are not spent?','Has any insurer declined, cancelled or refused to renew your insurance?','Are you aged 18 or over and domiciled in the UK?','Do you only provide services in the UK, Channel Islands or Isle of Man?'];

export const INSURANCE_STEPS=[
 {id:'business',title:'How you work',description:'Select every way that you work.',fields:[
  {name:'insWorking',label:'How you work',type:'multi',required:true,options:[{value:'insWorkingFromHome',label:'I work from home'},{value:'insMobile',label:'I work on a mobile basis'},
    {value:'insRentedRoom',label:'I solely occupy a treatment room within a salon, fitness/leisure or other commercial establishment'},
    {value:'insSubcontractor',label:'I am a self-employed subcontractor within a multi-therapist salon'},{value:'insSalon',label:'I own or operate a salon in commercial or retail premises'}]},
  {name:'insTurnover',label:'Annual turnover (£)',type:'number',required:true,when:isSalon},
  {name:'insWageRoll',label:'Annual wage roll (£)',type:'number',required:true,when:isSalon},
  {name:'insSalonCount',label:'Number of salons',type:'number',required:true,when:isSalon},
  yn('insNamedPeopleCover','Do you want to cover named employees or subcontractors?'),
  {name:'insNamedPeople',label:'Named people',type:'people',required:true,when:yes('insNamedPeopleCover'),hint:'Employees cost £32.50 each and subcontractors £15. More than four people needs a review by the Insurance team.'}]},
 {id:'cover',title:'Your cover',description:'Medical malpractice is included. Choose what else you need.',fields:[
  {name:'insTeachingCover',label:'Teaching and student cover',type:'radio',required:true,options:[{value:'none',label:'None'},{value:'standard',label:'Teaching + Student Cover'},{value:'additional',label:'Teaching + Student Cover + Additional Treatments'}]},
  {name:'insTreatmentExtensions',label:'Specialist treatment extensions',type:'multi',required:false,options:TREATMENT_OPTIONS},
  yn('insQualifiedForTreatments','Are you qualified to carry out each selected treatment?',{when:treatments}),
  yn('insPatchTesting','Do you agree to carry out the required patch testing?',{when:treatments}),
  {name:'insEquipmentTier',label:'Business equipment sum insured',type:'select',required:true,options:tiers,when:v=>!isSalon(v)},
  yn('insStandardConstruction','Is the building of standard construction?',{when:tier}),
  yn('insNonStandardOver15','Is more than 15% of the building non-standard construction?',{when:v=>tier(v)&&v.insStandardConstruction==='no'}),
  yn('insMultipleAddresses','Is the equipment kept at more than one address?',{when:tier}),
  yn('insNonSalonEL',"Do you need Employers' Liability?",{when:v=>!isSalon(v)}),
  {name:'insNonSalonELTier',label:"Employers' Liability indemnity",type:'select',required:true,when:v=>!isSalon(v)&&v.insNonSalonEL==='yes',options:[{value:'1',label:'1 employee'},{value:'3',label:'Up to 3 employees'},{value:'5',label:'Up to 5 employees'}]},
  yn('insSalonEL',"Do you need Employers' Liability?",{when:isSalon}),
  yn('insContents','Do you need Contents cover?',{when:isSalon}),
  sum('insComputers','Computers (£)',{when:salonAnd('insContents')}),sum('insEquipment','Equipment (£)',{when:salonAnd('insContents')}),sum('insStock','Stock (£)',{when:salonAnd('insContents')}),
  sum('insGeneralContents','General contents (£)',{when:salonAnd('insContents')}),sum('insTenantImprovements',"Tenant's improvements (£)",{when:salonAnd('insContents')}),sum('insRentPayable','Rent payable (£)',{when:salonAnd('insContents')}),
  yn('insMoneyCover','Do you need Money cover?',{when:isSalon}),
  yn('insBuildingsCover','Do you need Buildings cover?',{when:isSalon}),
  sum('insBuildingsSI','Buildings sum insured (£)',{when:salonAnd('insBuildingsCover')}),sum('insFixturesSI','Fixtures and fittings sum insured (£)',{when:salonAnd('insBuildingsCover')}),
  sum('insRentReceivableSI','Rent receivable sum insured (£)',{when:salonAnd('insBuildingsCover')}),
  yn('insBuildingsSubsidenceDeclaration','Is the building free from subsidence, heave and landslip, with no known cause for concern?',{when:salonAnd('insBuildingsCover')}),
  yn('insBiCover','Do you need Business Interruption cover?',{when:isSalon}),
  sum('insBiIncome','Gross income (£)',{when:salonAnd('insBiCover')}),sum('insBiDebts','Additional increased cost of working and debts (£)',{when:salonAnd('insBiCover')}),
  yn('insPropertyAwayCover','Do you need Property Away cover?',{when:isSalon}),
  sum('insPropertyAwaySI','Property Away sum insured (£)',{when:salonAnd('insPropertyAwayCover')})]},
 {id:'property',title:'Your premises',description:'We need the address and some details of the premises you are insuring.',when:propertyCover,fields:[
  {name:'insPremL1',label:'Premises address line 1',type:'text',required:true},{name:'insPremL2',label:'Premises address line 2',type:'text',required:false},
  {name:'insPremTown',label:'Town / city',type:'text',required:true},{name:'insPremCounty',label:'County',type:'text',required:false},{name:'insPremPostcode',label:'Postcode',type:'text',required:true},
  yn('insSoleOccupation','Do you solely occupy the premises?'),yn('insStandardConstruction','Is the building of standard construction?'),
  yn('insNonStandardOver15','Is more than 15% of the building non-standard construction?',{when:v=>v.insStandardConstruction==='no'}),
  yn('insUnoccupiedDeclaration','Will the premises be occupied, never empty for more than 30 days in a row?'),yn('insFlatRoof','Does the building have a flat roof?'),
  yn('insFloodHistory','Has the premises had flooding?'),yn('insBasement','Is there a basement or semi-basement?'),yn('insSubsidenceHistory','Has the premises had subsidence?')]},
 {id:'declarations',title:'Your declarations',description:'Your answers help us decide whether we can offer cover online.',fields:[
  ...DECLARATION_LABELS.map((label,i)=>yn('insDecl'+(i+1),label)),
  {name:'insInformationAccurate',label:'I confirm the information I have given is complete and accurate.',type:'checkbox',required:true},
  {name:'insEthicsAccepted',label:'I accept the Beauty Guild Code of Ethics.',type:'checkbox',required:true},
  {name:'insDemandsNeedsAccepted',label:'I confirm the demands and needs statement is correct.',type:'checkbox',required:true},
  {name:'insNonAdvisedAccepted',label:'I understand this is a non-advised sale.',type:'checkbox',required:true}]},
];
export const visibleSteps=v=>INSURANCE_STEPS.filter(s=>!s.when||s.when(v));
export const visibleFields=v=>visibleSteps(v).flatMap(s=>s.fields).filter(f=>!f.when||f.when(v));
const FLAGS=['insNamedPeopleCover','insContents','insMoneyCover','insBuildingsCover','insBiCover','insPropertyAwayCover','insSalonEL','insNonSalonEL'];
const confirmations=['insInformationAccurate','insEthicsAccepted','insDemandsNeedsAccepted','insNonAdvisedAccepted'];

// Flat form answers -> the request body's `insurance` object. Only answers to questions still on screen are sent.
export function toRequest(v){
  const shown=new Set(visibleFields(v).map(f=>f.name)),has=k=>shown.has(k),out={};
  for(const f of visibleFields(v)){
    const x=v[f.name];
    if(f.type==='number'||f.type==='select')out[f.name]=Number(x)||0;
    else if(f.type==='radio'&&f.options.some(o=>o.value==='yes'))out[f.name]=x==='yes'||x==='no'?x:'';
    else if(f.type!=='checkbox'&&f.type!=='multi'&&f.type!=='people'&&f.type!=='text')out[f.name]=x;
  }
  for(const k of FLAGS)out[k]=has(k)&&v[k]==='yes';
  for(const k of working(v).filter(k=>['insWorkingFromHome','insMobile','insRentedRoom','insSubcontractor','insSalon'].includes(k)))out[k]=true;
  out.insTeachingCover=v.insTeachingCover==='standard'||v.insTeachingCover==='additional'?v.insTeachingCover:'';
  out.insTreatmentExtensions=v.insTreatmentExtensions||[];
  out.insNamedPeople=has('insNamedPeople')?(v.insNamedPeople||[]).filter(p=>p.firstName||p.lastName):[];
  out.insPremisesAddress=has('insPremL1')?{l1:v.insPremL1||'',l2:v.insPremL2||'',town:v.insPremTown||'',county:v.insPremCounty||'',postcode:v.insPremPostcode||''}:{};
  out.insDeclarations=DECLARATION_LABELS.map((_,i)=>v['insDecl'+(i+1)]||'');
  for(const k of confirmations)out[k]=v[k]===true?'yes':'';
  return out;
}
