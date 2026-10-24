import test from 'node:test';
import assert from 'node:assert/strict';
import { dueToday, planSummary, thenCharge } from './priceSummary.js';

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
