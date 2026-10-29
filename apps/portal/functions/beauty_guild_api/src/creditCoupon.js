'use strict';
// The credit for an Associate membership being upgraded to Full (docs/delivery/cancellations-refunds-spec.md, section 3.6) travels as a one-time
// Stripe coupon on the first invoice, the same mechanism as the additional branch discount: a fixed amount, `once`, for this checkout only, never
// more than the first payment. The Associate fee is NOT refunded in cash; it is credited against the new membership.
const { form } = require('./plans');

// Creates the coupon. stripe(method, path, {body, key}) is the checkout helper. The key makes a retry of the same checkout reuse the coupon.
async function createCreditCoupon(stripe, { amountOffPence, previousMembershipId }, { key }) {
  const body = form({
    amount_off: amountOffPence,
    currency: 'gbp',
    duration: 'once',
    max_redemptions: 1,
    name: 'Associate membership credit',
    metadata: {
      source: 'upgrade_credit',
      previous_membership_id: String(previousMembershipId || ''),
      portal: 'portal_v2',
    },
  });
  const coupon = await stripe('POST', '/coupons', { body, key });
  if (!coupon?.id) throw new Error('Stripe did not return a coupon.');
  return coupon.id;
}

module.exports = { createCreditCoupon };
