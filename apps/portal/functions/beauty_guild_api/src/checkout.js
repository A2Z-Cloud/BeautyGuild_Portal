'use strict';
// Catalogue-driven Stripe Checkout, following V1: the function creates the Checkout Session and
// holds the Stripe key, and Creator handles everything after payment from the session metadata
// (the webhook is Creator's, not this function's). Amounts are never taken from the browser: the
// server decides which catalogue items apply, then reads each item's live price from Stripe.
const express = require('express');
const crypto = require('node:crypto');
const {HttpError} = require('./errors');
const {resolveContact, createCrmClient} = require('./records');
const {createRateLimiter} = require('./rateLimit');
const {ITEMS, SERVICES, pounds} = require('./catalogue');

const STRIPE = 'https://api.stripe.com/v1';
const PRICE_ID = /^price_[A-Za-z0-9]{6,}$/;

function registerCheckoutRoutes(app, {enabled, getCurrentUser, getCrmHeaders, crmApiDomain, stripeKey, prices = {}, publicOrigin, fetchImpl = fetch, now = Date.now}) {
  const router = express.Router();
  const {call: crm} = createCrmClient({getCrmHeaders, crmApiDomain, fetchImpl});
  const limiter = createRateLimiter({limit: 20, windowMs: 60 * 1000, now});
  const unavailable = () => new HttpError(503, 'CHECKOUT_UNAVAILABLE', 'Online payment is not available yet.');
  const priceCache = new Map();

  async function stripe(method, path, params) {
    let r;
    try {
      r = await fetchImpl(STRIPE + path, {method, signal: AbortSignal.timeout(15000), ...(params ? {body: params.body} : {}),
        headers: {Authorization: 'Bearer ' + stripeKey, ...(params ? {'Content-Type': 'application/x-www-form-urlencoded', 'Idempotency-Key': params.key} : {})}});
    } catch { throw new HttpError(502, 'PAYMENT_UNAVAILABLE', 'Secure checkout is unavailable.'); }
    const body = await r.json().catch(() => null);
    if (!r.ok || !body) throw new HttpError(502, 'PAYMENT_UNAVAILABLE', 'Secure checkout is unavailable.');
    return body;
  }
  // The price a catalogue item points at, read from Stripe (Books keeps it in step) and held briefly.
  async function priceFor(itemKey) {
    const id = prices[ITEMS[itemKey].env];
    if (!PRICE_ID.test(String(id || ''))) throw new HttpError(409, 'ITEM_NOT_AVAILABLE', ITEMS[itemKey].name + ' cannot be bought online yet.');
    const hit = priceCache.get(id);
    if (hit && now() - hit.at < 60000) return hit.price;
    const p = await stripe('GET', '/prices/' + id);
    if (!p.active || p.currency !== 'gbp' || !Number.isSafeInteger(p.unit_amount) || p.unit_amount < 50 || p.unit_amount > 10000000)
      throw new HttpError(409, 'ITEM_NOT_AVAILABLE', ITEMS[itemKey].name + ' cannot be bought online yet.');
    // The catalogue says whether an item is one-off or recurring; a mismatched Stripe price is refused.
    if ((ITEMS[itemKey].interval || null) !== (p.recurring?.interval || null) || (p.recurring && p.recurring.interval_count !== 1))
      throw new HttpError(409, 'ITEM_NOT_AVAILABLE', ITEMS[itemKey].name + ' cannot be bought online yet.');
    const price = {id, unit: p.unit_amount, interval: p.recurring?.interval || null};
    priceCache.set(id, {price, at: now()});
    return price;
  }

  async function build(req, input) {
    const service = SERVICES[input.service];
    if (!service) throw new HttpError(422, 'INVALID_REQUEST', 'Choose something to pay for.');
    let contact = null;
    try { contact = await resolveContact(req, crm, req.portalUser); }
    catch (e) { if (!(service.allowNoContact && e.code === 'CONTACT_UNLINKED')) throw e; }
    const prepared = await service.prepare({req, crm, contact, input, user: req.portalUser});
    if (prepared.alreadyPaid) return {service, contact, alreadyPaid: true};
    const lines = [];
    for (const l of prepared.lines) {
      const price = await priceFor(l.item);
      lines.push({item: l.item, name: ITEMS[l.item].name, quantity: l.quantity, priceId: price.id, unitPence: price.unit,
        totalPence: price.unit * l.quantity, interval: price.interval});
    }
    return {service, contact, prepared, lines, totalPence: lines.reduce((t, l) => t + l.totalPence, 0),
      mode: lines.some(l => l.interval) ? 'subscription' : 'payment'};
  }
  const view = b => b.alreadyPaid ? {service: b.service.title, alreadyPaid: true} :
    {service: b.service.title, alreadyPaid: false, currency: 'GBP', totalPence: b.totalPence, mode: b.mode,
      lines: b.lines.map(({name, quantity, unitPence, totalPence, interval}) => ({name, quantity, unitPence, totalPence, interval}))};
  const inputFrom = src => ({service: String(src.service || ''), recordId: String(src.recordId || ''), centreId: String(src.centreId || ''),
    addons: src.addons && typeof src.addons === 'object' ? src.addons : parseAddons(src.addons),
    level: String(src.level || ''), branch: String(src.branch || ''), branches: src.branches || '', billing: String(src.billing || ''),
    previousId: String(src.previousId || ''), changeType: String(src.changeType || ''), start: String(src.start || ''),
    accepted: String(src.accepted || ''), firstName: String(src.firstName || ''), lastName: String(src.lastName || '')});
  function parseAddons(text) {
    const out = {};
    for (const part of String(text || '').split(',').filter(Boolean)) { const [k, v] = part.split(':'); out[k] = Number(v); }
    return out;
  }
  async function crmUpdate(req, module, id, fields) {
    try {
      await fetchImpl(crmApiDomain + '/crm/v3/' + module + '/' + id, {method: 'PUT', signal: AbortSignal.timeout(15000),
        headers: {...(await getCrmHeaders(req)), 'Content-Type': 'application/json'}, body: JSON.stringify({data: [fields]})});
    } catch { /* The charge still stands; Creator reconciles from the Stripe event. */ }
  }

  const send = fn => async (req, res, next) => { try { await fn(req, res); } catch (e) { next(e); } };
  router.use(express.json({limit: '10kb'}));
  router.use(async (req, res, next) => {
    try {
      if (!enabled) throw new HttpError(503, 'BILLING_DISABLED', 'Online payment is not available yet.');
      const user = await getCurrentUser(req);
      if (!user?.id) throw new HttpError(401, 'SIGN_IN_REQUIRED', 'Sign in to continue.');
      req.portalUser = user;
      next();
    } catch (e) { next(e); }
  });
  router.get('/quote', send(async (req, res) => {
    if (!stripeKey) throw unavailable();
    res.json({quote: view(await build(req, {...inputFrom(req.query), quote: true}))});
  }));
  router.post('/', send(async (req, res) => {
    if (!stripeKey.startsWith('sk_test_') || !/^https:\/\/[a-z0-9.-]+$/i.test(publicOrigin || '')) throw unavailable();
    if (!limiter(req.portalUser.id)) throw new HttpError(429, 'RATE_LIMIT', 'Too many requests. Please wait a moment and try again.');
    const input = inputFrom(req.body || {}), b = await build(req, input);
    if (b.alreadyPaid) return res.json({alreadyPaid: true});
    // Reuse a session already started for this record rather than create a second charge.
    if (b.prepared.existingSessionId) {
      const old = await stripe('GET', '/checkout/sessions/' + encodeURIComponent(b.prepared.existingSessionId)).catch(() => null);
      if (old?.payment_status === 'paid') return res.json({alreadyPaid: true});
      if (old?.status === 'open' && typeof old.url === 'string' && old.url.startsWith('https://checkout.stripe.com/'))
        return res.json({checkoutUrl: old.url, reused: true});
    }
    const amounts = {};
    for (const l of b.lines) amounts[l.item] = pounds(l.totalPence);
    const meta = {
      email: req.portalUser.email, name: b.contact ? [b.contact.First_Name, b.contact.Last_Name].filter(Boolean).join(' ') : '',
      currency: 'GBP', status: 'pending', source: 'portal_v2',
      ...b.prepared.metadata({amounts, total: pounds(b.totalPence), lines: b.lines}),
    };
    const params = new URLSearchParams({mode: b.mode, customer_email: req.portalUser.email,
      success_url: publicOrigin + '/app/#/payment-return?result=success&service=' + encodeURIComponent(input.service),
      cancel_url: publicOrigin + '/app/#/payment-return?result=cancelled&service=' + encodeURIComponent(input.service),
      ...(b.contact ? {client_reference_id: String(b.contact.id)} : {})});
    b.lines.forEach((l, i) => { params.set('line_items[' + i + '][price]', l.priceId); params.set('line_items[' + i + '][quantity]', String(l.quantity)); });
    for (const [k, v] of Object.entries(meta)) params.set('metadata[' + k + ']', String(v).slice(0, 500));
    const key = crypto.createHash('sha256').update([b.contact?.id || req.portalUser.id, input.service, input.recordId, input.centreId,
      JSON.stringify(b.lines.map(l => [l.priceId, l.quantity])), Math.floor(now() / 120000)].join('|')).digest('hex').slice(0, 40);
    const session = await stripe('POST', '/checkout/sessions', {body: params, key: 'portal-v2-' + key});
    if (!session.id || typeof session.url !== 'string' || !session.url.startsWith('https://checkout.stripe.com/'))
      throw new HttpError(502, 'PAYMENT_UNAVAILABLE', 'Secure checkout is unavailable.');
    if (b.prepared.record) await crmUpdate(req, b.prepared.record.module, b.prepared.record.id, {Stripe_Checkout_Session_ID: session.id, Payment_Status: 'Payment Processing'});
    res.status(201).json({checkoutUrl: session.url});
  }));
  app.use('/portal/checkout', router);
}
module.exports = {registerCheckoutRoutes};
