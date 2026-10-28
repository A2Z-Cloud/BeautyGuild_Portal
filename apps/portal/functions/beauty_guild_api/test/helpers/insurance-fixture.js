'use strict';
// Shared by insurance-change-quote.test.js and staff-routes.test.js: a fake CRM and Stripe holding a Full member with a Non Salon policy.
const { world, IDS } = require('./world');

const ME = IDS.me;
const DEAL = IDS.deal;
const iso = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const json = (body, status = 200) => ({ status, ok: status < 400, json: async () => body });
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
    if (init.method === 'PUT' && t.failPut) return json({ data: [{ status: 'error' }] }, 500);
    if (t.openSession && url.includes('/checkout/sessions/' + t.openSession) && (!init.method || init.method === 'GET'))
      return json({
        id: t.openSession,
        status: 'open',
        payment_status: 'unpaid',
        url: 'https://checkout.stripe.com/c/pay/' + t.openSession,
        metadata: {},
      });
    if (init.method === 'POST' && t.failExtension && url.includes('/crm/v3/Insurance_Extension'))
      return json({ data: [{ status: 'error' }] }, 400);
    if (url.includes('lookup_keys[]=FEE-MTA'))
      return json({
        data: [{ id: 'price_fee00000001', active: true, currency: 'gbp', unit_amount: 500, recurring: null }],
      });
    // The staff API tests (staff-routes.test.js): the CRM user behind a signed request, and the Contact the staff member chose.
    if (url.includes('/crm/v3/users/'))
      return json({
        users: [
          {
            id: url.split('/users/')[1],
            full_name: 'Sam Staff',
            email: 'sam@beautyguild.com',
            status: 'active',
            profile: { name: 'Standard' },
            role: { name: 'Processing' },
          },
        ],
      });
    if (url.match(/Contacts\/\d+\?fields=/))
      return json({ data: [{ id: ME, Email: 'alice@example.test', First_Name: 'Alice', Last_Name: 'Test' }] });
    if (url.match(/Deals\/\d+\?fields=/)) return json({ data: t.deal ? [t.deal] : [] });
    if (url.includes('Membership_Extension/search')) return { status: 204, ok: true, json: async () => ({}) };
    if (url.includes('Insurance_Policy/search')) return json({ data: t.policies || (t.policy ? [t.policy] : []) });
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
const ASK = (change = {}) => ({
  service: 'insurance_change',
  recordId: DEAL,
  change: { effectiveDate: iso(0), ...change },
});
const SUB = { type: 'subcontractor', firstName: 'Bo', lastName: 'Ng' };

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

module.exports = { fixture, ASK, SUB, ANSWERS, WRITES, posts, iso, json, ME, DEAL };
