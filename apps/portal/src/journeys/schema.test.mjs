import test from 'node:test';
import assert from 'node:assert/strict';
import { STEPS, newJourney, validateStep, accreditationClass, membershipLevels, insuranceRoute } from './schema.js';

test('three journeys each have a review step',()=>{
  for(const service of ['membership','accreditation','insurance']) {
    assert.ok(STEPS[service].length>=4);
    assert.match(STEPS[service].at(-1),/review|quote/i);
  }
});
test('required member details and email format',()=>{
  const d=newJourney('membership');
  assert.ok(validateStep('membership',0,d).email);
  d.firstName='Sam';d.lastName='Example';d.email='incorrect';
  assert.ok(validateStep('membership',0,d).email);
  d.email='sam@example.test';
  assert.deepEqual(validateStep('membership',0,d),{});
});
test('training centre country controls accreditation classification',()=>{
  for(const c of ['England','Scotland','Wales','Northern Ireland'])
    assert.equal(accreditationClass(c),'Standard Accreditation (UK)');
  assert.equal(accreditationClass('Ireland'),'International Accreditation');
});
test('membership level visibility is conditional',()=>{
  const d=newJourney('membership');
  assert.deepEqual(membershipLevels(d).map(x=>x.value),['associate']);
  d.insuranceWanted='yes';
  assert.equal(membershipLevels(d).length,3);
  d.territory='Other';
  assert.deepEqual(membershipLevels(d).map(x=>x.value),['international']);
});
test('salon property checks only apply to salon route',()=>{
  const d=newJourney('insurance');
  assert.equal(insuranceRoute(d.workingMethods),'Non-Salon');
  assert.deepEqual(validateStep('insurance',3,d),{});
  d.workingMethods=['salon'];
  assert.ok(validateStep('insurance',3,d).premisesAddress);
  d.premisesAddress='1 Example Road';d.premisesPostcode='AB1 2CD';d.turnover='10000';
  assert.deepEqual(validateStep('insurance',3,d),{});
});
test('positive claims disclosure is collected, not silently rejected',()=>{
  const d=newJourney('insurance');
  assert.ok(validateStep('insurance',4,d).claimsHistory);
  d.claimsHistory='yes';d.priorDecline='no';d.declaration=true;
  assert.deepEqual(validateStep('insurance',4,d),{});
});
test('accreditation requires an example course and declaration',()=>{
  const d=newJourney('accreditation');
  assert.ok(validateStep('accreditation',2,d).courses);
  d.courses=['facial'];
  assert.deepEqual(validateStep('accreditation',2,d),{});
  assert.ok(validateStep('accreditation',4,d).declaration);
});
