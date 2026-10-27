'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { cleanChange, quoteChange, afterIns, quoteId, dayBefore } = require('../src/insuranceChange');
const { prorate } = require('../src/prorata');
const { evaluateRules } = require('../src/insurance');

const TODAY = '2026-10-07';
// A Non-Salon policy that started 30/09/2026 and ends 29/09/2027: from 07/10/2026 that is 358 of 365 days.
const DAYS = { days: 358, total: 365 };
const pro = pence => prorate(pence, DAYS);
const cover = (insuranceExtra = {}) => ({
  insurance: {
    id: 'pol1',
    route: 'non_salon',
    status: 'Active',
    startDate: '2026-09-30',
    endDate: '2027-09-29',
    paymentFrequency: 'Annual',
    covers: [
      { id: 'c1', code: 'MEDMAL', netPence: 3250 },
      { id: 'c2', code: 'NAMED_EMPLOYEES', netPence: 3250, personId: 'p1' },
      { id: 'c3', code: 'BUSINESS_EQUIPMENT', netPence: 6500, sumInsured: 5000 },
    ],
    people: [{ id: 'p1', name: 'Ada Lee', type: 'employee' }],
    premises: [{ id: 'm1', standardConstruction: 'yes', nonStandardOver15: 'no', country: 'United Kingdom' }],
    ...insuranceExtra,
  },
});
const q = (raw, c = cover()) =>
  quoteChange({ cover: c, change: cleanChange({ effectiveDate: TODAY, ...raw }), today: TODAY });
const codes = r => r.reasons.map(x => x.code);

test('a subcontractor is added at GBP 15 for the days left, IPT once on the net, and the fee applies', () => {
  const r = q({ addPeople: [{ type: 'subcontractor', firstName: 'Bo', lastName: 'Ng' }] });
  assert.equal(r.outcome, 'PASS');
  assert.equal(r.premiumNetPence, pro(1500));
  assert.equal(r.iptPence, Math.round(pro(1500) * 0.12));
  assert.equal(r.employeesCharged, 0, 'a subcontractor pays no membership fee');
  assert.equal(r.feeApplies, true);
  assert.equal(r.items[0].sku, 'INS-NAMED-SUB-NS');
});
test('an added employee pays the premium and is charged the pro-rated membership fee', () => {
  const r = q({ addPeople: [{ type: 'employee', firstName: 'Cy', lastName: 'Day' }] });
  assert.equal(r.outcome, 'PASS');
  assert.equal(r.premiumNetPence, pro(3250));
  assert.equal(r.employeesCharged, 1);
});
test('a like-for-like swap carries the membership fee over: only the GBP 5 fee is due', () => {
  const r = q({ removePeople: ['p1'], addPeople: [{ type: 'employee', firstName: 'Cy', lastName: 'Day' }] });
  assert.equal(r.outcome, 'PASS');
  assert.equal(r.premiumNetPence, 0);
  assert.equal(r.employeesCharged, 0);
  assert.equal(r.feeApplies, true, 'documents are re-issued, so the fee applies even with no price difference');
});
test('removals, an employee replaced by a subcontractor, more than four people and a refund go to the office', () => {
  assert.deepEqual(codes(q({ removePeople: ['p1'] })), ['REMOVAL']);
  assert.deepEqual(
    codes(q({ removePeople: ['p1'], addPeople: [{ type: 'subcontractor', firstName: 'Bo', lastName: 'Ng' }] })),
    ['REMOVAL'],
  );
  assert.deepEqual(codes(q({ removePeople: ['nope'] })).includes('UNKNOWN_PERSON'), true);
  const five = Array.from({ length: 4 }, (_, i) => ({ type: 'subcontractor', firstName: 'S' + i, lastName: 'X' }));
  assert.ok(codes(q({ addPeople: five })).includes('NAMED_PEOPLE_LIMIT'), 'one existing plus four added is five');
  // The old row was paid more than the new one costs, so the swap would leave a refund.
  const paidMore = cover({ covers: [{ id: 'c2', code: 'NAMED_EMPLOYEES', netPence: 9000, personId: 'p1' }] });
  assert.ok(
    codes(
      q({ removePeople: ['p1'], addPeople: [{ type: 'employee', firstName: 'Cy', lastName: 'Day' }] }, paidMore),
    ).includes('REFUND'),
  );
});
test('a subcontractor replaced by an employee is a payment: the new premium less the credit, and the employee pays the membership fee', () => {
  const c = cover({
    covers: [{ id: 'c2', code: 'NAMED_SUBCONTRACTORS', netPence: 1500, personId: 'p2' }],
    people: [{ id: 'p2', name: 'Bo Ng', type: 'subcontractor' }],
  });
  const r = q({ removePeople: ['p2'], addPeople: [{ type: 'employee', firstName: 'Cy', lastName: 'Day' }] }, c);
  assert.equal(r.outcome, 'PASS');
  assert.equal(r.premiumNetPence, pro(3250) - pro(1500));
  assert.equal(r.employeesCharged, 1);
});
test('treatments and teaching are priced from the new business rates; a standard to additional teaching change credits what was paid', () => {
  const t = q({ treatments: ['spmu'] });
  assert.equal(t.outcome, 'PASS');
  assert.equal(t.premiumNetPence, pro(17925));
  const withStandard = cover({
    covers: [
      { id: 'c4', code: 'TEACHING', netPence: 7500 },
      { id: 'c5', code: 'TREATMENT_SPMU', netPence: 17925 },
    ],
  });
  const up = q({ teaching: 'additional' }, withStandard);
  assert.equal(up.outcome, 'PASS');
  assert.equal(up.premiumNetPence, pro(15000) - pro(7500));
  assert.ok(
    codes(q({ teaching: 'additional' })).includes('TEACHING_NEEDS_TREATMENT'),
    'additional teaching needs a treatment',
  );
  assert.ok(codes(q({ treatments: ['spmu'] }, withStandard)).includes('ALREADY_HELD'));
});
test('equipment: only a verified increase goes online, priced as the new level less what was paid for the old', () => {
  const up = q({ equipmentTier: 20000 });
  assert.equal(up.outcome, 'PASS');
  assert.equal(up.premiumNetPence, pro(20000) - pro(6500));
  assert.equal(q({ equipmentTier: 5000 }).items.length, 0, 'the same level is not a change');
  const unknown = cover({ covers: [{ id: 'c3', code: 'BUSINESS_EQUIPMENT', netPence: 6500, sumInsured: null }] });
  assert.deepEqual(codes(q({ equipmentTier: 20000 }, unknown)), ['UNVERIFIED_COVER']);
  const ten = cover({ covers: [{ id: 'c3', code: 'BUSINESS_EQUIPMENT', netPence: 10000, sumInsured: 10000 }] });
  assert.deepEqual(codes(q({ equipmentTier: 5000 }, ten)), ['DOWNGRADE']);
  assert.deepEqual(codes(q({ equipmentTier: 5000 }, cover({ covers: [] }))), ['PREMISES_NEEDED']);
  const nonStandard = cover({
    premises: [{ id: 'm1', standardConstruction: 'no' }],
    covers: [{ id: 'c3', code: 'BUSINESS_EQUIPMENT', netPence: 9750, sumInsured: 5000 }],
  });
  assert.equal(
    q({ equipmentTier: 10000 }, nonStandard).premiumNetPence,
    pro(15000) - pro(9750),
    'non-standard construction rates',
  );
});
test("Employers' Liability: added when not held; a held level is never verified online, whatever Cover_Option says", () => {
  const add = q({ elTier: 1 });
  assert.equal(add.outcome, 'PASS');
  assert.equal(add.premiumNetPence, pro(7500));
  for (const option of [null, 'Up to 1', '1', 'Equipment band or EL band']) {
    const held = cover({ covers: [{ id: 'c6', code: 'EMPLOYERS_LIABILITY', netPence: 7500, option }] });
    assert.deepEqual(codes(q({ elTier: 3 }, held)), ['EL_OFFICE'], String(option));
  }
});
test('what Creator ends is recorded: a replaced row and a removed person, each up to the day before the new cover starts', () => {
  const swap = q({ removePeople: ['p1'], addPeople: [{ type: 'employee', firstName: 'Cy', lastName: 'Day' }] });
  assert.deepEqual(swap.endings, [
    { module: 'Insurance_Extension', id: 'c2', effectiveTo: '2026-10-06' },
    { module: 'Insured_People', id: 'p1', effectiveTo: '2026-10-06' },
  ]);
  const up = q({ equipmentTier: 10000 });
  assert.deepEqual(up.endings, [{ module: 'Insurance_Extension', id: 'c3', effectiveTo: '2026-10-06' }]);
  assert.deepEqual(q({ treatments: ['spmu'] }).endings, [], 'an addition ends nothing');
  assert.equal(dayBefore('2026-03-01'), '2026-02-28');
  assert.equal(dayBefore('2028-03-01'), '2028-02-29');
});
test('a Salon policy, a monthly or unknown payment plan, no policy, no choice and missing names are not paid online', () => {
  assert.ok(codes(q({ treatments: ['spmu'] }, cover({ route: 'salon' }))).includes('SALON_NOT_ONLINE'));
  assert.ok(codes(q({ treatments: ['spmu'] }, cover({ paymentFrequency: 'Monthly' }))).includes('PAYMENT_PLAN'));
  assert.ok(codes(q({ treatments: ['spmu'] }, cover({ paymentFrequency: null }))).includes('PAYMENT_PLAN'));
  assert.deepEqual(codes(q({ treatments: ['spmu'] }, { insurance: null })), ['NO_POLICY']);
  assert.deepEqual(codes(q({})), ['NOTHING_CHOSEN']);
  assert.ok(codes(q({ addPeople: [{ type: 'employee', firstName: '', lastName: '' }] })).includes('PERSON_NAME'));
});
test('the change is cleaned: unknown keys, bad tiers and unknown treatments are dropped, and a price is never read', () => {
  const c = cleanChange({
    effectiveDate: '2026-10-07',
    treatments: ['spmu', 'nope', 'spmu'],
    equipmentTier: 12345,
    elTier: 3,
    price: 1,
    addPeople: [{ type: 'x', firstName: ' A ', lastName: 'B' }],
  });
  assert.deepEqual(c.treatments, ['spmu']);
  assert.equal(c.equipmentTier, 0);
  assert.equal(c.elTier, 3);
  assert.equal(c.price, undefined);
  assert.equal(c.addPeople[0].type, 'employee');
  assert.equal(c.addPeople[0].firstName, 'A');
  assert.equal(cleanChange({ effectiveDate: 'tomorrow' }).effectiveDate, '');
});
test('the rules see the policy after the change: more than four people is a REFER, an untrue declaration refers, a refused treatment check stops', () => {
  const c = cover();
  const change = cleanChange({ effectiveDate: TODAY, treatments: ['spmu'], qualified: 'no' });
  const rules = evaluateRules(afterIns({ cover: c, change }), 'United Kingdom');
  assert.equal(rules.overall, 'STOP');
  const decl = cleanChange({
    effectiveDate: TODAY,
    treatments: ['spmu'],
    declarations: ['yes', 'no', 'no', 'no', 'no', 'yes', 'yes'],
    qualified: 'yes',
    patchTesting: 'yes',
  });
  assert.equal(evaluateRules(afterIns({ cover: c, change: decl }), 'United Kingdom').overall, 'REFER');
});
test('a quote reference is the same for the same cover and change, and different when either changes', () => {
  const c = cover();
  const change = cleanChange({ effectiveDate: TODAY, treatments: ['spmu'] });
  const quote = quoteChange({ cover: c, change, today: TODAY });
  const id = quoteId({ cover: c, change, quote });
  assert.match(id, /^QC-[0-9A-F]{16}$/);
  assert.equal(quoteId({ cover: c, change, quote }), id);
  const other = cleanChange({ effectiveDate: TODAY, treatments: ['dermaplaning'] });
  assert.notEqual(
    quoteId({ cover: c, change: other, quote: quoteChange({ cover: c, change: other, today: TODAY }) }),
    id,
  );
  const moved = cover({ covers: [{ id: 'c1', code: 'MEDMAL', netPence: 3250 }] });
  assert.notEqual(
    quoteId({ cover: moved, change, quote: quoteChange({ cover: moved, change, today: TODAY }) }),
    id,
    'the policy changed',
  );
});
