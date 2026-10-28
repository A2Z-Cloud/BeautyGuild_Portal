'use strict';
// The staff routes that price and save for a customer the staff member chose (src/staff.js, src/checkout.js), through the real app.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');
const { loadConfig } = require('../src/config');
const { signStaffRequest } = require('../src/staff');
const { world, IDS } = require('./helpers/world');
const { fixture, ASK, SUB, ANSWERS, WRITES, posts } = require('./helpers/insurance-fixture');
const { fakeCrm, JOURNEY, env: DRAFT_ENV } = require('./helpers/drafts-fixture');

const SECRET = 'staff-test-secret-0123456789-abcdefghijklmnop';
const STAFF = '1011174000000000042';
const ENV = {
  PORTAL_BILLING_ENABLED: 'true',
  STRIPE_SECRET_KEY: 'sk_test_example_only',
  PORTAL_PUBLIC_ORIGIN: 'https://portal.example.test',
  PORTAL_RISK_SANCTIONS: 'false',
  PORTAL_INSURANCE_CHANGES_ENABLED: 'true',
  PORTAL_STAFF_API_ENABLED: 'true',
  STAFF_API_SECRET: SECRET,
  PORTAL_STAFF_API_ROLES: 'Administrator, Standard',
};
const MEMBERSHIP = { service: 'membership', level: 'associate', branch: 'hair', billing: 'annual', contactId: IDS.me };
let counter = 0;
const json = (body, status = 200) => ({ status, ok: status < 400, json: async () => body });
// A new customer: no membership yet, plus the CRM user behind a signed request and the Contact the staff member chose.
function newCustomer() {
  const w = world({ deals: [] });
  const base = w.fetchImpl;
  w.fetchImpl = async (url, init = {}) => {
    url = String(url);
    if (url.includes('/crm/v3/users/'))
      return json({
        users: [
          {
            id: STAFF,
            full_name: 'Sam Staff',
            email: 'sam@beautyguild.com',
            status: 'active',
            profile: { name: 'Standard' },
            role: { name: 'Processing' },
          },
        ],
      });
    if (url.match(/Contacts\/\d+\?fields=/))
      return json({ data: [{ id: IDS.me, Email: 'alice@example.test', First_Name: 'Alice', Last_Name: 'Test' }] });
    return base(url, init);
  };
  return w;
}

async function withStaff(w, fn, env = {}) {
  const app = createApp({
    config: loadConfig({ ...ENV, ...env }),
    getCrmHeaders: async () => ({ Authorization: 'Bearer test' }),
    getAnalyticsHeaders: async () => ({}),
    getCreatorHeaders: async () => ({}),
    fetchImpl: w.fetchImpl,
  });
  const server = await new Promise(resolve => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  try {
    // Signed the way the CRM function signs it, as the CRM user STAFF.
    const call = async (
      path,
      body,
      { secret = SECRET, user = STAFF, method = body === undefined ? 'GET' : 'POST' } = {},
    ) => {
      const text = body === undefined ? '' : JSON.stringify(body);
      const time = String(Math.floor(Date.now() / 1000));
      const nonce = (++counter).toString(16).padStart(32, '0');
      const signature = signStaffRequest({ secret, method, path, body: text, time, nonce, userId: user });
      const r = await fetch('http://127.0.0.1:' + server.address().port + path, {
        method,
        headers: {
          ...(text ? { 'Content-Type': 'application/json' } : {}),
          'X-Staff-User': user,
          'X-Staff-Time': time,
          'X-Staff-Nonce': nonce,
          'X-Staff-Signature': Buffer.from(signature, 'hex').toString('base64'),
        },
        ...(text ? { body: text } : {}),
      });
      return { status: r.status, body: await r.json() };
    };
    await fn({ call });
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}
const asked = () => ({ ...ASK({ addPeople: [SUB], ...ANSWERS }), contactId: IDS.me });

test('a staff quote prices for the chosen Contact and has no side effects', async () => {
  const w = newCustomer();
  await withStaff(w, async ({ call }) => {
    const r = await call('/staff/quote', MEMBERSHIP);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.contact.id, IDS.me);
    assert.equal(r.body.contact.name, 'Alice Test');
    assert.equal(r.body.quote.payable, true);
    assert.ok(r.body.quote.totalPence > 0);
    assert.ok(r.body.requestId);
  });
  assert.equal(w.crmPosts.length, 0, 'nothing written to the CRM');
  assert.equal(w.stripePosts.length, 0, 'no Stripe session made');
});

test('an unsigned request, a wrong secret and a user off the allow-list are all refused alike, and nothing is priced', async () => {
  const w = newCustomer();
  await withStaff(w, async ({ call }) => {
    const wrong = await call('/staff/quote', MEMBERSHIP, { secret: 'x'.repeat(40) });
    assert.equal(wrong.status, 401);
  });
  await withStaff(
    w,
    async ({ call }) => {
      const off = await call('/staff/quote', MEMBERSHIP);
      assert.equal(off.status, 401, 'Standard is not on this list');
    },
    { PORTAL_STAFF_API_ROLES: 'Administrator' },
  );
  assert.equal(w.crmPosts.length + w.stripePosts.length, 0);
});

test('the Contact must exist and be a CRM id; the request must be a JSON object', async () => {
  const w = newCustomer();
  await withStaff(w, async ({ call }) => {
    assert.equal((await call('/staff/quote', { ...MEMBERSHIP, contactId: 'abc' })).status, 422);
    assert.equal((await call('/staff/quote', { ...MEMBERSHIP, contactId: undefined })).status, 422);
    assert.equal((await call('/staff/quote', [1])).status, 400);
  });
});

test('a voucher code or waiver is refused with a clear 503 while discounts are off', async () => {
  const w = newCustomer();
  await withStaff(w, async ({ call }) => {
    const r = await call('/staff/quote', { ...MEMBERSHIP, voucherCode: 'WELCOME' });
    assert.equal(r.status, 503);
    assert.equal(r.body.error?.code || r.body.code, 'DISCOUNTS_DISABLED');
    const waiver = await call('/staff/quote', {
      ...MEMBERSHIP,
      waivers: [{ sku: 'MEM-JOIN', reason: 'Goodwill Gesture' }],
    });
    assert.equal(waiver.status, 503);
  });
});

test('a staff waiver takes the joining fee off the quote, as the approved staff member', async () => {
  const w = newCustomer();
  await withStaff(
    w,
    async ({ call }) => {
      const plain = await call('/staff/quote', MEMBERSHIP);
      const waived = await call('/staff/quote', {
        ...MEMBERSHIP,
        waivers: [{ sku: 'MEM-JOIN', reason: 'Goodwill Gesture' }],
      });
      assert.equal(waived.status, 200, JSON.stringify(waived.body));
      assert.equal(plain.body.quote.totalPence - waived.body.quote.totalPence, 1000);
      assert.equal(waived.body.quote.discounts[0].sku, 'MEM-JOIN');
      const bad = await call('/staff/quote', { ...MEMBERSHIP, waivers: [{ sku: 'MEM-JOIN', reason: 'Because' }] });
      assert.equal(bad.status, 422, 'a reason must come from the list');
    },
    { PORTAL_DISCOUNTS_ENABLED: 'true' },
  );
  assert.equal(w.crmPosts.length, 0, 'a quote records nothing');
});

test('a staff revision save writes the revision and a Note naming the staff member on it', async () => {
  const w = fixture();
  await withStaff(
    w,
    async ({ call }) => {
      const r = await call('/staff/insurance-change/revision', asked());
      assert.equal(r.status, 201, JSON.stringify(r.body));
      assert.equal(r.body.auditNote, true);
      const [note] = posts(w, 'Notes');
      assert.match(note.Note_Content, /Sam Staff/);
      assert.match(note.Note_Content, new RegExp(STAFF));
      assert.equal(note.Parent_Id.module.api_name, 'Policy_Revisions');
      assert.equal(note.Parent_Id.id, r.body.revision.id);
    },
    WRITES,
  );
});

test('if the Note cannot be written the revision stays saved and the response says so', async () => {
  const w = fixture();
  const base = w.fetchImpl;
  w.fetchImpl = async (url, init = {}) =>
    init.method === 'POST' && String(url).includes('/crm/v3/Notes')
      ? { status: 500, ok: false, json: async () => ({}) }
      : base(url, init);
  await withStaff(
    w,
    async ({ call }) => {
      const r = await call('/staff/insurance-change/revision', asked());
      assert.equal(r.status, 201, JSON.stringify(r.body));
      assert.equal(r.body.auditNote, false);
      assert.equal(posts(w, 'Policy_Revisions').length, 1);
    },
    WRITES,
  );
});

test('saving is refused while the writes switch is off, and writes nothing', async () => {
  const w = fixture();
  await withStaff(w, async ({ call }) => {
    const r = await call('/staff/insurance-change/revision', asked());
    assert.equal(r.status, 503);
  });
  assert.equal(w.crmPosts.length, 0);
});

// ---- Staff reads and the shared drafts ----
const draftBody = (extra = {}) => ({
  service: 'insurance',
  journeyId: JOURNEY,
  step: 2,
  answers: { a: 1 },
  contactId: '1000000000101',
  ...extra,
});
// The drafts CRM, plus the CRM user behind a signed request.
function draftsWorld() {
  const crm = fakeCrm();
  const base = crm.fetchImpl;
  crm.fetchImpl = async (url, init = {}) => {
    if (String(url).includes('/crm/v3/users/'))
      return json({
        users: [
          {
            id: STAFF,
            full_name: 'Sam Staff',
            email: 'sam@beautyguild.com',
            status: 'active',
            profile: { name: 'Standard' },
            role: { name: 'Processing' },
          },
        ],
      });
    return base(url, init);
  };
  return crm;
}
const WITH_DRAFTS = { ...DRAFT_ENV };

test("staff save a draft for the chosen Contact: it is the Contact's own draft, no Contact is made, and staff can list and resume it", async () => {
  const w = draftsWorld();
  await withStaff(
    w,
    async ({ call }) => {
      const saved = await call('/staff/drafts', draftBody());
      assert.equal(saved.status, 201, JSON.stringify(saved.body));
      const row = w.store.Insurance_Policy[0];
      assert.equal(String(row.Contact.id), '1000000000101', 'owned by the customer, not the staff member');
      const list = await call('/staff/drafts?contactId=1000000000101');
      assert.equal(list.status, 200, JSON.stringify(list.body));
      assert.equal(list.body.drafts.length, 1);
      const got = await call('/staff/drafts/insurance/' + row.id + '?contactId=1000000000101');
      assert.equal(got.status, 200, JSON.stringify(got.body));
      assert.equal(got.body.draft.journeyId, JOURNEY);
    },
    WITH_DRAFTS,
  );
  assert.equal(
    w.calls.some(c => c.method === 'POST' && /\/crm\/v3\/Contacts$/.test(c.u)),
    false,
    'a staff draft never creates a Contact',
  );
});

test('a staff draft needs a real Contact id and a JSON object, and is refused without a valid signed staff user', async () => {
  const w = draftsWorld();
  await withStaff(
    w,
    async ({ call }) => {
      assert.equal((await call('/staff/drafts', draftBody({ contactId: undefined }))).status, 422);
      assert.equal((await call('/staff/drafts', draftBody({ contactId: 'abc' }))).status, 422);
      assert.equal((await call('/staff/drafts', draftBody({ contactId: '1999999999999' }))).status, 404);
      assert.equal((await call('/staff/drafts', [1])).status, 400);
      assert.equal(
        (await call('/staff/drafts?contactId=1000000000101', undefined, { secret: 'x'.repeat(40) })).status,
        401,
      );
    },
    WITH_DRAFTS,
  );
  assert.equal(w.store.Insurance_Policy.length, 0, 'nothing was saved');
});

test('the draft routes are not there with the drafts switch off', async () => {
  const w = draftsWorld();
  await withStaff(
    w,
    async ({ call }) => {
      const r = await call('/staff/drafts', draftBody());
      assert.equal(r.status, 503);
      assert.equal(r.body.code, 'DRAFTS_DISABLED');
    },
    {},
  );
});

test('staff read membership options and cover for a Contact, and both are read only', async () => {
  const w = fixture();
  await withStaff(
    w,
    async ({ call }) => {
      const cover = await call('/staff/cover?contactId=' + IDS.me + '&recordId=' + IDS.deal);
      assert.equal(cover.status, 200, JSON.stringify(cover.body));
      assert.ok(cover.body.cover, 'the cover and its history');
      assert.equal((await call('/staff/cover?contactId=' + IDS.me)).status, 422, 'a membership id is needed');
      assert.equal((await call('/staff/cover?recordId=' + IDS.deal)).status, 422, 'a Contact id is needed');
      const options = await call('/staff/membership-options?contactId=' + IDS.me + '&recordId=' + IDS.deal);
      assert.equal(options.status, 503, 'off until membership changes are switched on');
    },
    {},
  );
  assert.equal(w.crmPosts.length, 0);
  await withStaff(
    w,
    async ({ call }) => {
      const options = await call('/staff/membership-options?contactId=' + IDS.me + '&recordId=' + IDS.deal);
      assert.equal(options.status, 200, JSON.stringify(options.body));
      assert.ok(options.body.options);
    },
    { PORTAL_MEMBERSHIP_CHANGES_ENABLED: 'true' },
  );
  assert.equal(w.crmPosts.length, 0, 'reads write nothing');
});
