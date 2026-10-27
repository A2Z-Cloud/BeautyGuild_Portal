'use strict';
// The insurance change quote through the real app: read only, behind PORTAL_INSURANCE_CHANGES_ENABLED, and never payable yet.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');
const { loadConfig } = require('../src/config');
const { world, IDS } = require('./helpers/world');

const ME = IDS.me;
const DEAL = IDS.deal;
const iso = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const json = (body, status = 200) => ({ status, ok: status < 400, json: async () => body });
const ENV = {
  PORTAL_BILLING_ENABLED: 'true',
  STRIPE_SECRET_KEY: 'sk_test_example_only',
  PORTAL_PUBLIC_ORIGIN: 'https://portal.example.test',
  PORTAL_RISK_SANCTIONS: 'false',
  PORTAL_INSURANCE_CHANGES_ENABLED: 'true',
};

// A 365 day policy that starts today, so a change today pays the whole year (365 of 365 days) and the sums are the yearly prices.
function fixture(over = {}) {
  const t = {
    deal: {
      id: DEAL,
      Deal_Name: 'Full Member',
      Stage: 'Active',
      Membership_Type: 'Full Member (Non-Salon)',
      Start_Date: iso(-5),
      Expiry_Date: iso(360),
      Contact_Name: { id: ME },
    },
    policy: {
      id: 'pol1',
      Application_Status: 'Active',
      Policy_Type: 'Non Salon',
      Policy_Start_Date: iso(0),
      Policy_End_Date: iso(364),
      Contact: { id: ME },
      Membership: { id: DEAL },
      Payment_Frequency: 'Annual',
    },
    covers: [
      { id: 'c1', Cover_Code: 'MEDMAL', Cover_Type: 'MedMal', Premium_Net: 32.5, Status: 'Active' },
      {
        id: 'c2',
        Cover_Code: 'NAMED_EMPLOYEES',
        Cover_Type: 'Named Person',
        Premium_Net: 32.5,
        Status: 'Active',
        Insured_Person: { id: 'p1' },
      },
    ],
    people: [{ id: 'p1', Name: 'Ada Lee', Person_Type: 'Employees', Status: 'Active' }],
    premises: [
      { id: 'm1', Standard_Construction: 'Yes', More_Than_15_Percent_Nonstandard: 'No', Country: 'United Kingdom' },
    ],
    deals: [],
    ...over,
  };
  const w = world({ deals: [t.deal] });
  const stripe = w.fetchImpl;
  w.writes = [];
  w.fetchImpl = async (url, init = {}) => {
    url = decodeURIComponent(String(url));
    if (init.method === 'POST' || init.method === 'PUT') w.writes.push(url);
    if (url.includes('lookup_keys[]=FEE-MTA'))
      return json({
        data: [{ id: 'price_fee00000001', active: true, currency: 'gbp', unit_amount: 500, recurring: null }],
      });
    if (url.match(/Deals\/\d+\?fields=/)) return json({ data: t.deal ? [t.deal] : [] });
    if (url.includes('Membership_Extension/search')) return { status: 204, ok: true, json: async () => ({}) };
    if (url.includes('Insurance_Policy/search')) return json({ data: t.policy ? [t.policy] : [] });
    if (url.includes('Insurance_Extension/search')) return json({ data: t.covers });
    if (url.includes('Insured_People/search')) return json({ data: t.people });
    if (url.includes('Insured_Premises/search')) return json({ data: t.premises });
    if (url.includes('Policy_Revisions/search')) return { status: 204, ok: true, json: async () => ({}) };
    if (url.includes('Deals/search') && url.includes('Stage,Start_Date')) return json({ data: t.deals });
    return stripe(url, init);
  };
  return w;
}
async function withApp(w, fn, env = {}) {
  const app = createApp({
    config: loadConfig({ ...ENV, ...env }),
    getCurrentUser: async () => ({ id: 'user-1', email: 'alice@example.test' }),
    getCrmHeaders: async () => ({ Authorization: 'Bearer test' }),
    getAnalyticsHeaders: async () => ({}),
    getCreatorHeaders: async () => ({}),
    fetchImpl: w.fetchImpl,
  });
  const server = await new Promise(resolve => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  try {
    const call = async (path, body) => {
      const r = await fetch('http://127.0.0.1:' + server.address().port + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return { status: r.status, body: await r.json() };
    };
    await fn({ quote: body => call('/portal/checkout/quote', body), pay: body => call('/portal/checkout', body) });
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}
const ASK = (change = {}) => ({
  service: 'insurance_change',
  recordId: DEAL,
  change: { effectiveDate: iso(0), ...change },
});
const SUB = { type: 'subcontractor', firstName: 'Bo', lastName: 'Ng' };

test('the quote is off until the switch is on', async () => {
  await withApp(
    fixture(),
    async ({ quote }) => {
      assert.equal((await quote(ASK({ addPeople: [SUB] }))).status, 503);
    },
    { PORTAL_INSURANCE_CHANGES_ENABLED: 'false' },
  );
});
test('a subcontractor: premium, IPT and the GBP 5 fee, a quote reference, nothing written, and not payable yet', async () => {
  const w = fixture();
  await withApp(w, async ({ quote }) => {
    const r = await quote(ASK({ addPeople: [SUB] }));
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const q = r.body.quote;
    assert.equal(q.payable, false, 'this slice only quotes');
    assert.equal(q.details.outcome, 'PASS');
    assert.match(q.details.quoteId, /^QC-[0-9A-F]{16}$/);
    // GBP 15.00 for 365 of 365 days, IPT 1.80, fee 5.00
    assert.equal(q.details.premiumNetPence, 1500);
    assert.equal(q.details.iptPence, 180);
    assert.deepEqual(
      q.lines.map(l => l.totalPence),
      [1500, 180, 500],
    );
    assert.equal(q.totalPence, 2180);
    assert.match(q.lines[0].name, /Add subcontractor Bo Ng \(365 of 365 days\)/);
    assert.equal(w.writes.length, 0, 'nothing is written to the CRM or Stripe');
  });
});
test('an added employee also pays the pro-rated membership fee at the live price', async () => {
  await withApp(fixture(), async ({ quote }) => {
    const q = (await quote(ASK({ addPeople: [{ type: 'employee', firstName: 'Cy', lastName: 'Day' }] }))).body.quote;
    // 32.50 + 3.90 IPT + 55.00 membership fee + 5.00 fee
    assert.equal(q.totalPence, 3250 + 390 + 5500 + 500);
    assert.ok(q.lines.some(l => /membership fee/i.test(l.name) && l.totalPence === 5500));
  });
});
test('a like-for-like swap is only the fee, and a removal, a monthly payer or a Salon policy is referred with no lines', async () => {
  await withApp(fixture(), async ({ quote }) => {
    const swap = (
      await quote(ASK({ removePeople: ['p1'], addPeople: [{ type: 'employee', firstName: 'Cy', lastName: 'Day' }] }))
    ).body.quote;
    assert.equal(swap.details.outcome, 'PASS', JSON.stringify(swap.blocked));
    assert.deepEqual(
      swap.lines.map(l => l.totalPence),
      [500],
    );
    const removal = (await quote(ASK({ removePeople: ['p1'] }))).body.quote;
    assert.equal(removal.blocked.status, 'REFER');
    assert.equal(removal.payable, false);
    assert.equal(removal.lines.length, 0);
  });
  for (const policy of [{ Payment_Frequency: 'Monthly' }, { Payment_Frequency: null }, { Policy_Type: 'Salon' }]) {
    const base = fixture().fetchImpl && fixture();
    const f = fixture({
      policy: {
        ...(base ? {} : {}),
        id: 'pol1',
        Application_Status: 'Active',
        Policy_Type: 'Non Salon',
        Policy_Start_Date: iso(0),
        Policy_End_Date: iso(364),
        Contact: { id: ME },
        Membership: { id: DEAL },
        Payment_Frequency: 'Annual',
        ...policy,
      },
    });
    await withApp(f, async ({ quote }) => {
      const q = (await quote(ASK({ addPeople: [SUB] }))).body.quote;
      assert.equal(q.blocked.status, 'REFER', JSON.stringify(policy));
      assert.equal(q.lines.length, 0);
    });
  }
});
test('the start date is from today up to 30 days ahead and never after the policy end; no back-dating', async () => {
  await withApp(fixture(), async ({ quote }) => {
    assert.equal((await quote(ASK({ effectiveDate: iso(-1), addPeople: [SUB] }))).status, 422, 'yesterday');
    assert.equal((await quote(ASK({ effectiveDate: iso(31), addPeople: [SUB] }))).status, 422, 'more than 30 days');
    assert.equal((await quote(ASK({ effectiveDate: 'soon', addPeople: [SUB] }))).status, 422);
    assert.equal((await quote(ASK({ effectiveDate: iso(30), addPeople: [SUB] }))).status, 200);
  });
  await withApp(
    fixture({
      policy: {
        id: 'pol1',
        Application_Status: 'Active',
        Policy_Type: 'Non Salon',
        Policy_Start_Date: iso(-350),
        Policy_End_Date: iso(10),
        Contact: { id: ME },
        Membership: { id: DEAL },
        Payment_Frequency: 'Annual',
      },
    }),
    async ({ quote }) => {
      assert.equal(
        (await quote(ASK({ effectiveDate: iso(11), addPeople: [SUB] }))).status,
        422,
        'after the policy ends',
      );
      assert.equal((await quote(ASK({ effectiveDate: iso(10), addPeople: [SUB] }))).status, 200, 'on the last day');
    },
  );
});
test('a change in the last month of a policy that has already been renewed goes to the office', async () => {
  const policy = {
    id: 'pol1',
    Application_Status: 'Active',
    Policy_Type: 'Non Salon',
    Policy_Start_Date: iso(-350),
    Policy_End_Date: iso(10),
    Contact: { id: ME },
    Membership: { id: DEAL },
    Payment_Frequency: 'Annual',
  };
  await withApp(
    fixture({ policy, deals: [{ id: 'renewal', Stage: 'Active', Start_Date: iso(11) }] }),
    async ({ quote }) => {
      const q = (await quote(ASK({ addPeople: [SUB] }))).body.quote;
      assert.equal(q.blocked.status, 'REFER');
      assert.match(q.blocked.reasons.join(' '), /already been renewed/);
    },
  );
  await withApp(fixture({ policy }), async ({ quote }) => {
    assert.equal((await quote(ASK({ addPeople: [SUB] }))).body.quote.details.outcome, 'PASS', 'no renewal yet');
  });
});
test("a member cannot quote for someone else's membership, and paying for an insurance change is refused", async () => {
  await withApp(
    fixture({
      deal: {
        id: DEAL,
        Stage: 'Active',
        Membership_Type: 'Full Member (Non-Salon)',
        Start_Date: iso(-5),
        Expiry_Date: iso(360),
        Contact_Name: { id: 'someone-else' },
      },
    }),
    async ({ quote }) => {
      assert.equal((await quote(ASK({ addPeople: [SUB] }))).status, 404);
    },
  );
  const w = fixture();
  await withApp(w, async ({ pay }) => {
    const r = await pay(ASK({ addPeople: [SUB] }));
    assert.equal(r.status, 503);
    assert.equal(r.body.code, 'PAYMENT_NOT_AVAILABLE');
    assert.equal(w.writes.length, 0, 'nothing reached Stripe or the CRM');
  });
});
