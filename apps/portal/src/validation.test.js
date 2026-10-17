import test from 'node:test';
import assert from 'node:assert/strict';
import {accreditationType, validate} from './logic.mjs';
import {JOURNEYS} from './JourneyConfig.js';

test('all three journeys contain multi-step data collection and review', () => {
  for(const kind of ['membership','accreditation','insurance']){
    const flow=JOURNEYS[kind];
    assert.ok(flow.steps.length>=6,kind);
    assert.equal(flow.steps.at(-1).id,'review');
    assert.ok(flow.steps.flatMap(s=>s.fields).length>=20,kind);
  }
});
test('required and email validation',()=>{
  const fields=[{name:'name',type:'text',required:true},{name:'email',type:'email',required:true}];
  assert.ok(validate(fields,{email:'test@example.test'}).name);
  assert.ok(validate(fields,{name:'Sam',email:'no-at-symbol'}).email);
  assert.deepEqual(validate(fields,{name:'Sam',email:'sam@example.test'}),{});
});
test('required multi-select and conditional fields',()=>{
  const fields=[
    {name:'method',type:'multi',required:true},
    {name:'details',type:'text',required:true,when:v=>(v.method||[]).includes('salon')}
  ];
  assert.ok(validate(fields,{}).method);
  assert.deepEqual(validate(fields,{method:['mobile']}),{});
  assert.ok(validate(fields,{method:['salon']}).details);
});
test('required checkboxes, zero and negative numbers',()=>{
  const fields=[{name:'accept',type:'checkbox',required:true},{name:'value',type:'number',required:true}];
  assert.ok(validate(fields,{value:0}).accept);
  assert.ok(validate(fields,{value:-1,accept:true}).value);
  assert.deepEqual(validate(fields,{value:0,accept:true}),{});
});
test('UK constituent nations and international accreditation',()=>{
  for(const c of ['England','Scotland','Wales','Northern Ireland','United Kingdom','UK']){
    assert.equal(accreditationType(c),'Standard Accreditation');
  }
  assert.equal(accreditationType('Ireland'),'International Accreditation');
});
test('insurance property questions conditional on premises or property cover',()=>{
  const property=JOURNEYS.insurance.steps.find(s=>s.id==='property');
  assert.equal(property.when({workingMethods:['mobile']}),false);
  assert.equal(property.when({workingMethods:['salon']}),true);
  assert.equal(property.when({workingMethods:['mobile'],contents:'yes'}),true);
});
test('membership insurance questions conditional on selection',()=>{
  const cover=JOURNEYS.membership.steps.find(s=>s.id==='insurance');
  assert.equal(cover.when({insuranceWanted:'no'}),false);
  assert.equal(cover.when({insuranceWanted:'yes'}),true);
});
test('tutor and premises dependent fields only required when active',()=>{
  const tutors=JOURNEYS.accreditation.steps.find(s=>s.id==='tutors').fields;
  assert.ok(validate(tutors,{otherTutors:'yes',additionalVenues:'no'}).tutorCount);
  assert.deepEqual(validate(tutors,{otherTutors:'no',additionalVenues:'no'}),{});
});
