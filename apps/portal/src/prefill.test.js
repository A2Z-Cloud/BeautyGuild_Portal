import test from 'node:test';
import assert from 'node:assert/strict';
import {countryFor,prefillFor} from './prefill.js';
import {JOURNEYS,COUNTRY_OPTIONS} from './JourneyConfig.js';

const DETAILS={title:'Ms',firstName:'Ada',lastName:'Lovelace',email:'ada@example.test',phone:'01234 567890',mobile:'07700 900123',
  addressLine1:'1 Test Street',addressLine2:'Flat 2',addressLine3:'',town:'Salisbury',county:'Wiltshire',postcode:'SP1 2AP',country:'United Kingdom',interests:['Beauty']};
const fields=kind=>JOURNEYS[kind].steps.flatMap(s=>s.fields);

test('membership form is filled from the contact, with Mobile first and Phone as the fallback',()=>{
  const out=prefillFor('membership',DETAILS,fields('membership'));
  assert.deepEqual([out.title,out.firstName,out.lastName,out.email,out.mobile],['Ms','Ada','Lovelace','ada@example.test','07700 900123']);
  assert.deepEqual([out.address1,out.address2,out.town,out.county,out.postcode,out.territory],['1 Test Street','Flat 2','Salisbury','Wiltshire','SP1 2AP','United Kingdom']);
  assert.equal(prefillFor('membership',{...DETAILS,mobile:''},fields('membership')).mobile,'01234 567890');
});
test('accreditation applicant keeps phone and mobile separate and uses the correspondence address',()=>{
  const out=prefillFor('accreditation',DETAILS,fields('accreditation'));
  assert.deepEqual([out.phone,out.mobile,out.contactCountry,out.address1,out.postcode],['01234 567890','07700 900123','United Kingdom','1 Test Street','SP1 2AP']);
});
test('insurance applicant gets name, email, telephone, territory and postcode',()=>{
  const out=prefillFor('insurance',DETAILS,fields('insurance'));
  assert.deepEqual([out.firstName,out.email,out.mobile,out.country,out.postcode],['Ada','ada@example.test','07700 900123','United Kingdom','SP1 2AP']);
});
test('nothing the member has already typed is overwritten, and empty CRM values are skipped',()=>{
  const out=prefillFor('membership',{...DETAILS,county:''},fields('membership'),{firstName:'Grace',town:'  '});
  assert.equal(out.firstName,undefined);
  assert.equal(out.town,'Salisbury');
  assert.equal(out.county,undefined);
});
test('a choice field is only filled with a value it offers',()=>{
  assert.equal(prefillFor('membership',{...DETAILS,country:'Atlantis'},fields('membership')).territory,undefined);
  assert.equal(prefillFor('membership',{...DETAILS,title:'Lord'},fields('membership')).title,undefined);
  assert.equal(prefillFor('membership',null,fields('membership')).firstName,undefined);
});
test('the buy pages use the contact country only when it is one of their options',()=>{
  assert.equal(countryFor({country:'France'},COUNTRY_OPTIONS),'France');
  assert.equal(countryFor({country:'Atlantis'},COUNTRY_OPTIONS),'');
  assert.equal(countryFor(null,COUNTRY_OPTIONS),'');
});
