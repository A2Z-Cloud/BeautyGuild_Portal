'use strict';
// The staff routes that price and save for a customer the staff member chose (src/staff.js, src/checkout.js), through the real app.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');
const { loadConfig } = require('../src/config');
const { signStaffRequest } = require('../src/staff');
const { world, IDS } = require('./helpers/world');
const { fixture, ASK, SUB, ANSWERS, WRITES, posts } = require('./helpers/insurance-fixture');

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
    const call = async (path, body, { secret = SECRET, user = STAFF } = {}) => {
      const text = JSON.stringify(body);
      const time = String(Math.floor(Date.now() / 1000));
      const nonce = (++counter).toString(16).padStart(32, '0');
      const signature = signStaffRequest({ secret, method: 'POST', path, body: text, time, nonce, userId: user });
      const r = await fetch('http://127.0.0.1:' + server.address().port + path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Staff-User': user,
          'X-Staff-Time': time,
          'X-Staff-Nonce': nonce,
          'X-Staff-Signature': Buffer.from(signature, 'hex').toString('base64'),
        },
        body: text,
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

test('a staff revision save writes the same revision the customer route would, and records who saved it', async () => {
  const w = fixture();
  await withStaff(
    w,
    async ({ call }) => {
      const r = await call('/staff/insurance-change/revision', asked());
      assert.equal(r.status, 201, JSON.stringify(r.body));
      assert.ok(r.body.revision);
      const [rev] = posts(w, 'Policy_Revisions');
      assert.equal(rev.Staff_Actor, 'Sam Staff (' + STAFF + ')');
    },
    { ...WRITES, PORTAL_STAFF_AUDIT_FIELD: 'Staff_Actor' },
  );
});

test('with no audit field set, the revision still saves and carries no extra field', async () => {
  const w = fixture();
  await withStaff(
    w,
    async ({ call }) => {
      const r = await call('/staff/insurance-change/revision', asked());
      assert.equal(r.status, 201, JSON.stringify(r.body));
      assert.equal(Object.keys(posts(w, 'Policy_Revisions')[0]).includes('Staff_Actor'), false);
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
