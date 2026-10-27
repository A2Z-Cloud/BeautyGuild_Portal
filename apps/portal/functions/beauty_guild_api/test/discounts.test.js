'use strict';
// Phase 0 (the 30 day joining fee rule) and phase 1 (the school referral code) of docs/delivery/vouchers-review.md.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');
const { loadConfig } = require('../src/config');
const { world, IDS } = require('./helpers/world');
const { normaliseCode, NOT_VALID, NOT_DUE } = require('../src/discounts');

const ON = { PORTAL_DISCOUNTS_ENABLED: 'true' };
// The school's Accreditation Reference is the code. Account is the school.
const SCHOOL = [
  {
    id: '1011174000003726033',
    Name: 'ACC - 0155',
    Accreditation_Status: 'Verified',
    Account: { id: '1011174000003698036', name: 'Test Academy' },
  },
];
// The school's accreditation has expired: the code must still work.
const EXPIRED_SCHOOL = [{ ...SCHOOL[0], Accreditation_Status: 'Expired' }];
const day = offset => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10);
const BUY = { service: 'membership', level: 'associate', branch: 'beauty', billing: 'annual' };
const asQuery = o => new URLSearchParams(o).toString();

async function withApp(state, fn, env = {}, { guest = false } = {}) {
  const app = createApp({
    config: loadConfig({
      PORTAL_BILLING_ENABLED: 'true',
      PUBLIC_QUOTES_ENABLED: 'true',
      STRIPE_SECRET_KEY: 'sk_test_example_only',
      PORTAL_PUBLIC_ORIGIN: 'https://portal.example.test',
      ...env,
    }),
    getCurrentUser: async () => (guest ? null : { id: 'user-1', email: 'alice@example.test' }),
    getCrmHeaders: async () => {
      if (guest) throw new Error('CRM must not be used for a guest');
      return { Authorization: 'Bearer test' };
    },
    getAnalyticsHeaders: async () => ({ Authorization: 'a' }),
    getCreatorHeaders: async () => ({ Authorization: 'c' }),
    fetchImpl: state.fetchImpl,
  });
  const server = await new Promise(resolve => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  try {
    const base = 'http://127.0.0.1:' + server.address().port;
    const call = async (path, body) => {
      const r = await fetch(base + path, {
        ...(body
          ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
          : {}),
      });
      return { status: r.status, body: await r.json() };
    };
    await fn({
      quote: async q => (await call('/portal/checkout/quote?' + asQuery(q))).body.quote,
      pay: body => call('/portal/checkout', { ...BUY, accepted: 'yes', firstName: 'Nia', lastName: 'New', ...body }),
      publicQuote: async body => (await call('/public/quote', body)).body.quote,
    });
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}
// An Active Deal that ended (or ends) this many days from today. Whether a joining fee is due is main's rule (catalogue.js).
const lapsed = offset => ({
  id: IDS.deal,
  Stage: 'Active',
  Membership_Type: 'Associate Member',
  Start_Date: '2020-01-01',
  Expiry_Date: day(offset),
  Contact_Name: { id: IDS.me },
});
const joiningLine = q => q.lines.find(l => /joining fee/i.test(l.name));

test('codes are the Accreditation Reference, in any spacing or case, and cannot carry search syntax', () => {
  for (const same of ['ACC-0155', 'acc 0155', ' ACC - 0155 ', 'acc0155']) assert.equal(normaliseCode(same), 'ACC-0155');
  for (const bad of [
    '',
    'a',
    'ACC',
    'x)or(y',
    'a,b',
    'ACC-',
    '0155',
    'x'.repeat(50),
    '(Referral_Code:starts_with:A)',
    'TESTCODE',
  ])
    assert.equal(normaliseCode(bad), '', bad);
});

test('new person: the joining fee is charged yearly and monthly', async () => {
  for (const billing of ['annual', 'monthly']) {
    const state = world({ unlinked: true });
    await withApp(
      state,
      async ({ quote }) => {
        const q = await quote({ ...BUY, billing });
        assert.ok(joiningLine(q), billing);
        assert.equal(q.joiningFee.due, true);
      },
      ON,
    );
  }
});

test('a valid school code waives the joining fee: yearly, and monthly to the penny', async () => {
  await withApp(
    world({ schools: EXPIRED_SCHOOL }),
    async ({ quote }) => {
      const plain = await quote({ ...BUY }),
        yearly = await quote({ ...BUY, code: 'acc 0155' });
      assert.equal(plain.totalPence, 6500);
      assert.equal(yearly.totalPence, 5500, 'code is case-insensitive and the expired school still gives the £10');
      assert.equal(joiningLine(yearly), undefined);
      assert.deepEqual(yearly.discount, {
        code: 'ACC-0155',
        label: 'Joining fee waived (code ACC-0155)',
        amountPence: 1000,
        line: 'joining_fee',
        lineName: 'Membership joining fee',
        indicative: false,
      });
      const monthlyPlain = await quote({ ...BUY, billing: 'monthly' }),
        monthly = await quote({ ...BUY, billing: 'monthly', code: 'ACC-0155' });
      assert.equal(monthlyPlain.totalPence, 1609, 'the first payment carries the joining fee in full');
      assert.equal(monthly.totalPence, 609, 'built from the lines Stripe gets, so the first payment is exact');
      assert.equal(monthly.plan.firstPaymentPence, 609);
      assert.equal(monthly.plan.laterPaymentPence, 609);
      assert.equal(
        monthly.lines.reduce((t, l) => t + l.totalPence, 0),
        609,
      );
    },
    ON,
  );
});
test('a wrong code gets one message, and the price is unchanged', async () => {
  await withApp(
    world({ schools: SCHOOL }),
    async ({ quote, pay }) => {
      const q = await quote({ ...BUY, code: 'ACC-0001' });
      assert.equal(q.totalPence, 6500);
      assert.deepEqual(q.codeResult, { status: 'invalid', message: NOT_VALID });
      assert.equal(NOT_VALID, 'That code is not valid');
      const r = await pay({ code: 'ACC-0001' });
      assert.equal(r.status, 422);
      assert.equal(r.body.error, NOT_VALID);
      assert.equal(r.body.code, 'CODE_INVALID');
    },
    ON,
  );
});
test('a code held by two schools is refused, never guessed', async () => {
  await withApp(
    world({
      schools: [
        ...SCHOOL,
        { ...SCHOOL[0], id: '1011174000000000051', Account: { id: '1011174000003698037', name: 'Other' } },
      ],
    }),
    async ({ quote }) => assert.equal((await quote({ ...BUY, code: 'ACC-0155' })).codeResult.status, 'invalid'),
    ON,
  );
});
test('about 10 wrong codes an hour per person, then a rate limit; the same wrong code counts once', async () => {
  await withApp(
    world({ schools: SCHOOL }),
    async ({ quote, pay }) => {
      for (let i = 0; i < 5; i++) await quote({ ...BUY, code: 'ACC-9999' });
      for (let i = 1; i < 10; i++)
        assert.equal((await quote({ ...BUY, code: 'ACC-100' + i })).codeResult.status, 'invalid');
      // That was 10 distinct wrong codes (WRONGA and WRONG1 to WRONG9). The next try is stopped, even a right one.
      const stopped = await quote({ ...BUY, code: 'ACC-0155' });
      assert.equal(stopped.codeResult.status, 'limited');
      assert.equal(stopped.totalPence, 6500);
      assert.equal((await pay({ code: 'ACC-0155' })).status, 429);
    },
    ON,
  );
});
test('a code is ignored with a clear message when no joining fee is due', async () => {
  await withApp(
    world({ schools: SCHOOL, deals: [lapsed(-10)] }),
    async ({ quote }) => {
      const q = await quote({ ...BUY, previousId: IDS.deal, code: 'ACC-0155' });
      assert.deepEqual(q.codeResult, { status: 'not_due', message: NOT_DUE });
      assert.equal(q.discount, undefined);
      assert.equal(q.joiningFee.due, false);
    },
    ON,
  );
});
test('a lapsed member (gap over a month) can use a code on the joining fee they now pay', async () => {
  await withApp(
    world({ schools: SCHOOL, deals: [lapsed(-45)] }),
    async ({ quote }) => {
      const q = await quote({ ...BUY, previousId: IDS.deal, code: 'ACC-0155' });
      assert.equal(q.discount.amountPence, 1000);
      assert.equal(q.totalPence, 5500);
    },
    ON,
  );
});
test('with the switch off the code does nothing and no code box is offered', async () => {
  await withApp(world({ schools: SCHOOL }), async ({ quote }) => {
    const q = await quote({ ...BUY, code: 'ACC-0155' });
    assert.equal(q.totalPence, 6500);
    assert.equal(q.discount, undefined);
    assert.equal(q.codeResult, undefined);
    assert.equal(q.joiningFee, undefined);
  });
});
test('no discount on accreditation, whatever code is sent', async () => {
  await withApp(
    world({ schools: SCHOOL }),
    async ({ quote }) => {
      const q = await quote({ service: 'accreditation', recordId: IDS.acc, code: 'ACC-0155' });
      assert.equal(q.discount, undefined);
      assert.equal(q.joiningFee, undefined);
      assert.equal(q.totalPence, 40900);
    },
    ON,
  );
});

test('paying with a code puts one `discounts` metadata entry on the session and writes nothing to the CRM', async () => {
  const state = world({ schools: SCHOOL });
  await withApp(
    state,
    async ({ pay }) => {
      const r = await pay({ code: 'acc 0155', billing: 'monthly' });
      assert.equal(r.status, 201, JSON.stringify(r.body));
    },
    ON,
  );
  // Creator records the redemption from the metadata: the portal writes no redemption record.
  assert.deepEqual(
    state.crmPosts.map(p => p.module),
    [],
  );
  const meta = state.stripePosts[0].params;
  assert.deepEqual(JSON.parse(meta.get('metadata[discounts]')), [
    {
      source: 'referral',
      code: 'ACC-0155',
      school_id: '1011174000003698036',
      accreditation_id: SCHOOL[0].id,
      applied_by: 'customer',
      sku: 'MEM-JOIN',
      list_amount: '10.00',
      amount: '10.00',
    },
  ]);
  assert.equal(meta.get('metadata[joining_fee_amount]'), '0.00');
  assert.equal(meta.get('metadata[total_amount]'), '6.09');
  assert.ok(![...meta.keys()].some(k => k.startsWith('line_items') && /joining/i.test(meta.get(k))));
});
test('a reference that was never issued (a draft or a rejected application) is not a valid code', async () => {
  for (const Accreditation_Status of ['Draft', 'Rejected', '']) {
    await withApp(
      world({ schools: [{ ...SCHOOL[0], Accreditation_Status }] }),
      async ({ quote }) => assert.equal((await quote({ ...BUY, code: 'ACC-0155' })).codeResult.status, 'invalid'),
      ON,
    );
  }
});
test('with the reference field switched off, codes cannot be checked and nothing is discounted', async () => {
  await withApp(
    world({ schools: SCHOOL }),
    async ({ pay }) => assert.equal((await pay({ code: 'ACC-0155' })).status, 503),
    { PORTAL_DISCOUNTS_ENABLED: 'true', PORTAL_DISCOUNT_REFERENCE_FIELD: '' },
  );
});
test('paying without a code, or with the switch off, writes no redemption and no `discounts` key', async () => {
  for (const [env, body] of [
    [ON, {}],
    [{}, { code: 'ACC-0155' }],
  ]) {
    const state = world({ schools: SCHOOL });
    await withApp(state, async ({ pay }) => assert.equal((await pay(body)).status, 201), env);
    assert.equal(state.stripePosts[0].params.has('metadata[discounts]'), false);
  }
});

test('a guest quote is indicative: it shows the discount with no CRM lookup and writes nothing', async () => {
  const state = world({ schools: SCHOOL });
  await withApp(
    state,
    async ({ publicQuote }) => {
      const q = await publicQuote({ ...BUY, code: 'ACC-77' });
      assert.equal(q.indicative, true);
      assert.equal(q.discount.indicative, true);
      assert.equal(q.totalPence, 5500);
      const plain = await publicQuote({ ...BUY });
      assert.equal(plain.joiningFee.due, true);
      const bad = await publicQuote({ ...BUY, code: 'x)' });
      assert.equal(bad.codeResult.message, NOT_VALID);
    },
    ON,
    { guest: true },
  );
  assert.equal(state.crmPosts.length, 0);
});
