'use strict';
// POST /staff/cancellation and /staff/cancellation/retry through the real app (src/cancellationConfirm.js): the first route that changes money.
// It records first, ends the Stripe subscription, refunds, and can be repeated or resumed without refunding twice.
const test = require('node:test');
const assert = require('node:assert/strict');
const { IDS } = require('./helpers/world');
const { iso, DEAL } = require('./helpers/insurance-fixture');
const { withStaff } = require('./helpers/staff-harness');
const { cancelWorld, ASSOCIATE } = require('./helpers/cancel-world');

const ON = { PORTAL_CANCELLATIONS_ENABLED: 'true', PORTAL_CANCELLATION_WRITES_ENABLED: 'true' };
const ASK = (extra = {}) => ({
  contactId: IDS.me,
  membershipId: DEAL,
  scenario: 'cancel_full',
  effectiveDate: iso(30),
  ...extra,
});
// Quotes, then confirms exactly what the quote said (as the widget does).
async function confirmAfterQuote(call, ask = ASK(), over = {}) {
  const q = await call('/staff/cancellation/quote', ask);
  assert.equal(q.status, 200, JSON.stringify(q.body));
  assert.equal(q.body.quotable, true, JSON.stringify(q.body.blocking));
  return call('/staff/cancellation', {
    ...ask,
    confirmNetRefundPence: q.body.quote.netRefundPence,
    inputsHash: q.body.inputsHash,
    ...over,
  });
}
const stripeWrites = w => w.events.filter(e => e.startsWith('stripe:'));

test('confirm: the record is made first, the subscription ends at the effective date, one refund is made, and the Deal and policy are not touched', async () => {
  const w = cancelWorld();
  await withStaff(
    w,
    async ({ call }) => {
      const r = await confirmAfterQuote(call);
      assert.equal(r.status, 201, JSON.stringify(r.body));
      assert.equal(r.body.created, true);
      assert.equal(r.body.status, 'Completed');
      assert.equal(r.body.netRefundPence, 5680);
      assert.equal(r.body.refunds.length, 1);
    },
    ON,
  );
  // Order: the CRM record exists before any Stripe write.
  assert.equal(w.events[0], 'crm:create');
  assert.ok(w.events.indexOf('stripe:POST:/subscriptions/sub_1') > 0);
  // The record.
  const rec = w.cancellations[0];
  assert.equal(rec.Scenario, 'Cancel Full');
  assert.equal(rec.Cancellation_Status, 'Completed');
  assert.equal(rec.Net_Refund, '56.80');
  assert.equal(rec.Fee_Applied, '10.00');
  assert.match(rec.Requested_By, /Sam Staff \(1011174000000000042\)/);
  assert.match(rec.Inputs_Hash, /^[0-9a-f]{32}$/);
  // Stripe: ended at the effective date with no automatic proration, and one refund with an idempotency key.
  assert.equal(w.subscriptionPosts.length, 1);
  assert.equal(w.subscriptionPosts[0].get('proration_behavior'), 'none');
  assert.equal(
    Number(w.subscriptionPosts[0].get('cancel_at')),
    Date.UTC(
      ...iso(30)
        .split('-')
        .map((n, i) => (i === 1 ? n - 1 : +n)),
    ) / 1000,
  );
  assert.equal(w.refunds.length, 1);
  assert.equal(w.refunds[0].amount, 5680);
  assert.equal(w.refunds[0].payment_intent, 'pi_1');
  assert.equal(w.refunds[0].params.get('reason'), 'requested_by_customer');
  assert.match(w.refunds[0].idempotencyKey, /^cancel-\d+-pi_1-5680$/);
  assert.equal(w.refunds[0].metadata.cancellation_id, rec.id);
  // Never the Deal or the policy.
  assert.equal(w.writes.filter(u => /Deals|Insurance_Policy/.test(u)).length, 0);
});

test('an effective date of today ends the subscription now, without proration or a final invoice', async () => {
  const w = cancelWorld();
  await withStaff(
    w,
    async ({ call }) => assert.equal((await confirmAfterQuote(call, ASK({ effectiveDate: iso(0) }))).status, 201),
    ON,
  );
  assert.equal(w.subscriptionDeletes.length, 1);
  assert.match(w.subscriptionDeletes[0], /prorate=false/);
  assert.match(w.subscriptionDeletes[0], /invoice_now=false/);
  assert.equal(w.subscriptionPosts.length, 0);
  // Cooling off: everything paid is refunded in one refund.
  assert.equal(w.refunds[0].amount, 12780);
});

test('figures that changed since the quote are refused with the new quote, and nothing is recorded or changed', async () => {
  const w = cancelWorld();
  await withStaff(
    w,
    async ({ call }) => {
      const wrongNet = await confirmAfterQuote(call, ASK(), { confirmNetRefundPence: 9999 });
      assert.equal(wrongNet.status, 409);
      assert.equal(wrongNet.body.code, 'QUOTE_CHANGED');
      assert.equal(wrongNet.body.details.quote.netRefundPence, 5680);
      const wrongHash = await confirmAfterQuote(call, ASK(), { inputsHash: 'a'.repeat(32) });
      assert.equal(wrongHash.body.code, 'QUOTE_CHANGED');
      assert.equal((await confirmAfterQuote(call, ASK(), { inputsHash: 'nope' })).status, 422);
      assert.equal((await confirmAfterQuote(call, ASK(), { confirmNetRefundPence: '56.80' })).status, 422);
    },
    ON,
  );
  assert.deepEqual([w.cancellations.length, stripeWrites(w).length], [0, 0]);
});

test('if the CRM record cannot be made, Stripe is never touched', async () => {
  const w = cancelWorld({ noCancellationModule: true });
  await withStaff(
    w,
    async ({ call }) => {
      const r = await confirmAfterQuote(call);
      assert.equal(r.status, 502);
      assert.equal(r.body.code, 'CRM_UNAVAILABLE');
    },
    ON,
  );
  assert.equal(stripeWrites(w).length, 0);
  assert.equal(w.refunds.length, 0);
});

test('a field the CRM rejects is named in the log (never to the caller), and Stripe is still untouched', async () => {
  const w = cancelWorld({ noCancellationModule: 'badField' });
  const logs = [];
  const orig = console.log;
  console.log = line => logs.push(String(line));
  try {
    await withStaff(
      w,
      async ({ call }) => {
        const r = await confirmAfterQuote(call);
        assert.equal(r.status, 502);
        assert.deepEqual(r.body, {
          error: 'The CRM did not confirm the change. Nothing further was done.',
          code: 'CRM_UNAVAILABLE',
        });
      },
      ON,
    );
  } finally {
    console.log = orig;
  }
  const entry = JSON.parse(logs.find(l => l.includes('record_not_created')));
  assert.equal(entry.crmCode, 'INVALID_DATA');
  assert.equal(entry.crmField, 'Cancellation_Status');
  assert.equal(stripeWrites(w).length, 0);
});

test('confirming the same cancellation twice (a double click, a resend) is one cancellation: no second refund, no second call to end the subscription', async () => {
  const w = cancelWorld();
  await withStaff(
    w,
    async ({ call }) => {
      const quote = await call('/staff/cancellation/quote', ASK());
      const body = {
        ...ASK(),
        confirmNetRefundPence: quote.body.quote.netRefundPence,
        inputsHash: quote.body.inputsHash,
      };
      const first = await call('/staff/cancellation', body);
      assert.equal(first.status, 201, JSON.stringify(first.body));
      // The same request again: a new quote would now be refused (the subscription is ending), so the record is found by its hash.
      const again = await call('/staff/cancellation', body);
      assert.equal(again.status, 200, JSON.stringify(again.body));
      assert.equal(again.body.created, false);
      assert.equal(again.body.cancellationId, first.body.cancellationId);
      assert.equal(again.body.status, 'Completed');
    },
    ON,
  );
  assert.equal(w.cancellations.length, 1);
  assert.equal(w.refunds.length, 1);
  assert.equal(w.subscriptionPosts.length, 1);
});

test('a refund that fails leaves a resumable record; a repeat or a retry carries on, ends nothing twice and refunds once', async () => {
  const w = cancelWorld({ failRefunds: 1 });
  let id;
  await withStaff(
    w,
    async ({ call }) => {
      const r = await confirmAfterQuote(call);
      assert.equal(r.status, 502, JSON.stringify(r.body));
      assert.equal(r.body.details.status, 'Refund Failed');
      id = r.body.details.cancellationId;
      assert.equal(w.cancellations[0].Cancellation_Status, 'Refund Failed');
      assert.equal(w.subscriptionPosts.length, 1, 'the subscription is already ending');
      assert.equal(w.refunds.length, 0);
      // The retry resumes from the stored plan: the subscription is not ended again, and the refund is made.
      const retry = await call('/staff/cancellation/retry', { cancellationId: id });
      assert.equal(retry.status, 200, JSON.stringify(retry.body));
      assert.equal(retry.body.status, 'Completed');
      assert.equal(w.subscriptionPosts.length, 1);
      assert.equal(w.refunds.length, 1);
      assert.equal(w.refunds[0].amount, 5680);
      // A second retry changes nothing.
      const again = await call('/staff/cancellation/retry', { cancellationId: id });
      assert.equal(again.body.status, 'Completed');
      assert.equal(w.refunds.length, 1);
    },
    ON,
  );
});

test('a monthly payer: the refund is spread over the paid instalments, newest first, never more than each payment', async () => {
  const MONTHLY = {
    id: 'pol1',
    Application_Status: 'Active',
    Policy_Type: 'Non Salon',
    Policy_Start_Date: iso(0),
    Policy_End_Date: iso(364),
    Contact: { id: IDS.me },
    Membership: { id: DEAL },
    Payment_Frequency: 'Monthly',
  };
  // Cooling off: everything paid so far (£31.98) comes back, across the three instalments: £12.16, £12.16 and £7.66 of the oldest (£22.16).
  const w = cancelWorld({ monthly: true, over: { policy: MONTHLY } });
  await withStaff(
    w,
    async ({ call }) => {
      const r = await confirmAfterQuote(call, ASK({ effectiveDate: iso(0) }));
      assert.equal(r.status, 201, JSON.stringify(r.body));
      assert.equal(r.body.netRefundPence, 3198);
      assert.deepEqual(
        w.refunds.map(x => [x.payment_intent, x.amount]),
        [
          ['pi_3', 1216],
          ['pi_2', 1216],
          ['pi_1', 766],
        ],
      );
    },
    ON,
  );
  assert.equal(
    w.refunds.reduce((t, x) => t + x.amount, 0),
    3198,
  );
  assert.equal(w.subscriptionDeletes.length, 1, 'the remaining monthly payments stop');
});

test('a refund larger than the payments allow is refused before any refund is made', async () => {
  const w = cancelWorld({ invoiceAmount: 1000 });
  await withStaff(
    w,
    async ({ call }) => {
      const r = await confirmAfterQuote(call);
      assert.equal(r.status, 409, JSON.stringify(r.body));
      assert.equal(r.body.code, 'REFUND_EXCEEDS_PAYMENTS');
      assert.equal(r.body.details.status, 'Refund Failed');
    },
    ON,
  );
  assert.equal(w.refunds.length, 0);
});

test('Cancel Associate with no refund due ends the subscription and records it, with no refund', async () => {
  const w = cancelWorld({ over: ASSOCIATE });
  await withStaff(
    w,
    async ({ call }) => {
      const r = await confirmAfterQuote(call, ASK({ scenario: 'cancel_associate' }));
      assert.equal(r.status, 201, JSON.stringify(r.body));
      assert.equal(r.body.status, 'Completed');
      assert.equal(r.body.netRefundPence, 0);
    },
    ON,
  );
  assert.equal(w.refunds.length, 0);
  assert.equal(w.subscriptionPosts.length, 1);
  assert.equal(w.cancellations[0].Net_Refund, '0.00');
});

test('a cancellation that cannot be quoted cannot be confirmed, and says why', async () => {
  const w = cancelWorld({ subscription: { cancel_at: 1893456000 } });
  await withStaff(
    w,
    async ({ call }) => {
      const r = await call('/staff/cancellation', {
        ...ASK(),
        confirmNetRefundPence: 5680,
        inputsHash: 'a'.repeat(32),
      });
      assert.equal(r.status, 409);
      assert.equal(r.body.code, 'NOT_QUOTABLE');
      assert.ok(r.body.details.blocking.some(b => b.code === 'ALREADY_ENDING'));
    },
    ON,
  );
  assert.deepEqual([w.cancellations.length, stripeWrites(w).length], [0, 0]);
});

test('off unless both switches are on and the key is a test key; refused without a valid signature', async () => {
  const ask = { ...ASK(), confirmNetRefundPence: 5680, inputsHash: 'a'.repeat(32) };
  for (const env of [
    {},
    { PORTAL_CANCELLATIONS_ENABLED: 'true' },
    { PORTAL_CANCELLATION_WRITES_ENABLED: 'true' },
    { ...ON, STRIPE_SECRET_KEY: 'sk_live_not_allowed' },
  ]) {
    const w = cancelWorld();
    await withStaff(
      w,
      async ({ call }) => {
        const r = await call('/staff/cancellation', ask);
        assert.equal(r.status, 503, JSON.stringify(env));
        assert.equal(r.body.code, 'NOT_AVAILABLE');
        assert.equal((await call('/staff/cancellation/retry', { cancellationId: '3000000000000000001' })).status, 503);
      },
      env,
    );
    assert.deepEqual([w.cancellations.length, stripeWrites(w).length], [0, 0]);
  }
  await withStaff(
    cancelWorld(),
    async ({ call }) => assert.equal((await call('/staff/cancellation', ask, { secret: 'x'.repeat(40) })).status, 401),
    ON,
  );
});
