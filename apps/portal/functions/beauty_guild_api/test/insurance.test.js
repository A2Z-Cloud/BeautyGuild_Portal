'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {clean, calculateQuote, evaluateRules, territory} = require('../src/insurance');

const DECL = ['no', 'no', 'no', 'no', 'no', 'yes', 'yes'];
const CONFIRM = {insInformationAccurate: 'yes', insEthicsAccepted: 'yes', insDemandsNeedsAccepted: 'yes', insNonAdvisedAccepted: 'yes'};
const quote = raw => calculateQuote(clean(raw));
const rules = (raw, country = 'United Kingdom', opts) => evaluateRules(clean(raw), country, opts);
const codes = r => r.results.map(x => x.code);

test('non-salon core cover is £32.50 plus 12% IPT, rounded once in pence', () => {
  const q = quote({});
  assert.deepEqual(q.rows.map(r => [r.code, r.premiumPence]), [['MEDMAL', 3250]]);
  assert.equal(q.netPence, 3250);
  assert.equal(q.iptPence, 390);
  assert.equal(q.totalPence, 3640);
});
test('salon medical malpractice is banded by turnover and unavailable above £250,000', () => {
  const med = turnover => quote({insSalon: true, insTurnover: turnover}).rows.find(r => r.code === 'MEDMAL')?.premiumPence;
  assert.equal(med(100000), 7500);
  assert.equal(med(100001), 10000);
  assert.equal(med(175000), 10000);
  assert.equal(med(250000), 15000);
  assert.equal(med(250001), undefined);
});
test('named people, treatments, teaching and non-salon tiers are rated as in V1', () => {
  const q = quote({insNamedPeopleCover: true, insNamedPeople: [{type: 'employee', firstName: 'A', lastName: 'B'}, {type: 'subcontractor', firstName: 'C', lastName: 'D'}],
    insTreatmentExtensions: ['microneedling', 'piercing', 'nope'], insTeachingCover: 'additional', insEquipmentTier: 10000, insStandardConstruction: 'no', insNonSalonEL: true, insNonSalonELTier: 3});
  const by = Object.fromEntries(q.rows.map(r => [r.code, r.premiumPence]));
  assert.deepEqual(by, {MEDMAL: 3250, NAMED_EMPLOYEES: 3250, NAMED_SUBCONTRACTORS: 1500, TREATMENT_MICRONEEDLING: 17925, TREATMENT_PIERCING: 1415,
    TEACHING_PLUS: 15000, BUSINESS_EQUIPMENT: 15000, EMPLOYERS_LIABILITY: 12000});
});
test('salon property covers use V1 rates and minimums', () => {
  const q = quote({insSalon: true, insTurnover: 50000, insSalonEL: true, insWageRoll: 10000, insContents: true, insComputers: 1000, insMoneyCover: true,
    insBuildingsCover: true, insBuildingsSI: 100000, insBiCover: true, insBiIncome: 10000, insPropertyAwayCover: true, insPropertyAwaySI: 4000});
  const by = Object.fromEntries(q.rows.map(r => [r.code, r.premiumPence]));
  assert.equal(by.EMPLOYERS_LIABILITY, 7500);
  assert.equal(by.CONTENTS, 5000);
  assert.equal(by.MONEY, 2000);
  assert.equal(by.BUILDINGS, 15000);
  assert.equal(by.BUSINESS_INTERRUPTION, 5000);
  assert.equal(by.PROPERTY_AWAY, 10000);
});
test('the route comes from how the person works, not from the request', () => {
  assert.equal(clean({insRoute: 'salon'}).insRoute, 'non_salon');
  assert.equal(clean({insSalon: true, insRoute: 'non_salon'}).insRoute, 'salon');
});
test('clean drops unknown keys, bounds numbers and caps people', () => {
  const c = clean({insTurnover: -5, insStock: 'abc', insNamedPeople: Array.from({length: 40}, () => ({type: 'x', firstName: 'n'.repeat(200)})), evil: 1,
    insDeclarations: ['maybe', 'yes'], insEquipmentTier: 'junk'});
  assert.equal(c.insTurnover, 0);
  assert.equal(c.insStock, 0);
  assert.equal(c.insNamedPeople.length, 10);
  assert.equal(c.insNamedPeople[0].type, 'employee');
  assert.equal(c.insNamedPeople[0].firstName.length, 60);
  assert.equal(c.evil, undefined);
  assert.deepEqual(c.insDeclarations, ['', 'yes', '', '', '', '', '']);
  assert.equal(c.insEquipmentTier, 0);
});
test('a clean application passes; a salon turnover over the limit is a STOP', () => {
  const ok = rules({insDeclarations: DECL, ...CONFIRM}, 'United Kingdom', {complete: true});
  assert.equal(ok.overall, 'PASS');
  const stop = rules({insSalon: true, insTurnover: 250001});
  assert.equal(stop.overall, 'STOP');
  assert.ok(codes(stop).includes('SALON_TURNOVER_LIMIT'));
});
test('STOP rules: territory, wage roll, sums insured, declarations the customer refused', () => {
  assert.ok(codes(rules({}, 'France')).includes('UNSUPPORTED_TERRITORY'));
  assert.ok(codes(rules({insSalon: true, insWageRoll: 125001})).includes('WAGE_ROLL_LIMIT'));
  assert.ok(codes(rules({insSalon: true, insContents: true, insStock: 250001})).includes('CONTENTS_LIMIT'));
  assert.ok(codes(rules({insSalon: true, insBuildingsCover: true, insBuildingsSI: 500001})).includes('BUILDINGS_LIMIT'));
  assert.ok(codes(rules({insSalon: true, insBuildingsCover: true, insBuildingsSubsidenceDeclaration: 'no'})).includes('BUILDINGS_SUBSIDENCE'));
  assert.ok(codes(rules({insSalon: true, insBiCover: true, insBiIncome: 300001})).includes('BI_LIMIT'));
  assert.ok(codes(rules({insSalon: true, insPropertyAwayCover: true, insPropertyAwaySI: 25001})).includes('PROPERTY_AWAY_LIMIT'));
  assert.ok(codes(rules({insTreatmentExtensions: ['dermaplaning'], insQualifiedForTreatments: 'no'})).includes('TREATMENT_QUALIFICATION'));
  assert.ok(codes(rules({insTreatmentExtensions: ['dermaplaning'], insPatchTesting: 'no'})).includes('PATCH_TESTING'));
  for (const [key, code] of [['insInformationAccurate', 'INFORMATION_ACCURACY'], ['insEthicsAccepted', 'CODE_OF_ETHICS'], ['insDemandsNeedsAccepted', 'DEMANDS_AND_NEEDS'], ['insNonAdvisedAccepted', 'NON_ADVISED_SALE']])
    assert.ok(codes(rules({[key]: 'no'})).includes(code));
});
test('REFER rules: people limit, multiple salons, premises history, declarations', () => {
  const five = Array.from({length: 5}, () => ({type: 'employee', firstName: 'A', lastName: 'B'}));
  assert.equal(rules({insNamedPeopleCover: true, insNamedPeople: five}).overall, 'REFER');
  assert.equal(rules({insNamedPeopleCover: true, insNamedPeople: five.slice(0, 4)}).overall, 'PASS');
  assert.ok(codes(rules({insSalon: true, insSalonCount: 2})).includes('MULTIPLE_SALONS'));
  assert.ok(codes(rules({insSalon: true, insContents: true, insSoleOccupation: 'no'})).includes('SOLE_OCCUPATION'));
  assert.ok(codes(rules({insSalon: true, insFloodHistory: 'yes', insBasement: 'yes'})).includes('FLOOD_BASEMENT'));
  assert.ok(codes(rules({insSalon: true, insSubsidenceHistory: 'yes'})).includes('SUBSIDENCE_HISTORY'));
  assert.ok(codes(rules({insEquipmentTier: 5000, insStandardConstruction: 'no', insNonStandardOver15: 'yes'})).includes('NON_STANDARD_CONSTRUCTION'));
  assert.ok(codes(rules({insEquipmentTier: 5000, insMultipleAddresses: 'yes'})).includes('MULTIPLE_ADDRESSES'));
  const refer = rules({insDeclarations: ['yes', 'no', 'no', 'no', 'no', 'yes', 'yes']});
  assert.equal(refer.overall, 'REFER');
  assert.ok(codes(refer).includes('DECLARATION_1'));
  assert.ok(codes(rules({insDeclarations: ['no', 'no', 'no', 'no', 'no', 'no', 'yes']})).includes('DECLARATION_6'));
});
test('STOP outranks REFER, and REFER outranks incomplete', () => {
  assert.equal(rules({insEthicsAccepted: 'no', insDeclarations: ['yes', '', '', '', '', '', '']}).overall, 'STOP');
  assert.equal(rules({insDeclarations: ['yes', 'no', 'no', 'no', 'no', 'yes', 'yes']}, 'UK', {complete: true}).overall, 'REFER');
});
test('paying needs every declaration and confirmation answered; a quote does not', () => {
  assert.equal(rules({}).overall, 'PASS');
  const r = rules({}, 'United Kingdom', {complete: true});
  assert.equal(r.overall, 'INCOMPLETE');
  assert.match(r.results[0].customerMessage, /declaration/);
  assert.equal(rules({insSalon: true, insContents: true, insDeclarations: DECL, ...CONFIRM}, 'UK', {complete: true}).overall, 'INCOMPLETE');
  assert.equal(rules({insTreatmentExtensions: ['spmu'], insDeclarations: DECL, ...CONFIRM}, 'UK', {complete: true}).overall, 'INCOMPLETE');
});
test('UK nations and Crown dependencies are supported territories', () => {
  for (const c of ['', 'United Kingdom', 'England', 'Scotland', 'Wales', 'Northern Ireland', 'Jersey', 'Guernsey', 'Isle of Man']) assert.notEqual(territory(c), 'other', c);
  for (const c of ['France', 'Ireland', 'Other']) assert.equal(territory(c), 'other', c);
});
