'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createApp} = require('../src/app');
const {loadConfig} = require('../src/config');

const ENV = {PORTAL_BILLING_ENABLED: 'true', STRIPE_SECRET_KEY: 'sk_test_example_only', PORTAL_PUBLIC_ORIGIN: 'https://portal.example.test',
  STRIPE_PRICE_ACCREDITATION: 'price_accr111111', STRIPE_PRICE_ASSOCIATE_MEMBERSHIP: 'price_bundle22222',
  STRIPE_PRICE_ADDITIONAL_VENUE: 'price_venue33333', STRIPE_PRICE_ADDON_BADGE: 'price_badge44444', STRIPE_PRICE_ADDON_STICKER: 'price_sticker5555'};
const PRICES = {price_accr111111: 35400, price_bundle22222: 40900, price_venue33333: 10000, price_badge44444: 400, price_sticker5555: 400};
const ME = '1011174000000000001', ACC = '1011174000000000002', DEAL = '1011174000000000003', CENTRE = '1011174000000000004';

function world(opts = {}) {
  const state = {stripePosts: [], crmPuts: [], sessions: opts.sessions || {}, acc: {Applicant_Contact: {id: ME}, Accreditation_Level: 'Standard', Payment_Status: 'Unpaid', ...opts.acc},
    deals: opts.deals || [], priceOverride: opts.priceOverride || {}};
  const json = (body, status = 200) => ({status, ok: status < 400, json: async () => body});
  state.fetchImpl = async (url, init = {}) => {
    url = String(url);
    if (url.startsWith('https://api.stripe.com/v1/prices/')) {
      const id = url.split('/').pop(), p = state.priceOverride[id] || {};
      return PRICES[id] ? json({active: true, currency: 'gbp', unit_amount: PRICES[id], recurring: null, ...p}) : json({}, 404);
    }
    if (url.includes('/checkout/sessions/') && (init.method || 'GET') === 'GET') { const s = state.sessions[url.split('/').pop()]; return s ? json(s) : json({}, 404); }
    if (url === 'https://api.stripe.com/v1/checkout/sessions') {
      state.stripePosts.push({params: new URLSearchParams(init.body), key: init.headers['Idempotency-Key']});
      return json({id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1'});
    }
    if (init.method === 'PUT') { state.crmPuts.push({url, body: JSON.parse(init.body)}); return json({data: [{status: 'success'}]}); }
    if (url.includes('Contacts/search')) return json({data: [{id: ME, Email: 'alice@example.test', First_Name: 'Alice', Last_Name: 'Test'}]});
    if (url.includes('Training_Centre_Accred/' + ACC)) return json({data: [{id: ACC, ...state.acc}]});
    if (url.includes('Training_Centre_Accred/')) return json({data: [{id: 'x', Applicant_Contact: {id: 'someone-else'}}]});
    if (url.includes('Accreditation_Centre_Link/search')) return json({data: url.includes(CENTRE) ? [{Training_Centre: {id: CENTRE}}] : []});
    if (url.includes('Deals/search')) return json({data: state.deals});
    if (url.includes('Deals/' + DEAL)) return json({data: [{id: DEAL, Contact_Name: {id: ME}, Member_Profile: {id: 'prof1'}}]});
    if (url.includes('Deals/')) return json({data: [{id: 'x', Contact_Name: {id: 'someone-else'}}]});
    return json({data: []});
  };
  return state;
}
async function withApp(state, fn, env = {}) {
  const app = createApp({config: loadConfig({...ENV, ...env}), getCurrentUser: async () => ({id: 'user-1', email: 'alice@example.test'}),
    getCrmHeaders: async () => ({Authorization: 'Bearer test'}), fetchImpl: state.fetchImpl});
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  try {
    const url = path => 'http://127.0.0.1:' + server.address().port + path;
    const post = async body => { const r = await fetch(url('/portal/checkout'), {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)}); return {status: r.status, body: await r.json()}; };
    const get = async q => { const r = await fetch(url('/portal/checkout/quote?' + q)); return {status: r.status, body: await r.json()}; };
    await fn({post, get});
  } finally { await new Promise(resolve => server.close(resolve)); }
}
const activeDeal = {id: DEAL, Stage: 'Active', Membership_Type: 'Associate Member', Start_Date: '2020-01-01', Expiry_Date: '2999-01-01'};

test('accreditation without a membership is charged the combined bundle price, amount from Stripe', async () => {
  const w = world();
  await withApp(w, async ({post, get}) => {
    const q = await get('service=accreditation&recordId=' + ACC);
    assert.equal(q.body.quote.totalPence, 40900);
    const r = await post({service: 'accreditation', recordId: ACC});
    assert.equal(r.status, 201);
    assert.equal(r.body.checkoutUrl, 'https://checkout.stripe.com/c/pay/cs_test_1');
    const p = w.stripePosts[0].params;
    assert.equal(p.get('mode'), 'payment');
    assert.equal(p.get('line_items[0][price]'), 'price_bundle22222');
    assert.equal(p.get('customer_email'), 'alice@example.test');
    assert.equal(p.get('metadata[type]'), 'accreditation');
    assert.equal(p.get('metadata[accreditation_id]'), ACC);
    assert.equal(p.get('metadata[contact_id]'), ME);
    assert.equal(p.get('metadata[product_amount]'), '409.00');
    assert.equal(p.get('metadata[membership_required]'), 'true');
    assert.match(p.get('success_url'), /^https:\/\/portal\.example\.test\/app\/#\/payment-return\?result=success/);
    assert.equal(w.crmPuts[0].body.data[0].Payment_Status, 'Payment Processing');
    assert.equal(w.crmPuts[0].body.data[0].Stripe_Checkout_Session_ID, 'cs_test_1');
  });
});
test('accreditation with a current membership pays the plain accreditation price and carries the membership id', async () => {
  const w = world({deals: [activeDeal]});
  await withApp(w, async ({post}) => {
    assert.equal((await post({service: 'accreditation', recordId: ACC})).status, 201);
    const p = w.stripePosts[0].params;
    assert.equal(p.get('line_items[0][price]'), 'price_accr111111');
    assert.equal(p.get('metadata[product_amount]'), '354.00');
    assert.equal(p.get('metadata[membership_id]'), 'prof1');
    assert.equal(p.get('metadata[membership_required]'), 'false');
  });
});
test('a browser-supplied amount is ignored', async () => {
  const w = world();
  await withApp(w, async ({post}) => {
    await post({service: 'accreditation', recordId: ACC, amount: 1, totalPence: 1, price: 'price_x'});
    assert.equal(w.stripePosts[0].params.get('line_items[0][price]'), 'price_bundle22222');
    assert.equal(w.stripePosts[0].params.has('line_items[0][price_data][unit_amount]'), false);
  });
});
test("someone else's accreditation is not found", async () => {
  await withApp(world(), async ({post}) => {
    assert.equal((await post({service: 'accreditation', recordId: '1011174000000000099'})).status, 404);
  });
});
test('an already paid accreditation creates no session', async () => {
  const w = world({acc: {Payment_Status: 'Paid'}});
  await withApp(w, async ({post}) => {
    const r = await post({service: 'accreditation', recordId: ACC});
    assert.equal(r.body.alreadyPaid, true);
    assert.equal(w.stripePosts.length, 0);
  });
});
test('an open session for the record is reused, not duplicated', async () => {
  const w = world({acc: {Stripe_Checkout_Session_ID: 'cs_old'}, sessions: {cs_old: {status: 'open', payment_status: 'unpaid', url: 'https://checkout.stripe.com/c/pay/cs_old'}}});
  await withApp(w, async ({post}) => {
    const r = await post({service: 'accreditation', recordId: ACC});
    assert.equal(r.body.checkoutUrl, 'https://checkout.stripe.com/c/pay/cs_old');
    assert.equal(w.stripePosts.length, 0);
  });
});
test('additional venue must belong to the member\'s accreditation', async () => {
  const w = world();
  await withApp(w, async ({post}) => {
    assert.equal((await post({service: 'additional_venue', recordId: ACC, centreId: '1011174000000000077'})).status, 404);
    assert.equal((await post({service: 'additional_venue', recordId: ACC, centreId: CENTRE})).status, 201);
    const p = w.stripePosts[0].params;
    assert.equal(p.get('metadata[type]'), 'additional_venue');
    assert.equal(p.get('metadata[centre_id]'), CENTRE);
    assert.equal(p.get('line_items[0][price]'), 'price_venue33333');
  });
});
test('membership add-ons are priced per item with V1 metadata, quantities validated', async () => {
  const w = world();
  await withApp(w, async ({post, get}) => {
    const q = await get('service=membership_addon&recordId=' + DEAL + '&addons=badge:2,sticker:1');
    assert.equal(q.body.quote.totalPence, 1200);
    assert.equal(q.body.quote.lines.length, 2);
    assert.equal((await post({service: 'membership_addon', recordId: DEAL, addons: {badge: 2, sticker: 1}})).status, 201);
    const p = w.stripePosts[0].params;
    assert.equal(p.get('metadata[type]'), 'membership_addon');
    assert.equal(p.get('metadata[membership_deal_id]'), DEAL);
    assert.equal(p.get('metadata[badge_amount]'), '8.00');
    assert.equal(p.get('metadata[total_amount]'), '12.00');
    assert.equal((await post({service: 'membership_addon', recordId: DEAL, addons: {badge: 11}})).status, 422);
    assert.equal((await post({service: 'membership_addon', recordId: DEAL, addons: {unicorn: 1}})).status, 422);
    assert.equal((await post({service: 'membership_addon', recordId: DEAL, addons: {}})).status, 422);
    assert.equal((await post({service: 'membership_addon', recordId: '1011174000000000088', addons: {badge: 1}})).status, 404);
  });
});
test('an item with no Stripe price ID configured is refused', async () => {
  await withApp(world(), async ({post}) => {
    const r = await post({service: 'membership_addon', recordId: DEAL, addons: {bundle: 1}});
    assert.equal(r.status, 409);
    assert.equal(r.body.code, 'ITEM_NOT_AVAILABLE');
  });
});
test('an inactive or non-GBP Stripe price is refused', async () => {
  await withApp(world({priceOverride: {price_accr111111: {active: false}, price_bundle22222: {currency: 'usd'}}}), async ({post}) => {
    assert.equal((await post({service: 'accreditation', recordId: ACC})).status, 409);
  });
});
test('unknown services and live keys are refused', async () => {
  await withApp(world(), async ({post}) => {
    assert.equal((await post({service: 'insurance', recordId: ACC})).status, 422);
  });
  await withApp(world(), async ({post}) => {
    assert.equal((await post({service: 'accreditation', recordId: ACC})).status, 503);
  }, {STRIPE_SECRET_KEY: 'sk_live_nope'});
});
test('checkout is off unless billing is enabled', async () => {
  await withApp(world(), async ({post}) => {
    assert.equal((await post({service: 'accreditation', recordId: ACC})).status, 503);
  }, {PORTAL_BILLING_ENABLED: 'false'});
});
