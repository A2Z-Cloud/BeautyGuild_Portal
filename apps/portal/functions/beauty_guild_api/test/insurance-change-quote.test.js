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
    revisions: [],
    ...over,
  };
  const w = world({ deals: [t.deal] });
  const stripe = w.fetchImpl;
  w.writes = [];
  w.puts = [];
  w.fetchImpl = async (url, init = {}) => {
    url = decodeURIComponent(String(url));
    if (init.method === 'POST' || init.method === 'PUT') w.writes.push(url);
    if (init.method === 'PUT') w.puts.push({ url, body: JSON.parse(init.body).data[0] });
    if (init.method === 'POST' && t.failExtension && url.includes('/crm/v3/Insurance_Extension'))
      return json({ data: [{ status: 'error' }] }, 400);
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
    if (url.includes('Policy_Revisions/search'))
      return t.revisions.length ? json({ data: t.revisions }) : { status: 204, ok: true, json: async () => ({}) };
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
    await fn({
      quote: body => call('/portal/checkout/quote', body),
      pay: body => call('/portal/checkout', body),
      save: body => call('/portal/checkout/insurance-change/revision', body),
    });
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

// ---- R3-2: saving a quoted change as a revision and draft rows (behind PORTAL_INSURANCE_CHANGES_WRITES) ----
const WRITES = { PORTAL_INSURANCE_CHANGES_WRITES: 'true' };
const ANSWERS = {
  declarations: ['no', 'no', 'no', 'no', 'no', 'yes', 'yes'],
  insInformationAccurate: 'yes',
  insEthicsAccepted: 'yes',
  insDemandsNeedsAccepted: 'yes',
  insNonAdvisedAccepted: 'yes',
  qualified: 'yes',
  patchTesting: 'yes',
};
const posts = (w, module) => w.crmPosts.filter(c => c.module === module).map(c => c.record);

test('saving is off until the writes switch is on, and writes nothing', async () => {
  const w = fixture();
  await withApp(w, async ({ save }) => {
    assert.equal((await save(ASK({ addPeople: [SUB], ...ANSWERS }))).status, 503);
    assert.equal(w.writes.length, 0);
  });
});
test('a payable change is saved as a Quoted revision with draft rows, dated from the start date to the policy end, and no live row is touched', async () => {
  const w = fixture();
  await withApp(
    w,
    async ({ save }) => {
      const r = await save(ASK({ addPeople: [SUB], treatments: ['spmu'], ...ANSWERS }));
      assert.equal(r.status, 201, JSON.stringify(r.body));
      assert.equal(r.body.revision.status, 'Quoted');
      const [rev] = posts(w, 'Policy_Revisions');
      assert.equal(rev.Policy, 'pol1');
      assert.equal(rev.Membership, DEAL);
      assert.equal(rev.Change_Type, 'MTA');
      assert.equal(rev.Change_Scope, 'Policy Only');
      assert.equal(rev.Revision_Status, 'Quoted');
      assert.equal(rev.Requested_Effective_Date, iso(0));
      assert.match(rev.After_Quote_ID, /^QC-[0-9A-F]{16}$/);
      assert.match(rev.Name, /^MTA QC-[0-9A-F]{16}$/, 'the mandatory name: the prefix and the quote id');
      // 15.00 + 179.25 premium, IPT on the net, the GBP 5 fee (VAT 0.83), not waived
      assert.equal(rev.Premium_Delta_Net, 194.25);
      assert.equal(rev.IPT_Delta, 23.31);
      assert.equal(rev.MTA_Fee, 5);
      assert.equal(rev.VAT_Delta, 0.83);
      assert.equal(rev.Fee_Waived, false);
      const details = JSON.parse(rev.Request_Details);
      assert.deepEqual(details.change.declarations, ANSWERS.declarations, 'the repeated declarations are kept');
      assert.equal(details.change.confirmations.insEthicsAccepted, 'yes');
      assert.equal(details.quoteId, rev.After_Quote_ID);
      // draft rows, all linked to the revision and dated
      const revId = r.body.revision.id;
      const [person] = posts(w, 'Insured_People');
      assert.deepEqual(
        [person.Policy_Revision, person.Status, person.Effective_From, person.Effective_To, person.Person_Type],
        [revId, 'Draft', iso(0), iso(364), 'Subcontractors'],
      );
      const rows = posts(w, 'Insurance_Extension');
      assert.equal(rows.length, 2);
      for (const row of rows) {
        assert.deepEqual(
          [row.Policy_Revision, row.Status, row.Effective_From, row.Effective_To],
          [revId, 'Draft', iso(0), iso(364)],
        );
        assert.equal(row.Supersedes_Extension, undefined, 'an addition replaces nothing');
      }
      assert.ok(rows.some(x => x.Cover_Code === 'NAMED_SUBCONTRACTORS' && x.Insured_Person && x.Premium_Net === 15));
      assert.ok(rows.some(x => x.Cover_Code === 'TREATMENT_SPMU' && x.Premium_Net === 179.25));
      assert.equal(w.puts.length, 0, 'no existing record is updated');
      assert.deepEqual(
        [...new Set(w.crmPosts.map(c => c.module))].sort(),
        ['Insurance_Extension', 'Insured_People', 'Policy_Revisions'],
        'nothing is written to the policy or to live cover rows',
      );
    },
    WRITES,
  );
});
test('an increase names the row it replaces and carries the new level as the sum insured', async () => {
  const w = fixture({
    covers: [
      { id: 'c1', Cover_Code: 'MEDMAL', Premium_Net: 32.5, Status: 'Active' },
      {
        id: 'c3',
        Cover_Code: 'BUSINESS_EQUIPMENT',
        Cover_Type: 'Equipment',
        Premium_Net: 65,
        Sum_Insured: 5000,
        Status: 'Active',
      },
    ],
  });
  await withApp(
    w,
    async ({ save }) => {
      const r = await save(ASK({ equipmentTier: 10000, ...ANSWERS }));
      assert.equal(r.status, 201, JSON.stringify(r.body));
      const [row] = posts(w, 'Insurance_Extension');
      assert.deepEqual(
        [row.Supersedes_Extension, row.Sum_Insured, row.Cover_Code, row.Premium_Net],
        ['c3', 10000, 'BUSINESS_EQUIPMENT', 100],
      );
      assert.equal(posts(w, 'Policy_Revisions')[0].Premium_Delta_Net, 35, '100.00 less the 65.00 already paid');
    },
    WRITES,
  );
});
test('a referred request is saved Under Review with everything the member entered and no rows', async () => {
  const w = fixture();
  await withApp(
    w,
    async ({ save }) => {
      const r = await save(ASK({ removePeople: ['p1'] }));
      assert.equal(r.status, 201, JSON.stringify(r.body));
      assert.equal(r.body.revision.status, 'Under Review');
      const [rev] = posts(w, 'Policy_Revisions');
      assert.equal(rev.Revision_Status, 'Under Review');
      assert.equal(rev.Premium_Delta_Net, undefined, 'nothing is priced for the office to pick up');
      const details = JSON.parse(rev.Request_Details);
      assert.deepEqual(details.change.removePeople, ['p1']);
      assert.match(details.reasons.join(' '), /refund/i);
      assert.equal(w.crmPosts.length, 1, 'only the header');
    },
    WRITES,
  );
});
test('the same quote is saved once, and a change already in flight blocks a new one', async () => {
  const w = fixture();
  await withApp(
    w,
    async ({ save }) => {
      const first = await save(ASK({ addPeople: [SUB], ...ANSWERS }));
      assert.equal(first.status, 201);
    },
    WRITES,
  );
  const quoteId = posts(w, 'Policy_Revisions')[0].After_Quote_ID;
  const again = fixture({
    revisions: [{ id: 'rev9', Policy: { id: 'pol1' }, Revision_Status: 'Quoted', After_Quote_ID: quoteId }],
  });
  await withApp(
    again,
    async ({ save }) => {
      const r = await save(ASK({ addPeople: [SUB], ...ANSWERS }));
      assert.equal(r.status, 200);
      assert.deepEqual([r.body.revision.id, r.body.revision.reused], ['rev9', true]);
      assert.equal(again.crmPosts.length, 0, 'nothing is created twice');
    },
    WRITES,
  );
  const busy = fixture({
    revisions: [
      { id: 'rev8', Policy: { id: 'pol1' }, Revision_Status: 'Awaiting Payment', After_Quote_ID: 'QC-OTHER' },
    ],
  });
  await withApp(
    busy,
    async ({ save }) => {
      const r = await save(ASK({ addPeople: [SUB], ...ANSWERS }));
      assert.equal(r.status, 409);
      assert.equal(r.body.code, 'REVISION_IN_PROGRESS');
      assert.equal(busy.crmPosts.length, 0);
    },
    WRITES,
  );
});
test('a payable change needs every declaration and confirmation answered before it is saved', async () => {
  const w = fixture();
  await withApp(
    w,
    async ({ save }) => {
      const r = await save(ASK({ addPeople: [SUB] }));
      assert.equal(r.status, 422);
      assert.equal(r.body.code, 'INCOMPLETE');
      assert.equal(w.crmPosts.length, 0);
    },
    WRITES,
  );
});
test('if a draft row cannot be written the revision is withdrawn, not left looking payable', async () => {
  const w = fixture({ failExtension: true });
  await withApp(
    w,
    async ({ save }) => {
      const r = await save(ASK({ treatments: ['spmu'], ...ANSWERS }));
      assert.equal(r.status, 502);
      assert.equal(w.puts.length, 1);
      assert.match(w.puts[0].url, /Policy_Revisions\/9\d+$/);
      assert.equal(w.puts[0].body.Revision_Status, 'Withdrawn');
    },
    WRITES,
  );
});
test("a configured name prefix replaces the default, and a member cannot save against someone else's policy", async () => {
  const w = fixture();
  await withApp(w, async ({ save }) => assert.equal((await save(ASK({ addPeople: [SUB], ...ANSWERS }))).status, 201), {
    ...WRITES,
    PORTAL_REVISION_NAME_PREFIX: 'CHG',
  });
  assert.match(posts(w, 'Policy_Revisions')[0].Name, /^CHG QC-/);
  const other = fixture({
    deal: {
      id: DEAL,
      Stage: 'Active',
      Membership_Type: 'Full Member (Non-Salon)',
      Start_Date: iso(-5),
      Expiry_Date: iso(360),
      Contact_Name: { id: 'someone-else' },
    },
  });
  await withApp(
    other,
    async ({ save }) => {
      assert.equal((await save(ASK({ addPeople: [SUB], ...ANSWERS }))).status, 404);
      assert.equal(other.crmPosts.length, 0);
    },
    WRITES,
  );
});

test('a referred request has a name too, and an increase records which row Creator ends and when', async () => {
  const w = fixture();
  await withApp(
    w,
    async ({ save }) => {
      assert.equal((await save(ASK({ removePeople: ['p1'] }))).status, 201);
      const [rev] = posts(w, 'Policy_Revisions');
      assert.match(rev.Name, /^MTA QC-[0-9A-F]{16}$/, 'the name works before anything is priced');
      assert.ok(rev.Name.length <= 120);
    },
    WRITES,
  );
  const inc = fixture({
    covers: [
      { id: 'c1', Cover_Code: 'MEDMAL', Premium_Net: 32.5, Status: 'Active' },
      { id: 'c3', Cover_Code: 'BUSINESS_EQUIPMENT', Premium_Net: 65, Sum_Insured: 5000, Status: 'Active' },
    ],
  });
  await withApp(
    inc,
    async ({ save }) => {
      assert.equal((await save(ASK({ effectiveDate: iso(3), equipmentTier: 10000, ...ANSWERS }))).status, 201);
      const details = JSON.parse(posts(inc, 'Policy_Revisions')[0].Request_Details);
      assert.deepEqual(
        details.endings,
        [{ module: 'Insurance_Extension', id: 'c3', effectiveTo: iso(2) }],
        'covered up to the day before',
      );
      const [row] = posts(inc, 'Insurance_Extension');
      assert.equal(row.Effective_From, iso(3));
      assert.equal(inc.puts.length, 0, 'the old row is left for Creator to end');
    },
    WRITES,
  );
});

test('a revision name is always set, unique when there is no quote id, and never over 120 characters', () => {
  const { revisionName } = require('../src/insuranceRevisions');
  assert.equal(revisionName('MTA', 'QC-ABC'), 'MTA QC-ABC');
  assert.equal(revisionName('', 'QC-ABC'), 'MTA QC-ABC', 'the default prefix');
  const a = revisionName('MTA', null),
    b = revisionName('MTA', null);
  assert.match(a, /^MTA REQ-[0-9A-F]{10}$/);
  assert.notEqual(a, b);
  assert.equal(revisionName('X'.repeat(200), 'QC-ABC').length, 120);
});
