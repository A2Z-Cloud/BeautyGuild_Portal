'use strict';
// The refund and credit rules (docs/delivery/cancellations-refunds-spec.md section 3, the worked examples in 3.7). Pure functions: no CRM, no Stripe.
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  CancellationError,
  termEnd,
  dayCounts,
  isCoolingOff,
  insuranceRefundAnnual,
  insuranceRefundMonthly,
  membershipRefund,
  cancellationQuote,
  upgradeCredit,
  upgradeNet,
} = require('../src/cancellations');

const throwsCode = (fn, code) =>
  assert.throws(fn, e => e instanceof CancellationError && e.code === code, 'expected ' + code);

// A Full membership with a policy from 18 May 2026, £55.00 membership fee, £100.00 premium (IPT £12.00).
const POLICY = { billing: 'annual', start: '2026-05-18', end: '2027-05-17', premiumNetPence: 10000 };
const FULL = { scenario: 'cancel_full', membership: { paidPence: 5500 }, insurance: POLICY };

test('a term ends 364 days after it starts, which is 365 days counting both ends', () => {
  assert.equal(termEnd('2026-04-01'), '2027-03-31'); // the Guild's upgrade example
  assert.equal(termEnd('2026-09-02'), '2027-09-01'); // "Valid until 01/09/2027" on the portal
  assert.equal(termEnd('2026-01-01'), '2026-12-31');
  assert.equal(dayCounts({ start: '2026-01-01', end: '2026-12-31', effective: '2026-04-01' }).termDays, 365);
  // The rule always gives 365 days, even across a leap day (the end date moves back a day)...
  assert.equal(termEnd('2027-09-02'), '2028-08-31');
  assert.equal(dayCounts({ start: '2027-09-02', end: termEnd('2027-09-02'), effective: '2027-09-02' }).termDays, 365);
  // ...but a policy whose own dates span 29 February has 366 days, and the pro-rata counts them.
  assert.equal(dayCounts({ start: '2027-09-02', end: '2028-09-01', effective: '2027-09-02' }).termDays, 366);
});

test('used and unused days: the day of the change is unused, nothing is used before the start, nothing is unused after the end', () => {
  const t = { start: '2026-01-01', end: '2026-12-31' };
  assert.deepEqual(dayCounts({ ...t, effective: '2026-04-01' }), { termDays: 365, usedDays: 90, unusedDays: 275 });
  assert.deepEqual(dayCounts({ ...t, effective: '2026-01-01' }), { termDays: 365, usedDays: 0, unusedDays: 365 });
  assert.deepEqual(dayCounts({ ...t, effective: '2025-12-01' }), { termDays: 365, usedDays: 0, unusedDays: 365 });
  assert.deepEqual(dayCounts({ ...t, effective: '2026-12-31' }), { termDays: 365, usedDays: 364, unusedDays: 1 });
  assert.deepEqual(dayCounts({ ...t, effective: '2027-01-15' }), { termDays: 365, usedDays: 365, unusedDays: 0 });
});

test('cooling off runs to 14 days after the insurance start: 1 June qualifies for an 18 May start, 2 June does not', () => {
  assert.equal(isCoolingOff({ start: '2026-05-18', effective: '2026-05-18' }), true);
  assert.equal(isCoolingOff({ start: '2026-05-18', effective: '2026-06-01' }), true);
  assert.equal(isCoolingOff({ start: '2026-05-18', effective: '2026-06-02' }), false);
  assert.equal(isCoolingOff({ start: '2026-05-18', effective: '2026-05-01' }), true, 'cover had not begun');
});

test('annual payer: the unused share of the premium rounds down, and so does the IPT on it (£100 premium, 304 of 365 days)', () => {
  const r = insuranceRefundAnnual({
    premiumNetPence: 10000,
    start: '2026-05-18',
    end: '2027-05-17',
    effective: '2026-07-18',
  });
  assert.equal(r.usedDays, 61);
  assert.equal(r.unusedDays, 304);
  assert.equal(r.premiumRefundPence, 8328);
  assert.equal(r.iptRefundPence, 999);
  assert.equal(r.refundPence, 9327);
});

test('monthly payer: never more than was paid, the value used is rounded up, and IPT is capped at the IPT paid', () => {
  // Three instalments: £8.34 premium and £1.00 IPT each, so £25.02 and £3.00 paid. 61 days used.
  const r = insuranceRefundMonthly({
    annualPremiumNetPence: 10000,
    paidNetPence: 2502,
    paidIptPence: 300,
    start: '2026-05-18',
    end: '2027-05-17',
    effective: '2026-07-18',
  });
  assert.equal(r.usedNetPence, 1672);
  assert.equal(r.premiumRefundPence, 830);
  assert.equal(r.iptRefundPence, 99);
  // Used more than paid: no refund at all, never negative.
  const none = insuranceRefundMonthly({
    annualPremiumNetPence: 10000,
    paidNetPence: 834,
    paidIptPence: 100,
    start: '2026-05-18',
    end: '2027-05-17',
    effective: '2026-12-18',
  });
  assert.equal(none.premiumRefundPence, 0);
  assert.equal(none.iptRefundPence, 0);
  // The IPT refund never exceeds the IPT paid.
  assert.equal(
    insuranceRefundMonthly({
      annualPremiumNetPence: 10000,
      paidNetPence: 2502,
      paidIptPence: 10,
      start: '2026-05-18',
      end: '2027-05-17',
      effective: '2026-07-18',
    }).iptRefundPence,
    10,
  );
});

test('Cancel Full, annual, pro-rata: £93.27 of premium and IPT less the £10 fee is £83.27, and the membership fee is not refunded', () => {
  const q = cancellationQuote({ ...FULL, effectiveDate: '2026-07-18' });
  assert.equal(q.coolingOff, false);
  assert.equal(q.membership.refundPence, 0);
  assert.equal(q.insurance.premiumRefundPence, 8328);
  assert.equal(q.insurance.iptRefundPence, 999);
  assert.equal(q.grossRefundPence, 9327);
  assert.equal(q.feeAppliedPence, 1000);
  assert.equal(q.netRefundPence, 8327);
  assert.equal(q.noRefundDue, false);
});

test('Cancel Full in cooling off: the membership fee, premium and IPT are refunded in full, with no fee', () => {
  const q = cancellationQuote({ ...FULL, effectiveDate: '2026-05-25' });
  assert.equal(q.coolingOff, true);
  assert.equal(q.membership.refundPence, 5500);
  assert.equal(q.insurance.premiumRefundPence, 10000);
  assert.equal(q.insurance.iptRefundPence, 1200);
  assert.equal(q.feeAppliedPence, 0);
  assert.equal(q.netRefundPence, 16700);
  // The boundary day, and the day after.
  assert.equal(cancellationQuote({ ...FULL, effectiveDate: '2026-06-01' }).coolingOff, true);
  const after = cancellationQuote({ ...FULL, effectiveDate: '2026-06-02' });
  assert.equal(after.coolingOff, false);
  assert.equal(after.feeAppliedPence, 1000);
  // A staff override is not needed in cooling off and is ignored, with a warning.
  const ignored = cancellationQuote({
    ...FULL,
    membership: { paidPence: 5500, overridePence: 100 },
    effectiveDate: '2026-05-25',
  });
  assert.equal(ignored.membership.refundPence, 5500);
  assert.equal(ignored.warnings.length, 1);
});

test('the £10 fee is netted from the refund, never billed: a smaller refund gives £0 and "no refund due"', () => {
  const q = cancellationQuote({
    ...FULL,
    insurance: { ...POLICY, premiumNetPence: 750 },
    effectiveDate: '2026-06-02',
  });
  assert.ok(q.grossRefundPence > 0 && q.grossRefundPence < 1000);
  assert.equal(q.feeAppliedPence, q.grossRefundPence, 'the fee taken is only as much as there was to take');
  assert.equal(q.netRefundPence, 0);
  assert.equal(q.noRefundDue, true);
  // Nothing to refund at all is not "no refund due" and has no fee.
  const late = cancellationQuote({ ...FULL, effectiveDate: '2027-06-01' });
  assert.equal(late.grossRefundPence, 0);
  assert.equal(late.feeAppliedPence, 0);
  assert.equal(late.noRefundDue, false);
  assert.ok(late.warnings.some(w => /after the insurance end/.test(w)));
});

test('Cancel Full, monthly payer: refunds at most what was paid, so a refund below the fee is no refund', () => {
  const q = cancellationQuote({
    ...FULL,
    insurance: { ...POLICY, billing: 'monthly', paidNetPence: 2502, paidIptPence: 300 },
    effectiveDate: '2026-07-18',
  });
  assert.equal(q.insurance.premiumRefundPence, 830);
  assert.equal(q.insurance.iptRefundPence, 99);
  assert.equal(q.grossRefundPence, 929);
  assert.equal(q.netRefundPence, 0);
  assert.equal(q.noRefundDue, true);
});

test('Cancel Full: a staff override of the membership fee adds to the refund and the fee comes off the total', () => {
  const q = cancellationQuote({
    ...FULL,
    membership: { paidPence: 5500, overridePence: 2000 },
    effectiveDate: '2026-07-18',
  });
  assert.equal(q.membership.refundPence, 2000);
  assert.equal(q.membership.overridden, true);
  assert.equal(q.grossRefundPence, 11327);
  assert.equal(q.netRefundPence, 10327);
  // More than was paid is refused, not capped.
  throwsCode(
    () =>
      cancellationQuote({ ...FULL, membership: { paidPence: 5500, overridePence: 5501 }, effectiveDate: '2026-07-18' }),
    'OVERRIDE_TOO_HIGH',
  );
});

test('Cancel Associate: no refund by default, no fee ever, a staff override is allowed, and there is no insurance', () => {
  const base = { scenario: 'cancel_associate', effectiveDate: '2026-07-18', membership: { paidPence: 5500 } };
  const none = cancellationQuote(base);
  assert.deepEqual(
    [none.grossRefundPence, none.feeAppliedPence, none.netRefundPence, none.noRefundDue],
    [0, 0, 0, false],
  );
  const partial = cancellationQuote({ ...base, membership: { paidPence: 5500, overridePence: 2000 } });
  assert.deepEqual([partial.grossRefundPence, partial.feeAppliedPence, partial.netRefundPence], [2000, 0, 2000]);
  const full = cancellationQuote({ ...base, membership: { paidPence: 5500, overridePence: 5500 } });
  assert.equal(full.netRefundPence, 5500);
  throwsCode(() => cancellationQuote({ ...base, insurance: POLICY }), 'INSURANCE_NOT_ALLOWED');
});

test('Downgrade Full to Associate refunds as a Full cancellation does; a Full with no insurance has nothing to refund by default', () => {
  const down = cancellationQuote({ ...FULL, scenario: 'downgrade_full', effectiveDate: '2026-07-18' });
  assert.equal(down.netRefundPence, 8327);
  const noPolicy = cancellationQuote({
    scenario: 'cancel_full',
    effectiveDate: '2026-07-18',
    membership: { paidPence: 5500 },
  });
  assert.equal(noPolicy.insurance, null);
  assert.equal(noPolicy.netRefundPence, 0);
});

test('upgrade credit: the unused part of the membership fee, rounded down (£55.00, 275 of 365 days is £41.43)', () => {
  const r = upgradeCredit({
    membershipFeePence: 5500,
    start: '2026-01-01',
    end: '2026-12-31',
    upgradeDate: '2026-04-01',
  });
  assert.deepEqual(r, { creditPence: 4143, usedDays: 90, unusedDays: 275, termDays: 365 });
  // Upgrading on the first day credits the whole fee; at the end of the term nothing.
  assert.equal(
    upgradeCredit({ membershipFeePence: 5500, start: '2026-01-01', end: '2026-12-31', upgradeDate: '2026-01-01' })
      .creditPence,
    5500,
  );
  assert.equal(
    upgradeCredit({ membershipFeePence: 5500, start: '2026-01-01', end: '2026-12-31', upgradeDate: '2027-01-01' })
      .creditPence,
    0,
  );
});

test('upgrade credit, monthly payer: limited to what was paid, never negative', () => {
  const t = { membershipFeePence: 5500, start: '2026-01-01', end: '2026-12-31', upgradeDate: '2026-04-01' };
  assert.equal(upgradeCredit({ ...t, paidToDatePence: 1376 }).creditPence, 19);
  assert.equal(upgradeCredit({ ...t, paidToDatePence: 1000 }).creditPence, 0);
});

test('the net for an upgrade is the new total less the credit, never below zero, and the Guild example is £65', () => {
  assert.deepEqual(upgradeNet({ newTotalPence: 8500, creditPence: 2000 }), {
    creditAppliedPence: 2000,
    netPence: 6500,
  });
  assert.deepEqual(upgradeNet({ newTotalPence: 8500, creditPence: 9000 }), { creditAppliedPence: 8500, netPence: 0 });
  throwsCode(() => upgradeNet({ newTotalPence: -1, creditPence: 0 }), 'INVALID_AMOUNT');
});

test('membership refund: none without an override', () => {
  assert.deepEqual(membershipRefund({ paidPence: 5500 }), { refundPence: 0, overridden: false });
  assert.deepEqual(membershipRefund({ paidPence: 5500, overridePence: null }), { refundPence: 0, overridden: false });
  assert.deepEqual(membershipRefund({ paidPence: 5500, overridePence: 0 }), { refundPence: 0, overridden: true });
});

test('bad input is refused with a code, never rounded or guessed', () => {
  throwsCode(() => cancellationQuote({ ...FULL, effectiveDate: '2026-02-30' }), 'INVALID_DATE');
  throwsCode(() => cancellationQuote({ ...FULL, effectiveDate: '18/05/2026' }), 'INVALID_DATE');
  throwsCode(() => cancellationQuote({ ...FULL, effectiveDate: undefined }), 'INVALID_DATE');
  throwsCode(
    () => cancellationQuote({ ...FULL, scenario: 'cancel_everything', effectiveDate: '2026-07-18' }),
    'INVALID_SCENARIO',
  );
  throwsCode(
    () => cancellationQuote({ ...FULL, membership: { paidPence: 55.5 }, effectiveDate: '2026-07-18' }),
    'INVALID_AMOUNT',
  );
  throwsCode(
    () => cancellationQuote({ ...FULL, membership: { paidPence: -1 }, effectiveDate: '2026-07-18' }),
    'INVALID_AMOUNT',
  );
  throwsCode(
    () => cancellationQuote({ ...FULL, membership: { paidPence: '5500' }, effectiveDate: '2026-07-18' }),
    'INVALID_AMOUNT',
  );
  throwsCode(
    () => cancellationQuote({ ...FULL, insurance: { ...POLICY, billing: 'weekly' }, effectiveDate: '2026-07-18' }),
    'INVALID_BILLING',
  );
  throwsCode(
    () => cancellationQuote({ ...FULL, insurance: { ...POLICY, end: '2026-01-01' }, effectiveDate: '2026-07-18' }),
    'INVALID_DATE',
  );
  throwsCode(() => dayCounts({ start: '2026-05-18', end: 'x', effective: '2026-07-18' }), 'INVALID_DATE');
});

test('the same input always gives the same answer and the input is not changed', () => {
  const input = Object.freeze({
    ...FULL,
    effectiveDate: '2026-07-18',
    membership: Object.freeze({ paidPence: 5500 }),
    insurance: Object.freeze({ ...POLICY }),
  });
  assert.deepEqual(cancellationQuote(input), cancellationQuote(input));
});
