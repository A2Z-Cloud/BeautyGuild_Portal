'use strict';
// Catalogue-driven Stripe Checkout, following V1: the function creates the Checkout Session and
// holds the Stripe key, and Creator handles everything after payment from the session metadata
// (the webhook is Creator's, not this function's). Amounts are never taken from the browser: the
// server decides which catalogue items apply, then reads each item's live price from Stripe.
const express = require('express');
const crypto = require('node:crypto');
const { HttpError } = require('./errors');
const { resolveContact, createCrmClient } = require('./records');
const { createRateLimiter, clientKey } = require('./rateLimit');
const { ITEMS, SERVICES, pounds, netPounds, membershipChangeOptions } = require('./catalogue');
const { prorate } = require('./prorata');
const { saveRevision } = require('./insuranceRevisions');
const { loadCover } = require('./cover');
const plans = require('./plans');
const { createDiscounts } = require('./discounts');
const { createCrmStore } = require('./voucherAdapter');
const { applyDiscounts, discountsMetadata, DiscountError, BRANCH } = require('./discountEngine');
const { branchCouponPlan, createBranchCoupon } = require('./branchCoupon');
const { fitToStripeLimit, filledCount, MAX_FILLED_KEYS } = require('./metadataContract');

const STRIPE = 'https://api.stripe.com/v1';
const ID = /^\d{10,25}$/;
// Stripe will not take a charge under 30p; below 50p a pro-rated line is not worth taking online.
const MIN_PRORATA_PENCE = 50;
const EXPIRED = 'This quote has expired. Please get a new quote.';
const PRICE_ID = /^price_[A-Za-z0-9]{6,}$/;

function registerCheckoutRoutes(
  app,
  {
    publicQuotesEnabled = false,
    discountsEnabled = false,
    voucherRedemptionEnabled = false,
    discountReferenceField = '',
    // Who is applying a voucher or waivers, for the future staff route:
    // async (req, input) => ({code, waivers, actor, store, applicationId}) or null.
    // Nothing is wired to it yet; customers never reach it (their requests carry only the referral code).
    discountRequestFor = null,
    membershipChangesEnabled = false,
    insuranceChangesEnabled = false,
    insuranceChangesWritesEnabled = false,
    insuranceChangesPaymentEnabled = false,
    revisionNamePrefix = '',
    staffPaymentLinksEnabled = false,
    // Reads voucher use history from Creator (creatorReports.js). Without it a voucher fails closed, as the use history cannot be checked.
    creatorReader = undefined,
    enabled,
    getCurrentUser,
    getCrmHeaders,
    crmApiDomain,
    stripeKey,
    publicOrigin,
    riskChecks = null,
    fetchImpl = fetch,
    now = Date.now,
  },
) {
  const router = express.Router();
  const { call: crm } = createCrmClient({ getCrmHeaders, crmApiDomain, fetchImpl });
  // School referral code and the 30 day joining fee rule: absent unless PORTAL_DISCOUNTS_ENABLED is 'true'.
  const discounts = discountsEnabled ? createDiscounts({ crm, referenceField: discountReferenceField, now }) : null;
  const limiter = createRateLimiter({ limit: 20, windowMs: 60 * 1000, now });
  // Each insurance pay attempt writes 5 to 15 CRM records, so it has its own, lower limits.
  const insuranceMinute = createRateLimiter({ limit: 3, windowMs: 60 * 1000, now });
  const insuranceHour = createRateLimiter({ limit: 10, windowMs: 60 * 60 * 1000, now });
  // Insurance attempts by what was asked for. A retry or double click within a few minutes gets the
  // same records and the same open session instead of a duplicate set. (Per instance, like the limiters.)
  const attempts = new Map(),
    referrals = new Map(),
    ATTEMPT_TTL = 5 * 60 * 1000,
    QUOTE_LIFE_MS = (23 * 60 + 50) * 60 * 1000;
  const unavailable = () => new HttpError(503, 'CHECKOUT_UNAVAILABLE', 'Online payment is not available yet.');
  const priceCache = new Map();

  async function stripe(method, path, params) {
    let r;
    try {
      r = await fetchImpl(STRIPE + path, {
        method,
        signal: AbortSignal.timeout(15000),
        ...(params ? { body: params.body } : {}),
        headers: {
          Authorization: 'Bearer ' + stripeKey,
          ...(params ? { 'Content-Type': 'application/x-www-form-urlencoded', 'Idempotency-Key': params.key } : {}),
        },
      });
    } catch {
      throw new HttpError(502, 'PAYMENT_UNAVAILABLE', 'Secure checkout is unavailable.');
    }
    const body = await r.json().catch(() => null);
    if (!r.ok || !body) throw new HttpError(502, 'PAYMENT_UNAVAILABLE', 'Secure checkout is unavailable.');
    return body;
  }
  // The price a catalogue item points at: the active Stripe price whose lookup key is the item's price list code. Books keeps the
  // list; a price change is a new Stripe price that takes the lookup key over. Read live and held briefly.
  async function priceFor(itemKey) {
    const item = ITEMS[itemKey],
      unavailable409 = () => new HttpError(409, 'ITEM_NOT_AVAILABLE', item.name + ' cannot be bought online yet.');
    const hit = priceCache.get(item.code);
    if (hit && now() - hit.at < 60000) return hit.price;
    const found = await stripe(
      'GET',
      '/prices?lookup_keys[]=' + encodeURIComponent(item.code) + '&active=true&limit=1',
    );
    const p = Array.isArray(found.data) ? found.data[0] : null;
    if (!p || !PRICE_ID.test(String(p.id || ''))) throw unavailable409();
    if (
      !p.active ||
      p.currency !== 'gbp' ||
      !Number.isSafeInteger(p.unit_amount) ||
      p.unit_amount < 50 ||
      p.unit_amount > 10000000
    )
      throw unavailable409();
    // The catalogue says whether an item is one-off or recurring; a mismatched Stripe price is refused.
    if (
      !item.oneOff &&
      ((item.interval || null) !== (p.recurring?.interval || null) || (p.recurring && p.recurring.interval_count !== 1))
    )
      throw unavailable409();
    const price = { id: p.id, unit: p.unit_amount, interval: item.oneOff ? null : p.recurring?.interval || null };
    priceCache.set(item.code, { price, at: now() });
    return price;
  }

  // A signed-in customer with no CRM Contact gets one when they press Pay or a quote is referred, so the policy, the referral and
  // the payment all belong to a person in the CRM. Only the verified email is used to find or make the Contact; the name and address
  // typed on the page only fill in a new one. A quote or a price check never creates one.
  const madeContacts = new Map(),
    makingContact = new Map();
  const clean = (v, n = 80) =>
    String(v ?? '')
      .replace(/[\u0000-\u001f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, n);
  async function ensureContact(req, input) {
    const user = req.portalUser,
      email = String(user.email || '')
        .trim()
        .toLowerCase();
    // CRM search can lag a Contact made moments ago, so one made here is confirmed by id and exact email, never made twice.
    const known = madeContacts.get(user.id);
    if (known && known.email === email) {
      const row = (await crm(req, 'Contacts/' + known.id))[0];
      if (
        row &&
        String(row.Email || '')
          .trim()
          .toLowerCase() === email
      )
        return { ...row, createdNow: true };
    }
    if (makingContact.has(user.id)) return makingContact.get(user.id);
    const make = (async () => {
      const first = clean(input.firstName, 60),
        last = clean(input.lastName, 60) || first || email.split('@')[0].slice(0, 80);
      const address = {
        Correspondence_Address_Line_1: clean(input.address1, 120),
        Correspondence_Address_Line_2: clean(input.address2, 120),
        Correspondence_Town: clean(input.town, 80),
        Correspondence_County: clean(input.county, 80),
        Correspondence_Postcode: clean(input.postcode, 20),
      };
      const record = {
        ...(first ? { First_Name: first } : {}),
        Last_Name: last,
        Email: email,
        ...Object.fromEntries(Object.entries(address).filter(([, v]) => v)),
      };
      const id = await crmCreate(req, 'Contacts', record);
      if (madeContacts.size >= 500) madeContacts.delete(madeContacts.keys().next().value);
      madeContacts.set(user.id, { id, email });
      return { id, Email: email, First_Name: first, Last_Name: last, createdNow: true };
    })();
    makingContact.set(user.id, make);
    try {
      return await make;
    } finally {
      makingContact.delete(user.id);
    }
  }

  async function build(req, input, { guest = false, createContact = false, staff = null } = {}) {
    const service = SERVICES[input.service];
    if (!service) throw new HttpError(422, 'INVALID_REQUEST', 'Choose something to pay for.');
    // Creator does not handle this payment type yet, so it stays off until the switch is turned on (PORTAL_MEMBERSHIP_CHANGES_ENABLED).
    if (input.service === 'insurance_change' && !insuranceChangesEnabled)
      throw new HttpError(503, 'NOT_AVAILABLE', 'Insurance changes are not available online yet.');
    if (input.service === 'membership_change' && !membershipChangesEnabled)
      throw new HttpError(503, 'NOT_AVAILABLE', 'Membership changes are not available online yet.');
    let contact = null;
    // A staff quote is for a Contact the staff member chose, already looked up by the staff route; nothing comes from a portal user.
    if (staff) contact = staff.contact;
    // A guest (no account) has no contact and is never risk screened: their price is a guide, and the checks run when they pay.
    else if (!guest) {
      try {
        contact = await resolveContact(req, crm, req.portalUser);
      } catch (e) {
        if (!(service.allowNoContact && e.code === 'CONTACT_UNLINKED')) throw e;
        if (createContact) contact = await ensureContact(req, input);
      }
    }
    const prepared = await service.prepare({
      req,
      crm,
      contact,
      input,
      user: staff ? { id: 'staff:' + staff.actor.id } : guest ? null : req.portalUser,
      risk: guest ? null : riskChecks,
      discounts,
    });
    if (prepared.alreadyPaid) return { service, contact, alreadyPaid: true };
    // An insurance change is payable only when the writes and the payment switches are both on (docs/delivery/mta-r3-plan.md, the gate).
    if (input.service === 'insurance_change')
      prepared.payable = insuranceChangesWritesEnabled && insuranceChangesPaymentEnabled;
    let lines = [];
    for (const l of prepared.lines) {
      const price = await priceFor(l.item);
      lines.push({
        item: l.item,
        name: ITEMS[l.item].name,
        quantity: l.quantity,
        priceId: price.id,
        unitPence: price.unit,
        totalPence: price.unit * l.quantity,
        interval: price.interval,
        term: l.term || 'ongoing',
        sku: ITEMS[l.item].code,
      });
    }
    // Computed items (insurance premiums) have no catalogue price: they travel as inline price_data. A named employee's membership fee is
    // charged once, inline, at the live membership price (priceItem).
    for (const l of prepared.inline || []) {
      const live = l.priceItem ? (await priceFor(l.priceItem)).unit : null;
      // A pro-rated line (an extra branch part way through the term) is the live yearly price for the days left, to the penny.
      let unit = l.priceItem ? live : l.unitPence;
      if (l.prorata) {
        unit = prorate(live, l.prorata);
        if (unit < MIN_PRORATA_PENCE)
          throw new HttpError(
            422,
            'TOO_LATE_TO_CHANGE',
            'Your membership ends too soon to add this online. Please call the office.',
          );
      }
      lines.push({
        item: null,
        rev: l.rev,
        fee: l.priceItem && !l.prorata ? l.priceItem : null,
        fullUnitPence: l.prorata ? live : undefined,
        sku: l.sku || null,
        name: l.name,
        quantity: l.quantity,
        priceId: null,
        unitPence: unit,
        totalPence: unit * l.quantity,
        interval: null,
        term: 'ongoing',
      });
    }
    // Discounts: the school referral code (customer) and, for the staff route, a voucher and waivers. The engine prices the discount on the
    // lines HERE, before a monthly plan is split, so a monthly plan spreads it over the first 12 payments exactly (see discountEngine.js).
    const joiningFeePence = prepared.joiningFee?.due ? (await priceFor('joining_fee')).unit : 0;
    const request = staff
      ? {
          code: staff.code,
          waivers: staff.waivers,
          actor: staff.actor,
          applicationId: staff.applicationId,
          store: staff.store,
        }
      : discountsEnabled && discountRequestFor
        ? await discountRequestFor(req, input)
        : null;
    let engine = null;
    if (discountsEnabled && (prepared.discount || request)) {
      try {
        engine = await applyDiscounts(
          {
            lines,
            contactId: contact?.id ? String(contact.id) : '',
            applicationId: request?.applicationId ? String(request.applicationId) : '',
            memberType: prepared.memberType || '',
            joiningFeeSince: prepared.joiningFeeSince || '',
          },
          {
            referral: prepared.discount || null,
            code: request?.code,
            waivers: request?.waivers,
            actor: request?.actor || { type: 'customer', id: guest ? 'guest' : req.portalUser?.id },
            store: request?.store,
            allowVouchers: voucherRedemptionEnabled,
            now,
          },
        );
      } catch (e) {
        if (e instanceof DiscountError)
          throw new HttpError(e.status, e.code === 'NOT_VALID' ? 'CODE_INVALID' : e.code, e.message);
        throw e;
      }
      lines = engine.lines;
    }
    const joinOff = engine?.breakdown.find(r => r.sku === ITEMS.joining_fee.code)?.discountPence || 0;
    const discount =
      prepared.discount && joinOff
        ? {
            code: prepared.discount.code,
            school: prepared.discount.school,
            indicative: prepared.discount.indicative,
            item: 'joining_fee',
            itemCode: ITEMS.joining_fee.code,
            listPence: joiningFeePence,
            amountPence: joinOff,
            label: 'Joining fee waived (code ' + prepared.discount.code + ')',
            lineName: ITEMS.joining_fee.name,
          }
        : null;
    if (!lines.length && !prepared.blocked) throw new HttpError(422, 'INVALID_REQUEST', 'Choose something to pay for.');
    // What the yearly price is, before a monthly plan turns it into shares.
    const annualPence = lines.reduce((t, l) => t + l.totalPence, 0);
    const feeLines = lines.filter(l => l.fee);
    const fees = {
      count: feeLines.reduce((t, l) => t + l.quantity, 0),
      grossPence: feeLines.reduce((t, l) => t + l.totalPence, 0),
      netPence: Math.round(feeLines.reduce((t, l) => t + Number(netPounds(l.fee, l.totalPence, l.quantity)) * 100, 0)),
    };
    // Membership and insurance renew by themselves. A yearly purchase's ongoing lines (the membership, extra branches, insurance premiums, IPT and
    // employee fees) are therefore yearly subscription lines too, so everything carries on together; the joining fee and add-ons are paid once.
    if (prepared.renews && !prepared.monthly)
      for (const l of lines)
        if (!l.interval && l.term === 'ongoing') {
          l.interval = 'year';
          l.priceId = null;
        }
    // The additional branch discount is a one-year Stripe coupon, never a lower branch line (see branchCoupon.js). entries (the metadata and the
    // quote) are corrected to the amount the customer really gets once the coupon is rounded.
    const couponFor = plan => {
      const d = engine?.branchDiscount;
      if (!d) return { coupon: null, entries: engine?.entries || [] };
      const monthlyBranch = plan?.lines.find(l => l.sku === BRANCH)?.monthlyPence || 0;
      const coupon = branchCouponPlan({
        discountPence: d.discountPence,
        listPence: d.listPence,
        monthly: Boolean(plan),
        branchMonthlyPence: monthlyBranch,
      });
      const entries = engine.entries
        .filter(e => e.sku !== BRANCH || coupon)
        .map(e => (e.sku === BRANCH ? { ...e, amount: (coupon.totalPence / 100).toFixed(2) } : e));
      return { coupon, entries };
    };
    const discountLines = entries =>
      entries.map(e => ({
        source: e.source,
        code: e.code || '',
        reason: e.reason || '',
        sku: e.sku,
        amountPence: Math.round(Number(e.amount) * 100),
      }));
    if (prepared.monthly) {
      // A monthly plan is charged as 12 payments of the yearly price divided by 12, plus the admin fee. The joining fee and add-ons are
      // charged once, in full, with the first payment. See plans.js.
      const admin = await priceFor('admin_fee_monthly');
      const plan = plans.splitMonthly(lines, admin.unit);
      const { coupon, entries } = couponFor(plan);
      if (coupon) {
        // The coupon takes the same amount off each of the first 12 payments.
        plan.firstPaymentPence -= coupon.amountOffPence;
        plan.yearOneTotalPence -= coupon.totalPence;
      }
      const monthly = [];
      for (const l of plan.lines) {
        if (l.term === 'year_one') {
          // A one-off line on the first invoice, at its catalogue price, exactly as a yearly purchase takes it.
          monthly.push({
            item: l.item,
            fee: l.fee,
            sku: l.sku,
            name: l.name,
            quantity: l.quantity,
            priceId: l.priceId,
            unitPence: l.unitPence,
            totalPence: l.totalPence,
            interval: null,
            term: 'year_one',
          });
        } else if (l.monthlyPence > 0)
          monthly.push({
            item: l.item,
            fee: l.fee,
            sku: l.sku,
            name: l.name.replace('(annual)', '(monthly)') + (l.quantity > 1 && !l.fee ? ' x ' + l.quantity : ''),
            quantity: 1,
            origQuantity: l.quantity,
            scale: 1 / plans.PAYMENTS,
            priceId: null,
            unitPence: l.monthlyPence,
            totalPence: l.monthlyPence,
            interval: 'month',
            term: 'ongoing',
          });
      }
      monthly.push({
        item: 'admin_fee_monthly',
        sku: ITEMS.admin_fee_monthly.code,
        name: ITEMS.admin_fee_monthly.name,
        quantity: 1,
        priceId: admin.id,
        unitPence: admin.unit,
        totalPence: admin.unit,
        interval: 'month',
        term: 'ongoing',
      });
      return {
        service,
        contact,
        prepared,
        discount,
        engine,
        entries,
        discountLines: discountLines(entries),
        branchCoupon: coupon,
        joiningFeePence,
        lines: monthly,
        fees,
        plan,
        annualPence,
        totalPence: plan.firstPaymentPence,
        mode: 'subscription',
      };
    }
    const { coupon, entries } = couponFor(null);
    return {
      service,
      contact,
      prepared,
      discount,
      engine,
      entries,
      discountLines: discountLines(entries),
      branchCoupon: coupon,
      joiningFeePence,
      lines,
      fees,
      annualPence,
      totalPence: lines.reduce((t, l) => t + l.totalPence, 0) - (coupon?.totalPence || 0),
      mode: lines.some(l => l.interval) ? 'subscription' : 'payment',
    };
  }
  const view = b =>
    b.alreadyPaid
      ? { service: b.service.title, alreadyPaid: true }
      : {
          service: b.service.title,
          alreadyPaid: false,
          currency: 'GBP',
          totalPence: b.totalPence,
          mode: b.mode,
          payable: !b.prepared.blocked && b.prepared.payable !== false,
          ...(b.prepared.details ? { details: b.prepared.details } : {}),
          ...(b.prepared.revisionDetails ? { revisions: b.prepared.revisionDetails } : {}),
          ...(b.prepared.blocked ? { blocked: b.prepared.blocked } : {}),
          // Only with discounts on, and only on the Join page's membership: whether a joining fee is due (so the page can offer a code box),
          // the discount that applies (label, amount, which line), and the one message when a code was refused or is not needed.
          ...(b.prepared.joiningFee
            ? { joiningFee: { due: b.prepared.joiningFee.due, amountPence: b.joiningFeePence } }
            : {}),
          ...(b.discount
            ? {
                discount: {
                  code: b.discount.code,
                  label: b.discount.label,
                  amountPence: b.discount.amountPence,
                  line: b.discount.item,
                  lineName: b.discount.lineName,
                  indicative: Boolean(b.discount.indicative),
                },
              }
            : {}),
          // Every discount on the basket (referral, voucher, waiver), by item. A branch discount shows the amount the coupon really gives.
          ...(b.discountLines?.length ? { discounts: b.discountLines } : {}),
          ...(b.prepared.codeResult && b.prepared.codeResult.status !== 'applied'
            ? { codeResult: { status: b.prepared.codeResult.status, message: b.prepared.codeResult.message } }
            : {}),
          // A monthly plan: 12 payments a year, the first including the joining fee and any add-ons in full, every later one (and every renewal) the same ongoing amount.
          ...(b.plan
            ? {
                plan: {
                  payments: plans.PAYMENTS,
                  firstPaymentPence: b.plan.firstPaymentPence,
                  laterPaymentPence: b.plan.laterPaymentPence,
                  oneOffPence: b.plan.oneOffPence,
                  yearOneTotalPence: b.plan.yearOneTotalPence,
                  adminFeePence: b.plan.adminPence,
                },
              }
            : {}),
          lines: b.lines.map(({ name, quantity, unitPence, totalPence, interval }) => ({
            name,
            quantity,
            unitPence,
            totalPence,
            interval,
          })),
        };
  const inputFrom = src => ({
    service: String(src.service || ''),
    recordId: String(src.recordId || ''),
    centreId: String(src.centreId || ''),
    code: String(src.code || '').slice(0, 60),
    addons: src.addons && typeof src.addons === 'object' ? src.addons : parseAddons(src.addons),
    level: String(src.level || ''),
    branch: String(src.branch || ''),
    branches: src.branches || '',
    billing: String(src.billing || ''),
    previousId: String(src.previousId || ''),
    changeType: String(src.changeType || ''),
    start: String(src.start || ''),
    accepted: String(src.accepted || ''),
    firstName: String(src.firstName || ''),
    lastName: String(src.lastName || ''),
    country: String(src.country || ''),
    change: src.change && typeof src.change === 'object' && !Array.isArray(src.change) ? src.change : null,
    changes: Array.isArray(src.changes) ? src.changes.filter(c => c && typeof c === 'object').slice(0, 6) : null,
    businessName: String(src.businessName || ''),
    address1: String(src.address1 || ''),
    address2: String(src.address2 || ''),
    town: String(src.town || ''),
    county: String(src.county || ''),
    postcode: String(src.postcode || ''),
    insurance:
      src.insurance && typeof src.insurance === 'object' && !Array.isArray(src.insurance) ? src.insurance : null,
  });
  function parseAddons(text) {
    const out = {};
    for (const part of String(text || '')
      .split(',')
      .filter(Boolean)) {
      const [k, v] = part.split(':');
      out[k] = Number(v);
    }
    return out;
  }
  async function crmUpdate(req, module, id, fields) {
    try {
      await fetchImpl(crmApiDomain + '/crm/v3/' + module + '/' + id, {
        method: 'PUT',
        signal: AbortSignal.timeout(15000),
        headers: { ...(await getCrmHeaders(req)), 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: [fields] }),
      });
    } catch {
      /* The charge still stands; Creator reconciles from the Stripe event. */
    }
  } // As crmUpdate, but a failure is an error: used where the CRM must agree with what Stripe has been told.
  async function crmUpdateStrict(req, module, id, fields) {
    let r;
    try {
      r = await fetchImpl(crmApiDomain + '/crm/v3/' + module + '/' + id, {
        method: 'PUT',
        signal: AbortSignal.timeout(15000),
        headers: { ...(await getCrmHeaders(req)), 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: [fields] }),
      });
    } catch {
      throw new HttpError(502, 'CRM_UNAVAILABLE', 'We could not finish setting up your payment. Please try again.');
    }
    if (!r.ok)
      throw new HttpError(502, 'CRM_UNAVAILABLE', 'We could not finish setting up your payment. Please try again.');
  }

  // Creates a CRM record and returns its id. Used for the insurance records, which exist before payment.
  async function crmCreate(
    req,
    module,
    record,
    failure = 'We could not prepare your insurance application. Please try again.',
  ) {
    let r, body;
    try {
      r = await fetchImpl(crmApiDomain + '/crm/v3/' + module, {
        method: 'POST',
        signal: AbortSignal.timeout(15000),
        headers: { ...(await getCrmHeaders(req)), 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: [record] }),
      });
      body = await r.json();
    } catch {
      throw new HttpError(502, 'CRM_UNAVAILABLE', failure);
    }
    const result = body?.data?.[0];
    if (!r.ok || result?.status !== 'success' || !result.details?.id)
      throw new HttpError(502, 'CRM_UNAVAILABLE', failure);
    return String(result.details.id);
  }

  // A REFER or STOP application is recorded in the CRM for the Insurance team (nothing goes to Stripe). The same
  // application within a few minutes is recorded once, and a recording that fails is an error, never a silent skip.
  async function recordReferral(req, b, payer) {
    const key = crypto
      .createHash('sha256')
      .update([payer.id, b.prepared.fingerprint || '', b.prepared.blocked.status].join('|'))
      .digest('hex');
    const hit = referrals.get(key);
    if (hit && now() - hit.at < ATTEMPT_TTL) return hit.promise;
    if (!insuranceMinute(payer.id) || !insuranceHour(payer.id))
      throw new HttpError(429, 'RATE_LIMIT', 'Too many insurance attempts. Please wait a few minutes and try again.');
    const promise = b.prepared.refer((module, record) => crmCreate(req, module, record));
    referrals.set(key, { at: now(), promise });
    promise.catch(() => {
      if (referrals.get(key)?.promise === promise) referrals.delete(key);
    });
    return promise;
  }

  const send = fn => async (req, res, next) => {
    try {
      await fn(req, res);
    } catch (e) {
      next(e);
    }
  };
  router.use(express.json({ limit: '40kb' }));
  router.use(async (req, res, next) => {
    try {
      if (!enabled) throw new HttpError(503, 'BILLING_DISABLED', 'Online payment is not available yet.');
      const user = await getCurrentUser(req);
      if (!user?.id) throw new HttpError(401, 'SIGN_IN_REQUIRED', 'Sign in to continue.');
      req.portalUser = user;
      next();
    } catch (e) {
      next(e);
    }
  });
  // Price a membership without an account, so the form can be filled in and priced before anyone signs up. Membership only: renewals and
  // standalone insurance need a signed-in member. Nothing is read from or written to the CRM, and it is rate limited per client.
  const guestLimiter = createRateLimiter({ limit: 30, windowMs: 60 * 1000, now });
  app.post(
    '/public/quote',
    express.json({ limit: '40kb' }),
    send(async (req, res) => {
      if (!enabled || !publicQuotesEnabled || !stripeKey) throw unavailable();
      if (!guestLimiter(clientKey(req)))
        throw new HttpError(429, 'RATE_LIMIT', 'Too many requests. Please wait a moment and try again.');
      const input = { ...inputFrom(req.body || {}), quote: true };
      if (input.service !== 'membership') throw new HttpError(422, 'SIGN_IN_FOR_PRICE', 'Sign in to see this price.');
      if (input.previousId)
        throw new HttpError(422, 'SIGN_IN_FOR_PRICE', 'Sign in to renew or upgrade your membership.');
      res.json({ quote: { ...view(await build(req, input, { guest: true })), indicative: true } });
    }),
  );
  // Saves the revisions of a priced insurance change. Shared by the customer route and the staff route; `audit` is {field, value} for staff.
  async function persistRevisions(req, b, recordId) {
    const revisions = b.prepared.revisions;
    if (!revisions || !revisions.length) throw new HttpError(422, 'INVALID_REQUEST', 'Choose a change to save.');
    // A change the member can pay for is only saved once every declaration and confirmation is answered.
    for (const r of revisions)
      if (r.outcome === 'PASS' && r.details.incomplete.length)
        throw new HttpError(422, 'INCOMPLETE', [...new Set(r.details.incomplete)].join(' '));
    const failure = 'We could not save your change. Please try again.';
    const ids = new Map();
    const saved = [];
    for (const r of revisions)
      saved.push(
        await saveRevision({
          ...r,
          ids,
          read: path => crm(req, path),
          create: (module, record) => crmCreate(req, module, record, failure),
          update: (module, id, fields) => crmUpdate(req, module, id, fields),
          contactId: b.contact.id,
          dealId: recordId,
          lines: b.lines,
          namePrefix: revisionNamePrefix,
        }),
      );
    return saved;
  }
  // Saves a quoted insurance change as a revision in the CRM: a payable change as Quoted with draft rows, a referred one as Under Review
  // with the full request for the office. Nothing is charged and no live cover row is touched. Off until the writes switch is on.
  router.post(
    '/insurance-change/revision',
    send(async (req, res) => {
      if (!insuranceChangesEnabled || !insuranceChangesWritesEnabled)
        throw new HttpError(503, 'NOT_AVAILABLE', 'Insurance changes are not available online yet.');
      if (!limiter(req.portalUser.id))
        throw new HttpError(429, 'RATE_LIMIT', 'Too many requests. Please wait a moment and try again.');
      const b = await build(req, { ...inputFrom(req.body || {}), service: 'insurance_change', quote: true });
      const saved = await persistRevisions(req, b, String(req.body?.recordId || ''));
      res.status(saved.every(x => x.reused) ? 200 : 201).json({ revision: saved[0], revisions: saved });
    }),
  );
  // What a member can choose when changing a membership: each branch and whether they already hold it.
  router.get(
    '/membership-options',
    send(async (req, res) => {
      if (!membershipChangesEnabled)
        throw new HttpError(503, 'NOT_AVAILABLE', 'Membership changes are not available online yet.');
      const contact = await resolveContact(req, crm, req.portalUser);
      res.json({ options: await membershipChangeOptions(req, crm, contact.id, String(req.query.recordId || '')) });
    }),
  );
  router.get(
    '/quote',
    send(async (req, res) => {
      if (!stripeKey) throw unavailable();
      res.json({ quote: view(await build(req, { ...inputFrom(req.query), quote: true })) });
    }),
  );
  // The same summary as GET /quote, for requests too large for a query string (insurance answers).
  router.post(
    '/quote',
    send(async (req, res) => {
      if (!stripeKey) throw unavailable();
      res.json({ quote: view(await build(req, { ...inputFrom(req.body || {}), quote: true })) });
    }),
  );
  // Pay for a quote you already have: the policy's own Stripe session, if it is still open. A quote whose session has
  // run out (or that never got one) is marked Expired and has to be quoted again.
  router.post(
    '/resume',
    send(async (req, res) => {
      if (!stripeKey) throw unavailable();
      if (!limiter(req.portalUser.id))
        throw new HttpError(429, 'RATE_LIMIT', 'Too many requests. Please wait a moment and try again.');
      const id = String(req.body?.policyId || '');
      if (!ID.test(id)) throw new HttpError(404, 'NOT_FOUND', 'Quote not found.');
      const contact = await resolveContact(req, crm, req.portalUser);
      const policy = (
        await crm(
          req,
          'Insurance_Policy/' +
            id +
            '?fields=' +
            encodeURIComponent('Contact,Application_Status,Stripe_Checkout_Session_ID,Quote_Expiry'),
        )
      )[0];
      if (!policy || String(policy.Contact?.id) !== String(contact.id))
        throw new HttpError(404, 'NOT_FOUND', 'Quote not found.');
      if (policy.Application_Status === 'Expired') throw new HttpError(409, 'QUOTE_EXPIRED', EXPIRED);
      if (policy.Application_Status !== 'Ready for Payment')
        throw new HttpError(409, 'NOT_PAYABLE', 'This quote cannot be paid for online.');
      const session = policy.Stripe_Checkout_Session_ID
        ? await stripe('GET', '/checkout/sessions/' + encodeURIComponent(policy.Stripe_Checkout_Session_ID)).catch(
            () => null,
          )
        : null;
      if (session?.payment_status === 'paid') return res.json({ alreadyPaid: true });
      if (
        session?.status === 'open' &&
        typeof session.url === 'string' &&
        session.url.startsWith('https://checkout.stripe.com/')
      )
        return res.json({ checkoutUrl: session.url, reused: true });
      await crmUpdate(req, 'Insurance_Policy', id, { Application_Status: 'Expired' });
      throw new HttpError(409, 'QUOTE_EXPIRED', EXPIRED);
    }),
  );
  // Pays for what the request describes: creates the Stripe Checkout Session and returns its URL. `staff` is set only by the staff payment link
  // (below): the payer is then the customer's Contact (their email is the Checkout email, so the session and the metadata Creator reads
  // identify the customer, never the staff member) and the Contact comes from staff, not from a portal user.
  const payForRequest = async (req, res, staff = null) => {
    const payer = staff ? staff.payer : req.portalUser;
    if (!stripeKey.startsWith('sk_test_') || !/^https:\/\/[a-z0-9.-]+$/i.test(publicOrigin || '')) throw unavailable();
    if (!limiter(payer.id))
      throw new HttpError(429, 'RATE_LIMIT', 'Too many requests. Please wait a moment and try again.');
    const input = inputFrom(req.body || {});
    // Paying for an insurance change needs the revision records, the payment switch and Creator (the gate in docs/delivery/mta-r3-plan.md).
    if (
      input.service === 'insurance_change' &&
      !(insuranceChangesEnabled && insuranceChangesWritesEnabled && insuranceChangesPaymentEnabled)
    )
      throw new HttpError(503, 'PAYMENT_NOT_AVAILABLE', 'Paying for an insurance change is not available online yet.');
    let b = await build(req, input, staff ? { staff } : {});
    // Rules that stop the purchase outright, or answers still missing, record nothing and make no Contact. Anything else
    // (a payment or a referral for the Insurance team) needs the customer to exist in the CRM first.
    if (!b.alreadyPaid && !b.contact && b.service.allowNoContact && b.prepared?.blocked?.status !== 'INCOMPLETE')
      b = await build(req, input, { createContact: true });
    if (b.alreadyPaid) return res.json({ alreadyPaid: true });
    // A code that is wrong is never ignored at payment: the customer would pay the fee they thought was waived.
    const codeStatus = b.prepared.codeResult?.status;
    if (codeStatus === 'invalid') throw new HttpError(422, 'CODE_INVALID', b.prepared.codeResult.message);
    if (codeStatus === 'limited') throw new HttpError(429, 'RATE_LIMIT', b.prepared.codeResult.message);
    if (b.prepared.blocked) {
      const blocked = b.prepared.blocked;
      const recorded = blocked.status !== 'INCOMPLETE' && b.prepared.refer ? await recordReferral(req, b, payer) : null;
      // What was recorded is returned so the portal can confirm it; only the id and the status, never CRM text.
      const details = recorded?.policyId
        ? { reference: String(recorded.policyId), status: blocked.status === 'STOP' ? 'Stopped' : 'Referred' }
        : undefined;
      throw new HttpError(
        422,
        'REFERRAL_REQUIRED',
        blocked.status === 'INCOMPLETE'
          ? blocked.reasons.join(' ')
          : blocked.riskMessage ||
              'This insurance quote needs a review by the Insurance team, so it cannot be paid for online. We will be in touch.',
        details,
      );
    }
    // Reuse a session already started for this record rather than create a second charge.
    if (b.prepared.existingSessionId) {
      const old = await stripe('GET', '/checkout/sessions/' + encodeURIComponent(b.prepared.existingSessionId)).catch(
        () => null,
      );
      if (old?.payment_status === 'paid') return res.json({ alreadyPaid: true });
      // Reused only if it is for the same plan: a session opened for yearly payment is not handed back to someone who now chose monthly.
      if (
        old?.status === 'open' &&
        typeof old.url === 'string' &&
        old.url.startsWith('https://checkout.stripe.com/') &&
        (old.metadata?.subscription_type || '') === (b.prepared.billing || '')
      )
        return res.json({ checkoutUrl: old.url, reused: true });
    }
    // Insurance CRM records are created now, before payment, as V1 does: Creator's webhook reads their ids from the metadata.
    const startSession = async () => {
      // Insurance CRM records are created now, before payment, as V1 does: Creator's webhook reads their ids from the metadata.
      // A payable insurance quote lives as long as its Stripe session: 23 hours 50 minutes (Stripe's limit is 24 hours).
      const expiresAt = b.prepared.beforePay ? new Date(now() + QUOTE_LIFE_MS) : null;
      const insuranceIds = b.prepared.beforePay
        ? await b.prepared.beforePay((module, record) => crmCreate(req, module, record, b.prepared.createFailure), {
            expiresAt,
            feesPence: b.fees.grossPence,
            update: (module, id, fields) => crmUpdate(req, module, id, fields),
            lines: b.lines,
            namePrefix: revisionNamePrefix,
          })
        : null;
      // The branch discount's coupon is made first so its id goes into the `discounts` metadata with the other entries.
      let couponId = '';
      if (b.branchCoupon) {
        const couponKey = crypto
          .createHash('sha256')
          .update(
            [b.contact?.id || payer.id, input.service, JSON.stringify(b.branchCoupon), Math.floor(now() / 120000)].join(
              '|',
            ),
          )
          .digest('hex')
          .slice(0, 40);
        couponId = await createBranchCoupon(stripe, b.branchCoupon, {
          entries: b.entries.filter(e => e.sku === BRANCH),
          key: 'portal-v2-coupon-' + couponKey,
        });
      }
      const discountsEntry = () =>
        discountsMetadata(
          b.entries.map(e => (couponId && e.sku === BRANCH ? { ...e, stripe_coupon_id: couponId } : e)),
        );
      const quoteReference = 'BGP-' + now().toString(36).toUpperCase();
      const catalogue = b.lines.filter(l => l.item);
      const amounts = {};
      for (const l of catalogue) amounts[l.item] = pounds(l.totalPence);
      let meta = {
        email: payer.email,
        name: b.contact ? [b.contact.First_Name, b.contact.Last_Name].filter(Boolean).join(' ') : '',
        currency: 'GBP',
        status: 'pending',
        source: 'portal_v2',
        ...b.prepared.metadata({
          amounts,
          total: pounds(b.totalPence),
          lines: catalogue,
          inline: b.lines.filter(l => !l.item),
          insuranceIds,
          fees: b.fees,
          annualPence: b.annualPence,
          quoteReference,
          discountsEntry: discountsEntry(),
        }),
      };
      // Stripe allows 50 filled metadata keys. The plan is also on the subscription, so it is only added here while there is room.
      if (b.plan && filledCount(meta) < MAX_FILLED_KEYS)
        meta.monthly_plan = JSON.stringify({
          payments: plans.PAYMENTS,
          first_payment: pounds(b.plan.firstPaymentPence),
          later_payment: pounds(b.plan.laterPaymentPence),
          one_off_total: pounds(b.plan.oneOffPence),
          year_one_total: pounds(b.plan.yearOneTotalPence),
          admin_fee: pounds(b.plan.adminPence),
          admin_fee_net: (b.plan.adminPence / 120).toFixed(2),
        });
      meta = fitToStripeLimit(meta);
      const params = new URLSearchParams({
        mode: b.mode,
        customer_email: payer.email,
        ...(expiresAt ? { expires_at: String(Math.floor(expiresAt.getTime() / 1000)) } : {}),
        success_url: publicOrigin + '/app/#/payment-return?result=success&service=' + encodeURIComponent(input.service),
        cancel_url:
          publicOrigin + '/app/#/payment-return?result=cancelled&service=' + encodeURIComponent(input.service),
        ...(b.contact ? { client_reference_id: String(b.contact.id) } : {}),
      });
      b.lines.forEach((l, i) => {
        if (l.priceId) params.set('line_items[' + i + '][price]', l.priceId);
        else {
          params.set('line_items[' + i + '][price_data][currency]', 'gbp');
          params.set('line_items[' + i + '][price_data][product_data][name]', l.name);
          params.set('line_items[' + i + '][price_data][unit_amount]', String(l.unitPence));
          // The price list code (the item's SKU in Books) travels on the line's product, so Creator can find the Books item by code, not by name.
          if (l.sku) params.set('line_items[' + i + '][price_data][product_data][metadata][sku]', l.sku);
          // A line that renews recurs.
          if (l.interval) params.set('line_items[' + i + '][price_data][recurring][interval]', l.interval);
        }
        params.set('line_items[' + i + '][quantity]', String(l.quantity));
      });
      if (b.mode === 'subscription' && !b.plan && b.prepared.renews) {
        params.set('subscription_data[metadata][plan]', 'annual');
        params.set('subscription_data[metadata][contact_id]', String(b.contact?.id || ''));
      }
      if (b.plan) {
        params.set('subscription_data[metadata][plan]', 'monthly');
        params.set('subscription_data[metadata][contact_id]', String(b.contact?.id || ''));
      }
      if (couponId) params.set('discounts[0][coupon]', couponId);
      for (const [k, v] of Object.entries(meta)) params.set('metadata[' + k + ']', String(v).slice(0, 500));
      const key = crypto
        .createHash('sha256')
        .update(
          [
            b.contact?.id || payer.id,
            input.service,
            input.recordId,
            input.centreId,
            JSON.stringify(b.lines.map(l => [l.priceId || l.name + ':' + l.unitPence, l.quantity])),
            b.prepared.fingerprint || '',
            Math.floor(now() / 120000),
            // Stripe refuses a repeated key whose request differs in any way. The request carries a fresh quote reference, expiry and the
            // member's details, so a second click, or a change of branch within two minutes, must get its own key or checkout fails (502).
            params.toString(),
          ].join('|'),
        )
        .digest('hex')
        .slice(0, 40);
      const session = await stripe('POST', '/checkout/sessions', { body: params, key: 'portal-v2-' + key });
      if (!session.id || typeof session.url !== 'string' || !session.url.startsWith('https://checkout.stripe.com/'))
        throw new HttpError(502, 'PAYMENT_UNAVAILABLE', 'Secure checkout is unavailable.');
      if (insuranceIds?.policyId)
        await crmUpdate(req, 'Insurance_Policy', insuranceIds.policyId, { Stripe_Checkout_Session_ID: session.id });
      if (b.prepared.record)
        await crmUpdate(req, b.prepared.record.module, b.prepared.record.id, b.prepared.record.update(session.id));
      // A change's revisions are marked Awaiting Payment with the session id. If that fails the session is expired, so no one can pay
      // for a change the CRM does not know is waiting.
      if (b.prepared.afterSession) {
        try {
          await b.prepared.afterSession(session.id, insuranceIds, (module, id, fields) =>
            crmUpdateStrict(req, module, id, fields),
          );
        } catch (e) {
          await stripe('POST', '/checkout/sessions/' + encodeURIComponent(session.id) + '/expire', {
            body: new URLSearchParams(),
            key: 'portal-v2-expire-' + session.id,
          }).catch(() => {});
          throw e;
        }
      }
      return session;
    };
    if (b.prepared.beforePay) {
      const attemptKey = crypto
        .createHash('sha256')
        .update(
          [
            payer.id,
            JSON.stringify({ ...input, insurance: undefined }),
            b.prepared.fingerprint || '',
            JSON.stringify(b.lines.map(l => [l.priceId || l.name + ':' + l.unitPence, l.quantity])),
          ].join('|'),
        )
        .digest('hex');
      const hit = attempts.get(attemptKey);
      if (hit && now() - hit.at < ATTEMPT_TTL) {
        const earlier = await hit.promise.catch(() => null);
        const old =
          earlier && (await stripe('GET', '/checkout/sessions/' + encodeURIComponent(earlier.id)).catch(() => null));
        if (old?.payment_status === 'paid') return res.json({ alreadyPaid: true });
        if (old?.status === 'open' && typeof old.url === 'string' && old.url.startsWith('https://checkout.stripe.com/'))
          return res.json({ checkoutUrl: old.url, reused: true });
        attempts.delete(attemptKey);
      }
      if (!insuranceMinute(payer.id) || !insuranceHour(payer.id))
        throw new HttpError(429, 'RATE_LIMIT', 'Too many insurance attempts. Please wait a few minutes and try again.');
      const promise = startSession();
      attempts.set(attemptKey, { at: now(), promise });
      promise.catch(() => {
        if (attempts.get(attemptKey)?.promise === promise) attempts.delete(attemptKey);
      });
      return res.status(201).json({ checkoutUrl: (await promise).url });
    }
    const session = await startSession();
    res.status(201).json({ checkoutUrl: session.url });
  };
  router.post(
    '/',
    send((req, res) => payForRequest(req, res)),
  );
  app.use('/portal/checkout', router);

  // Entry points for the staff API (staff.js). They never read a portal user: the Contact is the one the staff member chose, looked up
  // here by id, and the actor is the staff member the CRM vouched for. Nothing is charged and no Stripe session is made.
  // The Contact the staff member chose, by id. 422 if it is not an id, 404 if there is no such Contact.
  async function staffContact(req, contactId) {
    if (!ID.test(String(contactId || ''))) throw new HttpError(422, 'INVALID_REQUEST', 'Choose a customer.');
    const row = (
      await crm(req, 'Contacts/' + contactId + '?fields=' + encodeURIComponent('Email,First_Name,Last_Name'))
    )[0];
    if (!row || String(row.id) !== String(contactId)) throw new HttpError(404, 'NOT_FOUND', 'Customer not found.');
    return row;
  }
  async function staffBuild(req, { contactId, body, voucherCode, waivers, applicationId, actor, service }) {
    const row = await staffContact(req, contactId);
    if ((voucherCode || waivers.length) && !discountsEnabled)
      throw new HttpError(503, 'DISCOUNTS_DISABLED', 'Vouchers and waivers are not switched on.');
    // A voucher's use history is read from Creator; if that cannot be read a voucher fails closed (waivers need only the CRM).
    const store = discountsEnabled ? createCrmStore({ crm, creator: creatorReader, req }) : undefined;
    const b = await build(
      req,
      { ...inputFrom(body), ...(service ? { service } : {}), quote: true },
      { staff: { contact: row, actor, code: voucherCode, waivers, applicationId, store } },
    );
    return { b, contact: { id: String(row.id), name: [row.First_Name, row.Last_Name].filter(Boolean).join(' ') } };
  }
  return {
    staffContact,
    // What a customer can choose when changing a membership: each branch and whether they already hold it (read only).
    async staffMembershipOptions(req, { contactId, recordId }) {
      if (!membershipChangesEnabled)
        throw new HttpError(503, 'NOT_AVAILABLE', 'Membership changes are not available online yet.');
      const contact = await staffContact(req, contactId);
      if (!ID.test(String(recordId || ''))) throw new HttpError(422, 'INVALID_REQUEST', 'Choose a membership.');
      return {
        contact: { id: String(contact.id) },
        options: await membershipChangeOptions(req, crm, contact.id, recordId),
      };
    },
    // The customer's current cover for one of their memberships, with the change history (read only, see cover.js).
    async staffCover(req, { contactId, recordId }) {
      const contact = await staffContact(req, contactId);
      if (!ID.test(String(recordId || ''))) throw new HttpError(422, 'INVALID_REQUEST', 'Choose a membership.');
      return {
        contact: { id: String(contact.id) },
        cover: await loadCover({ call: crm, req, contactId: contact.id, dealId: recordId, isDraft: undefined }),
      };
    },
    async staffQuote(req, args) {
      const { b, contact } = await staffBuild(req, args);
      return { contact, quote: view(b) };
    },
    // Saves a quoted insurance change as a revision on behalf of the customer, as the customer's own route does, recording who saved it.
    // A Stripe Checkout link for the customer, made by staff. It is the portal's own checkout (same rules, prices, risk checks, CRM records and
    // metadata), so Creator handles the payment as for a customer who paid online. The Checkout email, `client_reference_id` and metadata
    // identify the CUSTOMER (the Contact's CRM email), never the staff member, whose id is in the log only. Test mode only (the checkout refuses
    // any other key). The link is returned to the staff member to send; nothing is sent from here.
    async staffPaymentLink(req, args) {
      if (!staffPaymentLinksEnabled)
        throw new HttpError(503, 'NOT_AVAILABLE', 'Payment links are not switched on yet.');
      const contact = await staffContact(req, args.contactId);
      const email = String(contact.Email || '')
        .trim()
        .toLowerCase();
      if (!email)
        throw new HttpError(
          422,
          'NO_EMAIL',
          'This customer has no email address in the CRM, so a payment link cannot be made.',
        );
      // A waiver or voucher reduces the charge, and its use must be recorded and reserved when the link is made (the Waive_Logs row and the voucher
      // reservation, docs/delivery/vouchers-staff-route-spec.md). That is not built, so a link that carried one could be used twice. Quote it
      // with /staff/quote to show the price; the link is for the undiscounted checkout until the records exist.
      if (args.voucherCode || args.waivers.length)
        throw new HttpError(
          422,
          'DISCOUNTS_NOT_ON_LINKS',
          'A voucher or waiver cannot be applied to a payment link yet.',
        );
      const store = discountsEnabled ? createCrmStore({ crm, creator: creatorReader, req }) : undefined;
      const out = { status: 200, body: null };
      const res = {
        status(code) {
          out.status = code;
          return this;
        },
        json(body) {
          out.body = body;
          return this;
        },
      };
      const payReq = Object.assign(Object.create(req), { body: args.body });
      await payForRequest(payReq, res, {
        payer: { id: 'staff:' + args.actor.id, email },
        contact,
        actor: args.actor,
        code: args.voucherCode,
        waivers: args.waivers,
        applicationId: args.applicationId,
        store,
      });
      return {
        contact: { id: String(contact.id), name: [contact.First_Name, contact.Last_Name].filter(Boolean).join(' ') },
        ...out.body,
        created: out.status === 201,
      };
    },
    async staffSaveRevision(req, args) {
      // The same gates as the customer's route: nothing is saved until insurance changes and their writes are switched on.
      if (!insuranceChangesEnabled || !insuranceChangesWritesEnabled)
        throw new HttpError(503, 'NOT_AVAILABLE', 'Insurance changes are not available yet.');
      const { b, contact } = await staffBuild(req, { ...args, service: 'insurance_change' });
      const saved = await persistRevisions(req, b, String(args.body?.recordId || ''));
      // Who saved it: a CRM Note on each new revision. The connection writes the record, so the CRM's own Modified_By is the connection's
      // user. The revision is already saved, so a note that fails is reported (auditNote: false) and logged, never turned into an error.
      let auditNote = true;
      for (const r of saved.filter(x => !x.reused)) {
        try {
          await crmCreate(
            req,
            'Notes',
            {
              Note_Title: 'Saved by staff',
              Note_Content: [
                'Saved by ' +
                  clean(args.actor.name || 'Staff', 80) +
                  ' (CRM user ' +
                  args.actor.id +
                  ') through the Staff Workspace.',
                'Quote ' + (r.quoteId || '') + ', status ' + r.status + '.',
                new Date(now()).toISOString(),
              ].join('\n'),
              Parent_Id: { module: { api_name: 'Policy_Revisions' }, id: r.id },
            },
            'note',
          );
        } catch {
          auditNote = false;
          console.warn(
            JSON.stringify({ event: 'staff_audit_note_failed', staffUserId: args.actor.id, revisionId: r.id }),
          );
        }
      }
      return { contact, revision: saved[0], revisions: saved, created: !saved.every(x => x.reused), auditNote };
    },
  };
}
module.exports = { registerCheckoutRoutes };
