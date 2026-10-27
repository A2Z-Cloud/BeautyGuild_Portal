'use strict';
// Runs the portal against the real Stripe API in test mode (the CRM stays fake). The other tests use a fake Stripe, so they
// cannot notice when Stripe itself changes or when the Stripe catalogue drifts from the price list. This does:
//   1. every price list code has exactly one active price in Stripe, with the amount and interval the portal expects;
//   2. every purchase type makes a real Checkout Session that Stripe accepts (key limit, line shapes), whose total matches the
//      metadata Creator reads, and whose metadata Stripe stored as sent;
//   3. a real monthly subscription is put on its schedule by plans.ensureSchedule (12 months with every line, then the rest).
// Nothing is charged: sessions are expired straight away, and the subscription uses Stripe's test card in a throwaway
// customer that is deleted. Skipped unless STRIPE_TEST_KEY (an sk_test_ key) is set, so it never runs by accident:
//   STRIPE_TEST_KEY=sk_test_... npm run test:stripe        (in apps/portal)
const test = require('node:test');
const assert = require('node:assert/strict');
const plans = require('../src/plans');
const { world, withApp, PRICE_TABLE } = require('./helpers/world');
const { SCENARIOS } = require('./helpers/scenarios');

const KEY = String(process.env.STRIPE_TEST_KEY || '').trim();
const skip = KEY.startsWith('sk_test_')
  ? false
  : 'set STRIPE_TEST_KEY to an sk_test_ key to run against Stripe test mode';
const STRIPE = 'https://api.stripe.com/v1';

// Same shape as the checkout helper: stripe(method, path, { body, key }) returns the parsed body, and throws on an error.
async function stripe(method, path, params) {
  const r = await fetch(STRIPE + path, {
    method,
    headers: {
      Authorization: 'Bearer ' + KEY,
      ...(params ? { 'Content-Type': 'application/x-www-form-urlencoded', 'Idempotency-Key': params.key } : {}),
    },
    ...(params ? { body: params.body } : {}),
  });
  const body = await r.json();
  if (!r.ok) throw new Error('Stripe ' + method + ' ' + path.split('?')[0] + ': ' + (body.error?.message || r.status));
  return body;
}
const post = (path, obj) =>
  stripe('POST', path, {
    body: plans.form(obj),
    key: 'contract-' + Date.now() + '-' + Math.random().toString(36).slice(2),
  });

test('every price list code has one active Stripe price with the expected amount and interval', { skip }, async () => {
  assert.equal(Object.keys(PRICE_TABLE).length, 16);
  for (const [code, [pence, interval]] of Object.entries(PRICE_TABLE)) {
    const { data } = await stripe('GET', '/prices?active=true&lookup_keys[]=' + encodeURIComponent(code));
    assert.equal(data.length, 1, code + ': expected exactly one active price, found ' + data.length);
    const price = data[0];
    assert.equal(price.currency, 'gbp', code + ': currency');
    assert.equal(price.unit_amount, pence, code + ': amount in pence');
    assert.equal(price.recurring?.interval || null, interval, code + ': billing interval');
    assert.equal(price.livemode, false, code + ': must be test mode');
  }
});

test(
  'every purchase type makes a real Checkout Session that matches its metadata',
  { skip, timeout: 240000 },
  async () => {
    const made = [];
    try {
      for (const [label, opts, body] of SCENARIOS) {
        const state = world({ ...opts, liveStripe: true });
        let status;
        await withApp(
          state,
          async ({ post: checkout }) => {
            const r = await checkout(body);
            status = r.status;
            assert.equal(r.status, 201, label + ': ' + JSON.stringify(r.body));
            assert.match(r.body.checkoutUrl, /^https:\/\/checkout\.stripe\.com\//, label + ': checkout url');
          },
          { ...opts.env, STRIPE_SECRET_KEY: KEY },
        );
        made.push(...state.liveSessions);
        assert.equal(state.liveSessions.length, 1, label + ': one session');
        const sent = state.stripePosts[0].params;
        const session = await stripe('GET', '/checkout/sessions/' + state.liveSessions[0]);
        const lineItems = await stripe('GET', '/checkout/sessions/' + state.liveSessions[0] + '/line_items?limit=100');
        assert.equal(session.status, 'open', label);
        assert.equal(session.mode, sent.get('mode'), label + ': mode');
        // What Stripe stored is what the portal sent (Creator reads this).
        for (const [k, v] of sent.entries()) {
          const m = k.match(/^metadata\[(.+)\]$/);
          if (m && v !== '') assert.equal(session.metadata[m[1]], v, label + ': metadata ' + m[1]);
        }
        // The money Stripe will take now is the money the metadata says (accreditation calls it product_amount; an additional
        // venue sends no amount at all, so it is checked against the price list).
        const pounds = session.metadata.total_amount ?? session.metadata.product_amount;
        const expected = pounds === undefined ? PRICE_TABLE['ACC-VENUE'][0] : Math.round(Number(pounds) * 100);
        assert.equal(session.amount_total, expected, label + ': Stripe amount_total vs the amount in the metadata');
        const lines = new Set([...sent.keys()].map(k => k.match(/^line_items\[(\d+)\]/)?.[1]).filter(Boolean));
        assert.equal(lineItems.data.length, lines.size, label + ': line count');
        assert.equal(status, 201);
      }
    } finally {
      // Never leave a payable session open, even when an assertion fails.
      for (const id of made)
        await stripe('POST', '/checkout/sessions/' + id + '/expire', { body: '', key: 'expire-' + id }).catch(() => {});
    }
  },
);

test(
  'a monthly subscription is put on its schedule: 12 months with every line, then the lines that carry on',
  { skip, timeout: 120000 },
  async () => {
    let customer, subscription, schedule;
    const products = [];
    try {
      customer = await post('/customers', { name: 'ZZ contract test (safe to delete)' });
      const pm = await post('/payment_methods/pm_card_visa/attach', { customer: customer.id });
      await post('/customers/' + customer.id, { invoice_settings: { default_payment_method: pm.id } });
      // A subscription's inline price needs an existing product, so make them first (the sku and phase sit on the product, as the portal sends them).
      const item = async (name, pence, phase) => {
        const product = await post('/products', { name, metadata: { sku: 'MEM-JOIN', phase } });
        products.push(product.id);
        return {
          quantity: 1,
          price_data: { currency: 'gbp', unit_amount: pence, recurring: { interval: 'month' }, product: product.id },
        };
      };
      subscription = await post('/subscriptions', {
        customer: customer.id,
        items: [
          await item('ZZ test ongoing line', 500, 'ongoing'),
          await item('ZZ test year one line', 100, 'year_one'),
        ],
        metadata: { plan: 'monthly', phased: 'true' },
      });
      assert.equal(subscription.status, 'active', 'the test card should have paid the first month');

      assert.deepEqual(await plans.ensureSchedule(stripe, subscription.id), { status: 'scheduled', dropped: 1 });
      // Safe to run again: the webhook and the payment return page both call it.
      assert.deepEqual(await plans.ensureSchedule(stripe, subscription.id), { status: 'already' });

      const sub = await stripe('GET', '/subscriptions/' + subscription.id + '?expand[]=items.data.price.product');
      schedule = await stripe('GET', '/subscription_schedules/' + sub.schedule);
      assert.equal(schedule.end_behavior, 'release');
      assert.equal(schedule.phases.length, 2);
      assert.equal(schedule.phases[0].items.length, 2, 'phase one carries every line');
      assert.equal(schedule.phases[1].items.length, 1, 'phase two drops the year-one line');
      const months = (a, b) => Math.round((b - a) / (30.44 * 24 * 3600));
      assert.equal(months(schedule.phases[0].start_date, schedule.phases[0].end_date), plans.PAYMENTS);
      assert.equal(months(schedule.phases[1].start_date, schedule.phases[1].end_date), plans.PAYMENTS);
    } finally {
      if (schedule?.id)
        await stripe('POST', '/subscription_schedules/' + schedule.id + '/cancel', {
          body: '',
          key: 'c-' + schedule.id,
        }).catch(() => {});
      if (subscription?.id) await stripe('DELETE', '/subscriptions/' + subscription.id).catch(() => {});
      if (customer?.id) await stripe('DELETE', '/customers/' + customer.id).catch(() => {});
      // Keep the Stripe catalogue tidy: the products this test made are archived.
      for (const id of products) await post('/products/' + id, { active: false }).catch(() => {});
    }
  },
);

// Phase 3 (docs/delivery/vouchers-review.md): the additional branch discount is a per-checkout fixed amount coupon.
test(
  'a branch coupon is accepted on a subscription Checkout Session and takes its amount off the first invoice only',
  { skip, timeout: 120000 },
  async () => {
    const coupons = [];
    let session;
    try {
      const coupon = await post('/coupons', {
        amount_off: 500,
        currency: 'gbp',
        duration: 'once',
        max_redemptions: 1,
        name: 'ZZ contract test (safe to delete)',
        metadata: { voucher_id: 'v-test', sku: 'MEM-BRANCH' },
      });
      coupons.push(coupon.id);
      session = await post('/checkout/sessions', {
        mode: 'subscription',
        success_url: 'https://portal.example.test/ok',
        cancel_url: 'https://portal.example.test/no',
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: 'gbp',
              unit_amount: 1500,
              recurring: { interval: 'year' },
              product_data: { name: 'ZZ test branch', metadata: { sku: 'MEM-BRANCH' } },
            },
          },
        ],
        discounts: [{ coupon: coupon.id }],
      });
      assert.equal(session.total_details.amount_discount, 500);
      assert.equal(session.amount_total, 1000);
    } finally {
      if (session?.id) await post('/checkout/sessions/' + session.id + '/expire', {}).catch(() => {});
      for (const id of coupons) await stripe('DELETE', '/coupons/' + id).catch(() => {});
    }
  },
);

test(
  'a repeating 12 month branch coupon survives plans.ensureSchedule: it is in phase one of the schedule and on the first invoice',
  { skip, timeout: 120000 },
  async () => {
    let customer, subscription, schedule, coupon;
    const products = [];
    try {
      coupon = await post('/coupons', {
        amount_off: 83,
        currency: 'gbp',
        duration: 'repeating',
        duration_in_months: 12,
        max_redemptions: 1,
        name: 'ZZ contract test (safe to delete)',
        metadata: { voucher_id: 'v-test', sku: 'MEM-BRANCH' },
      });
      customer = await post('/customers', { name: 'ZZ contract test (safe to delete)' });
      const pm = await post('/payment_methods/pm_card_visa/attach', { customer: customer.id });
      await post('/customers/' + customer.id, { invoice_settings: { default_payment_method: pm.id } });
      const item = async (name, pence, phase) => {
        const product = await post('/products', { name, metadata: { sku: 'MEM-BRANCH', phase } });
        products.push(product.id);
        return {
          quantity: 1,
          price_data: { currency: 'gbp', unit_amount: pence, recurring: { interval: 'month' }, product: product.id },
        };
      };
      subscription = await post('/subscriptions', {
        customer: customer.id,
        items: [await item('ZZ test branch', 125, 'ongoing'), await item('ZZ test year one line', 100, 'year_one')],
        discounts: [{ coupon: coupon.id }],
        metadata: { plan: 'monthly', phased: 'true' },
        expand: ['latest_invoice'],
      });
      assert.equal(subscription.status, 'active');
      assert.equal(subscription.latest_invoice.total_discount_amounts[0].amount, 83, 'first payment');

      assert.deepEqual(await plans.ensureSchedule(stripe, subscription.id), { status: 'scheduled', dropped: 1 });
      const sub = await stripe('GET', '/subscriptions/' + subscription.id + '?expand[]=discounts');
      const onSub = (sub.discounts || []).map(d => d.source?.coupon?.id || d.source?.coupon || d.coupon?.id);
      assert.deepEqual(onSub, [coupon.id], 'the subscription still has the coupon after the schedule is applied');
      schedule = await stripe('GET', '/subscription_schedules/' + sub.schedule);
      const phaseCoupons = d =>
        (d || []).map(x => x.coupon?.id || x.coupon || x.source?.coupon?.id || x.source?.coupon);
      assert.deepEqual(phaseCoupons(schedule.phases[0].discounts), [coupon.id], 'phase one carries the coupon');
      assert.deepEqual(phaseCoupons(schedule.phases[1].discounts), [], 'phase two (payment 13 onward) has none');
    } finally {
      if (schedule?.id)
        await stripe('POST', '/subscription_schedules/' + schedule.id + '/cancel', {
          body: '',
          key: 'c-' + schedule.id,
        }).catch(() => {});
      if (subscription?.id) await stripe('DELETE', '/subscriptions/' + subscription.id).catch(() => {});
      if (customer?.id) await stripe('DELETE', '/customers/' + customer.id).catch(() => {});
      if (coupon?.id) await stripe('DELETE', '/coupons/' + coupon.id).catch(() => {});
      for (const id of products) await post('/products/' + id, { active: false }).catch(() => {});
    }
  },
);
