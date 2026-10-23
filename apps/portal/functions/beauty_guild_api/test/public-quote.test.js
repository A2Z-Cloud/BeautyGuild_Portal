'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createApp} = require('../src/app');
const {loadConfig} = require('../src/config');

const ENV = {PORTAL_BILLING_ENABLED: 'true', PUBLIC_QUOTES_ENABLED: 'true', STRIPE_SECRET_KEY: 'sk_test_example_only', PORTAL_PUBLIC_ORIGIN: 'https://portal.example.test',
  PORTAL_RISK_SANCTIONS: 'true', PORTAL_RISK_FLOOD: 'true', PORTAL_RISK_SUBSIDENCE: 'true'};
// Stripe prices are found by lookup key (the price list code).
const PRICES = {'MEM-ASSOC-Y': [5500, 'year'], 'MEM-FULLNS-Y': [5500, 'year'], 'MEM-JOIN': [1000, null], 'MEM-BRANCH': [1500, null], 'MEM-ADMIN': [150, 'month']};
const json = (body, status = 200) => ({status, ok: status < 400, json: async () => body});

async function withApp(fn, env = {}) {
  const calls = [];
  const fetchImpl = async url => {
    url = String(url); calls.push(url);
    if (url.startsWith('https://api.stripe.com/v1/prices?')) {
      const code = new URL(url).searchParams.get('lookup_keys[]'), p = PRICES[code];
      return json({data: p ? [{id: 'price_' + code.replace(/[^A-Za-z0-9]/g, '') + '123456', active: true, currency: 'gbp', unit_amount: p[0], recurring: p[1] ? {interval: p[1], interval_count: 1} : null}] : []});
    }
    return json({data: []});
  };
  const app = createApp({config: loadConfig({...ENV, ...env}), getCurrentUser: async () => null, getCrmHeaders: async () => { throw new Error('CRM must not be used'); },
    getAnalyticsHeaders: async () => { throw new Error('Analytics must not be used'); }, getCreatorHeaders: async () => { throw new Error('Creator must not be used'); }, fetchImpl});
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  try {
    const base = 'http://127.0.0.1:' + server.address().port;
    const post = async (path, body) => { const r = await fetch(base + path, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)}); return {status: r.status, body: await r.json()}; };
    await fn({quote: body => post('/public/quote', body), post, calls});
  } finally { await new Promise(resolve => server.close(resolve)); }
}
const BUY = {service: 'membership', level: 'associate', branch: 'beauty', billing: 'annual'};

test('a signed-out visitor can price a membership: first charge with the joining fee, then the yearly price, flagged as a guide', async () => {
  await withApp(async ({quote, calls}) => {
    const r = await quote({...BUY, branches: 'nails'});
    assert.equal(r.status, 200);
    assert.equal(r.body.quote.totalPence, 5500 + 1000 + 1500);
    assert.equal(r.body.quote.indicative, true);
    assert.deepEqual(r.body.quote.lines.map(l => l.interval), ['year', null, null]);
    assert.ok(calls.every(u => u.startsWith('https://api.stripe.com/v1/prices?')), 'only Stripe prices are read');
  });
});
test('monthly guest pricing: the yearly price and the joining fee spread over 12 payments, rounded up, plus the admin fee', async () => {
  await withApp(async ({quote}) => {
    const r = await quote({...BUY, billing: 'monthly'});
    assert.equal(r.status, 200);
    // 55.00 a year is 4.59 a month (rounded up); the 10.00 joining fee adds 0.83; the admin fee is 1.50
    assert.equal(r.body.quote.totalPence, 459 + 83 + 150);
    assert.deepEqual(r.body.quote.plan, {payments: 12, firstPaymentPence: 692, laterPaymentPence: 609, yearOneTotalPence: 692 * 12, adminFeePence: 150});
    assert.deepEqual(r.body.quote.lines.map(l => [l.name, l.totalPence, l.interval]), [['Associate Member membership (monthly)', 459, 'month'], ['Membership joining fee', 83, 'month'], ['Monthly payment admin fee', 150, 'month']]);
  });
});
test('a guest cannot price a renewal, an upgrade, standalone insurance or accreditation', async () => {
  await withApp(async ({quote}) => {
    for (const body of [{...BUY, previousId: '1011174000000000003'}, {service: 'insurance', country: 'United Kingdom', insurance: {}}, {service: 'accreditation', recordId: '1011174000000000002'}]) {
      const r = await quote(body);
      assert.equal(r.status, 422, JSON.stringify(body).slice(0, 40));
      assert.equal(r.body.code, 'SIGN_IN_FOR_PRICE');
    }
  });
});
test('a guest membership with insurance is priced and rule-checked without any risk screening or CRM access', async () => {
  await withApp(async ({quote, calls}) => {
    const r = await quote({...BUY, level: 'full_non_salon', country: 'United Kingdom', insurance: {insWorkingFromHome: true, insEquipmentTier: 5000, insStandardConstruction: 'yes'}});
    assert.equal(r.status, 200);
    assert.equal(r.body.quote.payable, true);
    assert.equal(r.body.quote.totalPence, 5500 + 1000 + 3250 + 6500 + 1170);
    assert.ok(calls.every(u => u.startsWith('https://api.stripe.com/v1/prices?')));
    const refer = await quote({...BUY, level: 'full_non_salon', country: 'United Kingdom', insurance: {insSalon: true, insSalonCount: 4, insTurnover: 90000}});
    assert.equal(refer.body.quote.payable, false);
  });
});
test('guest pricing is off unless switched on, and checkout and drafts still need an account', async () => {
  await withApp(async ({quote}) => { assert.equal((await quote(BUY)).status, 503); }, {PUBLIC_QUOTES_ENABLED: 'false'});
  await withApp(async ({post}) => {
    assert.equal((await post('/portal/checkout', {...BUY, accepted: 'yes', firstName: 'A', lastName: 'B'})).status, 401);
    assert.equal((await post('/portal/checkout/quote', BUY)).status, 401);
    const draft = await post('/portal/drafts', {service: 'membership', journeyId: 'b0fd218f-9ad6-4c13-9b78-2830f3e270b0', step: 1, answers: {}});
    assert.ok([401, 503].includes(draft.status), 'drafts are refused for a guest: ' + draft.status);
  });
});
test('guest pricing is rate limited per client', async () => {
  await withApp(async ({quote}) => {
    let last;
    for (let i = 0; i < 31; i++) last = await quote(BUY);
    assert.equal(last.status, 429);
  });
});
