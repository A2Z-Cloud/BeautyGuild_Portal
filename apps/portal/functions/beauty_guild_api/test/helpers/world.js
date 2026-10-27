'use strict';
// A small fake world for tests that need the whole checkout: a fake CRM and a fake Stripe that finds prices by
// lookup key. Used by metadata-contract.test.js. (checkout.test.js keeps its own, richer copy.)
const { createApp } = require('../../src/app');
const { loadConfig } = require('../../src/config');

const ENV = {
  PORTAL_BILLING_ENABLED: 'true',
  STRIPE_SECRET_KEY: 'sk_test_example_only',
  PORTAL_PUBLIC_ORIGIN: 'https://portal.example.test',
  PORTAL_RISK_SANCTIONS: 'false',
  PORTAL_MEMBERSHIP_CHANGES_ENABLED: 'true',
};
// code -> price, as in Stripe test mode: [amount in pence, billing interval or null]
const PRICE_TABLE = {
  'ACC-STD': [35400, null],
  'ACC-ASSOC': [40900, null],
  'ACC-INTL': [35000, null],
  'ACC-INTL-MEM': [40500, null],
  'ACC-VENUE': [6000, null],
  'MEM-ASSOC-Y': [5500, 'year'],
  'MEM-FULLNS-Y': [5500, 'year'],
  'MEM-FULLS-Y': [5500, 'year'],
  'MEM-INTL-Y': [5500, 'year'],
  'MEM-JOIN': [1000, null],
  'MEM-BRANCH': [1500, null],
  'MEM-BUNDLE': [1000, null],
  'MEM-CERT': [400, null],
  'MEM-BADGE': [400, null],
  'MEM-STICKER': [400, null],
  'MEM-ADMIN': [150, 'month'],
};
const IDS = {
  me: '1011174000000000001',
  acc: '1011174000000000002',
  deal: '1011174000000000003',
  centre: '1011174000000000004',
};

// liveStripe: true sends every Stripe request to the real Stripe API (test mode, with the key in env.STRIPE_SECRET_KEY) and records
// the sessions it made in state.liveSessions; the CRM stays fake.
function world({ deals = [], acc = {}, unlinked = false, liveStripe = false, schools = [], previousDeal = {} } = {}) {
  const state = { stripePosts: [], crmPosts: [], liveSessions: [] };
  const json = (body, status = 200) => ({ status, ok: status < 400, json: async () => body });
  state.fetchImpl = async (url, init = {}) => {
    url = String(url);
    if (liveStripe && url.startsWith('https://api.stripe.com/')) {
      if (init.method === 'POST' && url.endsWith('/checkout/sessions'))
        state.stripePosts.push({ params: new URLSearchParams(init.body) });
      const r = await fetch(url, init);
      const text = await r.text();
      if (init.method === 'POST' && url.endsWith('/checkout/sessions') && r.ok)
        state.liveSessions.push(JSON.parse(text).id);
      return { status: r.status, ok: r.ok, json: async () => JSON.parse(text) };
    }
    if (url.startsWith('https://api.stripe.com/v1/prices?')) {
      const code = new URL(url).searchParams.get('lookup_keys[]');
      const row = PRICE_TABLE[code];
      return json({
        data: row
          ? [
              {
                id: 'price_' + code.replace(/[^A-Za-z0-9]/g, '') + '00000',
                active: true,
                currency: 'gbp',
                unit_amount: row[0],
                recurring: row[1] ? { interval: row[1], interval_count: 1 } : null,
              },
            ]
          : [],
      });
    }
    if (url === 'https://api.stripe.com/v1/checkout/sessions') {
      state.stripePosts.push({ params: new URLSearchParams(init.body) });
      return json({ id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1' });
    }
    if (url.includes('/checkout/sessions/')) return json({}, 404);
    if (init.method === 'POST' && url.includes('/crm/v3/')) {
      const module = url.split('/crm/v3/')[1];
      state.crmPosts.push({ module, record: JSON.parse(init.body).data[0] });
      return json({
        data: [{ status: 'success', details: { id: '9' + String(state.crmPosts.length).padStart(18, '0') } }],
      });
    }
    if (init.method === 'PUT') return json({ data: [{ status: 'success' }] });
    if (url.includes('Contacts/search'))
      return json({
        data: unlinked ? [] : [{ id: IDS.me, Email: 'alice@example.test', First_Name: 'Alice', Last_Name: 'Test' }],
      });
    if (url.includes('Insurance_Policy/')) return json({ data: [] });
    if (url.includes('Training_Centre_Accred/search')) return json({ data: schools });
    if (url.includes('Training_Centre_Accred/' + IDS.acc))
      return json({
        data: [
          {
            id: IDS.acc,
            Applicant_Contact: { id: IDS.me },
            Accreditation_Level: 'Standard',
            Payment_Status: 'Unpaid',
            ...acc,
          },
        ],
      });
    if (url.includes('Accreditation_Centre_Link/search'))
      return json({ data: [{ Training_Centre: { id: IDS.centre } }] });
    if (url.includes('Deals/search')) return json({ data: deals });
    if (url.includes('Deals/' + IDS.deal))
      return json({
        data: [{ id: IDS.deal, Contact_Name: { id: IDS.me }, Member_Profile: { id: 'prof1' }, ...previousDeal }],
      });
    return json({ data: [] });
  };
  return state;
}

// Runs fn({ post }) against the real app, wired to the fake world. post(body) is a signed-in POST /portal/checkout.
async function withApp(state, fn, env = {}) {
  const app = createApp({
    config: loadConfig({ ...ENV, ...env }),
    getCurrentUser: async () => ({ id: 'user-1', email: 'alice@example.test' }),
    getCrmHeaders: async () => ({ Authorization: 'Bearer test' }),
    getAnalyticsHeaders: async () => ({ Authorization: 'a' }),
    getCreatorHeaders: async () => ({ Authorization: 'c' }),
    fetchImpl: state.fetchImpl,
  });
  const server = await new Promise(resolve => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  try {
    const post = async body => {
      const r = await fetch('http://127.0.0.1:' + server.address().port + '/portal/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return { status: r.status, body: await r.json() };
    };
    await fn({ post });
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

module.exports = { world, withApp, IDS, PRICE_TABLE };
