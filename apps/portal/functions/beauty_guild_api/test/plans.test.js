'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { allocate, splitMonthly, form } = require('../src/plans');

const line = (totalPence, term = 'ongoing') => ({ totalPence, term });

test('allocate shares exactly the target pence, whole pence first and the pence owed to the largest fractions', () => {
  assert.deepEqual(allocate([line(5500)], 459), [459]);
  const shares = allocate([line(5500), line(3250), line(6500), line(1170)], 1369);
  assert.equal(
    shares.reduce((t, n) => t + n, 0),
    1369,
  );
  assert.deepEqual(shares, [458, 271, 542, 98], 'the 3 pence owed go to .83, .67 and .50, in that order');
  assert.deepEqual(allocate([], 0), []);
});

test('monthly payments are the ongoing yearly total plus the admin fee divided by 12, rounded up; one-off items are added in full to the first payment', () => {
  const cases = [
    // [lines, first payment, later payment]
    [[line(5500)], 609, 609], // Associate renewal: £6.09
    [[line(5500), line(1000, 'year_one')], 1609, 609], // Associate new member: joining fee £10.00 in full, then £6.09
    [[line(5500), line(400, 'year_one')], 1009, 609], // Associate renewal with a badge: £4.00 in full, then £6.09
  ];
  for (const [lines, first, later] of cases) {
    const plan = splitMonthly(lines, 150);
    assert.equal(plan.firstPaymentPence, first);
    assert.equal(plan.laterPaymentPence, later);
    assert.equal(
      plan.lines.reduce((t, l) => t + l.monthlyPence, 0) + plan.oneOffPence + 150,
      plan.firstPaymentPence,
      'the lines add up to the payment',
    );
  }
  // Non-salon renewal: 55.00 + 32.50 + 3.90 = 91.40 a year, so £9.12 a month. Salon at the lowest band: 55 + 75 + 9 = 139.00, £13.09.
  assert.equal(splitMonthly([line(5500), line(3250), line(390)], 150).firstPaymentPence, 912);
  assert.equal(splitMonthly([line(5500), line(7500), line(900)], 150).firstPaymentPence, 1309);
  // Standard accreditation, 354.00 a year, is exactly £31.00 a month with the admin fee.
  assert.equal(splitMonthly([line(35400)], 150).firstPaymentPence, 3100);
});
test('the joining fee and add-ons are charged once with the first payment, so every later payment and renewal is the ongoing amount', () => {
  const lines = [line(5500), line(3250), line(390), line(1000, 'year_one'), line(400, 'year_one')];
  const plan = splitMonthly(lines, 150);
  const ongoing = plan.lines.filter(l => l.term === 'ongoing').reduce((t, l) => t + l.monthlyPence, 0);
  assert.equal(ongoing + 150, plan.laterPaymentPence);
  assert.equal(plan.laterPaymentPence, Math.ceil(9140 / 12) + 150);
  assert.equal(plan.oneOffPence, 1400);
  assert.equal(plan.firstPaymentPence, plan.laterPaymentPence + 1400);
  // A one-off line has no monthly share: it is charged at its full price.
  assert.deepEqual(
    plan.lines.filter(l => l.term === 'year_one').map(l => l.monthlyPence),
    [0, 0],
  );
  assert.equal(plan.yearOneTotalPence, plan.laterPaymentPence * 12 + 1400, 'what is paid in the first twelve months');
  assert.equal(plan.yearTwoTotalPence, plan.laterPaymentPence * 12, 'the same in every later year');
});

test('form encodes nested objects and arrays the way Stripe expects', () => {
  assert.equal(
    form({ a: 1, b: { c: 'x' }, d: [{ e: 2 }, { e: 3 }], skip: undefined }).toString(),
    new URLSearchParams([
      ['a', '1'],
      ['b[c]', 'x'],
      ['d[0][e]', '2'],
      ['d[1][e]', '3'],
    ]).toString(),
  );
});
