'use strict';
// Runs the portal against the real Stripe API in test mode (the CRM stays fake). The other tests use a fake Stripe, so they
// cannot notice when Stripe itself changes or when the Stripe catalogue drifts from the price list. This does:
//   1. every price list code has exactly one active price in Stripe, with the amount and interval the portal expects;
//   2. every purchase type makes a real Checkout Session that Stripe accepts (key limit, line shapes), whose total matches the
//      metadata Creator reads, and whose metadata Stripe stored as sent;
//   (A monthly plan's joining fee and add-ons are one-off lines on the first invoice, so there is no schedule to test.)
// Nothing is charged: sessions are expired straight away. Skipped unless STRIPE_TEST_KEY (an sk_test_ key) is set, so it never runs by accident:
//   STRIPE_TEST_KEY=sk_test_... npm run test:stripe        (in apps/portal)
const test = require('node:test');
const assert = require('node:assert/strict');
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
          { STRIPE_SECRET_KEY: KEY },
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
