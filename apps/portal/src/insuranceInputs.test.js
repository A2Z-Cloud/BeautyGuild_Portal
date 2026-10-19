import test from 'node:test';
import assert from 'node:assert/strict';
import {CALL_OFFICE,GUILD_PHONE,INSURANCE_STEPS,TREATMENT_OPTIONS,coverAction,demandsAndNeeds,effective,stopMessages,toRequest,visibleFields,visibleSteps,withIpt} from './insuranceInputs.js';

const ids=v=>visibleSteps(v).map(s=>s.id),names=v=>visibleFields(v).map(f=>f.name);
const SALON={insWorking:['insSalon']},NON={insWorking:['insMobile']};

test('AL-INS-025 and 075: Declarations is the step name and each cover has its own step',()=>{
  assert.equal(INSURANCE_STEPS.find(s=>s.id==='declarations').title,'Declarations');
  assert.deepEqual(ids(NON),['business','people','standardTreatments','treatments','teaching','equipment','el','declarations','demands']);
  assert.deepEqual(ids({...SALON,insContents:'yes'}),['business','people','standardTreatments','treatments','teaching','el','contents','money','buildings','bi','propertyAway','property','declarations','demands']);
  assert.deepEqual(ids({...SALON}).includes('property'),false);
});
test('AL-INS-026 to 038: declarations are statements, answered I agree or I do not agree, and agreeing is the answer the function expects',()=>{
  const decl=INSURANCE_STEPS.find(s=>s.id==='declarations').fields.filter(f=>f.name.startsWith('insDecl'));
  assert.equal(decl.length,7);
  assert.equal(decl[0].label,'I have not made any claims in the past 5 years and I have never had any claims for any laser or IPL treatments.');
  assert.equal(decl[6].label,'I do not conduct any business or have clients outside of the United Kingdom of Great Britain and Northern Ireland, the Channel Islands or Isle of Man.');
  const agreed=Object.fromEntries(decl.map(f=>[f.name,'agree']));
  assert.deepEqual(toRequest({...NON,...agreed}).insDeclarations,['no','no','no','no','no','yes','yes']);
  assert.deepEqual(toRequest({...NON,insDecl1:'disagree',insDecl6:'disagree'}).insDeclarations,['yes','','','','','no','']);
  const ethics=INSURANCE_STEPS.flatMap(s=>s.fields).find(f=>f.name==='insEthicsAccepted');
  assert.ok(ethics.links['Beauty Guild Code of Ethics'].startsWith('https://'));
  assert.equal(INSURANCE_STEPS.flatMap(s=>s.fields).find(f=>f.name==='insNonAdvisedAccepted').label,'I understand that the sale is non-advised and that no personal recommendation has been made.');
});
test('AL-INS-037 and 046: the demands and needs statement lists only the covers chosen',()=>{
  assert.deepEqual(demandsAndNeeds(NON).items,['Public, Products and Professional Treatment liability risks']);
  assert.deepEqual(demandsAndNeeds({...NON,insNonSalonEL:'yes',insEquipmentTier:'10000',insTreatmentExtensions:['spmu'],insTeachingCover:'standard'}).items,
    ['Public, Products and Professional Treatment liability risks','Employers Liability','Contents up to £10,000.00']);
  assert.deepEqual(demandsAndNeeds({...SALON,insSalonEL:'yes',insContents:'yes',insStock:'400',insComputers:'200',insMoneyCover:'yes',insBuildingsCover:'yes',insBiCover:'yes',insPropertyAwayCover:'yes'}).items,
    ['Public, Products and Professional Treatment liability risks','Employers Liability','Contents up to £600.00','Money Cover','Buildings Cover','Business Interruption Cover','Property Away and in Transit Cover']);
  assert.ok(demandsAndNeeds(NON).intro.startsWith('I understand that this product meets the demands and needs of a business in the hair or beauty industry'));
});
test('AL-INS-043: turnover is three bands and is sent as the band limit the function rates on',()=>{
  const f=INSURANCE_STEPS[0].fields.find(x=>x.name==='insTurnover');
  assert.deepEqual(f.options.map(o=>o.label),['£0–£100,000','£100,001–£175,000','£175,001–£250,000']);
  assert.equal(f.type,'radio');
  assert.equal(toRequest({...SALON,insTurnover:'175000'}).insTurnover,175000);
  assert.equal(toRequest(NON).insTurnover,undefined);
  assert.ok(f.info.join(' ').includes('call the office on '+GUILD_PHONE));
});
test('AL-INS-044 and 049: wage roll is a yes/no for a salon, and the figure is only asked with Employers Liability',()=>{
  assert.ok(names(SALON).includes('insWageRollOver125k'));assert.ok(!names(SALON).includes('insWageRoll'));
  assert.ok(!names(NON).includes('insWageRollOver125k'));
  assert.ok(names({...SALON,insSalonEL:'yes'}).includes('insWageRoll'));
  assert.deepEqual(stopMessages({...SALON,insWageRollOver125k:'yes'}),[CALL_OFFICE]);
  assert.deepEqual(stopMessages({...SALON,insWageRollOver125k:'no'}),[]);
  assert.deepEqual(stopMessages({...SALON,insSalonEL:'yes',insWageRoll:'125001'}),[CALL_OFFICE]);
  assert.deepEqual(stopMessages({...SALON,insSalonEL:'yes',insWageRoll:'125000'}),[]);
  const r=toRequest({...SALON,insWageRollOver125k:'no',insSalonEL:'yes',insWageRoll:'60000'});
  assert.equal(r.insWageRollOver125k,'no');assert.equal(r.insWageRoll,60000);
  assert.equal(toRequest({...SALON,insWageRollOver125k:'no',insWageRoll:'60000'}).insWageRoll,undefined);
});
test('AL-INS-073: a single property away item over £10,000 blocks',()=>{
  const v={...SALON,insPropertyAwayCover:'yes'};
  assert.ok(names(v).includes('insPropertyAwayMaxItem'));
  assert.equal(stopMessages({...v,insPropertyAwayMaxItem:'10001'}).length,1);
  assert.equal(stopMessages({...v,insPropertyAwayMaxItem:'10000'}).length,0);
  assert.equal(toRequest({...v,insPropertyAwayMaxItem:'4500'}).insPropertyAwayMaxItem,4500);
});
test('AL-INS-008 and 009: treatment and teaching prices show with IPT, and additional teaching needs an additional treatment',()=>{
  assert.deepEqual(TREATMENT_OPTIONS.map(o=>o.price),['£31.36','£200.76','£15.85','£200.76','£200.76']);
  assert.equal(withIpt(75),'£84.00');assert.equal(withIpt(150),'£168.00');
  const teaching=INSURANCE_STEPS.find(s=>s.id==='teaching').fields[0];
  assert.deepEqual(teaching.options.map(o=>o.price).filter(Boolean),['£84.00','£168.00']);
  assert.ok(teaching.options.every(o=>o.value==='none'||o.info));
  assert.equal(teaching.optionWhen.additional({insTreatmentExtensions:[]}),false);
  assert.equal(teaching.optionWhen.additional({insTreatmentExtensions:['spmu']}),true);
  assert.equal(effective({insTeachingCover:'additional'}).insTeachingCover,'');
  assert.equal(toRequest({...NON,insTeachingCover:'additional'}).insTeachingCover,'');
  assert.equal(toRequest({...NON,insTeachingCover:'additional',insTreatmentExtensions:['spmu']}).insTeachingCover,'additional');
});
test('AL-INS-012 and 020: the equipment and Employers Liability dropdowns do not show prices',()=>{
  const sel=n=>INSURANCE_STEPS.flatMap(s=>s.fields).find(f=>f.name===n);
  for(const o of [...sel('insEquipmentTier').options,...sel('insNonSalonELTier').options])assert.ok(!/£\d+\.\d\d|premium|per /i.test(o.label),o.label);
});
test('AL-INS-013 and 058: standard construction is defined wherever it is asked',()=>{
  const asked=INSURANCE_STEPS.flatMap(s=>s.fields).filter(f=>f.name==='insStandardConstruction');
  assert.equal(asked.length,2);
  for(const f of asked)assert.ok(f.info[0].startsWith('Standard construction is built of brick, stone or concrete'));
});
test('AL-INS-051 and 060: property questions and the flat roof wording',()=>{
  const f=n=>INSURANCE_STEPS.find(s=>s.id==='property').fields.find(x=>x.name===n);
  assert.equal(f('insFloodHistory').label,'Are you aware that the address or property has suffered previously from flooding?');
  assert.equal(f('insSubsidenceHistory').label,'Are you aware that the address or property has suffered previously from subsidence?');
  assert.equal(f('insBasement').label,'Does the property have a basement?');
  assert.equal(f('insFlatRoof').label,'Is your premises constructed with a flat roof?');
  assert.equal(f('insFlatRoof').yesNote[0],'We will not make any payment for damage caused by any deficiency of a flat roof unless:');
  assert.deepEqual(f('insFlatRoof').yesNote[1].list,['the roof is inspected once every 2 years by a competent person; and','any defects are rectified within 14 days.']);
});
test('AL-INS-005 and 024: employing staff is a yes/no with the employment status pop-up and a limit of five including the policy holder',()=>{
  const q=INSURANCE_STEPS.find(s=>s.id==='people').fields;
  assert.equal(q[0].label,'Do you employ staff or engage subcontractors on a full time, part time or "as and when needed" basis?');
  assert.equal(q[0].info[2].href,'https://www.gov.uk/guidance/check-employment-status-for-tax');
  assert.equal(q[1].max,4);
  assert.equal(q[1].hint,'This policy covers a maximum of 5 including the policy holder. If you would like to add more employees, contact the office on 01332 224830.');
});
test('AL-INS-004: the quote summary can edit or remove a cover',()=>{
  const v={...SALON,insContents:'yes',insSalonEL:'yes',insTreatmentExtensions:['spmu','dermaplaning'],insTeachingCover:'standard',insNamedPeopleCover:'yes',insNamedPeople:[{type:'employee',firstName:'Ada',lastName:'Lee'},{type:'subcontractor',firstName:'Bo',lastName:'Ng'}]};
  assert.deepEqual(coverAction('Insurance - Contents',v).remove(),{insContents:'no'});
  assert.equal(coverAction('Insurance - Contents',v).section,'contents');
  assert.deepEqual(coverAction("Insurance - Employers' Liability",v).remove(),{insSalonEL:'no'});
  assert.deepEqual(coverAction("Insurance - Employers' Liability",NON).remove(),{insNonSalonEL:'no'});
  assert.deepEqual(coverAction('Insurance - Dermaplaning',v).remove(),{insTreatmentExtensions:['spmu']});
  assert.deepEqual(coverAction('Insurance - Teaching + Student Cover',v).remove(),{insTeachingCover:'none'});
  assert.deepEqual(coverAction('Insurance - Named subcontractor cover (Bo Ng)',v).remove().insNamedPeople.map(p=>p.firstName),['Ada']);
  assert.equal(coverAction('Insurance - Medical Malpractice',v).remove,undefined);
  assert.equal(coverAction('Insurance Premium Tax (12%)',v),null);
});
test('the cover wording the customer gave is on screen, with policy documents named',()=>{
  const text=JSON.stringify(INSURANCE_STEPS)+JSON.stringify(INSURANCE_STEPS.find(s=>s.id==='el').intro(SALON));
  for(const s of ['Employers\' Liability covers the compensation and legal costs','This covers all forms of money such as cash','Covers damage to your building, including rebuilding it',"This covers the reduction in turnover if you can't trade",
    'Property away and in transit insurance protects you','You must provide a fair presentation of the risk','Select this level of cover if you are only teaching treatments'])assert.ok(text.includes(s),s);
  assert.ok(!text.includes('Fixed premium'));assert.ok(!text.includes('Contents unlocks'));assert.ok(!/—/.test(text));
});
