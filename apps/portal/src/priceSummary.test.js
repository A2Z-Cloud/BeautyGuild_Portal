import test from 'node:test';
import assert from 'node:assert/strict';
import { dueToday, planSummary, thenCharge, upgradeCredit, waivedLine, offersCode } from './priceSummary.js';

const annual = {
  totalPence: 6500,
  lines: [
    { name: 'Associate Member membership (annual)', quantity: 1, unitPence: 5500, totalPence: 5500, interval: 'year' },
    { name: 'Membership joining fee', quantity: 1, unitPence: 1000, totalPence: 1000, interval: null },
  ],
};
const monthly = {
  totalPence: 692,
  plan: { payments: 12, firstPaymentPence: 692, laterPaymentPence: 609, yearOneTotalPence: 8304, adminFeePence: 150 },
  lines: [
    { name: 'Associate Member membership (monthly)', quantity: 1, unitPence: 459, totalPence: 459, interval: 'month' },
    { name: 'Membership joining fee', quantity: 1, unitPence: 83, totalPence: 83, interval: 'month' },
    { name: 'Monthly payment admin fee', quantity: 1, unitPence: 150, totalPence: 150, interval: 'month' },
  ],
};
const oneOff = {
  totalPence: 15780,
  lines: [{ name: 'Insurance - Medical Malpractice', quantity: 1, unitPence: 3250, totalPence: 3250, interval: null }],
};

test('due today is the whole first charge, including the first subscription payment and the one-off fees', () => {
  assert.equal(dueToday(annual), 6500);
  assert.equal(dueToday(monthly), 692);
  assert.equal(dueToday(oneOff), 15780);
  assert.equal(dueToday(null), 0);
});
test('after the first payment a yearly subscription charges its own price', () => {
  assert.deepEqual(thenCharge(annual), { pence: 5500, interval: 'year', yearly: null });
});
test('everything that renews is added up: membership, branches, insurance and its tax come back together each year', () => {
  const quote = {
    totalPence: 17420,
    lines: [
      { name: 'Full Member membership (annual)', totalPence: 5500, interval: 'year' },
      { name: 'Membership joining fee', totalPence: 1000, interval: null },
      { name: 'Insurance - Medical Malpractice', totalPence: 3250, interval: 'year' },
      { name: 'Insurance - Business Equipment', totalPence: 6500, interval: 'year' },
      { name: 'Insurance Premium Tax (12%)', totalPence: 1170, interval: 'year' },
    ],
  };
  assert.deepEqual(thenCharge(quote), { pence: 16420, interval: 'year', yearly: null });
});
test('a monthly plan has its own summary: the first 12 payments, then the ongoing payment, with the admin fee', () => {
  assert.equal(thenCharge(monthly), null);
  assert.deepEqual(planSummary(monthly), {
    payments: 12,
    firstPence: 692,
    laterPence: 609,
    adminPence: 150,
    same: false,
    yearOnePence: 8304,
  });
  assert.equal(
    planSummary({
      plan: {
        payments: 12,
        firstPaymentPence: 609,
        laterPaymentPence: 609,
        yearOneTotalPence: 7308,
        adminFeePence: 150,
      },
    }).same,
    true,
  );
  assert.equal(planSummary(annual), null);
  assert.equal(planSummary(null), null);
});
test('a purchase with nothing recurring has no later charge', () => {
  assert.equal(thenCharge(oneOff), null);
  assert.equal(thenCharge(null), null);
});

test('a waived joining fee is shown as a waived line, and the code box is offered only when a fee is due', () => {
  const discount = {
    code: 'ABC123',
    label: 'Joining fee waived (code ABC123)',
    amountPence: 1000,
    line: 'joining_fee',
    lineName: 'Membership joining fee',
    indicative: true,
  };
  assert.deepEqual(waivedLine({ discount }), {
    name: 'Membership joining fee',
    pence: 1000,
    label: 'Joining fee waived (code ABC123)',
    indicative: true,
  });
  assert.equal(waivedLine(annual), null);
  assert.equal(waivedLine(null), null);
  assert.equal(offersCode({ joiningFee: { due: true } }), true);
  assert.equal(offersCode({ joiningFee: { due: false } }), false);
  assert.equal(offersCode(annual), false, 'discounts off: the server sends no joiningFee, so no box');
  assert.equal(offersCode(null), false);
});

test('an upgrade shows the credit and what is left to pay, which is already the total due today', () => {
  const quote = {
    totalPence: 9857,
    upgrade: { creditPence: 4143, appliedPence: 4143, netPence: 9857, unusedDays: 275, termDays: 365 },
    lines: [],
  };
  assert.deepEqual(upgradeCredit(quote), { pence: 4143, netPence: 9857, unusedDays: 275, termDays: 365 });
  assert.equal(dueToday(quote), 9857);
  assert.equal(upgradeCredit({ totalPence: 100, lines: [] }), null);
  assert.equal(
    upgradeCredit({ upgrade: { creditPence: 0, appliedPence: 0, netPence: 100 } }),
    null,
    'nothing to credit, nothing shown',
  );
  assert.equal(upgradeCredit(null), null);
});
