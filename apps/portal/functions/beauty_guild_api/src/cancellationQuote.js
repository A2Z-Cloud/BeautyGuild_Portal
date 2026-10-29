'use strict';
// The staff cancellation quote (docs/delivery/cancellations-refunds-spec.md, sections 3 and 6.1). READ ONLY: it gathers what a membership
// paid and what a policy covers, then hands the facts to the calculation engine (cancellations.js). It writes nothing to the CRM and makes no
// Stripe call that changes anything.
//
// Money comes from Stripe (the checkout session's metadata, which holds the amounts exactly as paid); dates, the premium rows and the payment
// frequency come from the CRM. When the two disagree, or a fact cannot be verified, the quote is REFUSED with a named reason in `blocking`
// rather than guessed (spec D12). It supports a first-term yearly or monthly payer; a renewed term, a renewal policy, an
// ended or mixed subscription and a policy changed since purchase are all refused for now.
const crypto = require('node:crypto');
const { HttpError } = require('./errors');
const { loadCover } = require('./cover');
const engine = require('./cancellations');
const { createPaymentFacts, gbpToPence } = require('./paymentFacts');

const ID = /^\d{10,25}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const uri = encodeURIComponent;
const text = v => (v == null ? '' : String(v).trim());
const sum = rows => rows.reduce((t, n) => t + n, 0);

// A membership type is Associate or Full ("Associate Member", "Full Member (Non-Salon)").
const levelOf = type => (/associate/i.test(text(type)) ? 'associate' : /full/i.test(text(type)) ? 'full' : null);
// What a price list code is, from its prefix. The accreditation family must never be cancelled by a membership cancellation.
const skuFamily = sku =>
  /^ACC-/.test(sku) ? 'accreditation' : /^MEM-|^INS-|^CALC-|^FEE-/.test(sku) ? 'membership_or_insurance' : 'other';

/**
 * @param {{ enabled: boolean, call: (req: any, path: string) => Promise<any[]>, stripeGet: (path: string) => Promise<any>,
 *   staffContact: (req: any, contactId: string) => Promise<any>, now?: () => number }} deps
 */
function createCancellationQuotes({ enabled, call, stripeGet, staffContact, now = Date.now }) {
  const blockedBy = (list, code, message) => list.push({ code, message });

  const payments = createPaymentFacts({ stripeGet });

  async function subscriptionItems(id) {
    const sub = await stripeGet('/subscriptions/' + uri(id) + '?expand[]=items.data.price.product');
    if (!sub) return null;
    const items = ((sub.items && sub.items.data) || []).map(i => {
      const sku =
        text(i.price && i.price.lookup_key) ||
        text(i.price && i.price.product && i.price.product.metadata && i.price.product.metadata.sku);
      return { sku, family: skuFamily(sku) };
    });
    return { id: sub.id, status: sub.status, cancelAt: sub.cancel_at || null, items };
  }

  return async function staffCancellationQuote(req, { contactId, body }) {
    if (!enabled) throw new HttpError(503, 'NOT_AVAILABLE', 'Cancellations are not switched on yet.');
    const membershipId = text(body.membershipId);
    if (!ID.test(membershipId)) throw new HttpError(422, 'INVALID_REQUEST', 'Choose a membership.');
    const scenario = text(body.scenario);
    if (!engine.SCENARIOS.includes(scenario))
      throw new HttpError(422, 'INVALID_REQUEST', 'Choose cancel, downgrade or cancel as an Associate.');
    const today = new Date(now()).toISOString().slice(0, 10);
    const effectiveDate = text(body.effectiveDate) || today;
    if (!DATE.test(effectiveDate)) throw new HttpError(422, 'INVALID_REQUEST', 'Choose the date as YYYY-MM-DD.');
    let overridePence = null;
    if (body.membershipRefundPence !== undefined && body.membershipRefundPence !== null) {
      if (!Number.isSafeInteger(body.membershipRefundPence) || body.membershipRefundPence < 0)
        throw new HttpError(422, 'INVALID_REQUEST', 'The membership refund must be a whole number of pence.');
      overridePence = body.membershipRefundPence;
      if (!text(body.overrideReason))
        throw new HttpError(422, 'INVALID_REQUEST', 'Say why the membership fee is being refunded.');
    }
    const contact = await staffContact(req, contactId);
    const cover = await loadCover({ call, req, contactId: contact.id, dealId: membershipId, isDraft: undefined });
    const blocking = [];
    const warnings = [];
    const m = cover.membership;
    const ins = cover.insurance;
    const level = levelOf(m.type);

    if (!level) blockedBy(blocking, 'MEMBERSHIP_TYPE_UNKNOWN', 'The membership type could not be read.');
    if (level === 'associate' && scenario !== 'cancel_associate')
      throw new HttpError(422, 'SCENARIO_MISMATCH', 'This is an Associate membership: use cancel as an Associate.');
    if (level === 'full' && scenario === 'cancel_associate')
      throw new HttpError(422, 'SCENARIO_MISMATCH', 'This is a Full membership: use cancel or downgrade.');
    if (!/^active$/i.test(text(m.status)))
      blockedBy(blocking, 'NOT_ACTIVE', 'This membership is not active, so it cannot be cancelled here.');
    if (!DATE.test(text(m.startDate)) || !DATE.test(text(m.endDate)))
      blockedBy(blocking, 'DATES_UNKNOWN', 'The membership start or end date is missing.');

    // Things the Guild has not yet decided how to handle: shown, never silently dropped.
    const extras = (m.extras || []).filter(x => !/cancel|ended|removed/i.test(text(x.status)));
    if (extras.length)
      warnings.push({
        code: 'EXTRAS_PRESENT',
        message:
          'This membership has extras (' +
          [...new Set(extras.map(x => x.type || 'extra'))].join(', ') +
          '). Their refund is not calculated.',
      });
    if (ins && ins.people && ins.people.length)
      warnings.push({
        code: 'EMPLOYEES_PRESENT',
        message:
          'The policy names ' +
          ins.people.length +
          ' employee(s) or subcontractor(s). Employee membership fees are not refunded here.',
      });
    if (effectiveDate < today) warnings.push({ code: 'BACKDATED', message: 'The effective date is in the past.' });

    // The insurance facts, from the CRM.
    let policyFacts = null;
    let policySessionId = '';
    if (ins) {
      if (scenario === 'cancel_associate')
        blockedBy(
          blocking,
          'SCENARIO_MISMATCH',
          'An Associate membership has no insurance, but this one has a policy.',
        );
      if (ins.renewal)
        blockedBy(
          blocking,
          'RENEWAL_EXISTS',
          'A renewal policy already exists for this membership. Renewals are not handled here yet.',
        );
      const freq = text(ins.paymentFrequency).toLowerCase();
      if (freq !== 'annual' && freq !== 'monthly')
        blockedBy(blocking, 'PAYMENT_FREQUENCY_UNKNOWN', 'The policy payment frequency is not Annual or Monthly.');
      const nets = (ins.covers || []).map(c => c.netPence);
      if (!nets.length || nets.some(n => n == null))
        blockedBy(blocking, 'PREMIUM_UNKNOWN', 'The policy premium could not be read from its cover rows.');
      if (!DATE.test(text(ins.startDate)) || !DATE.test(text(ins.endDate)))
        blockedBy(blocking, 'DATES_UNKNOWN', 'The policy start or end date is missing.');
      const row = (await call(req, 'Insurance_Policy/' + ins.id + '?fields=' + uri('Stripe_Checkout_Session_ID')))[0];
      policySessionId = text(row && row.Stripe_Checkout_Session_ID);
      if (!policySessionId) blockedBy(blocking, 'NO_PAYMENT_RECORD', 'The policy has no payment recorded in Stripe.');
      policyFacts = {
        id: ins.id,
        billing: /** @type {'monthly' | 'annual'} */ (freq === 'monthly' ? 'monthly' : 'annual'),
        start: text(ins.startDate),
        end: text(ins.endDate),
        crmPremiumNetPence: (ins.covers || []).every(c => c.netPence != null)
          ? sum((ins.covers || []).map(c => c.netPence))
          : null,
        crmIptPence: (ins.covers || []).every(c => c.iptPence != null)
          ? sum((ins.covers || []).map(c => c.iptPence))
          : null,
      };
    }

    // The money, from Stripe.
    let membershipPaidPence = null;
    let insurancePaid = null;
    const subscriptionIds = [];
    if (!blocking.length) {
      const found = await payments.findMembershipSession({
        contactId: String(contact.id),
        start: m.startDate,
        end: m.endDate,
        policySessionId,
      });
      if (found.status === 'none')
        blockedBy(
          blocking,
          'TERM_NOT_VERIFIED',
          'No Stripe payment was found for this membership term. It may have renewed, or was paid a moment ago (Stripe search lags by about a minute).',
        );
      else if (found.status === 'ambiguous')
        blockedBy(blocking, 'AMBIGUOUS_PAYMENT', 'More than one Stripe payment matches this membership term.');
      else {
        const s = found.session;
        const monthly = text(s.metadata.subscription_type) === 'monthly';
        if (text(s.metadata.subscription_type) !== 'annual' && !monthly)
          blockedBy(
            blocking,
            'PAYMENT_FREQUENCY_UNKNOWN',
            'The membership payment frequency could not be read from Stripe.',
          );
        if (policyFacts && policyFacts.billing !== (monthly ? 'monthly' : 'annual'))
          blockedBy(
            blocking,
            'FREQUENCY_MISMATCH',
            'The CRM says the policy is paid ' +
              policyFacts.billing +
              ' but Stripe says the membership is paid ' +
              (monthly ? 'monthly' : 'annually') +
              '.',
          );
        if (s.subscription) subscriptionIds.push(s.subscription);
        let policySub = s.subscription;
        let ps = null;
        if (policyFacts) {
          ps = found.sessions.find(x => x.id === policySessionId);
          if (!ps || ps.payment_status !== 'paid')
            blockedBy(blocking, 'NO_PAYMENT_RECORD', 'The policy payment in Stripe was not found or is not paid.');
          else if (ps.subscription) {
            policySub = ps.subscription;
            if (!subscriptionIds.includes(ps.subscription)) subscriptionIds.push(ps.subscription);
          }
        }
        // What was paid. A yearly payer paid the whole fee and premium at once, as the session recorded it. A monthly payer's is read from the
        // paid instalments (invoice lines), because only some of the year has been paid.
        let paidMembership = null;
        let paidPremium = null;
        if (!blocking.length && monthly) {
          const forMembership = await payments.monthlyPaid({ subscriptionId: s.subscription });
          const forPolicy =
            policySub === s.subscription ? forMembership : await payments.monthlyPaid({ subscriptionId: policySub });
          if (forMembership.instalments === 0 || (policyFacts && forPolicy.instalments === 0))
            blockedBy(blocking, 'NO_PAYMENT_RECORD', 'No paid instalment was found in Stripe for this membership.');
          paidMembership = forMembership.membershipPence;
          paidPremium = { netPence: forPolicy.premiumNetPence, iptPence: forPolicy.iptPence };
          for (const u of new Set([...forMembership.unplaced, ...forPolicy.unplaced]))
            warnings.push({
              code: 'UNPLACED_LINE',
              message: 'A paid line could not be placed and is not counted: ' + u + '.',
            });
          if (forMembership.notRefundedPence)
            warnings.push({
              code: 'KEPT_FEES',
              message: 'The joining fee, admin fees, extras and employee fees paid are not refunded here.',
            });
          if (effectiveDate > today)
            warnings.push({
              code: 'FUTURE_INSTALMENTS',
              message: 'Instalments due before the effective date are not counted: only what has been paid so far.',
            });
          warnings.push({
            code: 'MONTHLY',
            message:
              'Paid monthly: the refund is limited to what has been paid so far (' +
              forMembership.instalments +
              ' instalment(s)).',
          });
        } else if (!blocking.length) {
          paidMembership = gbpToPence(s.metadata.base_membership_amount);
        }
        membershipPaidPence = paidMembership;
        if (membershipPaidPence == null)
          blockedBy(blocking, 'AMOUNT_UNREADABLE', 'The membership fee paid could not be read from Stripe.');
        if (policyFacts && ps && ps.payment_status === 'paid') {
          // The policy's session holds the premium and IPT for the YEAR as bought. The CRM rows must agree, or the policy has changed since purchase.
          const yearNet = gbpToPence(ps.metadata.insurance_net_amount);
          const yearIpt = gbpToPence(ps.metadata.insurance_ipt_amount);
          if (yearNet == null || yearIpt == null)
            blockedBy(blocking, 'AMOUNT_UNREADABLE', 'The premium paid could not be read from Stripe.');
          else if (
            policyFacts.crmPremiumNetPence !== yearNet ||
            (policyFacts.crmIptPence != null && policyFacts.crmIptPence !== yearIpt)
          )
            blockedBy(
              blocking,
              'AMOUNTS_DISAGREE',
              'The policy premium in the CRM does not match what was paid in Stripe. The policy may have been changed since purchase.',
            );
          else if (!blocking.length)
            insurancePaid = monthly
              ? { yearNetPence: yearNet, netPence: paidPremium.netPence, iptPence: paidPremium.iptPence }
              : { yearNetPence: yearNet, netPence: yearNet, iptPence: yearIpt };
        }
      }
    }

    // The subscriptions that would end: none may be ended already, and none may hold anything outside membership and insurance.
    const subscriptions = [];
    if (!blocking.length) {
      for (const id of subscriptionIds) {
        const sub = await subscriptionItems(id);
        if (!sub) {
          blockedBy(blocking, 'SUBSCRIPTION_NOT_FOUND', 'The Stripe subscription could not be found.');
          continue;
        }
        if (sub.status === 'canceled' || sub.cancelAt)
          blockedBy(blocking, 'ALREADY_ENDING', 'The Stripe subscription has already ended or is set to end.');
        if (sub.items.some(i => i.family === 'accreditation'))
          blockedBy(
            blocking,
            'MIXED_SUBSCRIPTION',
            'This subscription also holds accreditation, which a membership cancellation must not end. Process in the CRM.',
          );
        else if (sub.items.some(i => i.family === 'other'))
          warnings.push({
            code: 'UNKNOWN_SUBSCRIPTION_ITEMS',
            message: 'The subscription holds an item that is not recognised as membership or insurance.',
          });
        subscriptions.push({ id: sub.id, status: sub.status, endsAt: effectiveDate });
      }
    }

    const facts = {
      membership: { id: m.id, level, type: m.type, status: m.status, start: m.startDate, end: m.endDate },
      insurance: policyFacts ? { id: policyFacts.id, start: policyFacts.start, end: policyFacts.end } : null,
    };
    if (blocking.length)
      return { contact: { id: String(contact.id) }, quotable: false, quote: null, blocking, warnings, facts };

    // The engine refuses bad input with a code (an override above what was paid, a bad date): that is a 422 to the caller, not a server error.
    let quote;
    try {
      quote = engine.cancellationQuote({
        scenario,
        effectiveDate,
        membership: { paidPence: membershipPaidPence, overridePence },
        insurance: policyFacts
          ? {
              billing: policyFacts.billing,
              start: policyFacts.start,
              end: policyFacts.end,
              // A yearly payer: the premium paid is the premium. A monthly payer: the premium for the year, and what has been paid of it.
              premiumNetPence: insurancePaid.yearNetPence,
              paidNetPence: insurancePaid.netPence,
              paidIptPence: insurancePaid.iptPence,
            }
          : null,
      });
    } catch (e) {
      if (e instanceof engine.CancellationError) throw new HttpError(422, e.code, e.message);
      throw e;
    }
    for (const w of quote.warnings) warnings.push({ code: 'ENGINE', message: w });
    // Binds the later confirm to exactly these inputs: if a fact changes in between, the hash changes and the confirm is refused.
    const inputsHash = crypto
      .createHash('sha256')
      .update(
        JSON.stringify([
          contact.id,
          membershipId,
          scenario,
          effectiveDate,
          overridePence,
          text(body.overrideReason),
          membershipPaidPence,
          insurancePaid,
          policyFacts && [policyFacts.start, policyFacts.end],
          subscriptions.map(s => s.id),
        ]),
      )
      .digest('hex')
      .slice(0, 32);
    return {
      contact: { id: String(contact.id) },
      quotable: true,
      quote: { ...quote, overrideReason: overridePence === null ? null : text(body.overrideReason).slice(0, 200) },
      stripe: { subscriptions },
      inputsHash,
      blocking: [],
      warnings,
      facts,
    };
  };
}

module.exports = { createCancellationQuotes, levelOf, gbpToPence };
