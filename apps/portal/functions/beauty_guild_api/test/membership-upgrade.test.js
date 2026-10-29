'use strict';
// Upgrade from Associate to Full with the unused Associate fee credited (docs/delivery/cancellations-refunds-spec.md section 3.6), through the real
// customer checkout. Behind PORTAL_MEMBERSHIP_UPGRADE_ENABLED; off, an upgrade is priced exactly as before.
const test = require('node:test');
const assert = require('node:assert/strict');
const { world, withApp, IDS } = require('./helpers/world');
const { UPGRADING, ASSOCIATE_SESSION, UPGRADE, INS_OK, BUY, FULL } = require('./helpers/scenarios');

const BODY = {
  ...BUY,
  level: 'full_non_salon',
  insurance: INS_OK,
  country: 'United Kingdom',
  previousId: IDS.deal,
  changeType: 'upgrade',
};
const upgrading = (over = {}) =>
  world({ deals: [UPGRADING], previousDeal: UPGRADING, associateSession: ASSOCIATE_SESSION, ...over });
const asked = (over = {}) => ({ ...BODY, ...over });

test('the quote credits the unused Associate fee (£55.00, 275 of 365 days left: £41.43) and shows what is left to pay', async () => {
  const off = await (async () => {
    let out;
    await withApp(upgrading(), async ({ quote }) => (out = await quote(asked())), {});
    return out;
  })();
  assert.equal(off.status, 200, JSON.stringify(off.body));
  assert.equal(off.body.quote.upgrade, undefined, 'with the switch off an upgrade is priced as before: no credit');
  await withApp(
    upgrading(),
    async ({ quote }) => {
      const on = await quote(asked());
      assert.equal(on.status, 200, JSON.stringify(on.body));
      const u = on.body.quote.upgrade;
      assert.deepEqual([u.creditPence, u.appliedPence, u.unusedDays, u.termDays], [4143, 4143, 275, 365]);
      assert.equal(u.associateEnds, UPGRADING.Expiry_Date);
      assert.equal(
        on.body.quote.totalPence,
        off.body.quote.totalPence - 4143,
        'the total is already net of the credit',
      );
      assert.equal(u.netPence, on.body.quote.totalPence);
    },
    UPGRADE,
  );
});

test('paying: one Stripe credit coupon for the credit, the metadata says so, and the total charged is the net', async () => {
  const state = upgrading();
  let net;
  await withApp(
    state,
    async ({ post, quote }) => {
      net = (await quote(asked())).body.quote.totalPence;
      const r = await post(asked());
      assert.equal(r.status, 201, JSON.stringify(r.body));
    },
    UPGRADE,
  );
  assert.equal(state.couponPosts.length, 1);
  const coupon = state.couponPosts[0].params;
  assert.equal(coupon.get('amount_off'), '4143');
  assert.equal(coupon.get('duration'), 'once');
  assert.equal(coupon.get('max_redemptions'), '1');
  assert.equal(coupon.get('metadata[previous_membership_id]'), IDS.deal);
  const params = state.stripePosts[0].params;
  assert.equal(params.get('discounts[0][coupon]'), 'coupon_test_1');
  assert.equal(params.get('metadata[change_type]'), 'upgrade');
  assert.equal(params.get('metadata[previous_membership_id]'), IDS.deal);
  assert.equal(params.get('metadata[upgrade_credit]'), '41.43');
  assert.equal(params.get('metadata[previous_subscription_id]'), 'sub_prev');
  assert.equal(params.get('metadata[total_amount]'), (net / 100).toFixed(2));
});

test('with the switch off nothing changes: no credit, no coupon and none of the new keys', async () => {
  const state = upgrading();
  await withApp(state, async ({ post }) => assert.equal((await post(asked())).status, 201), {});
  assert.equal(state.couponPosts.length, 0);
  const params = state.stripePosts[0].params;
  assert.equal(params.has('discounts[0][coupon]'), false);
  assert.equal(params.has('metadata[upgrade_credit]'), false);
  assert.equal(params.has('metadata[previous_subscription_id]'), false);
});

test('an Associate who pays monthly is credited what they have paid beyond the value used (4 shares of £4.59 paid, 90 days used: £4.77)', async () => {
  const monthly = {
    ...ASSOCIATE_SESSION,
    metadata: { ...ASSOCIATE_SESSION.metadata, subscription_type: 'monthly', base_membership_amount: '4.59' },
  };
  const paid = n =>
    Array.from({ length: n }, (_, i) => ({
      id: 'in_a' + i,
      amount_paid: 459,
      created: 1700000000 + i,
      lines: { data: [{ amount: 459, price: { id: 'price_assoc_mem' } }], has_more: false },
    }));
  const credit = async n => {
    let out;
    await withApp(
      upgrading({ associateSession: monthly, associateInvoices: paid(n) }),
      async ({ quote }) => (out = await quote(asked())),
      UPGRADE,
    );
    return out;
  };
  // The year is 12 shares (£55.08); 90 of 365 days are used, valued at £13.59 (rounded up); 4 shares paid is £18.36.
  const four = await credit(4);
  assert.equal(four.status, 200, JSON.stringify(four.body));
  assert.equal(four.body.quote.upgrade.creditPence, 477);
  // Paid no more than the value used: no credit, never negative.
  assert.equal((await credit(2)).body.quote.upgrade.creditPence, 0);
});

test('a credit larger than what is charged is capped at it, never paid out', async () => {
  const big = { ...ASSOCIATE_SESSION, metadata: { ...ASSOCIATE_SESSION.metadata, base_membership_amount: '5500.00' } };
  await withApp(
    upgrading({ associateSession: big }),
    async ({ quote }) => {
      const r = await quote(asked());
      assert.equal(r.status, 200, JSON.stringify(r.body));
      const u = r.body.quote.upgrade;
      assert.ok(u.creditPence > u.appliedPence);
      assert.equal(r.body.quote.totalPence, 0);
      assert.equal(u.netPence, 0);
    },
    UPGRADE,
  );
});

test('anything that is not an active, annual Associate membership with a confirmed payment is refused, not charged the full price', async () => {
  const refused = async (state, body, code = 'UPGRADE_NOT_AVAILABLE', status = 422) =>
    withApp(
      state,
      async ({ quote, post }) => {
        const q = await quote(body);
        assert.equal(q.status, status, JSON.stringify(q.body));
        assert.equal(q.body.code, code);
        assert.equal((await post(body)).status, status);
      },
      UPGRADE,
    );
  // The membership being upgraded is a Full membership.
  await refused(world({ deals: [FULL], previousDeal: FULL, associateSession: ASSOCIATE_SESSION }), asked());
  // Not Active.
  await refused(upgrading({ previousDeal: { ...UPGRADING, Stage: 'Expired' } }), asked());
  // No insurance, or an upgrade to Associate.
  await refused(upgrading(), asked({ insurance: undefined }));
  await refused(upgrading(), asked({ level: 'associate' }));
  // The Associate paid monthly, or the payment cannot be found in Stripe.
  const monthly = { ...ASSOCIATE_SESSION, metadata: { ...ASSOCIATE_SESSION.metadata, subscription_type: 'monthly' } };
  await refused(upgrading({ associateSession: monthly }), asked());
  await refused(world({ deals: [UPGRADING], previousDeal: UPGRADING }), asked());
  // Someone else's membership is not found.
  await refused(
    upgrading({ previousDeal: { ...UPGRADING, Contact_Name: { id: 'someone-else' } } }),
    asked(),
    'NOT_FOUND',
    404,
  );
});
