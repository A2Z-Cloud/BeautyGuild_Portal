import test from 'node:test';
import assert from 'node:assert/strict';
import {accreditationType, validate} from './logic.mjs';
import {JOURNEYS,countryOption,COUNTRY_OPTIONS} from './JourneyConfig.js';

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

test('address lookup country maps onto the dropdown options', () => {
  assert.equal(countryOption('United Kingdom'), 'United Kingdom');
  assert.equal(countryOption(' ireland '), 'Ireland');
  assert.equal(countryOption('Germany'), 'Other');
  assert.equal(countryOption(''), '');
  assert.equal(countryOption(undefined), '');
  assert.ok(COUNTRY_OPTIONS.includes(countryOption('France')));
});

import {formatDate,serviceLabel} from './format.js';
test('dates read naturally for customers', () => {
  assert.equal(formatDate('2026-10-15'), '15 Oct 2026');
  assert.equal(formatDate('2026-10-15T11:26:51+01:00'), '15 Oct 2026');
  assert.equal(formatDate('2026-10-15T11:26:51+01:00',{time:true}), '15 Oct 2026, 11:26');
  assert.equal(formatDate('18-Aug-2026'), '18 Aug 2026');
  assert.equal(formatDate('01-Nov-2026 09:00:00',{time:true}), '1 Nov 2026, 09:00');
  assert.equal(formatDate(null), '—');
  assert.equal(formatDate('not a date'), 'not a date');
  assert.equal(serviceLabel('accreditation'), 'Accreditation');
});
