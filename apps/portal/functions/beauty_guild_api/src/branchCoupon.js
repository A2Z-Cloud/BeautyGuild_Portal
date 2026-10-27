'use strict';
// Phase 3: a discount on the additional branch. The branch recurs, so lowering its line would repeat the lower price at renewal. Instead the
// line keeps its full price and a Stripe coupon is made for this checkout only: a fixed amount, never more than the branch costs, `once`
// on a yearly purchase and `repeating` for 12 months on a monthly plan (the monthly share). Plan: docs/delivery/vouchers-review.md, phase 3.
const { form, PAYMENTS } = require('./plans');

// discountPence is the yearly discount from the engine. branchMonthlyPence is the branch line's monthly share on a monthly plan (after
// plans.splitMonthly); the coupon can never take more than that from one payment.
// Returns null when there is nothing to take off. totalPence is what the customer really gets: on a monthly plan it is the rounded
// monthly share times 12, which can differ from the staff member's figure by a few pence (the quote shows this figure).
function branchCouponPlan({ discountPence, listPence, monthly, branchMonthlyPence = 0 }) {
  const yearly = Math.min(discountPence, listPence);
  if (!(yearly > 0)) return null;
  if (!monthly) return { duration: 'once', months: null, amountOffPence: yearly, totalPence: yearly };
  const perPayment = Math.min(Math.round(yearly / PAYMENTS), branchMonthlyPence);
  if (!(perPayment > 0)) return null;
  return { duration: 'repeating', months: PAYMENTS, amountOffPence: perPayment, totalPence: perPayment * PAYMENTS };
}

// Creates the coupon. stripe(method, path, {body, key}) is the checkout helper. The key makes a retry of the same checkout reuse the coupon.
// The voucher id (or, for a waiver, the source) travels in the metadata so the invoice can be traced back to the record.
async function createBranchCoupon(stripe, plan, { entries = [], key }) {
  const first = entries[0] || {};
  const body = form({
    amount_off: plan.amountOffPence,
    currency: 'gbp',
    duration: plan.duration,
    ...(plan.months ? { duration_in_months: plan.months } : {}),
    max_redemptions: 1,
    name: 'Additional branch discount',
    metadata: {
      source: first.source || '',
      voucher_id: first.voucher_id || '',
      code: first.code || '',
      sku: 'MEM-BRANCH',
      portal: 'portal_v2',
    },
  });
  const coupon = await stripe('POST', '/coupons', { body, key });
  if (!coupon?.id) throw new Error('Stripe did not return a coupon.');
  return coupon.id;
}

module.exports = { branchCouponPlan, createBranchCoupon };
