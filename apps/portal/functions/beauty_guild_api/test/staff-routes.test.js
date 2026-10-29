'use strict';
// The staff routes that price and save for a customer the staff member chose (src/staff.js, src/checkout.js), through the real app.
const test = require('node:test');
const assert = require('node:assert/strict');
const { world, IDS } = require('./helpers/world');
const { fixture, ASK, SUB, ANSWERS, WRITES, posts } = require('./helpers/insurance-fixture');
const { fakeCrm, JOURNEY, env: DRAFT_ENV } = require('./helpers/drafts-fixture');

const { STAFF, withStaff } = require('./helpers/staff-harness');
const MEMBERSHIP = { service: 'membership', level: 'associate', branch: 'hair', billing: 'annual', contactId: IDS.me };
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

// ---- Staff payment link ----
const LINKS = { PORTAL_STAFF_PAYMENT_LINKS_ENABLED: 'true' };
// Paying needs the customer's acceptance of the Code of Ethics and terms (the checkout rule), which the widget captures from the customer.
const PAY = { ...MEMBERSHIP, accepted: 'yes' };

test("a staff payment link is the customer's own checkout: the Checkout email and references are the customer, never the staff member", async () => {
  const w = newCustomer();
  await withStaff(
    w,
    async ({ call }) => {
      const r = await call('/staff/payment-link', PAY);
      assert.equal(r.status, 201, JSON.stringify(r.body));
      assert.match(r.body.checkoutUrl, /^https:\/\/checkout\.stripe\.com\//);
      assert.equal(r.body.contact.id, IDS.me);
    },
    LINKS,
  );
  assert.equal(w.stripePosts.length, 1, 'one Checkout Session');
  const text = w.stripePosts[0].params.toString();
  assert.equal(w.stripePosts[0].params.get('customer_email'), 'alice@example.test');
  assert.equal(w.stripePosts[0].params.get('client_reference_id'), IDS.me);
  assert.equal(w.stripePosts[0].params.get('metadata[email]'), 'alice@example.test');
  for (const staff of [STAFF, 'Sam Staff', 'sam@beautyguild.com', 'staff%3A'])
    assert.equal(text.includes(staff), false, 'the staff member is not in the Stripe request: ' + staff);
});

test('a staff payment link is off by default, needs the customer email, and keeps every checkout rule', async () => {
  const w = newCustomer();
  await withStaff(w, async ({ call }) => {
    const off = await call('/staff/payment-link', PAY);
    assert.equal(off.status, 503);
    assert.equal(off.body.code, 'NOT_AVAILABLE');
  });
  assert.equal(w.stripePosts.length, 0);
  // Test mode only, as for every checkout.
  await withStaff(
    w,
    async ({ call }) => {
      assert.equal((await call('/staff/payment-link', PAY)).status, 503);
    },
    { ...LINKS, STRIPE_SECRET_KEY: 'sk_live_not_allowed' },
  );
  assert.equal(w.stripePosts.length, 0);
  // A Contact with no email cannot be sent a link.
  const noEmail = newCustomer();
  const base = noEmail.fetchImpl;
  noEmail.fetchImpl = async (url, init = {}) =>
    String(url).match(/Contacts\/\d+\?fields=/)
      ? json({ data: [{ id: IDS.me, First_Name: 'Alice', Last_Name: 'Test' }] })
      : base(url, init);
  await withStaff(
    noEmail,
    async ({ call }) => {
      const r = await call('/staff/payment-link', PAY);
      assert.equal(r.status, 422);
      assert.equal(r.body.code, 'NO_EMAIL');
    },
    LINKS,
  );
  assert.equal(noEmail.stripePosts.length, 0);
  // The same rules as a customer: a membership the Contact already holds is not sold again.
  await withStaff(
    fixture(),
    async ({ call }) => {
      const r = await call('/staff/payment-link', PAY);
      assert.equal(r.status, 409);
      assert.equal(r.body.code, 'MEMBERSHIP_EXISTS');
    },
    LINKS,
  );
  // A voucher or waiver is refused on a link until its records and reservation exist, so none can be used twice.
  const discounted = newCustomer();
  await withStaff(
    discounted,
    async ({ call }) => {
      const waiver = await call('/staff/payment-link', {
        ...PAY,
        waivers: [{ sku: 'MEM-JOIN', reason: 'Goodwill Gesture' }],
      });
      assert.equal(waiver.status, 422);
      assert.equal(waiver.body.code, 'DISCOUNTS_NOT_ON_LINKS');
      assert.equal((await call('/staff/payment-link', { ...PAY, voucherCode: 'WELCOME' })).status, 422);
    },
    { ...LINKS, PORTAL_DISCOUNTS_ENABLED: 'true' },
  );
  assert.equal(discounted.stripePosts.length, 0);
  // The customer's acceptance is required, as for any payment.
  await withStaff(
    newCustomer(),
    async ({ call }) => {
      assert.equal((await call('/staff/payment-link', MEMBERSHIP)).status, 422);
    },
    LINKS,
  );
  // Unsigned.
  await withStaff(
    newCustomer(),
    async ({ call }) => {
      assert.equal((await call('/staff/payment-link', PAY, { secret: 'x'.repeat(40) })).status, 401);
    },
    LINKS,
  );
});
