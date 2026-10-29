'use strict';
// The staff cancellation CONFIRM (docs/delivery/cancellations-refunds-spec.md, sections 4.1 and 6.1): records the cancellation in the CRM, ends the Stripe
// subscription(s), and creates the refunds. It is the first route that changes money, so it fails safe:
//  - It recomputes the quote and refuses (409 QUOTE_CHANGED) unless the figures and the inputs hash are exactly what staff saw.
//  - The CRM record is created FIRST. If that fails (the module does not exist, the CRM is down) nothing else is done, Stripe is never touched.
//  - Every step is recorded and idempotent: a repeat of the same confirm, or a retry, finds the record and carries on from where it stopped. A refund
//    carries an idempotency key, so the same step never refunds twice.
//  - Test mode only (the function refuses any key that is not sk_test_), behind its own switch, and it never changes the Deal or the policy: a CRM
//    workflow on the cancellation record is to do that (a status change can fire workflows the Guild must check first).
//
// THE CRM MODULE AND ITS FIELD NAMES BELOW ARE UNCONFIRMED: the module does not exist yet (spec section 5.1). They are in one place so they are easy to
// change when the CRM owner creates it; nothing is written until it exists, because the first write is the record.
const crypto = require('node:crypto');
const { HttpError } = require('./errors');
const { form } = require('./plans');

const MODULE = 'Membership_Cancellations';
const F = Object.freeze({
  name: 'Name',
  contact: 'Contact',
  membership: 'Membership',
  scenario: 'Scenario',
  status: 'Cancellation_Status',
  effectiveDate: 'Effective_Date',
  coolingOff: 'Cooling_Off',
  lines: 'Lines_JSON',
  plan: 'Plan_JSON',
  hash: 'Inputs_Hash',
  membershipRefund: 'Membership_Refund',
  premiumRefund: 'Premium_Refund',
  iptRefund: 'IPT_Refund',
  feeApplied: 'Fee_Applied',
  netRefund: 'Net_Refund',
  overrideReason: 'Override_Reason',
  subscriptionIds: 'Stripe_Subscription_IDs',
  refundIds: 'Stripe_Refund_IDs',
  requestedBy: 'Requested_By',
  error: 'Error_Detail',
});
const STATUS = Object.freeze({
  pending: 'Pending',
  subscriptionEnded: 'Subscription Ended',
  refundFailed: 'Refund Failed',
  completed: 'Completed',
});
const SCENARIO_LABEL = {
  cancel_associate: 'Cancel Associate',
  cancel_full: 'Cancel Full',
  downgrade_full: 'Downgrade Full',
};
const ID = /^\d{10,25}$/;
const HASH = /^[0-9a-f]{32}$/;
const uri = encodeURIComponent;
const text = v => (v == null ? '' : String(v).trim());
const pounds = pence => (pence / 100).toFixed(2);
const epoch = iso => Math.floor(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 1000);

/**
 * @param {{ enabled: boolean, stripeKey: string, call: (req: any, path: string) => Promise<any[]>,
 *   crmWriter: { create: Function, update: Function }, stripeGet: (path: string) => Promise<any>,
 *   stripeWriter: { post: Function, del: Function }, quoteFor: (req: any, args: any) => Promise<any>,
 *   now?: () => number, log?: (line: string) => void }} deps
 */
function createCancellationConfirm({
  enabled,
  stripeKey,
  call,
  crmWriter,
  stripeGet,
  stripeWriter,
  quoteFor,
  now = Date.now,
  log = console.log,
}) {
  const audit = entry => log(JSON.stringify({ event: 'staff_cancellation', ...entry }));

  // Ends one subscription at the effective date, with no automatic proration (we calculate every refund). Already ending or ended counts as done.
  async function endSubscription(id, effectiveDate) {
    const sub = await stripeGet('/subscriptions/' + uri(id));
    if (!sub) throw new HttpError(409, 'SUBSCRIPTION_NOT_FOUND', 'The Stripe subscription could not be found.');
    if (sub.status === 'canceled' || sub.cancel_at) return { id, state: 'already_ended' };
    const effective = epoch(effectiveDate);
    if (effective <= Math.floor(now() / 1000)) {
      await stripeWriter.del('/subscriptions/' + uri(id), form({ prorate: 'false', invoice_now: 'false' }));
      return { id, state: 'ended_now' };
    }
    await stripeWriter.post(
      '/subscriptions/' + uri(id),
      form({ cancel_at: String(effective), proration_behavior: 'none' }),
      'cancel-sub-' + id + '-' + effective,
    );
    return { id, state: 'ends_' + effectiveDate };
  }

  // The payment intent behind an invoice: older API versions put it on the invoice, newer ones under `payments`.
  async function paymentIntentOf(invoice) {
    const direct = invoice.payment_intent;
    if (direct) return typeof direct === 'string' ? direct : direct.id;
    const full = await stripeGet('/invoices/' + uri(invoice.id) + '?expand[]=payments');
    const p = full && full.payments && full.payments.data && full.payments.data[0] && full.payments.data[0].payment;
    return (
      (p && (typeof p.payment_intent === 'string' ? p.payment_intent : p.payment_intent && p.payment_intent.id)) || ''
    );
  }

  // What can still be refunded, newest payment first, across the subscriptions: each payment's amount less every refund already made on it. Reads
  // only, so a shortfall is found BEFORE any refund is created.
  async function refundable(subscriptionIds, cancellationId) {
    const payments = [];
    let alreadyForThis = 0;
    for (const sub of subscriptionIds) {
      const invoices = await stripeGet('/invoices?limit=12&status=paid&subscription=' + uri(sub));
      for (const inv of (invoices && invoices.data) || []) {
        const pi = await paymentIntentOf(inv);
        if (!pi || !(inv.amount_paid > 0)) continue;
        const refunds = await stripeGet('/refunds?limit=100&payment_intent=' + uri(pi));
        let refunded = 0;
        for (const r of (refunds && refunds.data) || []) {
          if (r.status === 'failed' || r.status === 'canceled') continue;
          refunded += r.amount;
          if (text(r.metadata && r.metadata.cancellation_id) === cancellationId) alreadyForThis += r.amount;
        }
        payments.push({ pi, createdAt: inv.created || 0, remaining: Math.max(0, inv.amount_paid - refunded) });
      }
    }
    payments.sort((a, b) => b.createdAt - a.createdAt);
    return { payments, alreadyForThis };
  }

  function recordFor(q, plan, actor, hash, body) {
    const quote = q.quote;
    return {
      [F.name]: 'Cancellation ' + (SCENARIO_LABEL[quote.scenario] || quote.scenario) + ' ' + quote.effectiveDate,
      [F.contact]: { id: q.contact.id },
      [F.membership]: { id: plan.membershipId },
      [F.scenario]: SCENARIO_LABEL[quote.scenario] || quote.scenario,
      [F.status]: STATUS.pending,
      [F.effectiveDate]: quote.effectiveDate,
      [F.coolingOff]: quote.coolingOff,
      [F.lines]: JSON.stringify({
        membership: quote.membership,
        insurance: quote.insurance,
        feeAppliedPence: quote.feeAppliedPence,
        netRefundPence: quote.netRefundPence,
      }),
      [F.plan]: JSON.stringify(plan),
      [F.hash]: hash,
      [F.membershipRefund]: pounds(quote.membership.refundPence),
      [F.premiumRefund]: pounds(quote.insurance ? quote.insurance.premiumRefundPence : 0),
      [F.iptRefund]: pounds(quote.insurance ? quote.insurance.iptRefundPence : 0),
      [F.feeApplied]: pounds(quote.feeAppliedPence),
      [F.netRefund]: pounds(quote.netRefundPence),
      [F.overrideReason]: text(quote.overrideReason).slice(0, 200),
      [F.requestedBy]: ('Staff ' + text(actor.name) + ' (' + actor.id + ')').slice(0, 120),
      [F.subscriptionIds]: JSON.stringify(plan.subscriptions),
    };
  }

  // Runs (or resumes) the steps for a recorded cancellation from its stored plan. Each step is skipped if it is already done.
  async function run(req, rec, plan, contactId, actor) {
    const steps = [];
    const fail = async (status, e, step) => {
      audit({
        cancellationId: rec.id,
        staffUserId: actor.id,
        step,
        outcome: 'error',
        code: e.code || '',
        stripeCode: e.stripeCode || '',
      });
      try {
        await crmWriter.update(req, MODULE, rec.id, {
          [F.status]: status,
          [F.error]: (step + ': ' + (e.code || e.message)).slice(0, 250),
        });
      } catch {
        /* The log line above still says what happened. */
      }
      const err = new HttpError(
        e.status || 502,
        e.code || 'CANCELLATION_FAILED',
        'The cancellation did not finish: ' + step + '. Nothing was lost; retry will carry on from here.',
      );
      err.details = { cancellationId: rec.id, status, step };
      throw err;
    };

    for (const id of plan.subscriptions) {
      try {
        const r = await endSubscription(id, plan.effectiveDate);
        steps.push({ step: 'subscription', id, state: r.state });
      } catch (e) {
        await fail(STATUS.pending, e, 'ending the subscription');
      }
    }
    if (rec.status === STATUS.pending) {
      try {
        await crmWriter.update(req, MODULE, rec.id, { [F.status]: STATUS.subscriptionEnded });
      } catch (e) {
        await fail(STATUS.pending, e, 'recording that the subscription ended');
      }
    }

    const refunds = [];
    let net = plan.netRefundPence;
    if (net > 0) {
      let allocation;
      try {
        const r = await refundable(plan.subscriptions, rec.id);
        net -= r.alreadyForThis;
        allocation = r.payments;
      } catch (e) {
        await fail(STATUS.refundFailed, e, 'reading the payments');
      }
      const toDo = [];
      let left = net;
      for (const p of allocation) {
        if (left <= 0) break;
        const take = Math.min(left, p.remaining);
        if (take > 0) toDo.push({ pi: p.pi, amount: take });
        left -= take;
      }
      if (left > 0)
        await fail(
          STATUS.refundFailed,
          { status: 409, code: 'REFUND_EXCEEDS_PAYMENTS', message: 'More is to be refunded than the payments allow.' },
          'allocating the refund',
        );
      for (const t of toDo) {
        try {
          const refund = await stripeWriter.post(
            '/refunds',
            form({
              payment_intent: t.pi,
              amount: t.amount,
              reason: 'requested_by_customer',
              metadata: {
                cancellation_id: rec.id,
                contact_id: contactId,
                scenario: plan.scenario,
                portal: 'portal_v2',
              },
            }),
            'cancel-' + rec.id + '-' + t.pi + '-' + t.amount,
          );
          refunds.push({ id: refund.id, amountPence: t.amount, status: refund.status });
          steps.push({ step: 'refund', id: refund.id, amountPence: t.amount, status: refund.status });
        } catch (e) {
          await fail(STATUS.refundFailed, e, 'creating a refund');
        }
      }
    }
    const anyFailed = refunds.some(r => r.status === 'failed' || r.status === 'canceled');
    const finalStatus = anyFailed ? STATUS.refundFailed : STATUS.completed;
    try {
      await crmWriter.update(req, MODULE, rec.id, {
        [F.status]: finalStatus,
        [F.refundIds]: JSON.stringify(refunds.map(r => r.id)),
        [F.error]: anyFailed ? 'A refund failed in Stripe.' : '',
      });
    } catch (e) {
      await fail(STATUS.pending, e, 'recording the result');
    }
    // Who confirmed it: a CRM Note, best effort (the log line and the record's Requested By are the record).
    try {
      await crmWriter.create(req, 'Notes', {
        Note_Title: 'Cancellation confirmed',
        Note_Content:
          'Confirmed by ' +
          text(actor.name) +
          ' (CRM user ' +
          actor.id +
          '). Net refund £' +
          pounds(plan.netRefundPence) +
          '.',
        Parent_Id: { module: { api_name: MODULE }, id: rec.id },
      });
    } catch {
      /* best effort */
    }
    audit({ cancellationId: rec.id, staffUserId: actor.id, outcome: finalStatus, refunds: refunds.length });
    return { status: finalStatus, steps, refunds };
  }

  async function findByHash(req, hash) {
    const rows = await call(
      req,
      MODULE +
        '/search?criteria=' +
        uri('(' + F.hash + ':equals:' + hash + ')') +
        '&fields=' +
        uri(['id', F.status, F.plan, F.contact].join(',')),
    );
    const row = rows[0];
    if (!row) return null;
    let plan = null;
    try {
      plan = JSON.parse(text(row[F.plan]));
    } catch {
      plan = null;
    }
    return {
      id: String(row.id),
      status: text(row[F.status]),
      plan,
      contactId: row[F.contact] && row[F.contact].id ? String(row[F.contact].id) : '',
    };
  }

  function gates() {
    if (!enabled) throw new HttpError(503, 'NOT_AVAILABLE', 'Cancellations are not switched on yet.');
    if (!stripeKey || !stripeKey.startsWith('sk_test_'))
      throw new HttpError(503, 'NOT_AVAILABLE', 'Cancellations run in Stripe test mode only for now.');
  }

  // POST /staff/cancellation
  async function confirm(req, { contactId, body, actor }) {
    gates();
    const confirmNet = body.confirmNetRefundPence;
    const hash = text(body.inputsHash);
    if (!Number.isSafeInteger(confirmNet) || confirmNet < 0)
      throw new HttpError(422, 'INVALID_REQUEST', 'Confirm the net refund you were shown, in pence.');
    if (!HASH.test(hash)) throw new HttpError(422, 'INVALID_REQUEST', 'Send the inputsHash from the quote.');
    // A repeat, or a retry after a failure: the record already holds the plan, so carry on from it. (A new quote would now be refused because the
    // subscription is already ending.)
    const existing = await findByHash(req, hash);
    if (existing) {
      if (existing.status === STATUS.completed)
        return {
          contact: { id: existing.contactId || String(contactId) },
          cancellationId: existing.id,
          status: existing.status,
          created: false,
          steps: [],
          refunds: [],
        };
      if (!existing.plan)
        throw new HttpError(409, 'RECORD_UNREADABLE', 'The cancellation record could not be read. Ask the office.');
      const done = await run(
        req,
        { id: existing.id, status: existing.status },
        existing.plan,
        existing.plan.contactId,
        actor,
      );
      return { contact: { id: existing.plan.contactId }, cancellationId: existing.id, created: false, ...done };
    }
    const q = await quoteFor(req, { contactId, body });
    if (!q.quotable) {
      const e = new HttpError(
        409,
        'NOT_QUOTABLE',
        'This cannot be cancelled here: ' + text(q.blocking[0] && q.blocking[0].message),
      );
      e.details = { blocking: q.blocking };
      throw e;
    }
    if (q.inputsHash !== hash || q.quote.netRefundPence !== confirmNet) {
      const e = new HttpError(
        409,
        'QUOTE_CHANGED',
        'The figures have changed since the quote. Review the new figures and confirm again.',
      );
      e.details = { quote: q.quote, inputsHash: q.inputsHash };
      throw e;
    }
    const plan = {
      contactId: q.contact.id,
      membershipId: text(body.membershipId),
      scenario: q.quote.scenario,
      effectiveDate: q.quote.effectiveDate,
      netRefundPence: q.quote.netRefundPence,
      subscriptions: q.stripe.subscriptions.map(s => s.id),
    };
    // The record first. If this fails nothing else happens.
    let id;
    try {
      id = await crmWriter.create(req, MODULE, recordFor(q, plan, actor, hash, body));
    } catch (e) {
      audit({
        staffUserId: actor.id,
        contactId: q.contact.id,
        scenario: plan.scenario,
        outcome: 'record_not_created',
        code: e.code || '',
        ...(e.diag || {}),
      });
      throw e;
    }
    audit({
      cancellationId: id,
      staffUserId: actor.id,
      contactId: q.contact.id,
      scenario: plan.scenario,
      outcome: 'recorded',
    });
    const done = await run(req, { id, status: STATUS.pending }, plan, q.contact.id, actor);
    return {
      contact: { id: q.contact.id },
      cancellationId: id,
      created: true,
      netRefundPence: plan.netRefundPence,
      ...done,
    };
  }

  // POST /staff/cancellation/retry: resumes a record by id.
  async function retry(req, { body, actor }) {
    gates();
    const id = text(body.cancellationId);
    if (!ID.test(id)) throw new HttpError(422, 'INVALID_REQUEST', 'Choose a cancellation.');
    const rows = await call(req, MODULE + '/' + id + '?fields=' + uri(['id', F.status, F.plan, F.hash].join(',')));
    const row = rows[0];
    if (!row) throw new HttpError(404, 'NOT_FOUND', 'Cancellation not found.');
    const status = text(row[F.status]);
    if (status === STATUS.completed)
      return { contact: { id: '' }, cancellationId: id, status, created: false, steps: [], refunds: [] };
    let plan = null;
    try {
      plan = JSON.parse(text(row[F.plan]));
    } catch {
      plan = null;
    }
    if (!plan || !plan.subscriptions)
      throw new HttpError(409, 'RECORD_UNREADABLE', 'The cancellation record could not be read. Ask the office.');
    const done = await run(req, { id, status }, plan, plan.contactId, actor);
    return { contact: { id: plan.contactId }, cancellationId: id, created: false, ...done };
  }

  return { confirm, retry };
}

module.exports = {
  createCancellationConfirm,
  MODULE,
  F,
  STATUS,
  hashOf: s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 32),
};
