'use strict';
// A signed staff API harness shared by the staff route tests: the real app, wired to the fake world a test passes in, and a `call` that signs
// each request the way the CRM function does, as the CRM user STAFF.
const { createApp } = require('../../src/app');
const { loadConfig } = require('../../src/config');
const { signStaffRequest } = require('../../src/staff');

const SECRET = 'staff-test-secret-0123456789-abcdefghijklmnop';
const STAFF = '1011174000000000042';
const ENV = {
  PORTAL_BILLING_ENABLED: 'true',
  STRIPE_SECRET_KEY: 'sk_test_example_only',
  PORTAL_PUBLIC_ORIGIN: 'https://portal.example.test',
  PORTAL_RISK_SANCTIONS: 'false',
  PORTAL_INSURANCE_CHANGES_ENABLED: 'true',
  PORTAL_STAFF_API_ENABLED: 'true',
  STAFF_API_SECRET: SECRET,
  PORTAL_STAFF_API_ROLES: 'Administrator, Standard',
};
let counter = 0;

async function withStaff(w, fn, env = {}) {
  const app = createApp({
    config: loadConfig({ ...ENV, ...env }),
    getCrmHeaders: async () => ({ Authorization: 'Bearer test' }),
    getAnalyticsHeaders: async () => ({}),
    getCreatorHeaders: async () => ({}),
    fetchImpl: w.fetchImpl,
  });
  const server = await new Promise(resolve => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  try {
    // Signed the way the CRM function signs it, as the CRM user STAFF.
    const call = async (
      path,
      body,
      { secret = SECRET, user = STAFF, method = body === undefined ? 'GET' : 'POST' } = {},
    ) => {
      const text = body === undefined ? '' : JSON.stringify(body);
      const time = String(Math.floor(Date.now() / 1000));
      const nonce = (++counter).toString(16).padStart(32, '0');
      const signature = signStaffRequest({ secret, method, path, body: text, time, nonce, userId: user });
      const r = await fetch('http://127.0.0.1:' + server.address().port + path, {
        method,
        headers: {
          ...(text ? { 'Content-Type': 'application/json' } : {}),
          'X-Staff-User': user,
          'X-Staff-Time': time,
          'X-Staff-Nonce': nonce,
          'X-Staff-Signature': Buffer.from(signature, 'hex').toString('base64'),
        },
        ...(text ? { body: text } : {}),
      });
      return { status: r.status, body: await r.json() };
    };
    await fn({ call });
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

module.exports = { SECRET, STAFF, ENV, withStaff };
