'use strict';
// Reads what a customer paid, from Stripe, for the cancellation quote and the upgrade credit. READ ONLY (it takes a GET-only reader).
// The CRM stores no Stripe subscription id on a membership, so a membership's payment is found through the policy's own checkout session id, or
// by searching the Contact's subscriptions and matching the term dates on each subscription's checkout session. Stripe search can lag by about a
// minute, so a membership paid a moment ago may not be found yet.
const uri = encodeURIComponent;
const text = v => (v == null ? '' : String(v).trim());
// "55.00" -> 5500. Anything that is not a plain amount is unreadable, not zero.
const gbpToPence = v => (/^\d+(\.\d{1,2})?$/.test(text(v)) ? Math.round(Number(text(v)) * 100) : null);

/** @param {{ stripeGet: (path: string) => Promise<any> }} deps */
function createPaymentFacts({ stripeGet }) {
  // The checkout sessions that could be this membership's payment.
  async function candidateSessions({ contactId, policySessionId }) {
    const found = [];
    if (policySessionId) {
      const s = await stripeGet('/checkout/sessions/' + uri(policySessionId));
      if (s) found.push(s);
    }
    const subs = await stripeGet(
      '/subscriptions/search?limit=20&query=' + uri("metadata['contact_id']:'" + contactId + "'"),
    );
    for (const sub of (subs && subs.data) || []) {
      if (found.some(s => s.subscription === sub.id)) continue;
      const list = await stripeGet('/checkout/sessions?limit=1&subscription=' + uri(sub.id));
      for (const s of (list && list.data) || []) found.push(s);
    }
    return found;
  }

  // The one paid subscription checkout of this Contact whose term is exactly this membership's. { status: 'ok' | 'none' | 'ambiguous', session, sessions }.
  async function findMembershipSession({ contactId, start, end, policySessionId = '' }) {
    const sessions = await candidateSessions({ contactId: String(contactId), policySessionId });
    const mine = sessions.filter(
      s =>
        s.payment_status === 'paid' &&
        s.mode === 'subscription' &&
        text(s.metadata && s.metadata.contact_id) === String(contactId) &&
        text(s.metadata.membership_start) === text(start) &&
        text(s.metadata.membership_expiry) === text(end),
    );
    if (mine.length === 0) return { status: 'none', session: null, sessions };
    if (mine.length > 1) return { status: 'ambiguous', session: null, sessions };
    return { status: 'ok', session: mine[0], sessions };
  }

  // ---- What a monthly payer has paid so far, from the subscription's paid invoices ----
  // A price (with its product) read once and held for this call. Invoice lines name a price by id; the price holds the lookup key, whether it
  // recurs and (through its product) the price list code, whatever the Stripe API version's line shape.
  const priceCache = new Map();
  async function priceOf(id) {
    if (!priceCache.has(id)) priceCache.set(id, await stripeGet('/prices/' + uri(id) + '?expand[]=product'));
    return priceCache.get(id);
  }
  // The price id on an invoice line: older API versions put the price on the line, newer ones under `pricing.price_details`.
  const priceIdOf = line => {
    const direct = line.price;
    if (direct) return typeof direct === 'string' ? direct : text(direct.id);
    const nested = line.pricing && line.pricing.price_details && line.pricing.price_details.price;
    return nested ? (typeof nested === 'string' ? nested : text(nested.id)) : '';
  };
  async function linesOf(invoice) {
    const inline = invoice.lines && invoice.lines.data;
    if (inline && !(invoice.lines && invoice.lines.has_more)) return inline;
    const all = await stripeGet('/invoices/' + uri(invoice.id) + '/lines?limit=100');
    return (all && all.data) || [];
  }

  /**
   * What a monthly payer has paid so far for a subscription, split by what it was for. Membership fee instalments, premium and IPT are what a
   * cancellation or upgrade refunds or credits; the joining fee, add-ons, extra branches, employee fees and the monthly admin fee never are.
   * A line that cannot be placed is listed in `unplaced` (shown as a warning, never counted). Reads only.
   * @returns {Promise<{ instalments: number, membershipPence: number, premiumNetPence: number, iptPence: number, notRefundedPence: number, unplaced: string[] }>}
   */
  async function monthlyPaid({ subscriptionId }) {
    const invoices = await stripeGet('/invoices?limit=24&status=paid&subscription=' + uri(subscriptionId));
    const out = {
      instalments: 0,
      membershipPence: 0,
      premiumNetPence: 0,
      iptPence: 0,
      notRefundedPence: 0,
      unplaced: [],
    };
    for (const invoice of (invoices && invoices.data) || []) {
      if (!(invoice.amount_paid > 0)) continue;
      out.instalments += 1;
      for (const line of await linesOf(invoice)) {
        const amount = Number.isSafeInteger(line.amount) ? line.amount : 0;
        const id = priceIdOf(line);
        const price = id ? await priceOf(id) : null;
        const sku = text(
          (price && price.lookup_key) ||
            (price && price.product && price.product.metadata && price.product.metadata.sku),
        );
        const recurs = Boolean(price && price.recurring);
        const kind = classifySku(sku, recurs);
        if (kind === 'membership') out.membershipPence += amount;
        else if (kind === 'premium') out.premiumNetPence += amount;
        else if (kind === 'ipt') out.iptPence += amount;
        else if (kind === 'kept') out.notRefundedPence += amount;
        else out.unplaced.push(sku || text(line.description) || 'a line with no price list code');
      }
    }
    return out;
  }

  return { findMembershipSession, candidateSessions, monthlyPaid };
}

// What a price list code is, for what a cancellation refunds. The member's own membership fee recurs monthly; the same code on a one-off line is a
// named employee's fee, which is kept.
function classifySku(sku, recurs) {
  if (/^MEM-(ASSOC|FULLNS|FULLS)-Y$/.test(sku)) return recurs ? 'membership' : 'kept';
  if (sku === 'INS-IPT') return 'ipt';
  if (/^(INS|CALC)-/.test(sku)) return 'premium';
  if (/^(MEM-JOIN|MEM-ADMIN|MEM-BRANCH|MEM-BUNDLE|MEM-CERT|MEM-BADGE|MEM-STICKER|FEE-)/.test(sku)) return 'kept';
  return 'unplaced';
}

module.exports = { createPaymentFacts, gbpToPence, text, classifySku };
