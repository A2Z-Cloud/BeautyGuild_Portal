'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { allocate, splitMonthly, ensureSchedule, verifyStripeSignature, form } = require('../src/plans');

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
test("monthly payments are the yearly total plus the admin fee divided by 12, rounded up: the Guild's price list examples", () => {
  const cases = [
    // [lines, first payment, later payment]
    [[line(5500)], 609, 609], // Associate renewal: £6.09
    [[line(5500), line(1000, 'year_one')], 692, 609], // Associate new member: £6.92, then £6.09
    [[line(5500), line(400, 'year_one')], 642, 609], // Associate renewal with a badge: £6.42
  ];
  for (const [lines, first, later] of cases) {
    const plan = splitMonthly(lines, 150);
    assert.equal(plan.firstPaymentPence, first);
    assert.equal(plan.laterPaymentPence, later);
    assert.equal(
      plan.lines.reduce((t, l) => t + l.monthlyPence, 0) + 150,
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
test('the ongoing lines pay the same in both years, so only the year-one lines have to stop after payment 12', () => {
  const lines = [line(5500), line(3250), line(390), line(1000, 'year_one'), line(400, 'year_one')];
  const plan = splitMonthly(lines, 150);
  const ongoing = plan.lines.filter(l => l.term === 'ongoing').reduce((t, l) => t + l.monthlyPence, 0);
  const yearOne = plan.lines.filter(l => l.term === 'year_one').reduce((t, l) => t + l.monthlyPence, 0);
  assert.equal(ongoing + 150, plan.laterPaymentPence);
  assert.equal(ongoing + yearOne + 150, plan.firstPaymentPence);
  assert.equal(plan.laterPaymentPence, Math.ceil(9140 / 12) + 150);
  assert.equal(plan.firstPaymentPence, Math.ceil(10540 / 12) + 150);
  assert.equal(plan.yearOneTotalPence, plan.firstPaymentPence * 12);
});

function fakeStripe(sub) {
  const calls = [];
  const stripe = async (method, path, params) => {
    calls.push({ method, path, body: params?.body ? new URLSearchParams(params.body) : null, key: params?.key });
    if (method === 'GET' && path.startsWith('/subscriptions/')) return sub;
    if (method === 'POST' && path === '/subscription_schedules')
      return { id: 'sub_sched_1', phases: [{ start_date: 1760000000 }] };
    return {};
  };
  return { stripe, calls };
}
const item = (id, phase, quantity = 1) => ({ price: { id, product: { metadata: phase ? { phase } : {} } }, quantity });

test('a monthly plan is put on a schedule: every line for 12 months, then the ongoing lines, released afterwards', async () => {
  const { stripe, calls } = fakeStripe({
    id: 'sub_abc123',
    status: 'active',
    schedule: null,
    items: { data: [item('price_member', 'ongoing'), item('price_join', 'year_one'), item('price_admin', null)] },
  });
  assert.deepEqual(await ensureSchedule(stripe, 'sub_abc123'), { status: 'scheduled', dropped: 1 });
  const set = calls.find(c => c.path === '/subscription_schedules/sub_sched_1').body;
  assert.equal(set.get('end_behavior'), 'release');
  assert.equal(set.get('phases[0][start_date]'), '1760000000');
  assert.deepEqual(
    [0, 1, 2].map(i => set.get(`phases[0][items][${i}][price]`)),
    ['price_member', 'price_join', 'price_admin'],
  );
  assert.deepEqual(
    [0, 1].map(i => set.get(`phases[1][items][${i}][price]`)),
    ['price_member', 'price_admin'],
  );
  assert.equal(set.get('phases[1][items][2][price]'), null);
  assert.equal(set.get('phases[0][duration][interval]'), 'month');
  assert.equal(set.get('phases[0][duration][interval_count]'), '12');
  assert.equal(set.get('phases[1][proration_behavior]'), 'none');
});
test('a branch coupon on the subscription is passed into phase one of the schedule, and phase two carries none', async () => {
  const { stripe, calls } = fakeStripe({
    id: 'sub_abc123',
    status: 'active',
    schedule: null,
    discounts: [{ id: 'di_1', source: { type: 'coupon', coupon: { id: 'co_test_1' } } }],
    items: { data: [item('price_member', 'ongoing'), item('price_join', 'year_one')] },
  });
  assert.equal((await ensureSchedule(stripe, 'sub_abc123')).status, 'scheduled');
  assert.match(calls[0].path, /expand\[\]=discounts/);
  const set = calls.find(c => c.path === '/subscription_schedules/sub_sched_1').body;
  assert.equal(set.get('phases[0][discounts][0][coupon]'), 'co_test_1');
  assert.equal(set.get('phases[1][discounts][0][coupon]'), null);
  // No coupon: the request is exactly as before.
  const plain = fakeStripe({
    id: 'sub_abc123',
    status: 'active',
    schedule: null,
    discounts: [],
    items: { data: [item('price_member', 'ongoing'), item('price_join', 'year_one')] },
  });
  await ensureSchedule(plain.stripe, 'sub_abc123');
  assert.equal(
    plain.calls.find(c => c.path === '/subscription_schedules/sub_sched_1').body.get('phases[0][discounts][0][coupon]'),
    null,
  );
});
test('ensureSchedule leaves alone a subscription with a schedule, nothing to drop, or no longer active, and is safe to repeat', async () => {
  const none = fakeStripe({
    id: 'sub_abc123',
    status: 'active',
    schedule: null,
    items: { data: [item('price_member', 'ongoing'), item('price_admin', null)] },
  });
  assert.equal((await ensureSchedule(none.stripe, 'sub_abc123')).status, 'none');
  assert.equal(
    none.calls.some(c => c.method === 'POST'),
    false,
  );
  const has = fakeStripe({
    id: 'sub_abc123',
    status: 'active',
    schedule: 'sub_sched_9',
    items: { data: [item('price_member', 'ongoing'), item('price_join', 'year_one')] },
  });
  assert.equal((await ensureSchedule(has.stripe, 'sub_abc123')).status, 'already');
  assert.equal(
    has.calls.some(c => c.method === 'POST'),
    false,
  );
  const dead = fakeStripe({
    id: 'sub_abc123',
    status: 'canceled',
    schedule: null,
    items: { data: [item('price_join', 'year_one')] },
  });
  assert.equal((await ensureSchedule(dead.stripe, 'sub_abc123')).status, 'inactive');
  assert.equal((await ensureSchedule(none.stripe, 'not-a-subscription')).status, 'invalid');
});
test('if two callers race and the schedule appears first, the loser reports already, not an error', async () => {
  let reads = 0;
  const stripe = async (method, path) => {
    if (method === 'GET' && path.startsWith('/subscriptions/')) {
      reads++;
      return reads === 1
        ? {
            id: 'sub_abc123',
            status: 'active',
            schedule: null,
            items: { data: [item('a', 'ongoing'), item('b', 'year_one')] },
          }
        : { id: 'sub_abc123', schedule: 'sub_sched_2' };
    }
    throw new Error('Secure checkout is unavailable.');
  };
  assert.equal((await ensureSchedule(stripe, 'sub_abc123')).status, 'already');
});

test('the Stripe signature must match the body, the secret and be recent', () => {
  const secret = 'whsec_test_secret',
    now = 1760000000000,
    t = String(now / 1000),
    body = Buffer.from('{"id":"evt_1"}');
  const sign = (b, s = secret, ts = t) =>
    't=' +
    ts +
    ',v1=' +
    crypto
      .createHmac('sha256', s)
      .update(ts + '.')
      .update(b)
      .digest('hex');
  assert.equal(verifyStripeSignature(body, sign(body), secret, now), true);
  assert.equal(
    verifyStripeSignature(Buffer.from('{"id":"evt_2"}'), sign(body), secret, now),
    false,
    'a different body',
  );
  assert.equal(verifyStripeSignature(body, sign(body, 'whsec_other'), secret, now), false, 'a different secret');
  assert.equal(
    verifyStripeSignature(body, sign(body, secret, String(now / 1000 - 600)), secret, now),
    false,
    'too old',
  );
  assert.equal(verifyStripeSignature(body, '', secret, now), false);
  assert.equal(verifyStripeSignature(body, sign(body), '', now), false, 'no secret configured');
  assert.equal(verifyStripeSignature(String(body), sign(body), secret, now), false, 'must be the raw bytes');
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
