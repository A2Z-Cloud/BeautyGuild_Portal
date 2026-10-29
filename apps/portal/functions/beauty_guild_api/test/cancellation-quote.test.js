'use strict';
// POST /staff/cancellation/quote through the real app (src/cancellationQuote.js, spec section 6.1): read only, money from Stripe, facts from the CRM,
// and a named refusal whenever a fact cannot be verified.
const test = require('node:test');
const assert = require('node:assert/strict');
const { IDS } = require('./helpers/world');
const { iso, ME, DEAL } = require('./helpers/insurance-fixture');
const { withStaff } = require('./helpers/staff-harness');

const ON = { PORTAL_CANCELLATIONS_ENABLED: 'true' };
const ASK = (extra = {}) => ({
  contactId: IDS.me,
  membershipId: DEAL,
  scenario: 'cancel_full',
  effectiveDate: iso(30),
  ...extra,
});

const { cancelWorld, ASSOCIATE } = require('./helpers/cancel-world');
const blockedWith = async (w, body, code, env = ON) => {
  await withStaff(
    w,
    async ({ call }) => {
      const r = await call('/staff/cancellation/quote', body);
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.quotable, false);
      assert.equal(r.body.quote, null);
      assert.ok(
        r.body.blocking.some(b => b.code === code),
        'expected ' + code + ' in ' + JSON.stringify(r.body.blocking),
      );
    },
    env,
  );
};

test('Cancel Full, annual: the refund is worked out from what Stripe says was paid, and nothing is written or changed', async () => {
  const w = cancelWorld();
  await withStaff(
    w,
    async ({ call }) => {
      const r = await call('/staff/cancellation/quote', ASK());
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.quotable, true);
      const q = r.body.quote;
      assert.equal(q.coolingOff, false);
      assert.equal(q.insurance.unusedDays, 335);
      assert.equal(q.insurance.premiumRefundPence, 5965);
      assert.equal(q.insurance.iptRefundPence, 715);
      assert.equal(q.membership.paidPence, 5500);
      assert.equal(q.membership.refundPence, 0);
      assert.equal(q.feeAppliedPence, 1000);
      assert.equal(q.netRefundPence, 5680);
      assert.deepEqual(r.body.stripe.subscriptions, [{ id: 'sub_1', status: 'active', endsAt: iso(30) }]);
      assert.match(r.body.inputsHash, /^[0-9a-f]{32}$/);
      assert.equal(r.body.contact.id, IDS.me);
    },
    ON,
  );
  assert.equal(w.writes.length, 0, 'nothing written to the CRM');
  assert.ok(w.stripeCalls.length > 0);
  assert.ok(
    w.stripeCalls.every(c => c.method === 'GET'),
    'Stripe is only read',
  );
});

test('cooling off refunds everything with no fee, and a staff override is ignored with a warning', async () => {
  await withStaff(
    cancelWorld(),
    async ({ call }) => {
      const r = await call('/staff/cancellation/quote', ASK({ effectiveDate: iso(0) }));
      const q = r.body.quote;
      assert.equal(q.coolingOff, true);
      assert.equal(q.feeAppliedPence, 0);
      assert.equal(q.netRefundPence, 5500 + 6500 + 780);
      const ignored = await call(
        '/staff/cancellation/quote',
        ASK({ effectiveDate: iso(0), membershipRefundPence: 100, overrideReason: 'Goodwill' }),
      );
      assert.ok(ignored.body.warnings.some(x => /override was ignored/.test(x.message)));
    },
    ON,
  );
});

test('a membership fee override needs a reason, adds to the refund, and the fee comes off the total', async () => {
  await withStaff(
    cancelWorld(),
    async ({ call }) => {
      assert.equal((await call('/staff/cancellation/quote', ASK({ membershipRefundPence: 2000 }))).status, 422);
      assert.equal(
        (await call('/staff/cancellation/quote', ASK({ membershipRefundPence: 20.5, overrideReason: 'x' }))).status,
        422,
      );
      const r = await call(
        '/staff/cancellation/quote',
        ASK({ membershipRefundPence: 2000, overrideReason: 'Goodwill' }),
      );
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.quote.membership.refundPence, 2000);
      assert.equal(r.body.quote.membership.overridden, true);
      assert.equal(r.body.quote.netRefundPence, 5680 + 2000);
      assert.equal(r.body.quote.overrideReason, 'Goodwill');
      // More than was paid is refused by the engine as a 4xx-style refusal, never capped.
      const tooMuch = await call(
        '/staff/cancellation/quote',
        ASK({ membershipRefundPence: 6000, overrideReason: 'x' }),
      );
      assert.equal(tooMuch.status, 422);
      assert.equal(tooMuch.body.code, 'OVERRIDE_TOO_HIGH');
    },
    ON,
  );
});

test('Cancel Associate (no policy): no refund and no fee by default; an override is refunded in full with no fee', async () => {
  const w = cancelWorld({ over: ASSOCIATE });
  await withStaff(
    w,
    async ({ call }) => {
      const none = await call('/staff/cancellation/quote', ASK({ scenario: 'cancel_associate' }));
      assert.equal(none.status, 200, JSON.stringify(none.body));
      assert.deepEqual(
        [none.body.quote.insurance, none.body.quote.netRefundPence, none.body.quote.feeAppliedPence],
        [null, 0, 0],
      );
      const partial = await call(
        '/staff/cancellation/quote',
        ASK({ scenario: 'cancel_associate', membershipRefundPence: 2000, overrideReason: 'Goodwill' }),
      );
      assert.deepEqual([partial.body.quote.netRefundPence, partial.body.quote.feeAppliedPence], [2000, 0]);
    },
    ON,
  );
  assert.equal(w.writes.length, 0);
});

test('the same input gives the same hash, and a different date gives a different one', async () => {
  await withStaff(
    cancelWorld(),
    async ({ call }) => {
      const a = await call('/staff/cancellation/quote', ASK());
      const b = await call('/staff/cancellation/quote', ASK());
      const c = await call('/staff/cancellation/quote', ASK({ effectiveDate: iso(31) }));
      assert.equal(a.body.inputsHash, b.body.inputsHash);
      assert.notEqual(a.body.inputsHash, c.body.inputsHash);
    },
    ON,
  );
});

test('a monthly payer is refused for now, before any Stripe call', async () => {
  const w = cancelWorld({
    over: {
      policy: {
        id: 'pol1',
        Application_Status: 'Active',
        Policy_Type: 'Non Salon',
        Policy_Start_Date: iso(0),
        Policy_End_Date: iso(364),
        Contact: { id: ME },
        Membership: { id: DEAL },
        Payment_Frequency: 'Monthly',
      },
    },
  });
  await blockedWith(w, ASK(), 'MONTHLY_NOT_SUPPORTED_YET');
  assert.equal(w.stripeCalls.length, 0);
});

test('a membership paid monthly in Stripe is refused for now', async () => {
  await blockedWith(
    cancelWorld({ session: { metadata: { subscription_type: 'monthly' } } }),
    ASK(),
    'MONTHLY_NOT_SUPPORTED_YET',
  );
});

test('a term Stripe cannot match (renewed, or paid a moment ago) is refused, not guessed', async () => {
  await blockedWith(
    cancelWorld({ session: { metadata: { membership_start: '2020-01-01' } } }),
    ASK(),
    'TERM_NOT_VERIFIED',
  );
  await blockedWith(cancelWorld({ session: { metadata: { contact_id: '999' } } }), ASK(), 'TERM_NOT_VERIFIED');
  await blockedWith(cancelWorld({ session: { payment_status: 'unpaid' } }), ASK(), 'TERM_NOT_VERIFIED');
});

test('a policy whose premium no longer matches what was paid is refused (it was changed since purchase)', async () => {
  await blockedWith(
    cancelWorld({ session: { metadata: { insurance_net_amount: '60.00' } } }),
    ASK(),
    'AMOUNTS_DISAGREE',
  );
  await blockedWith(
    cancelWorld({ session: { metadata: { base_membership_amount: 'fifty-five' } } }),
    ASK(),
    'AMOUNT_UNREADABLE',
  );
  await blockedWith(cancelWorld({ policySession: '' }), ASK(), 'NO_PAYMENT_RECORD');
});

test('a subscription that also holds accreditation, or has already ended, is never cancelled by a membership cancellation', async () => {
  const mixed = { items: { data: [{ price: { lookup_key: 'MEM-FULLNS-Y' } }, { price: { lookup_key: 'ACC-STD' } }] } };
  await blockedWith(cancelWorld({ subscription: mixed }), ASK(), 'MIXED_SUBSCRIPTION');
  await blockedWith(cancelWorld({ subscription: { cancel_at: 1893456000 } }), ASK(), 'ALREADY_ENDING');
  await blockedWith(cancelWorld({ subscription: { status: 'canceled' } }), ASK(), 'ALREADY_ENDING');
});

test('a membership that is not active, or has a renewal policy, is refused with a reason', async () => {
  const inactive = {
    deal: {
      id: DEAL,
      Deal_Name: 'Full',
      Stage: 'Expired',
      Membership_Type: 'Full Member (Non-Salon)',
      Start_Date: iso(-5),
      Expiry_Date: iso(360),
      Contact_Name: { id: ME },
    },
  };
  await blockedWith(cancelWorld({ over: inactive }), ASK(), 'NOT_ACTIVE');
  const pol = n => ({
    id: 'pol' + n,
    Application_Status: 'Active',
    Policy_Type: 'Non Salon',
    Policy_Start_Date: iso(n === 1 ? 0 : 200),
    Policy_End_Date: iso(n === 1 ? 364 : 560),
    Contact: { id: ME },
    Membership: { id: DEAL },
    Payment_Frequency: 'Annual',
  });
  await blockedWith(cancelWorld({ over: { policies: [pol(1), pol(2)] } }), ASK(), 'RENEWAL_EXISTS');
});

test("the scenario must match the membership, the ids must be real, and another Contact's membership is not found", async () => {
  await withStaff(
    cancelWorld(),
    async ({ call }) => {
      const a = await call('/staff/cancellation/quote', ASK({ scenario: 'cancel_associate' }));
      assert.equal(a.status, 422);
      assert.equal(a.body.code, 'SCENARIO_MISMATCH');
      assert.equal((await call('/staff/cancellation/quote', ASK({ membershipId: 'abc' }))).status, 422);
      assert.equal((await call('/staff/cancellation/quote', ASK({ scenario: 'cancel_everything' }))).status, 422);
      assert.equal((await call('/staff/cancellation/quote', ASK({ effectiveDate: '18/05/2026' }))).status, 422);
      assert.equal((await call('/staff/cancellation/quote', ASK({ contactId: 'abc' }))).status, 422);
    },
    ON,
  );
  const theirs = {
    deal: {
      id: DEAL,
      Stage: 'Active',
      Membership_Type: 'Full Member (Non-Salon)',
      Start_Date: iso(-5),
      Expiry_Date: iso(360),
      Contact_Name: { id: 'someone-else' },
    },
  };
  await withStaff(
    cancelWorld({ over: theirs }),
    async ({ call }) => {
      assert.equal((await call('/staff/cancellation/quote', ASK())).status, 404);
    },
    ON,
  );
  // The Associate that is quoted as a Full cancellation is refused too.
  await withStaff(
    cancelWorld({ over: ASSOCIATE }),
    async ({ call }) => {
      assert.equal((await call('/staff/cancellation/quote', ASK())).status, 422);
    },
    ON,
  );
});

test('extras and named people are shown as warnings, never silently dropped', async () => {
  await withStaff(
    cancelWorld(),
    async ({ call }) => {
      const r = await call('/staff/cancellation/quote', ASK());
      assert.ok(
        r.body.warnings.some(w => w.code === 'EMPLOYEES_PRESENT'),
        JSON.stringify(r.body.warnings),
      );
      const back = await call('/staff/cancellation/quote', ASK({ effectiveDate: iso(-3) }));
      assert.ok(back.body.warnings.some(w => w.code === 'BACKDATED'));
    },
    ON,
  );
});

test('off by default, refused without a valid signature, and a Stripe outage is a clear 502', async () => {
  await withStaff(cancelWorld(), async ({ call }) => {
    const off = await call('/staff/cancellation/quote', ASK());
    assert.equal(off.status, 503);
    assert.equal(off.body.code, 'NOT_AVAILABLE');
  });
  await withStaff(
    cancelWorld(),
    async ({ call }) => {
      assert.equal((await call('/staff/cancellation/quote', ASK(), { secret: 'x'.repeat(40) })).status, 401);
    },
    ON,
  );
  await withStaff(
    cancelWorld({ stripeStatus: 500 }),
    async ({ call }) => {
      const r = await call('/staff/cancellation/quote', ASK());
      assert.equal(r.status, 502);
      assert.equal(r.body.code, 'STRIPE_UNAVAILABLE');
    },
    ON,
  );
});
