import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_CHANGES,
  TEACHING,
  answersToRequest,
  dateRange,
  declarationsDone,
  eligibility,
  emptyChange,
  isEmptyChange,
  options,
  problems,
  toBody,
} from './insuranceChangeForm.js';

const NOW = Date.parse('2026-10-07T10:00:00Z');
const cover = (extra = {}, covers) => ({
  insurance: {
    route: 'non_salon',
    paymentFrequency: 'Annual',
    startDate: '2026-09-30',
    endDate: '2027-09-29',
    covers: covers || [
      { code: 'MEDMAL' },
      { code: 'NAMED_EMPLOYEES', personId: 'p1' },
      { code: 'BUSINESS_EQUIPMENT', sumInsured: 10000 },
      { code: 'TREATMENT_SPMU' },
    ],
    people: [{ id: 'p1', name: 'Ada Lee', type: 'employee' }],
    ...extra,
  },
});
const ALL_AGREE = Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map(i => ['insDecl' + i, 'agree']));
const CONFIRMED = {
  insInformationAccurate: true,
  insEthicsAccepted: true,
  insDemandsNeedsAccepted: true,
  insNonAdvisedAccepted: true,
};

test('only a Non-Salon policy paid yearly is changed online; anything else says to call the office', () => {
  assert.equal(eligibility(cover()).online, true);
  assert.equal(eligibility(cover({ route: 'salon' })).online, false);
  assert.match(eligibility(cover({ paymentFrequency: 'Monthly' })).reason, /monthly/);
  assert.equal(eligibility(cover({ paymentFrequency: null })).online, false, 'an unknown plan is not offered');
  assert.equal(eligibility({ insurance: null }).online, false);
});
test('the start date runs from today up to 30 days ahead and never past the policy end', () => {
  assert.deepEqual(dateRange(cover(), NOW), { min: '2026-10-07', max: '2026-11-06' });
  assert.deepEqual(dateRange(cover({ endDate: '2026-10-20' }), NOW), { min: '2026-10-07', max: '2026-10-20' });
});
test('what can be chosen follows the cover held: treatments not held, teaching upgrade only, equipment raised only, Employers Liability added only', () => {
  const o = options(cover());
  assert.ok(!o.treatments.some(t => t.value === 'spmu'), 'a treatment already held is not offered');
  assert.equal(o.treatments.length, 4);
  assert.deepEqual(
    o.teaching.map(t => t.value),
    TEACHING.map(t => t.value),
  );
  assert.deepEqual(o.equipment, { current: 10000, tiers: [15000, 20000] });
  assert.deepEqual(o.employersLiability, { tiers: [1, 3, 5] });
  const standard = options(
    cover({}, [
      { code: 'TEACHING' },
      { code: 'EMPLOYERS_LIABILITY' },
      { code: 'BUSINESS_EQUIPMENT', sumInsured: null },
    ]),
  );
  assert.deepEqual(
    standard.teaching.map(t => t.value),
    ['additional'],
  );
  assert.match(standard.employersLiability.office, /office/);
  assert.match(standard.equipment.office, /could not confirm/, 'a level that cannot be verified goes to the office');
  assert.deepEqual(options(cover({}, [{ code: 'TEACHING_PLUS' }])).teaching, []);
  assert.match(options(cover({}, [])).equipment.office, /office/, 'new equipment needs the premises details');
});
test('the answers are sent the way new business sends them: I agree is the expected answer, the four confirmations are yes', () => {
  const r = answersToRequest({ ...ALL_AGREE, ...CONFIRMED, insQualifiedForTreatments: 'yes', insPatchTesting: 'yes' });
  assert.deepEqual(r.declarations, ['no', 'no', 'no', 'no', 'no', 'yes', 'yes']);
  assert.equal(r.insEthicsAccepted, 'yes');
  assert.deepEqual([r.qualified, r.patchTesting], ['yes', 'yes']);
  const dis = answersToRequest({ insDecl1: 'disagree', insDecl6: 'disagree' });
  assert.deepEqual(
    [dis.declarations[0], dis.declarations[5], dis.declarations[1]],
    ['yes', 'no', ''],
    'disagreeing is the other answer, unanswered is blank',
  );
  assert.equal(dis.insEthicsAccepted, '');
});
test('the body carries each non-empty change with the repeated answers, trims names and never carries a price', () => {
  const a = { ...emptyChange('2026-10-07'), addPeople: [{ type: 'subcontractor', firstName: ' Bo ', lastName: 'Ng' }] };
  const b = { ...emptyChange('2026-10-12'), treatments: ['spmu'] };
  const body = toBody('123', [a, emptyChange('2026-10-20'), b], { ...ALL_AGREE, ...CONFIRMED });
  assert.equal(body.service, 'insurance_change');
  assert.equal(body.recordId, '123');
  assert.equal(body.changes.length, 2, 'an empty change is not sent');
  assert.equal(body.changes[0].addPeople[0].firstName, 'Bo');
  assert.deepEqual(body.changes[1].declarations, ['no', 'no', 'no', 'no', 'no', 'yes', 'yes']);
  assert.ok(!JSON.stringify(body).match(/price|amount|total/i));
  assert.equal(MAX_CHANGES, 3);
});
test('problems are named before the member goes on: nothing chosen, a bad date, a missing name, teaching with no treatment', () => {
  const c = cover();
  assert.deepEqual(problems([emptyChange('2026-10-07')], c, NOW), ['Choose a change to make.']);
  assert.match(problems([{ ...emptyChange('2026-09-01'), treatments: ['dermaplaning'] }], c, NOW)[0], /start date/);
  assert.match(
    problems(
      [{ ...emptyChange('2026-10-07'), addPeople: [{ type: 'employee', firstName: '', lastName: 'X' }] }],
      c,
      NOW,
    )[0],
    /first name/,
  );
  const noTreatments = cover({}, [{ code: 'MEDMAL' }]);
  assert.match(
    problems([{ ...emptyChange('2026-10-07'), teaching: 'additional' }], noTreatments, NOW)[0],
    /treatment extension/,
  );
  assert.deepEqual(problems([{ ...emptyChange('2026-10-07'), treatments: ['dermaplaning'] }], c, NOW), []);
  assert.equal(isEmptyChange(emptyChange('2026-10-07')), true);
});
test('the declarations are done when every statement and confirmation is answered, and the treatment questions when a treatment is chosen', () => {
  const none = [{ ...emptyChange('2026-10-07'), addPeople: [{ type: 'employee', firstName: 'A', lastName: 'B' }] }];
  const withTreatment = [{ ...emptyChange('2026-10-07'), treatments: ['spmu'] }];
  assert.equal(declarationsDone({ ...ALL_AGREE, ...CONFIRMED }, none), true);
  assert.equal(
    declarationsDone({ ...ALL_AGREE, ...CONFIRMED }, withTreatment),
    false,
    'qualification and patch testing are asked',
  );
  assert.equal(
    declarationsDone(
      { ...ALL_AGREE, ...CONFIRMED, insQualifiedForTreatments: 'yes', insPatchTesting: 'yes' },
      withTreatment,
    ),
    true,
  );
  assert.equal(declarationsDone({ ...ALL_AGREE, ...CONFIRMED, insDecl3: undefined }, none), false);
  assert.equal(declarationsDone({ ...ALL_AGREE, ...CONFIRMED, insEthicsAccepted: false }, none), false);
});
