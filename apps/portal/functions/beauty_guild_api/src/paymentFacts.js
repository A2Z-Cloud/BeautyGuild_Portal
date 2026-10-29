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

  return { findMembershipSession, candidateSessions };
}

module.exports = { createPaymentFacts, gbpToPence, text };
