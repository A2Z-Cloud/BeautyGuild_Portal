'use strict';
// Phase 0 (the 30 day joining fee rule) and phase 1 (the school referral code) of docs/delivery/vouchers-review.md.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');
const { loadConfig } = require('../src/config');
const { world, IDS } = require('./helpers/world');
const { joiningFeeDue, daysSinceExpiry, normaliseCode, NOT_VALID, NOT_DUE } = require('../src/discounts');

const ON = { PORTAL_DISCOUNTS_ENABLED: 'true', PORTAL_DISCOUNT_REFERENCE_FIELD: 'Accreditation_Reference' };
// The school's Accreditation Reference is the code. Account is the school.
const SCHOOL = [
  {
    id: '1011174000000000050',
    Accreditation_Reference: 'ACC - 0140',
    Accreditation_Status: 'Verified',
    Account: { id: '1011174000000000060', name: 'Test Academy' },
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
const joiningLine = q => q.lines.find(l => /joining fee/i.test(l.name));

test('the 30 day rule: day 30 pays no joining fee, day 31 pays it', () => {
  const today = '2026-10-26';
  const due = (previous, expiry, rule = true) => joiningFeeDue({ previous, expiry, today, rule });
  assert.equal(due(null, null), true, 'a new person always pays it');
  assert.equal(due('1', '2026-10-26'), false, 'expired today');
  assert.equal(due('1', '2026-09-26'), false, 'day 30 (expired 30 days ago) pays no fee');
  assert.equal(due('1', '2026-09-25'), true, 'day 31 pays the fee');
  assert.equal(due('1', '2027-01-01'), false, 'still current');
  assert.equal(due('1', null), false, 'no known expiry keeps the renewal free');
  assert.equal(due('1', '2020-01-01', false), false, 'rule off: the old behaviour');
  assert.equal(daysSinceExpiry('2026-09-26', today), 30);
  assert.equal(daysSinceExpiry('garbage', today), null);
});
test('codes are the Accreditation Reference, in any spacing or case, and cannot carry search syntax', () => {
  for (const same of ['ACC-0140', 'acc 0140', ' ACC - 0140 ', 'acc0140']) assert.equal(normaliseCode(same), 'ACC-0140');
  for (const bad of [
    '',
    'a',
    'ACC',
    'x)or(y',
    'a,b',
    'ACC-',
    '0140',
    'x'.repeat(50),
    '(Referral_Code:starts_with:A)',
    'TESTCODE',
  ])
    assert.equal(normaliseCode(bad), '', bad);
});

for (const billing of ['annual', 'monthly'])
  test('renewal joining fee, ' + billing + ': 30 days after expiry is free, 31 days pays', async () => {
    for (const [ago, charged] of [
      [30, false],
      [31, true],
      [0, false],
    ]) {
      const state = world({ previousDeal: { Expiry_Date: day(-ago) }, deals: [] });
      await withApp(
        state,
        async ({ quote }) => {
          const q = await quote({ ...BUY, billing, previousId: IDS.deal });
          assert.equal(Boolean(joiningLine(q)), charged, ago + ' days: ' + JSON.stringify(q.lines));
        },
        ON,
      );
    }
  });
test('renewal, rule off: a membership 90 days lapsed still skips the joining fee (nothing changes by default)', async () => {
  const state = world({ previousDeal: { Expiry_Date: day(-90) } });
  await withApp(state, async ({ quote }) => {
    const q = await quote({ ...BUY, previousId: IDS.deal });
    assert.equal(joiningLine(q), undefined);
    assert.equal(q.joiningFee, undefined);
  });
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
        yearly = await quote({ ...BUY, code: 'acc 0140' });
      assert.equal(plain.totalPence, 6500);
      assert.equal(yearly.totalPence, 5500, 'code is case-insensitive and the expired school still gives the £10');
      assert.equal(joiningLine(yearly), undefined);
      assert.deepEqual(yearly.discount, {
        code: 'ACC-0140',
        label: 'Joining fee waived (code ACC-0140)',
        amountPence: 1000,
        line: 'joining_fee',
        lineName: 'Membership joining fee',
        indicative: false,
      });
      const monthlyPlain = await quote({ ...BUY, billing: 'monthly' }),
        monthly = await quote({ ...BUY, billing: 'monthly', code: 'ACC-0140' });
      assert.equal(monthlyPlain.totalPence, 692);
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
        { ...SCHOOL[0], id: '1011174000000000051', Account: { id: '1011174000000000061', name: 'Other' } },
      ],
    }),
    async ({ quote }) => assert.equal((await quote({ ...BUY, code: 'ACC-0140' })).codeResult.status, 'invalid'),
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
      const stopped = await quote({ ...BUY, code: 'ACC-0140' });
      assert.equal(stopped.codeResult.status, 'limited');
      assert.equal(stopped.totalPence, 6500);
      assert.equal((await pay({ code: 'ACC-0140' })).status, 429);
    },
    ON,
  );
});
test('a code is ignored with a clear message when no joining fee is due', async () => {
  await withApp(
    world({ schools: SCHOOL, previousDeal: { Expiry_Date: day(-10) } }),
    async ({ quote }) => {
      const q = await quote({ ...BUY, previousId: IDS.deal, code: 'ACC-0140' });
      assert.deepEqual(q.codeResult, { status: 'not_due', message: NOT_DUE });
      assert.equal(q.discount, undefined);
      assert.equal(q.joiningFee.due, false);
    },
    ON,
  );
});
test('a lapsed member (31 days) can use a code on the joining fee they now pay', async () => {
  await withApp(
    world({ schools: SCHOOL, previousDeal: { Expiry_Date: day(-31) } }),
    async ({ quote }) => {
      const q = await quote({ ...BUY, previousId: IDS.deal, code: 'ACC-0140' });
      assert.equal(q.discount.amountPence, 1000);
      assert.equal(q.totalPence, 5500);
    },
    ON,
  );
});
test('with the switch off the code does nothing and no code box is offered', async () => {
  await withApp(world({ schools: SCHOOL }), async ({ quote }) => {
    const q = await quote({ ...BUY, code: 'ACC-0140' });
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
      const q = await quote({ service: 'accreditation', recordId: IDS.acc, code: 'ACC-0140' });
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
      const r = await pay({ code: 'acc 0140', billing: 'monthly' });
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
      type: 'referral_code',
      code: 'ACC-0140',
      school_id: '1011174000000000060',
      accreditation_id: SCHOOL[0].id,
      item: 'MEM-JOIN',
      list_amount: '10.00',
      discount_amount: '10.00',
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
      async ({ quote }) => assert.equal((await quote({ ...BUY, code: 'ACC-0140' })).codeResult.status, 'invalid'),
      ON,
    );
  }
});
test('without the reference field set, codes cannot be checked and nothing is discounted', async () => {
  await withApp(
    world({ schools: SCHOOL }),
    async ({ pay }) => assert.equal((await pay({ code: 'ACC-0140' })).status, 503),
    { PORTAL_DISCOUNTS_ENABLED: 'true' },
  );
});
test('paying without a code, or with the switch off, writes no redemption and no `discounts` key', async () => {
  for (const [env, body] of [
    [ON, {}],
    [{}, { code: 'ACC-0140' }],
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
