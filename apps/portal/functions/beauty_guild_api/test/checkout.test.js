'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createApp} = require('../src/app');
const {loadConfig} = require('../src/config');

const ENV = {PORTAL_BILLING_ENABLED: 'true', STRIPE_SECRET_KEY: 'sk_test_example_only', PORTAL_PUBLIC_ORIGIN: 'https://portal.example.test',
  STRIPE_PRICE_ACCREDITATION: 'price_accr111111', STRIPE_PRICE_ASSOCIATE_MEMBERSHIP: 'price_bundle22222',
  STRIPE_PRICE_ADDITIONAL_VENUE: 'price_venue33333', STRIPE_PRICE_ADDON_BADGE: 'price_badge44444', STRIPE_PRICE_ADDON_STICKER: 'price_sticker5555'};
const PRICES = {price_intl111111: 35000, price_intlbundle1: 40500, price_accr111111: 35400, price_bundle22222: 40900, price_venue33333: 10000, price_badge44444: 400, price_sticker5555: 400};
const POLICY = '1011174000000000009';
const ME = '1011174000000000001', ACC = '1011174000000000002', DEAL = '1011174000000000003', CENTRE = '1011174000000000004';

function world(opts = {}) {
  const state = {stripePosts: [], crmPuts: [], sessions: opts.sessions || {}, acc: {Applicant_Contact: {id: ME}, Accreditation_Level: 'Standard', Payment_Status: 'Unpaid', ...opts.acc},
    deals: opts.deals || [], priceOverride: opts.priceOverride || {}};
  const json = (body, status = 200) => ({status, ok: status < 400, json: async () => body});
  state.fetchImpl = async (url, init = {}) => {
    url = String(url);
    if (state.external) { const handled = await state.external(url, init); if (handled) return handled; }
    if (url.startsWith('https://api.stripe.com/v1/prices/')) {
      const id = url.split('/').pop(), p = state.priceOverride[id] || {};
      return PRICES[id] ? json({active: true, currency: 'gbp', unit_amount: PRICES[id], recurring: null, ...p}) : json({}, 404);
    }
    if (url.includes('/checkout/sessions/') && (init.method || 'GET') === 'GET') { const s = state.sessions[url.split('/').pop()]; return s ? json(s) : json({}, 404); }
    if (url === 'https://api.stripe.com/v1/checkout/sessions') {
      state.stripePosts.push({params: new URLSearchParams(init.body), key: init.headers['Idempotency-Key']});
      return json({id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1'});
    }
    if (init.method === 'POST' && url.includes('/crm/v3/')) {
      const module = url.split('/crm/v3/')[1]; state.crmPosts = state.crmPosts || [];
      state.crmPosts.push({module, record: JSON.parse(init.body).data[0]});
      return json({data: [{status: 'success', details: {id: '9' + String(state.crmPosts.length).padStart(18, '0')}}]});
    }
    if (init.method === 'PUT') { state.crmPuts.push({url, body: JSON.parse(init.body)}); return json({data: [{status: 'success'}]}); }
    if (url.includes('Contacts/search')) return json({data: [{id: ME, Email: 'alice@example.test', First_Name: 'Alice', Last_Name: 'Test'}]});
    if (url.includes('Insurance_Policy/') && (init.method || 'GET') === 'GET') return state.policy ? json({data: [{id: POLICY, ...state.policy}]}) : json({data: []});
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
    getCrmHeaders: async () => ({Authorization: 'Bearer test'}), getAnalyticsHeaders: async () => ({Authorization: 'a'}), getCreatorHeaders: async () => ({Authorization: 'c'}), fetchImpl: state.fetchImpl});
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
const INTL_ENV = {STRIPE_PRICE_ACCREDITATION_INTERNATIONAL: 'price_intl111111', STRIPE_PRICE_ACCREDITATION_INTERNATIONAL_BUNDLE: 'price_intlbundle1'};
test('an international school without a membership pays the flat 405 pound international bundle, no VAT', async () => {
  const w = world({acc: {Accreditation_Level: 'International Accreditation Annual'}});
  await withApp(w, async ({post, get}) => {
    assert.equal((await get('service=accreditation&recordId=' + ACC)).body.quote.totalPence, 40500);
    assert.equal((await post({service: 'accreditation', recordId: ACC})).status, 201);
    const p = w.stripePosts[0].params;
    assert.equal(p.get('line_items[0][price]'), 'price_intlbundle1');
    assert.equal(p.get('metadata[product_amount]'), '405.00');
    assert.equal(p.get('metadata[product_name]'), 'International Accreditation + International Membership');
    assert.equal(JSON.parse(p.get('metadata[membership_details]')).type, 'International');
  }, INTL_ENV);
});
test('an international school with a current membership pays the flat 350 pound fee', async () => {
  const w = world({acc: {Accreditation_Level: 'International Accreditation Annual'}, deals: [activeDeal]});
  await withApp(w, async ({post}) => {
    assert.equal((await post({service: 'accreditation', recordId: ACC})).status, 201);
    const p = w.stripePosts[0].params;
    assert.equal(p.get('line_items[0][price]'), 'price_intl111111');
    assert.equal(p.get('metadata[product_amount]'), '350.00');
    assert.equal(p.get('metadata[membership_required]'), 'false');
  }, INTL_ENV);
});
test('an international school cannot pay until the international prices are set up', async () => {
  const w = world({acc: {Accreditation_Level: 'International Accreditation Annual'}});
  await withApp(w, async ({post}) => {
    const r = await post({service: 'accreditation', recordId: ACC});
    assert.equal(r.status, 409);
    assert.equal(w.stripePosts.length, 0);
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

// ---- Membership purchases ----
const MEM_ENV = {STRIPE_PRICE_MEMBERSHIP_ASSOCIATE_ANNUAL: 'price_assocY1111', STRIPE_PRICE_MEMBERSHIP_ASSOCIATE_MONTHLY: 'price_assocM1111',
  STRIPE_PRICE_MEMBERSHIP_FULL_NON_SALON_ANNUAL: 'price_fullY11111', STRIPE_PRICE_MEMBERSHIP_JOINING_FEE: 'price_join111111', STRIPE_PRICE_MEMBERSHIP_BRANCH: 'price_branch1111'};
Object.assign(PRICES, {price_assocY1111: 5500, price_assocM1111: 458, price_fullY11111: 4860, price_join111111: 1000, price_branch1111: 1500});
const RECURRING = {price_assocY1111: {recurring: {interval: 'year', interval_count: 1}}, price_assocM1111: {recurring: {interval: 'month', interval_count: 1}},
  price_fullY11111: {recurring: {interval: 'year', interval_count: 1}}};
const BUY = {service: 'membership', level: 'associate', branch: 'beauty', billing: 'annual', accepted: 'yes', firstName: 'Nia', lastName: 'New'};
const unlinked = w => { const f = w.fetchImpl; w.fetchImpl = async (u, i) => String(u).includes('Contacts/search') ? {status: 200, ok: true, json: async () => ({data: []})} : f(u, i); return w; };

test('membership carries the trading name and address from the Join page into the metadata, and omits blanks', async () => {
  const w = unlinked(world({priceOverride: RECURRING}));
  await withApp(w, async ({post}) => {
    const r = await post({...BUY, businessName: "Nia's Nails", address1: '1 High Street', town: 'Leeds', postcode: 'LS1 1AA'});
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const p = w.stripePosts[0].params;
    assert.equal(p.get('metadata[business_name]'), "Nia's Nails");
    assert.equal(p.get('metadata[address_line_1]'), '1 High Street');
    assert.equal(p.get('metadata[postcode]'), 'LS1 1AA');
    assert.equal(p.get('metadata[address_line_2]'), null);
  }, MEM_ENV);
});

test('the membership extras are named without the word Additional', async () => {
  const {ITEMS} = require('../src/catalogue');
  assert.deepEqual([ITEMS.addon_certificate.name, ITEMS.addon_badge.name, ITEMS.addon_sticker.name], ['Certificate', 'Badge', 'Window sticker']);
});

test('a signed-in member without a Contact can buy: subscription, joining fee, V1 metadata, no contact id', async () => {
  const w = unlinked(world({priceOverride: RECURRING}));
  await withApp(w, async ({post}) => {
    const r = await post({...BUY, branches: 'nails', addons: {badge: 2}});
    assert.equal(r.status, 201);
    const p = w.stripePosts[0].params;
    assert.equal(p.get('mode'), 'subscription');
    assert.equal(p.get('line_items[0][price]'), 'price_assocY1111');
    assert.equal(p.get('line_items[1][price]'), 'price_join111111');
    assert.equal(p.get('line_items[2][price]'), 'price_branch1111');
    assert.equal(p.get('line_items[3][price]'), 'price_badge44444');
    assert.equal(p.get('metadata[type]'), 'membership');
    assert.equal(p.get('metadata[contact_id]'), '');
    assert.equal(p.get('metadata[entry_point]'), 'public');
    assert.equal(p.get('metadata[name]'), 'Nia New');
    assert.equal(p.get('metadata[membership_level]'), 'associate');
    assert.equal(p.get('metadata[base_membership_amount]'), '55.00');
    assert.equal(p.get('metadata[base_membership_amount_net]'), '51.78');
    assert.equal(p.get('metadata[joining_fee_amount_net]'), '8.33');
    assert.equal(p.get('metadata[branch_addon_amount]'), '15.00');
    assert.equal(p.get('metadata[badge_amount]'), '8.00');
    assert.equal(p.get('metadata[total_amount]'), '88.00');
    assert.equal(p.get('metadata[change_type]'), 'new');
    assert.equal(p.has('client_reference_id'), false);
  }, MEM_ENV);
});
test('monthly uses the monthly price; Full non-salon net splits the zero-rated element', async () => {
  const w = world({priceOverride: {...RECURRING, price_fullY11111: {recurring: {interval: 'year', interval_count: 1}}}});
  await withApp(w, async ({post}) => {
    assert.equal((await post({...BUY, billing: 'monthly'})).status, 201);
    assert.equal(w.stripePosts[0].params.get('line_items[0][price]'), 'price_assocM1111');
    assert.equal((await post({...BUY, level: 'full_non_salon'})).status, 201);
    const p = w.stripePosts[1].params;
    assert.equal(p.get('metadata[base_membership_amount]'), '48.60');
    assert.equal(p.get('metadata[base_membership_amount_net]'), '46.45');
  }, MEM_ENV);
});
test('renewal waives the joining fee, needs an owned previous membership, and links it', async () => {
  const w = world({deals: [activeDeal], priceOverride: RECURRING});
  await withApp(w, async ({post}) => {
    assert.equal((await post(BUY)).status, 409);
    assert.equal((await post({...BUY, previousId: '1011174000000000088'})).status, 404);
    assert.equal((await post({...BUY, previousId: DEAL})).status, 201);
    const p = w.stripePosts[0].params;
    assert.equal(p.get('metadata[change_type]'), 'renewal');
    assert.equal(p.get('metadata[previous_membership_id]'), DEAL);
    assert.equal(p.get('metadata[joining_fee_amount]'), '0.00');
    assert.equal(p.get('metadata[membership_profile_id]'), 'prof1');
    assert.equal(p.get('line_items[1][price]'), null);
  }, MEM_ENV);
});
test('membership input is validated', async () => {
  const w = world({priceOverride: RECURRING});
  await withApp(w, async ({post, get}) => {
    assert.equal((await post({...BUY, level: 'international'})).status, 422);
    assert.equal((await post({...BUY, level: 'platinum'})).status, 422);
    assert.equal((await post({...BUY, branch: 'spa'})).status, 422);
    assert.equal((await post({...BUY, branches: 'beauty'})).status, 422);
    assert.equal((await post({...BUY, branches: 'nails,nails'})).status, 422);
    assert.equal((await post({...BUY, billing: 'weekly'})).status, 422);
    assert.equal((await post({...BUY, accepted: ''})).status, 422);
    assert.equal(w.stripePosts.length, 0);
    const q = await get('service=membership&level=associate&branch=beauty&billing=annual');
    assert.equal(q.status, 200);
    assert.equal(q.body.quote.totalPence, 6500);
  }, MEM_ENV);
});
test('a membership price set up with the wrong billing interval is refused', async () => {
  const w = world({priceOverride: {price_assocY1111: {recurring: {interval: 'month', interval_count: 1}}}});
  await withApp(w, async ({post}) => {
    assert.equal((await post(BUY)).status, 409);
  }, MEM_ENV);
});

// ---- Insurance purchases ----
const INS_OK = {insRoute: 'non_salon', insMobile: true, insEquipmentTier: 5000, insStandardConstruction: 'yes', insDeclarations: ['no', 'no', 'no', 'no', 'no', 'yes', 'yes'],
  insInformationAccurate: 'yes', insEthicsAccepted: 'yes', insDemandsNeedsAccepted: 'yes', insNonAdvisedAccepted: 'yes'};
const FULL_DEAL = {id: DEAL, Contact_Name: {id: ME}, Stage: 'Active', Membership_Type: 'Full Member (Non-Salon)'};
const fullWorld = opts => world({deals: [FULL_DEAL], ...opts});
const INSURE = {service: 'insurance', country: 'United Kingdom', accepted: 'yes', firstName: 'Nia', lastName: 'New', insurance: INS_OK};
const lineNames = p => [...p.keys()].filter(k => /^line_items\[\d+\]\[price_data\]\[product_data\]\[name\]$/.test(k)).map(k => p.get(k));

test('standalone insurance: inline premium lines and IPT, CRM records first, ids in the V1 metadata', async () => {
  const w = fullWorld();
  await withApp(w, async ({post}) => {
    const r = await post(INSURE);
    assert.equal(r.status, 201);
    const p = w.stripePosts[0].params;
    assert.equal(p.get('mode'), 'payment');
    assert.deepEqual(lineNames(p), ['Insurance - Medical Malpractice', 'Insurance - Business Equipment', 'Insurance Premium Tax (12%)']);
    assert.equal(p.get('line_items[0][price_data][unit_amount]'), '3250');
    assert.equal(p.get('line_items[1][price_data][unit_amount]'), '6500');
    assert.equal(p.get('line_items[2][price_data][unit_amount]'), '1170');
    assert.equal(p.get('line_items[0][price_data][currency]'), 'gbp');
    assert.equal(p.has('line_items[0][price]'), false);
    assert.deepEqual(w.crmPosts.map(c => c.module), ['Insurance_Policy', 'Insurance_Extension', 'Insurance_Extension', 'Declarations']);
    const [policy, medmal, equipment, decl] = w.crmPosts.map(c => c.record);
    assert.equal(policy.Entry_Route, 'Existing Member');
    assert.equal(policy.Contact, ME);
    assert.equal(policy.Application_Status, 'Ready for Payment');
    assert.equal(medmal.Cover_Type, 'MedMal');
    assert.equal(equipment.Cover_Type, 'Equipment');
    assert.equal(equipment.IPT_Amount, 7.8);
    assert.equal(decl.Insurance_Policy, '9000000000000000001');
    assert.equal(decl.Terms_and_Privacy_Accepted, true);
    assert.equal(p.get('metadata[type]'), 'insurance');
    assert.equal(p.get('metadata[insurance_policy_id]'), '9000000000000000001');
    assert.equal(p.get('metadata[insurance_extension_ids]'), '9000000000000000002,9000000000000000003');
    assert.equal(p.get('metadata[insurance_declarations_id]'), '9000000000000000004');
    assert.equal(p.get('metadata[insured_premises_id]'), '');
    assert.equal(p.get('metadata[insurance_amount]'), '109.20');
    assert.equal(p.get('metadata[insurance_net_amount]'), '97.50');
    assert.equal(p.get('metadata[insurance_ipt_amount]'), '11.70');
    assert.equal(p.get('metadata[insurance_route]'), 'non_salon');
    assert.equal(p.get('metadata[contact_id]'), ME);
    assert.equal(p.get('metadata[entry_point]'), 'member');
  });
});
test('insurance for a linked member records the Contact and the current membership on the policy', async () => {
  const w = fullWorld();
  await withApp(w, async ({post}) => {
    assert.equal((await post(INSURE)).status, 201);
    const policy = w.crmPosts[0].record;
    assert.equal(policy.Contact, ME);
    assert.equal(policy.Membership, DEAL);
    assert.equal(policy.Entry_Route, 'Existing Member');
    assert.equal(w.stripePosts[0].params.get('metadata[contact_id]'), ME);
    assert.equal(w.stripePosts[0].params.get('client_reference_id'), ME);
  });
});
test('salon property cover creates premises, people and linked extensions', async () => {
  const w = fullWorld();
  const salon = {...INS_OK, insRoute: 'salon', insSalon: true, insTurnover: 90000, insContents: true, insComputers: 2000, insEquipment: 5000, insMoneyCover: true,
    insNamedPeopleCover: true, insNamedPeople: [{type: 'employee', firstName: 'Ada', lastName: 'Lee'}, {type: 'subcontractor', firstName: 'Bo', lastName: 'Ng'}],
    insPremisesAddress: {l1: '1 High St', postcode: 'AB1 2CD'}, insSoleOccupation: 'yes', insStandardConstruction: 'yes'};
  await withApp(w, async ({post}) => {
    assert.equal((await post({...INSURE, insurance: salon})).status, 201);
    assert.deepEqual(w.crmPosts.map(c => c.module), ['Insurance_Policy', 'Insured_Premises', 'Insured_People', 'Insured_People', 'Insurance_Extension', 'Insurance_Extension',
      'Insurance_Extension', 'Insurance_Extension', 'Insurance_Extension', 'Declarations']);
    const rec = w.crmPosts.map(c => c.record);
    assert.equal(rec[0].Policy_Type, 'Salon');
    assert.equal(rec[1].Policy, '9000000000000000001');
    assert.equal(rec[2].Person_Type, 'Employees');
    assert.equal(rec[3].Person_Type, 'Subcontractors');
    assert.equal(rec.find(r => r.Cover_Code === 'NAMED_EMPLOYEES').Insured_Person, '9000000000000000003');
    assert.equal(rec.find(r => r.Cover_Code === 'NAMED_SUBCONTRACTORS').Insured_Person, '9000000000000000004');
    assert.equal(rec.find(r => r.Cover_Code === 'CONTENTS').Insured_Premises, '9000000000000000002');
    assert.equal(rec.find(r => r.Cover_Code === 'MEDMAL').Insured_Premises, undefined);
    const p = w.stripePosts[0].params;
    assert.equal(p.get('metadata[insured_premises_id]'), '9000000000000000002');
    assert.equal(p.get('metadata[insured_people_ids]'), '9000000000000000003,9000000000000000004');
    // 75 + 32.50 + 15 + contents (16 + 100 = 116) + money 20 = 258.50 net, IPT 31.02
    assert.equal(p.get('metadata[insurance_net_amount]'), '258.50');
    assert.equal(p.get('metadata[insurance_ipt_amount]'), '31.02');
    assert.equal(p.get('metadata[insurance_amount]'), '289.52');
  });
});
test('a REFER or STOP quote is not payable, never reaches Stripe, and is recorded in the CRM for the Insurance team', async () => {
  const w = fullWorld();
  await withApp(w, async ({post}) => {
    for (const [insurance, status] of [[{...INS_OK, insDeclarations: ['yes', 'no', 'no', 'no', 'no', 'yes', 'yes']}, 'REFER'], [{...INS_OK, insEthicsAccepted: 'no'}, 'STOP'],
      [{...INS_OK, insSalon: true, insTurnover: 300000}, 'STOP']]) {
      const r = await post({...INSURE, insurance});
      assert.equal(r.status, 422, status);
      assert.equal(r.body.code, 'REFERRAL_REQUIRED');
      assert.deepEqual(Object.keys(r.body.details).sort(), ['reference', 'status']);
      assert.equal(r.body.details.status, status === 'REFER' ? 'Referred' : 'Stopped');
      assert.match(r.body.details.reference, /^\d+$/);
    }
    assert.equal(w.stripePosts.length, 0);
    const policies = w.crmPosts.filter(c => c.module === 'Insurance_Policy').map(c => c.record);
    assert.deepEqual(policies.map(p => [p.Application_Status, p.Risk_Status]), [['Referred', 'Referred'], ['Referred', 'Stopped'], ['Referred', 'Stopped']]);
    assert.ok(policies.every(p => /^[A-Z_0-9]+: /.test(p.Risk_Summary)));
    assert.deepEqual(w.crmPosts.filter(c => c.module === 'Declarations').map(c => c.record.Referral_Required), [true, true, true]);
  });
});
test('the server insists on answered declarations and confirmations before payment', async () => {
  const w = fullWorld();
  await withApp(w, async ({post}) => {
    const r = await post({...INSURE, insurance: {insMobile: true, insEquipmentTier: 5000}});
    assert.equal(r.status, 422);
    assert.match(r.body.error, /declaration/);
    assert.equal(w.crmPosts, undefined);
    assert.equal(w.stripePosts.length, 0);
  });
});
test('POST /quote summarises a computed quote with its reasons and creates no records', async () => {
  const w = fullWorld();
  const app = createApp({config: loadConfig({...ENV}), getCurrentUser: async () => ({id: 'user-1', email: 'alice@example.test'}), getCrmHeaders: async () => ({Authorization: 'Bearer t'}), fetchImpl: w.fetchImpl});
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  try {
    const quote = async insurance => (await (await fetch('http://127.0.0.1:' + server.address().port + '/portal/checkout/quote', {method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({service: 'insurance', country: 'United Kingdom', insurance})})).json()).quote;
    const ok = await quote({insMobile: true, insEquipmentTier: 5000});
    assert.equal(ok.payable, true);
    assert.equal(ok.totalPence, 10920);
    assert.equal(ok.lines.length, 3);
    const stop = await quote({insSalon: true, insTurnover: 300000});
    assert.equal(stop.payable, false);
    assert.equal(stop.blocked.status, 'STOP');
    assert.match(stop.blocked.reasons[0], /turnover/);
    assert.equal(w.crmPosts, undefined);
    assert.equal(w.stripePosts.length, 0);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
test('insurance in another territory is stopped, and browser-supplied route and amounts are ignored', async () => {
  const w = fullWorld();
  await withApp(w, async ({post}) => {
    assert.equal((await post({...INSURE, country: 'France'})).status, 422);
    assert.equal((await post({...INSURE, country: ''})).status, 422);
    const r = await post({...INSURE, amount: 1, insurance: {...INS_OK, insRoute: 'salon', insTurnover: 1, totalPence: 1}});
    assert.equal(r.status, 201);
    assert.equal(w.stripePosts[0].params.get('line_items[0][price_data][unit_amount]'), '3250');
    assert.equal(w.stripePosts[0].params.get('metadata[insurance_route]'), 'non_salon');
  });
});
test('a CRM failure while creating the policy stops checkout before Stripe', async () => {
  const w = fullWorld(), f = w.fetchImpl;
  w.fetchImpl = async (u, i) => String(u).includes('/crm/v3/Insurance_Policy') && i?.method === 'POST' ? {status: 400, ok: false, json: async () => ({})} : f(u, i);
  await withApp(w, async ({post}) => {
    assert.equal((await post(INSURE)).status, 502);
    assert.equal(w.stripePosts.length, 0);
  });
});
test('membership with insurance: recurring membership plus one-off inline premium lines, V1 membership_insurance metadata', async () => {
  const w = unlinked(world({priceOverride: RECURRING}));
  await withApp(w, async ({post}) => {
    const r = await post({...BUY, level: 'full_non_salon', insurance: INS_OK, country: 'United Kingdom'});
    assert.equal(r.status, 201);
    const p = w.stripePosts[0].params;
    assert.equal(p.get('mode'), 'subscription');
    assert.equal(p.get('line_items[0][price]'), 'price_fullY11111');
    assert.equal(p.get('line_items[1][price]'), 'price_join111111');
    assert.deepEqual(lineNames(p), ['Insurance - Medical Malpractice', 'Insurance - Business Equipment', 'Insurance Premium Tax (12%)']);
    assert.equal(p.get('metadata[type]'), 'membership_insurance');
    assert.equal(p.get('metadata[insurance_requested]'), 'true');
    assert.equal(p.get('metadata[insurance_policy_id]'), '9000000000000000001');
    assert.equal(p.get('metadata[insurance_amount]'), '109.20');
    assert.equal(p.get('metadata[base_membership_amount]'), '48.60');
    // 48.60 + 10 joining + 109.20 insurance
    assert.equal(p.get('metadata[total_amount]'), '167.80');
    // membership net (46.45 + 8.33) plus insurance, which carries no VAT
    assert.equal(p.get('metadata[total_amount_net]'), '163.98');
    assert.ok([...p.keys()].filter(k => k.startsWith('metadata[')).length <= 50);
    assert.ok([...p.keys()].filter(k => k.startsWith('metadata[')).every(k => p.get(k).length <= 500));
    assert.equal(w.crmPosts[0].record.Entry_Route, 'Public Prospect');
  }, MEM_ENV);
});
test('membership with a REFER quote cannot be paid for online', async () => {
  const w = unlinked(world({priceOverride: RECURRING}));
  await withApp(w, async ({post}) => {
    const r = await post({...BUY, level: 'full_non_salon', country: 'United Kingdom', insurance: {...INS_OK, insNamedPeopleCover: true,
      insNamedPeople: [1, 2, 3, 4, 5].map(n => ({type: 'employee', firstName: 'P' + n, lastName: 'X'}))}});
    assert.equal(r.status, 422);
    assert.equal(w.stripePosts.length, 0);
    assert.equal(w.crmPosts.find(c => c.module === 'Insurance_Policy').record.Application_Status, 'Referred');
  }, MEM_ENV);
});

test('standalone insurance needs a current Full membership: none, Associate, expired and Full Salon', async () => {
  const cases = [[[], 'no membership'], [[{...FULL_DEAL, Membership_Type: 'Associate Member'}], 'associate'],
    [[{...FULL_DEAL, Expiry_Date: '2020-01-01'}], 'expired'], [[{...FULL_DEAL, Stage: 'Pending'}], 'not active']];
  for (const [deals, label] of cases) {
    const w = world({deals});
    await withApp(w, async ({post}) => {
      const r = await post(INSURE);
      assert.equal(r.status, 409, label);
      assert.equal(r.body.code, 'INSURANCE_NEEDS_FULL_MEMBERSHIP');
      assert.match(r.body.error, /included with Full membership/);
      assert.equal(w.crmPosts, undefined);
      assert.equal(w.stripePosts.length, 0);
    });
  }
  const salon = world({deals: [{...FULL_DEAL, Membership_Type: 'Full Member (Salon)'}]});
  await withApp(salon, async ({post}) => assert.equal((await post(INSURE)).status, 201));
  const noContact = unlinked(world({deals: [FULL_DEAL]}));
  await withApp(noContact, async ({post}) => assert.equal((await post(INSURE)).status, 409));
});
test('membership with insurance is refused for the Associate level, which has no insurance', async () => {
  const w = unlinked(world({priceOverride: RECURRING}));
  await withApp(w, async ({post}) => {
    const r = await post({...BUY, insurance: INS_OK, country: 'United Kingdom'});
    assert.equal(r.status, 409);
    assert.equal(r.body.code, 'INSURANCE_NEEDS_FULL_MEMBERSHIP');
    assert.equal(w.crmPosts, undefined);
    assert.equal(w.stripePosts.length, 0);
    assert.equal((await post({...BUY, level: 'full_non_salon'})).status, 201);
  }, MEM_ENV);
});
test('two identical insurance POSTs create one set of CRM records and one Stripe session', async () => {
  const w = fullWorld(), f = w.fetchImpl;
  // A created session can then be read back as open, as Stripe would report it.
  w.fetchImpl = async (u, i) => String(u).endsWith('/checkout/sessions/cs_test_1') ? {status: 200, ok: true, json: async () => ({id: 'cs_test_1', status: 'open', payment_status: 'unpaid', url: 'https://checkout.stripe.com/c/pay/cs_test_1'})} : f(u, i);
  await withApp(w, async ({post}) => {
    const [a, b] = await Promise.all([post(INSURE), post(INSURE)]);
    assert.deepEqual([a.status, b.status].sort(), [200, 201]);
    assert.equal(a.body.checkoutUrl, b.body.checkoutUrl);
    const again = await post(INSURE);
    assert.equal(again.body.reused, true);
    assert.equal(w.stripePosts.length, 1);
    assert.equal(w.crmPosts.filter(c => c.module === 'Insurance_Policy').length, 1);
    assert.equal(w.crmPosts.filter(c => c.module === 'Declarations').length, 1);
    // a different answer is a different application
    assert.equal((await post({...INSURE, insurance: {...INS_OK, insEquipmentTier: 10000}})).status, 201);
    assert.equal(w.crmPosts.filter(c => c.module === 'Insurance_Policy').length, 2);
  });
});
test('a failed attempt is not remembered, so the retry can succeed', async () => {
  const w = fullWorld(), f = w.fetchImpl;
  let fail = true;
  w.fetchImpl = async (u, i) => fail && String(u) === 'https://api.stripe.com/v1/checkout/sessions' && i?.method === 'POST' ? {status: 500, ok: false, json: async () => ({})} : f(u, i);
  await withApp(w, async ({post}) => {
    assert.equal((await post(INSURE)).status, 502);
    fail = false;
    assert.equal((await post(INSURE)).status, 201);
  });
});
test('insurance pay attempts have a lower limit than quotes: 3 a minute, 10 an hour', async () => {
  let t = 1000000;
  const w = fullWorld(), f = w.fetchImpl;
  w.fetchImpl = async (u, i) => /\/checkout\/sessions\/cs_test_1$/.test(String(u)) ? {status: 200, ok: true, json: async () => ({id: 'cs_test_1', status: 'open', payment_status: 'unpaid', url: 'https://checkout.stripe.com/c/pay/cs_test_1'})} : f(u, i);
  const app = createApp({config: loadConfig({...ENV}), getCurrentUser: async () => ({id: 'user-1', email: 'alice@example.test'}), getCrmHeaders: async () => ({Authorization: 'Bearer t'}), fetchImpl: w.fetchImpl, now: () => t});
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const call = async (path, body) => { const r = await fetch('http://127.0.0.1:' + server.address().port + '/portal/checkout' + path, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)}); return r.status; };
  const variant = n => ({...INSURE, insurance: {...INS_OK, insTurnover: 0, insNamedPeopleCover: true, insNamedPeople: [{type: 'employee', firstName: 'P' + n, lastName: 'X'}]}});
  try {
    assert.deepEqual([await call('/', variant(1)), await call('/', variant(2)), await call('/', variant(3))], [201, 201, 201]);
    assert.equal(await call('/', variant(4)), 429);
    assert.equal(await call('/quote', variant(4)), 200);
    const records = w.crmPosts.length;
    assert.equal(await call('/', variant(1)), 200);
    assert.equal(w.crmPosts.length, records);
    let ok = 3;
    for (let n = 5; n < 14; n++) { t += 61000; if (await call('/', variant(n)) === 201) ok++; }
    assert.equal(ok, 10);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

// ---- Insurance risk checks (sanctions, flood, subsidence) ----
const RISK_ENV = {PORTAL_RISK_SANCTIONS: 'true', PORTAL_RISK_FLOOD: 'true', PORTAL_RISK_SUBSIDENCE: 'true', ANALYTICS_ORG_ID: '555', ANALYTICS_WORKSPACE_ID: 'W1'};
const SANCTION_HEAD = ['Unique ID', 'OFSI Group ID', 'Name 1', 'Name 2', 'Name 3', 'Name 4', 'Name 5', 'Name 6', 'Name type', 'Alias strength', 'Designation Type', 'D.O.B', 'Address Country', 'Nationality(/ies)', 'Regime Name'];
// Fake Analytics and Creator, answered before the CRM and Stripe fakes: sanctions rows, flood and subsidence postcodes, and a switch to take Analytics down.
function riskSources(w, {listed = {}, sanctions = [], analyticsDown = false} = {}) {
  w.external = async (url, init) => {
    const json = (body, status = 200) => ({status, ok: status < 300, json: async () => body, text: async () => (typeof body === 'string' ? body : JSON.stringify(body))});
    if (url.includes('analyticsapi')) {
      if (analyticsDown) throw new Error('down');
      if (url.includes('/views?CONFIG')) return json({data: {views: [{viewId: 'V1', viewName: 'UK-Sanctions-List'}]}});
      if (url.endsWith('/views/V1')) return json({data: {views: {lastModifiedTime: String(Date.now() - 3600e3)}}});
      if (url.includes('/data?CONFIG=')) return json({data: {jobId: /COUNT/.test(decodeURIComponent(url)) ? 'JC' : 'JS'}});
      if (url.endsWith('/exportjobs/JC/data')) return json('n\n58609');
      if (url.endsWith('/exportjobs/JS/data')) return json([SANCTION_HEAD.join(','), ...sanctions.map(r => SANCTION_HEAD.map(h => r[h] || '').join(','))].join('\n'));
      if (url.includes('/exportjobs/')) return json({data: {jobCode: 1004}});
      return json({}, 404);
    }
    if (url.includes('/creator/v2.1/data/')) {
      const kind = url.includes('Flood') ? 'flood' : 'subsidence', criteria = decodeURIComponent(url.split('criteria=')[1] || '');
      if (criteria === 'InActive==false') return json({code: 3000, data: [{List_Date: '2024-01-01'}]});
      const key = /"([A-Z0-9 ]+)"/.exec(criteria)[1].replace(/ /g, '');
      return listed[kind] && listed[kind][key] ? json({code: 3000, data: [{Postcode_Key: key, Outcome: listed[kind][key]}]}) : json({code: 9280, message: 'No records found matching the given criteria.'}, 400);
    }
    return null;
  };
}
const person = (id, first, last) => ({'Unique ID': id, 'OFSI Group ID': '9' + id, 'Name 1': first, 'Name 6': last, 'Name type': 'Primary name', 'Designation Type': 'Individual', 'Regime Name': 'Secret regime'});
const SALON_PREMISES = {...INS_OK, insRoute: 'salon', insSalon: true, insTurnover: 90000, insContents: true, insComputers: 2000, insEquipment: 5000,
  insPremisesAddress: {l1: '1 High St', postcode: 'ab10 1au'}, insSoleOccupation: 'yes', insStandardConstruction: 'yes'};
const screeningRows = w => (w.crmPosts || []).filter(c => c.module === 'Risk_Screenings').map(c => c.record);

test('risk checks all clear: payable, the checks are recorded against the policy, nothing says Referred', async () => {
  const w = fullWorld();
  riskSources(w);
  await withApp(w, async ({post}) => {
    assert.equal((await post(INSURE)).status, 201);
    const policy = w.crmPosts.find(c => c.module === 'Insurance_Policy').record;
    assert.equal(policy.Application_Status, 'Ready for Payment');
    assert.equal(policy.Risk_Status, 'Clear');
    assert.deepEqual(screeningRows(w).map(r => [r.Check, r.Subject, r.Result, r.Investigation_Status]), [['Sanctions', 'Buyer: Alice Test', 'Clear', 'Cleared']]);
    assert.match(screeningRows(w)[0].Policy, /^9\d+$/);
    assert.equal(w.stripePosts.length, 1);
  }, RISK_ENV);
});
test('a sanctions match: not payable, the customer is told to contact the Guild, staff get a Referred policy and an Open screening row', async () => {
  const w = fullWorld();
  riskSources(w, {sanctions: [person('A1', 'Alice', 'Test')]});
  await withApp(w, async ({post}) => {
    const r = await post(INSURE);
    assert.equal(r.status, 422);
    assert.equal(r.body.code, 'REFERRAL_REQUIRED');
    assert.equal(r.body.error, 'We cannot complete this online. Please contact the Guild on 01332 224830.');
    assert.ok(!/sanction|secret|alice/i.test(JSON.stringify(r.body)), 'nothing about the match reaches the customer');
    assert.deepEqual(r.body.details, {reference: r.body.details.reference, status: 'Referred'});
    assert.ok(r.body.details.reference);
    assert.equal(w.stripePosts.length, 0);
    const policy = w.crmPosts.find(c => c.module === 'Insurance_Policy').record;
    assert.deepEqual([policy.Application_Status, policy.Risk_Status], ['Referred', 'Referred']);
    assert.match(policy.Risk_Summary, /RISK_SANCTIONS_REVIEW/);
    assert.equal(w.crmPosts.find(c => c.module === 'Declarations').record.Referral_Required, true);
    const [row] = screeningRows(w);
    assert.deepEqual([row.Check, row.Result, row.Investigation_Status], ['Sanctions', 'Potential match', 'Open']);
    assert.match(row.Match_Detail, /"id":"A1"/);
    assert.equal(row.Inputs_Hash.length, 64);
    assert.equal(row.Contact, ME);
    // the same application again is recorded once
    assert.equal((await post(INSURE)).status, 422);
    assert.equal(w.crmPosts.filter(c => c.module === 'Insurance_Policy').length, 1);
  }, RISK_ENV);
});
test('a check that cannot run is a REFER, never a clear result, and staff are told', async () => {
  const w = fullWorld();
  riskSources(w, {analyticsDown: true});
  await withApp(w, async ({post}) => {
    const r = await post(INSURE);
    assert.equal(r.status, 422);
    assert.match(r.body.error, /could not finish our checks/);
    assert.equal(w.stripePosts.length, 0);
    assert.equal(screeningRows(w)[0].Result, 'Error');
    assert.equal(w.crmPosts.find(c => c.module === 'Insurance_Policy').record.Risk_Status, 'Referred');
  }, RISK_ENV);
});
test('a listed postcode refers or stops the quote; an unlisted one is payable', async () => {
  const listed = {flood: {AB101AU: 'Refer'}, subsidence: {AB101AU: 'Stop'}};
  const w = fullWorld();
  riskSources(w, {listed});
  await withApp(w, async ({post}) => {
    const r = await post({...INSURE, insurance: SALON_PREMISES});
    assert.equal(r.status, 422);
    assert.equal(w.crmPosts.find(c => c.module === 'Insurance_Policy').record.Risk_Status, 'Stopped');
    assert.deepEqual(screeningRows(w).map(x => [x.Check, x.Result]), [['Sanctions', 'Clear'], ['Flood', 'Listed postcode'], ['Subsidence', 'Listed postcode']]);
  }, RISK_ENV);
  const w2 = fullWorld();
  riskSources(w2, {listed: {flood: {ZZ99ZZ: 'Refer'}}});
  await withApp(w2, async ({post}) => assert.equal((await post({...INSURE, insurance: SALON_PREMISES})).status, 201), RISK_ENV);
});
test('a quote shows the risk outcome but writes nothing', async () => {
  const w = fullWorld();
  riskSources(w, {listed: {flood: {AB101AU: 'Refer'}}});
  const app = createApp({config: loadConfig({...ENV, ...RISK_ENV}), getCurrentUser: async () => ({id: 'user-1', email: 'alice@example.test'}), getCrmHeaders: async () => ({Authorization: 'Bearer t'}),
    getAnalyticsHeaders: async () => ({}), getCreatorHeaders: async () => ({}), fetchImpl: w.fetchImpl});
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  try {
    const r = await (await fetch('http://127.0.0.1:' + server.address().port + '/portal/checkout/quote', {method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({service: 'insurance', country: 'United Kingdom', insurance: SALON_PREMISES})})).json();
    assert.equal(r.quote.payable, false);
    assert.equal(r.quote.blocked.status, 'REFER');
    assert.match(r.quote.blocked.reasons.join(' '), /flood risk/);
    assert.equal(w.crmPosts, undefined);
    assert.equal(w.stripePosts.length, 0);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
test('if the audit rows cannot be written the member is not sent to pay', async () => {
  const w = fullWorld();
  riskSources(w);
  const original = w.fetchImpl;
  w.fetchImpl = async (url, init = {}) => (init.method === 'POST' && String(url).endsWith('/crm/v3/Risk_Screenings')
    ? {status: 400, ok: false, json: async () => ({data: [{status: 'error'}]})} : original(url, init));
  await withApp(w, async ({post}) => {
    const r = await post(INSURE);
    assert.equal(r.status, 502);
    assert.equal(w.stripePosts.length, 0);
  }, RISK_ENV);
});
test('an incomplete application (a postcode that is not a postcode) is the member to fix and records nothing', async () => {
  const w = fullWorld();
  riskSources(w);
  await withApp(w, async ({post}) => {
    const r = await post({...INSURE, insurance: {...SALON_PREMISES, insPremisesAddress: {l1: '1 High St', postcode: 'HELLO'}}});
    assert.equal(r.status, 422);
    assert.match(r.body.error, /valid UK postcode/);
    assert.equal(r.body.details, undefined);
    assert.equal(w.crmPosts, undefined);
  }, RISK_ENV);
});
test('with the risk switches off nothing changes: no Analytics or Creator call, no screening rows', async () => {
  const w = fullWorld();
  const seen = [];
  w.external = async url => { if (/analyticsapi|creator\/v2/.test(url)) seen.push(url); return null; };
  await withApp(w, async ({post}) => {
    assert.equal((await post(INSURE)).status, 201);
    assert.equal(seen.length, 0);
    assert.equal(screeningRows(w).length, 0);
    assert.equal('Risk_Status' in w.crmPosts[0].record, false);
  });
});

// ---- Start dates and payment status values ----
test('a membership start date outside the window is refused with a message, not reset to today', async () => {
  const w = world({priceOverride: RECURRING});
  await withApp(w, async ({post}) => {
    const day = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
    for (const start of ['2000-01-01', day(-1), day(91), 'tomorrow']) {
      const r = await post({...BUY, previousId: DEAL, start});
      assert.equal(r.status, 422, start);
      assert.match(r.body.error, /^Choose a start date from today up to \d{4}-\d{2}-\d{2}\.$/);
    }
    assert.equal(w.stripePosts.length, 0);
    assert.equal((await post({...BUY, previousId: DEAL, start: day(30)})).status, 201);
    assert.equal(w.stripePosts[0].params.get('metadata[membership_start]'), day(30));
    assert.equal((await post({...BUY, previousId: DEAL})).status, 201);
    assert.equal(w.stripePosts[1].params.get('metadata[membership_start]'), day(0));
  }, MEM_ENV);
});
test('only modules with a payment-in-progress value are written to; Deals get no Payment_Status', async () => {
  const {PROCESSING_STATUS} = require('../src/catalogue');
  assert.deepEqual(Object.keys(PROCESSING_STATUS), ['Training_Centre_Accred']);
  const w = world({deals: [activeDeal], priceOverride: RECURRING});
  await withApp(w, async ({post}) => {
    assert.equal((await post({...BUY, previousId: DEAL})).status, 201);
    assert.equal((await post({service: 'membership_addon', recordId: DEAL, addons: {badge: 1}})).status, 201);
    assert.equal(w.crmPuts.length, 0);
    assert.equal((await post({service: 'accreditation', recordId: ACC})).status, 201);
    assert.equal(w.crmPuts.length, 1);
    assert.equal(w.crmPuts[0].body.data[0].Payment_Status, PROCESSING_STATUS.Training_Centre_Accred);
  }, MEM_ENV);
});

// ---- Start dates for insurance, and one date for membership with insurance ----
const dayFrom = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const yearEnd = start => { const d = new Date(start + 'T00:00:00Z'); d.setUTCFullYear(d.getUTCFullYear() + 1); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); };

test('standalone insurance starts today by default and a later start up to 30 days ahead is recorded on the policy and in the metadata', async () => {
  const w = fullWorld();
  await withApp(w, async ({post}) => {
    assert.equal((await post(INSURE)).status, 201);
    let policy = w.crmPosts[0].record;
    assert.equal(policy.Policy_Start_Date, dayFrom(0));
    assert.equal(policy.Policy_End_Date, yearEnd(dayFrom(0)));
    assert.equal(w.stripePosts[0].params.get('metadata[insurance_start_date]'), dayFrom(0));
    assert.equal((await post({...INSURE, start: dayFrom(30)})).status, 201);
    policy = w.crmPosts.filter(c => c.module === 'Insurance_Policy')[1].record;
    assert.equal(policy.Policy_Start_Date, dayFrom(30));
    assert.equal(policy.Policy_End_Date, yearEnd(dayFrom(30)));
    assert.equal(w.stripePosts[1].params.get('metadata[insurance_start_date]'), dayFrom(30));
    assert.equal(w.stripePosts[1].params.get('metadata[insurance_end_date]'), yearEnd(dayFrom(30)));
  });
});
test('an insurance start date in the past or more than 30 days ahead is refused with the allowed range, and nothing is created', async () => {
  const w = fullWorld();
  await withApp(w, async ({post, get}) => {
    for (const start of [dayFrom(-1), dayFrom(31), '2000-01-01', 'soon', '2026-02-30']) {
      const r = await post({...INSURE, start});
      assert.equal(r.status, 422, start);
      assert.equal(r.body.error, 'Choose a start date from today up to ' + dayFrom(30) + '.');
    }
    assert.equal(w.crmPosts, undefined);
    assert.equal(w.stripePosts.length, 0);
  });
});
test('membership with insurance uses one date for both: the membership term and the policy start together', async () => {
  const w = unlinked(world({priceOverride: RECURRING}));
  await withApp(w, async ({post}) => {
    const start = dayFrom(14);
    const r = await post({...BUY, level: 'full_non_salon', insurance: INS_OK, country: 'United Kingdom', start});
    assert.equal(r.status, 201);
    const p = w.stripePosts[0].params;
    assert.equal(p.get('metadata[membership_start]'), start);
    assert.equal(p.get('metadata[membership_expiry]'), yearEnd(start));
    assert.equal(p.get('metadata[insurance_start_date]'), start);
    assert.equal(p.get('metadata[insurance_end_date]'), yearEnd(start));
    assert.equal(w.crmPosts[0].record.Policy_Start_Date, start);
  }, MEM_ENV);
});
test('the membership start window is 30 days, the same as insurance', async () => {
  const w = world({priceOverride: RECURRING});
  await withApp(w, async ({post}) => {
    assert.equal((await post({...BUY, previousId: DEAL, start: dayFrom(31)})).status, 422);
    assert.equal((await post({...BUY, previousId: DEAL, start: dayFrom(30)})).status, 201);
  }, MEM_ENV);
});
test('a different start date is a different insurance application, so a retry does not reuse the earlier records', async () => {
  const w = fullWorld();
  await withApp(w, async ({post}) => {
    assert.equal((await post({...INSURE, start: dayFrom(5)})).status, 201);
    assert.equal((await post({...INSURE, start: dayFrom(6)})).status, 201);
    assert.equal(w.crmPosts.filter(c => c.module === 'Insurance_Policy').length, 2);
    assert.equal(w.stripePosts.length, 2);
  });
});

// ---- Resuming a quote, quote amount and expiry ----
test('a payable insurance quote stores the session id, quoted amount and expiry on the policy', async () => {
  const w = fullWorld();
  await withApp(w, async ({post}) => {
    assert.equal((await post(INSURE)).status, 201);
    const policy = w.crmPosts[0].record;
    assert.equal(policy.Quoted_Amount, 109.2);
    assert.match(policy.Quote_Expiry, /^\d{4}-\d{2}-\d{2}$/);
    const put = w.crmPuts.find(c => c.url.includes('Insurance_Policy/9000000000000000001'));
    assert.deepEqual(put.body.data[0], {Stripe_Checkout_Session_ID: 'cs_test_1'});
    const expires = Number(w.stripePosts[0].params.get('expires_at')) - Date.now() / 1000;
    assert.ok(expires > 23 * 3600 && expires < 24 * 3600, 'Stripe sessions last under 24 hours');
  });
});
async function resumeCase(w, policy, body = {policyId: POLICY}) {
  w.policy = policy;
  let out;
  const app = createApp({config: loadConfig({...ENV}), getCurrentUser: async () => ({id: 'user-1', email: 'alice@example.test'}), getCrmHeaders: async () => ({Authorization: 'Bearer t'}), fetchImpl: w.fetchImpl});
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  try {
    const r = await fetch('http://127.0.0.1:' + server.address().port + '/portal/checkout/resume', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
    out = {status: r.status, body: await r.json()};
  } finally { await new Promise(resolve => server.close(resolve)); }
  return out;
}
const READY = {Contact: {id: ME}, Application_Status: 'Ready for Payment', Stripe_Checkout_Session_ID: 'cs_old'};
const expiredWrites = w => w.crmPuts.filter(c => c.body.data[0].Application_Status === 'Expired').length;
test('resume gives the open Stripe session for your own quote', async () => {
  const w = world({sessions: {cs_old: {id: 'cs_old', status: 'open', payment_status: 'unpaid', url: 'https://checkout.stripe.com/c/pay/cs_old'}}});
  const r = await resumeCase(w, READY);
  assert.equal(r.status, 200);
  assert.equal(r.body.checkoutUrl, 'https://checkout.stripe.com/c/pay/cs_old');
  assert.equal(expiredWrites(w), 0);
  assert.equal(w.stripePosts.length, 0);
});
test('resume marks a quote Expired when its session has run out, is missing or never existed', async () => {
  for (const [session, policy] of [[{id: 'cs_old', status: 'expired', payment_status: 'unpaid', url: null}, READY], [undefined, READY],
    [undefined, {...READY, Stripe_Checkout_Session_ID: undefined}]]) {
    const w = world({sessions: session ? {cs_old: session} : {}});
    const r = await resumeCase(w, policy);
    assert.equal(r.status, 409);
    assert.equal(r.body.code, 'QUOTE_EXPIRED');
    assert.match(r.body.error, /get a new quote/);
    assert.equal(expiredWrites(w), 1);
    assert.equal(w.stripePosts.length, 0);
  }
});
test('resume reports a paid session and refuses other people\'s, expired and non-payable policies', async () => {
  const paid = world({sessions: {cs_old: {id: 'cs_old', status: 'complete', payment_status: 'paid', url: null}}});
  assert.deepEqual((await resumeCase(paid, READY)).body, {alreadyPaid: true});
  assert.equal((await resumeCase(world(), {...READY, Contact: {id: 'someone-else'}})).status, 404);
  assert.equal((await resumeCase(world(), undefined)).status, 404);
  assert.equal((await resumeCase(world(), READY, {policyId: 'abc'})).status, 404);
  const done = world();
  const r = await resumeCase(done, {...READY, Application_Status: 'Expired'});
  assert.equal(r.body.code, 'QUOTE_EXPIRED');
  assert.equal(expiredWrites(done), 0);
  assert.equal((await resumeCase(world(), {...READY, Application_Status: 'Active'})).body.code, 'NOT_PAYABLE');
});

test('paying again within two minutes, or after changing the branch, gets its own Stripe key so checkout never fails', async () => {
  const w = unlinked(world({priceOverride: RECURRING}));
  await withApp(w, async ({post}) => {
    assert.equal((await post({...BUY, businessName: 'Nia', address1: '1 High Street', town: 'Leeds', postcode: 'LS1 1AA'})).status, 201);
    assert.equal((await post({...BUY, branch: 'holistic', businessName: 'Nia', address1: '1 High Street', town: 'Leeds', postcode: 'LS1 1AA'})).status, 201);
    assert.equal((await post({...BUY, businessName: 'Nia', address1: '2 Other Road', town: 'Leeds', postcode: 'LS1 1AA'})).status, 201);
    const keys = w.stripePosts.map(p => p.key);
    assert.equal(new Set(keys).size, 3);
  }, MEM_ENV);
});
