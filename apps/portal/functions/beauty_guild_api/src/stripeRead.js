'use strict';
// A read-only Stripe client: GET only, by design. It is used to read what a customer paid (checkout sessions, subscriptions) for the cancellation
// quote, which must never change anything. A 404 is `null`, anything else wrong is a 502.
const { HttpError } = require('./errors');

const STRIPE = 'https://api.stripe.com/v1';

function createStripeReader({ stripeKey, fetchImpl = fetch }) {
  return async function stripeGet(path) {
    const unavailable = () => new HttpError(502, 'STRIPE_UNAVAILABLE', 'Stripe could not be read. Please try again.');
    if (!stripeKey) throw new HttpError(503, 'NOT_AVAILABLE', 'Stripe is not configured.');
    let response;
    try {
      response = await fetchImpl(STRIPE + path, {
        method: 'GET',
        signal: AbortSignal.timeout(15000),
        headers: { Authorization: 'Bearer ' + stripeKey },
      });
    } catch {
      throw unavailable();
    }
    if (response.status === 404) return null;
    const body = await response.json().catch(() => null);
    if (!response.ok || !body) throw unavailable();
    return body;
  };
}

module.exports = { createStripeReader };
