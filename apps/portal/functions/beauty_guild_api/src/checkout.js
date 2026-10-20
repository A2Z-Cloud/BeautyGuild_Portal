'use strict';
// Catalogue-driven Stripe Checkout, following V1: the function creates the Checkout Session and
// holds the Stripe key, and Creator handles everything after payment from the session metadata
// (the webhook is Creator's, not this function's). Amounts are never taken from the browser: the
// server decides which catalogue items apply, then reads each item's live price from Stripe.
const express = require('express');
const crypto = require('node:crypto');
const {HttpError} = require('./errors');
const {resolveContact, createCrmClient} = require('./records');
const {createRateLimiter, clientKey} = require('./rateLimit');
const {ITEMS, SERVICES, pounds} = require('./catalogue');

const STRIPE = 'https://api.stripe.com/v1';
const ID = /^\d{10,25}$/;
const EXPIRED = 'This quote has expired. Please get a new quote.';
const PRICE_ID = /^price_[A-Za-z0-9]{6,}$/;

function registerCheckoutRoutes(app, {publicQuotesEnabled = false, enabled, getCurrentUser, getCrmHeaders, crmApiDomain, stripeKey, prices = {}, publicOrigin, riskChecks = null, fetchImpl = fetch, now = Date.now}) {
  const router = express.Router();
  const {call: crm} = createCrmClient({getCrmHeaders, crmApiDomain, fetchImpl});
  const limiter = createRateLimiter({limit: 20, windowMs: 60 * 1000, now});
  // Each insurance pay attempt writes 5 to 15 CRM records, so it has its own, lower limits.
  const insuranceMinute = createRateLimiter({limit: 3, windowMs: 60 * 1000, now});
  const insuranceHour = createRateLimiter({limit: 10, windowMs: 60 * 60 * 1000, now});
  // Insurance attempts by what was asked for. A retry or double click within a few minutes gets the
  // same records and the same open session instead of a duplicate set. (Per instance, like the limiters.)
  const attempts = new Map(), referrals = new Map(), ATTEMPT_TTL = 5 * 60 * 1000, QUOTE_LIFE_MS = (23 * 60 + 50) * 60 * 1000;
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

  async function build(req, input, {guest = false} = {}) {
    const service = SERVICES[input.service];
    if (!service) throw new HttpError(422, 'INVALID_REQUEST', 'Choose something to pay for.');
    let contact = null;
    // A guest (no account) has no contact and is never risk screened: their price is a guide, and the checks run when they pay.
    if (!guest) {
      try { contact = await resolveContact(req, crm, req.portalUser); }
      catch (e) { if (!(service.allowNoContact && e.code === 'CONTACT_UNLINKED')) throw e; }
    }
    const prepared = await service.prepare({req, crm, contact, input, user: guest ? null : req.portalUser, risk: guest ? null : riskChecks});
    if (prepared.alreadyPaid) return {service, contact, alreadyPaid: true};
    const lines = [];
    for (const l of prepared.lines) {
      const price = await priceFor(l.item);
      lines.push({item: l.item, name: ITEMS[l.item].name, quantity: l.quantity, priceId: price.id, unitPence: price.unit,
        totalPence: price.unit * l.quantity, interval: price.interval});
    }
    // Computed items (insurance premiums) have no catalogue price: they travel as inline price_data.
    for (const l of prepared.inline || []) lines.push({item: null, name: l.name, quantity: l.quantity, priceId: null, unitPence: l.unitPence, totalPence: l.unitPence * l.quantity, interval: null});
    if (!lines.length && !prepared.blocked) throw new HttpError(422, 'INVALID_REQUEST', 'Choose something to pay for.');
    return {service, contact, prepared, lines, totalPence: lines.reduce((t, l) => t + l.totalPence, 0),
      mode: lines.some(l => l.interval) ? 'subscription' : 'payment'};
  }
  const view = b => b.alreadyPaid ? {service: b.service.title, alreadyPaid: true} :
    {service: b.service.title, alreadyPaid: false, currency: 'GBP', totalPence: b.totalPence, mode: b.mode,
      payable: !b.prepared.blocked, ...(b.prepared.blocked ? {blocked: b.prepared.blocked} : {}),
      lines: b.lines.map(({name, quantity, unitPence, totalPence, interval}) => ({name, quantity, unitPence, totalPence, interval}))};
  const inputFrom = src => ({service: String(src.service || ''), recordId: String(src.recordId || ''), centreId: String(src.centreId || ''),
    addons: src.addons && typeof src.addons === 'object' ? src.addons : parseAddons(src.addons),
    level: String(src.level || ''), branch: String(src.branch || ''), branches: src.branches || '', billing: String(src.billing || ''),
    previousId: String(src.previousId || ''), changeType: String(src.changeType || ''), start: String(src.start || ''),
    accepted: String(src.accepted || ''), firstName: String(src.firstName || ''), lastName: String(src.lastName || ''),
    country: String(src.country || ''), businessName: String(src.businessName || ''), address1: String(src.address1 || ''), address2: String(src.address2 || ''),
    town: String(src.town || ''), county: String(src.county || ''), postcode: String(src.postcode || ''), insurance: src.insurance && typeof src.insurance === 'object' && !Array.isArray(src.insurance) ? src.insurance : null});
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

  // Creates a CRM record and returns its id. Used for the insurance records, which exist before payment.
  async function crmCreate(req, module, record) {
    let r, body;
    try {
      r = await fetchImpl(crmApiDomain + '/crm/v3/' + module, {method: 'POST', signal: AbortSignal.timeout(15000),
        headers: {...(await getCrmHeaders(req)), 'Content-Type': 'application/json'}, body: JSON.stringify({data: [record]})});
      body = await r.json();
    } catch { throw new HttpError(502, 'CRM_UNAVAILABLE', 'We could not prepare your insurance application. Please try again.'); }
    const result = body?.data?.[0];
    if (!r.ok || result?.status !== 'success' || !result.details?.id) throw new HttpError(502, 'CRM_UNAVAILABLE', 'We could not prepare your insurance application. Please try again.');
    return String(result.details.id);
  }

  // A REFER or STOP application is recorded in the CRM for the Insurance team (nothing goes to Stripe). The same
  // application within a few minutes is recorded once, and a recording that fails is an error, never a silent skip.
  async function recordReferral(req, b) {
    const key = crypto.createHash('sha256').update([req.portalUser.id, b.prepared.fingerprint || '', b.prepared.blocked.status].join('|')).digest('hex');
    const hit = referrals.get(key);
    if (hit && now() - hit.at < ATTEMPT_TTL) { await hit.promise; return; }
    if (!insuranceMinute(req.portalUser.id) || !insuranceHour(req.portalUser.id)) throw new HttpError(429, 'RATE_LIMIT', 'Too many insurance attempts. Please wait a few minutes and try again.');
    const promise = b.prepared.refer((module, record) => crmCreate(req, module, record));
    referrals.set(key, {at: now(), promise});
    promise.catch(() => { if (referrals.get(key)?.promise === promise) referrals.delete(key); });
    await promise;
  }

  const send = fn => async (req, res, next) => { try { await fn(req, res); } catch (e) { next(e); } };
  router.use(express.json({limit: '40kb'}));
  router.use(async (req, res, next) => {
    try {
      if (!enabled) throw new HttpError(503, 'BILLING_DISABLED', 'Online payment is not available yet.');
      const user = await getCurrentUser(req);
      if (!user?.id) throw new HttpError(401, 'SIGN_IN_REQUIRED', 'Sign in to continue.');
      req.portalUser = user;
      next();
    } catch (e) { next(e); }
  });
  // Price a membership without an account, so the form can be filled in and priced before anyone signs up. Membership only: renewals and
  // standalone insurance need a signed-in member. Nothing is read from or written to the CRM, and it is rate limited per client.
  const guestLimiter = createRateLimiter({limit: 30, windowMs: 60 * 1000, now});
  app.post('/public/quote', express.json({limit: '40kb'}), send(async (req, res) => {
    if (!enabled || !publicQuotesEnabled || !stripeKey) throw unavailable();
    if (!guestLimiter(clientKey(req))) throw new HttpError(429, 'RATE_LIMIT', 'Too many requests. Please wait a moment and try again.');
    const input = {...inputFrom(req.body || {}), quote: true};
    if (input.service !== 'membership') throw new HttpError(422, 'SIGN_IN_FOR_PRICE', 'Sign in to see this price.');
    if (input.previousId) throw new HttpError(422, 'SIGN_IN_FOR_PRICE', 'Sign in to renew or upgrade your membership.');
    res.json({quote: {...view(await build(req, input, {guest: true})), indicative: true}});
  }));
  router.get('/quote', send(async (req, res) => {
    if (!stripeKey) throw unavailable();
    res.json({quote: view(await build(req, {...inputFrom(req.query), quote: true}))});
  }));
  // The same summary as GET /quote, for requests too large for a query string (insurance answers).
  router.post('/quote', send(async (req, res) => {
    if (!stripeKey) throw unavailable();
    res.json({quote: view(await build(req, {...inputFrom(req.body || {}), quote: true}))});
  }));
  // Pay for a quote you already have: the policy's own Stripe session, if it is still open. A quote whose session has
  // run out (or that never got one) is marked Expired and has to be quoted again.
  router.post('/resume', send(async (req, res) => {
    if (!stripeKey) throw unavailable();
    if (!limiter(req.portalUser.id)) throw new HttpError(429, 'RATE_LIMIT', 'Too many requests. Please wait a moment and try again.');
    const id = String(req.body?.policyId || '');
    if (!ID.test(id)) throw new HttpError(404, 'NOT_FOUND', 'Quote not found.');
    const contact = await resolveContact(req, crm, req.portalUser);
    const policy = (await crm(req, 'Insurance_Policy/' + id + '?fields=' + encodeURIComponent('Contact,Application_Status,Stripe_Checkout_Session_ID,Quote_Expiry')))[0];
    if (!policy || String(policy.Contact?.id) !== String(contact.id)) throw new HttpError(404, 'NOT_FOUND', 'Quote not found.');
    if (policy.Application_Status === 'Expired') throw new HttpError(409, 'QUOTE_EXPIRED', EXPIRED);
    if (policy.Application_Status !== 'Ready for Payment') throw new HttpError(409, 'NOT_PAYABLE', 'This quote cannot be paid for online.');
    const session = policy.Stripe_Checkout_Session_ID ? await stripe('GET', '/checkout/sessions/' + encodeURIComponent(policy.Stripe_Checkout_Session_ID)).catch(() => null) : null;
    if (session?.payment_status === 'paid') return res.json({alreadyPaid: true});
    if (session?.status === 'open' && typeof session.url === 'string' && session.url.startsWith('https://checkout.stripe.com/')) return res.json({checkoutUrl: session.url, reused: true});
    await crmUpdate(req, 'Insurance_Policy', id, {Application_Status: 'Expired'});
    throw new HttpError(409, 'QUOTE_EXPIRED', EXPIRED);
  }));
  router.post('/', send(async (req, res) => {
    if (!stripeKey.startsWith('sk_test_') || !/^https:\/\/[a-z0-9.-]+$/i.test(publicOrigin || '')) throw unavailable();
    if (!limiter(req.portalUser.id)) throw new HttpError(429, 'RATE_LIMIT', 'Too many requests. Please wait a moment and try again.');
    const input = inputFrom(req.body || {}), b = await build(req, input);
    if (b.alreadyPaid) return res.json({alreadyPaid: true});
    if (b.prepared.blocked) {
      const blocked = b.prepared.blocked;
      if (blocked.status !== 'INCOMPLETE' && b.prepared.refer) await recordReferral(req, b);
      throw new HttpError(422, 'REFERRAL_REQUIRED', blocked.status === 'INCOMPLETE' ? blocked.reasons.join(' ')
        : blocked.riskMessage || 'This insurance quote needs a review by the Insurance team, so it cannot be paid for online. We will be in touch.');
    }
    // Reuse a session already started for this record rather than create a second charge.
    if (b.prepared.existingSessionId) {
      const old = await stripe('GET', '/checkout/sessions/' + encodeURIComponent(b.prepared.existingSessionId)).catch(() => null);
      if (old?.payment_status === 'paid') return res.json({alreadyPaid: true});
      if (old?.status === 'open' && typeof old.url === 'string' && old.url.startsWith('https://checkout.stripe.com/'))
        return res.json({checkoutUrl: old.url, reused: true});
    }
    // Insurance CRM records are created now, before payment, as V1 does: Creator's webhook reads their ids from the metadata.
    const startSession = async () => {
      // Insurance CRM records are created now, before payment, as V1 does: Creator's webhook reads their ids from the metadata.
      // A payable insurance quote lives as long as its Stripe session: 23 hours 50 minutes (Stripe's limit is 24 hours).
      const expiresAt = b.prepared.beforePay ? new Date(now() + QUOTE_LIFE_MS) : null;
      const insuranceIds = b.prepared.beforePay ? await b.prepared.beforePay((module, record) => crmCreate(req, module, record), {expiresAt}) : null;
      const catalogue = b.lines.filter(l => l.item);
      const amounts = {};
      for (const l of catalogue) amounts[l.item] = pounds(l.totalPence);
      const meta = {
        email: req.portalUser.email, name: b.contact ? [b.contact.First_Name, b.contact.Last_Name].filter(Boolean).join(' ') : '',
        currency: 'GBP', status: 'pending', source: 'portal_v2',
        ...b.prepared.metadata({amounts, total: pounds(b.totalPence), lines: catalogue, insuranceIds}),
      };
      const params = new URLSearchParams({mode: b.mode, customer_email: req.portalUser.email, ...(expiresAt ? {expires_at: String(Math.floor(expiresAt.getTime() / 1000))} : {}),
        success_url: publicOrigin + '/app/#/payment-return?result=success&service=' + encodeURIComponent(input.service),
        cancel_url: publicOrigin + '/app/#/payment-return?result=cancelled&service=' + encodeURIComponent(input.service),
        ...(b.contact ? {client_reference_id: String(b.contact.id)} : {})});
      b.lines.forEach((l, i) => {
        if (l.priceId) params.set('line_items[' + i + '][price]', l.priceId);
        else { params.set('line_items[' + i + '][price_data][currency]', 'gbp'); params.set('line_items[' + i + '][price_data][product_data][name]', l.name); params.set('line_items[' + i + '][price_data][unit_amount]', String(l.unitPence)); }
        params.set('line_items[' + i + '][quantity]', String(l.quantity));
      });
      for (const [k, v] of Object.entries(meta)) params.set('metadata[' + k + ']', String(v).slice(0, 500));
      const key = crypto.createHash('sha256').update([b.contact?.id || req.portalUser.id, input.service, input.recordId, input.centreId,
        JSON.stringify(b.lines.map(l => [l.priceId || l.name + ':' + l.unitPence, l.quantity])), b.prepared.fingerprint || '', Math.floor(now() / 120000),
        // Stripe refuses a repeated key whose request differs in any way. The request carries a fresh quote reference, expiry and the
        // member's details, so a second click, or a change of branch within two minutes, must get its own key or checkout fails (502).
        params.toString()].join('|')).digest('hex').slice(0, 40);
      const session = await stripe('POST', '/checkout/sessions', {body: params, key: 'portal-v2-' + key});
      if (!session.id || typeof session.url !== 'string' || !session.url.startsWith('https://checkout.stripe.com/'))
        throw new HttpError(502, 'PAYMENT_UNAVAILABLE', 'Secure checkout is unavailable.');
      if (insuranceIds?.policyId) await crmUpdate(req, 'Insurance_Policy', insuranceIds.policyId, {Stripe_Checkout_Session_ID: session.id});
      if (b.prepared.record) await crmUpdate(req, b.prepared.record.module, b.prepared.record.id, b.prepared.record.update(session.id));
      return session;
    };
    if (b.prepared.beforePay) {
      const attemptKey = crypto.createHash('sha256').update([req.portalUser.id, JSON.stringify({...input, insurance: undefined}), b.prepared.fingerprint || '',
        JSON.stringify(b.lines.map(l => [l.priceId || l.name + ':' + l.unitPence, l.quantity]))].join('|')).digest('hex');
      const hit = attempts.get(attemptKey);
      if (hit && now() - hit.at < ATTEMPT_TTL) {
        const earlier = await hit.promise.catch(() => null);
        const old = earlier && await stripe('GET', '/checkout/sessions/' + encodeURIComponent(earlier.id)).catch(() => null);
        if (old?.payment_status === 'paid') return res.json({alreadyPaid: true});
        if (old?.status === 'open' && typeof old.url === 'string' && old.url.startsWith('https://checkout.stripe.com/')) return res.json({checkoutUrl: old.url, reused: true});
        attempts.delete(attemptKey);
      }
      if (!insuranceMinute(req.portalUser.id) || !insuranceHour(req.portalUser.id)) throw new HttpError(429, 'RATE_LIMIT', 'Too many insurance attempts. Please wait a few minutes and try again.');
      const promise = startSession();
      attempts.set(attemptKey, {at: now(), promise});
      promise.catch(() => { if (attempts.get(attemptKey)?.promise === promise) attempts.delete(attemptKey); });
      return res.status(201).json({checkoutUrl: (await promise).url});
    }
    const session = await startSession();
    res.status(201).json({checkoutUrl: session.url});
  }));
  app.use('/portal/checkout', router);
}
module.exports = {registerCheckoutRoutes};
