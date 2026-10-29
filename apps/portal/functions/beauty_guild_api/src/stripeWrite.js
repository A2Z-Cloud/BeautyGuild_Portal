'use strict';
// A Stripe client that CHANGES things, kept apart from the read-only one (stripeRead.js) so no read path can ever write. Used only by the
// cancellation confirm (ending a subscription, creating refunds). The caller must hold a test key: the confirm refuses anything else.
// Every create takes an idempotency key, so a retry of the same step never makes a second refund.
const { HttpError } = require('./errors');

const STRIPE = 'https://api.stripe.com/v1';

function createStripeWriter({ stripeKey, fetchImpl = fetch }) {
  async function send(method, path, params, key) {
    const unavailable = () =>
      new HttpError(502, 'STRIPE_UNAVAILABLE', 'Stripe could not complete the request. Please try again.');
    let response;
    try {
      response = await fetchImpl(STRIPE + path, {
        method,
        signal: AbortSignal.timeout(20000),
        headers: {
          Authorization: 'Bearer ' + stripeKey,
          ...(params ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
          ...(key ? { 'Idempotency-Key': key } : {}),
        },
        ...(params ? { body: params.toString() } : {}),
      });
    } catch {
      throw unavailable();
    }
    const body = await response.json().catch(() => null);
    if (!response.ok || !body) {
      // Stripe's own error code (for example `resource_missing`), for the log and the caller's decision; never a key or a header.
      throw Object.assign(unavailable(), {
        stripeCode: body && body.error && body.error.code ? String(body.error.code) : '',
      });
    }
    return body;
  }
  return {
    post: (path, params, key) => send('POST', path, params, key),
    del: (path, params) => send('DELETE', path + (params ? '?' + params.toString() : ''), null, null),
  };
}

module.exports = { createStripeWriter };
