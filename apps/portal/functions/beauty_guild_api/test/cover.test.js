'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');
const { loadConfig } = require('../src/config');

const ME = '1011174000000000001';
const DEAL = '1011174000000000010';
const OTHER_DEAL = '1011174000000000011';
const POLICY = '1011174000000000020';
const json = body => ({ status: 200, ok: true, json: async () => body });

const deal = (extra = {}) => ({
  id: DEAL,
  Deal_Name: 'Full Member (Non-Salon)',
  Stage: 'Active',
  Membership_Type: 'Full Member (Non-Salon)',
  Membership_Branch: 'Guild of Beauty Therapists',
  Start_Date: '2026-09-30',
  Expiry_Date: '2027-09-29',
  Contact_Name: { id: ME },
  ...extra,
});
const policy = (extra = {}) => ({
  id: POLICY,
  Application_Status: 'Active',
  Policy_Type: 'Non Salon',
  Policy_Start_Date: '2026-09-30',
  Policy_End_Date: '2027-09-29',
  Contact: { id: ME },
  Membership: { id: DEAL },
  ...extra,
});

// A small fake CRM keyed by module name.
async function withApp(tables, fn, { config = {} } = {}) {
  const seen = [];
  const app = createApp({
    config: loadConfig({ PORTAL_RECORDS_ENABLED: 'true', ...config }),
    getCurrentUser: async () => ({ id: 'u1', email: 'ada@example.test' }),
    getCrmHeaders: async () => ({ Authorization: 'x' }),
    fetchImpl: async url => {
      url = decodeURIComponent(String(url));
      seen.push(url);
      if (url.includes('Contacts/search')) return json({ data: [{ id: ME, Email: 'ada@example.test' }] });
      const dealRead = url.match(/Deals\/(\d+)\?/);
      if (dealRead) return json({ data: tables.deals?.[dealRead[1]] ? [tables.deals[dealRead[1]]] : [] });
      for (const module of [
        'Membership_Extension',
        'Insurance_Policy',
        'Insurance_Extension',
        'Insured_People',
        'Insured_Premises',
        'Policy_Revisions',
      ]) {
        if (url.includes(module + '/search')) {
          const t = tables[module];
          if (t instanceof Error) return { status: 400, ok: false, json: async () => ({}) };
          return t && t.length ? json({ data: t }) : { status: 204, ok: true, json: async () => ({}) };
        }
      }
      return json({ data: [] });
    },
  });
  const server = await new Promise(resolve => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  try {
    await fn(async id => {
      const r = await fetch(
        'http://127.0.0.1:' + server.address().port + '/portal/records/membership/' + id + '/cover',
      );
      return { status: r.status, body: await r.json() };
    }, seen);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test('a Full member sees their membership, extras and insurance cover, people, premises and change history, read only', async () => {
  await withApp(
    {
      deals: { [DEAL]: deal() },
      Membership_Extension: [
        {
          id: 'x1',
          Extension_Type: 'Additional Branch',
          Membership_Branch: 'Guild of Holistic Therapists',
          Quantity: 1,
          Status: 'Active',
        },
      ],
      Insurance_Policy: [policy()],
      Insurance_Extension: [
        {
          id: 'e1',
          Cover_Code: 'MEDMAL',
          Cover_Type: 'MedMal',
          Premium_Net: 32.5,
          IPT_Amount: 3.9,
          Gross_Amount: 36.4,
          Status: 'Active',
        },
        {
          id: 'e2',
          Cover_Code: 'NAMED_EMPLOYEES',
          Cover_Type: 'Named Person',
          Premium_Net: 32.5,
          IPT_Amount: 3.9,
          Gross_Amount: 36.4,
          Status: 'Active',
        },
        {
          id: 'e3',
          Cover_Code: 'TREATMENT_SPMU',
          Cover_Type: 'Treatment',
          Premium_Net: 179.25,
          IPT_Amount: 21.51,
          Gross_Amount: 200.76,
          Status: 'Active',
        },
        { id: 'e4', Cover_Code: 'TEACHING', Cover_Type: 'Teaching', Premium_Net: 75, Status: 'Draft' },
        { id: 'e5', Cover_Code: 'BUSINESS_EQUIPMENT', Cover_Type: 'Equipment', Premium_Net: 100, Status: 'Superseded' },
      ],
      Insured_People: [
        { id: 'p1', Name: 'Ada Lee', Person_Type: 'Employees', Status: 'Active' },
        { id: 'p2', First_Name: 'Bo', Last_Name: 'Ng', Person_Type: 'Subcontractors', Status: 'Active' },
        { id: 'p3', Name: 'Gone Away', Person_Type: 'Employees', Status: 'Cancelled' },
      ],
      Insured_Premises: [{ id: 'm1', Address_Line_1: '1 Test Street', Town: 'Salisbury', Postcode: 'SP1 2AP' }],
      Policy_Revisions: [
        {
          id: 'r1',
          Revision_Status: 'Applied',
          Membership: { id: DEAL },
          Change_Type: 'MTA',
          Change_Scope: 'Policy Only',
          Requested_Effective_Date: '2026-10-07',
          Created_Time: '2026-10-05T10:00:00Z',
        },
        {
          id: 'r2',
          Membership: { id: DEAL },
          Change_Type: 'MTA',
          Change_Scope: 'Membership Only',
          Requested_Effective_Date: '2026-11-01',
          Created_Time: '2026-10-20T10:00:00Z',
        },
      ],
    },
    async get => {
      const r = await get(DEAL);
      assert.equal(r.status, 200, JSON.stringify(r.body));
      const c = r.body.cover;
      assert.equal(c.canChange, false, 'read only');
      assert.deepEqual(
        [c.membership.type, c.membership.startDate, c.membership.endDate, c.membership.branches],
        ['Full Member (Non-Salon)', '2026-09-30', '2027-09-29', ['Guild of Beauty Therapists']],
      );
      assert.equal(c.membership.extras[0].branch, 'Guild of Holistic Therapists');
      assert.equal(c.includesInsurance, true);
      assert.deepEqual([c.insurance.route, c.insurance.endDate], ['non_salon', '2027-09-29']);
      assert.deepEqual(
        c.insurance.covers.slice(0, 2).map(x => x.label),
        ['Medical malpractice and public liability', 'Named employee'],
      );
      assert.match(c.insurance.covers[2].label, /SPMU|Microblading/);
      assert.equal(c.insurance.covers[0].grossPence, 3640);
      assert.equal(c.insurance.covers.length, 3, 'a draft row and a superseded row are not current cover');
      assert.deepEqual(c.insurance.people, [
        { id: 'p1', name: 'Ada Lee', type: 'employee' },
        { id: 'p2', name: 'Bo Ng', type: 'subcontractor' },
      ]);
      assert.deepEqual(c.insurance.premises[0].address, ['1 Test Street', 'Salisbury', 'SP1 2AP']);
      assert.equal(c.revisions.available, true);
      assert.deepEqual(
        c.revisions.items.map(x => x.id),
        ['r2', 'r1'],
        'newest first',
      );
      assert.equal(c.revisions.items[1].status, 'Applied');
    },
  );
});

test('an Associate membership has no insurance, and a quote waiting for payment is not cover', async () => {
  await withApp(
    {
      deals: { [DEAL]: deal({ Membership_Type: 'Associate Member', Deal_Name: 'Associate Member' }) },
      Insurance_Policy: [
        policy({ Application_Status: 'Ready for Payment' }),
        policy({ id: 'p2', Application_Status: 'Referred' }),
      ],
    },
    async get => {
      const r = await get(DEAL);
      assert.equal(r.status, 200);
      assert.equal(r.body.cover.includesInsurance, false);
      assert.equal(r.body.cover.insurance, null);
      assert.equal(r.body.cover.revisions.items.length, 0);
    },
  );
});

test("someone else's membership, a draft, an unknown id and a policy of another contact are not shown", async () => {
  await withApp(
    {
      deals: {
        [DEAL]: deal({ Contact_Name: { id: '999' } }),
        [OTHER_DEAL]: deal({ id: OTHER_DEAL, Application_Status: 'Draft' }),
      },
    },
    async get => {
      assert.equal((await get(DEAL)).status, 404, 'not the signed-in contact');
      assert.equal((await get(OTHER_DEAL)).status, 404, 'a saved draft is not a membership');
      assert.equal((await get('123')).status, 404, 'not a record id');
      assert.equal((await get('1011174000000000099')).status, 404, 'not found');
    },
    { config: { PORTAL_CRM_DRAFTS_ENABLED: 'true' } },
  );
  await withApp({ deals: { [DEAL]: deal() }, Insurance_Policy: [policy({ Contact: { id: '999' } })] }, async get => {
    const r = await get(DEAL);
    assert.equal(r.status, 200);
    assert.equal(r.body.cover.insurance, null, "another contact's policy is never shown, even on this Deal");
  });
});

test('a CRM without the change history module shows an empty history, not an error', async () => {
  await withApp(
    { deals: { [DEAL]: deal() }, Insurance_Policy: [policy()], Policy_Revisions: new Error('no module') },
    async get => {
      const r = await get(DEAL);
      assert.equal(r.status, 200);
      assert.deepEqual(r.body.cover.revisions, { available: false, items: [] });
    },
  );
});

test('the cover read never writes to the CRM or prices anything', async () => {
  await withApp({ deals: { [DEAL]: deal() }, Insurance_Policy: [policy()] }, async (get, seen) => {
    await get(DEAL);
    assert.ok(seen.every(u => !/POST|PUT/.test(u)));
    assert.ok(seen.every(u => !u.includes('stripe')));
  });
});

test('the cover carries the saved levels, payment frequency, the person each cover row is for and the premises construction', async () => {
  await withApp(
    {
      deals: { [DEAL]: deal() },
      Insurance_Policy: [policy({ Payment_Frequency: 'Annual', Annual_Turnover: 90000, Annual_Wage_Roll: null })],
      Insurance_Extension: [
        { id: 'e1', Cover_Code: 'BUSINESS_EQUIPMENT', Premium_Net: 65, Sum_Insured: 5000, Status: 'Active' },
        { id: 'e2', Cover_Code: 'NAMED_EMPLOYEES', Premium_Net: 32.5, Insured_Person: { id: 'p1' }, Status: 'Active' },
        {
          id: 'e3',
          Cover_Code: 'EMPLOYERS_LIABILITY',
          Premium_Net: 75,
          Sum_Insured: '',
          Cover_Option: 'Up to 1',
          Status: 'Active',
        },
      ],
      Insured_Premises: [
        { id: 'm1', Standard_Construction: 'No', More_Than_15_Percent_Nonstandard: 'Yes', Country: 'United Kingdom' },
      ],
    },
    async get => {
      const c = (await get(DEAL)).body.cover.insurance;
      assert.equal(c.paymentFrequency, 'Annual');
      assert.equal(c.annualTurnover, 90000);
      assert.equal(c.annualWageRoll, null);
      assert.deepEqual(
        c.covers.map(x => [x.code, x.sumInsured, x.option, x.personId]),
        [
          ['BUSINESS_EQUIPMENT', 5000, null, null],
          ['NAMED_EMPLOYEES', null, null, 'p1'],
          ['EMPLOYERS_LIABILITY', null, 'Up to 1', null],
        ],
      );
      assert.deepEqual(
        [c.premises[0].standardConstruction, c.premises[0].nonStandardOver15, c.premises[0].country],
        ['no', 'yes', 'United Kingdom'],
      );
    },
  );
});
