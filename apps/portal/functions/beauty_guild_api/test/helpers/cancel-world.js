'use strict';
// A fake CRM and Stripe for the cancellation tests: a Full member with a yearly policy paid by one Stripe subscription, plus the write side the
// confirm uses (the cancellation record, subscription and refund calls), with every call logged in order in `w.events`.
const { fixture, iso, ME, DEAL } = require('./insurance-fixture');

const json = (body, status = 200) => ({ status, ok: status < 400, json: async () => body });

// A Full member with a yearly policy: £55.00 membership, premium £65.00 net and £7.80 IPT, all paid by one Stripe subscription.
function cancelWorld({
  session = {},
  subscription = {},
  over = {},
  policySession = 'cs_1',
  stripeStatus = 200,
  invoiceAmount = 12780,
  failRefunds = 0,
  noCancellationModule = false,
} = {}) {
  const w = fixture(over);
  const stripeCalls = [];
  w.events = [];
  w.cancellations = [];
  w.refunds = [];
  w.subscriptionPosts = [];
  w.subscriptionDeletes = [];
  let ended = false;
  let seq = 3000000000000000000n;
  const SESSION = {
    id: 'cs_1',
    mode: 'subscription',
    payment_status: 'paid',
    subscription: 'sub_1',
    metadata: {
      contact_id: ME,
      type: 'membership_insurance',
      membership_start: iso(-5),
      membership_expiry: iso(360),
      subscription_type: 'annual',
      base_membership_amount: '55.00',
      insurance_net_amount: '65.00',
      insurance_ipt_amount: '7.80',
      ...session.metadata,
    },
    ...Object.fromEntries(Object.entries(session).filter(([k]) => k !== 'metadata')),
  };
  const SUB = {
    id: 'sub_1',
    status: 'active',
    cancel_at: null,
    items: {
      data: [{ price: { lookup_key: 'MEM-FULLNS-Y' } }, { price: { product: { metadata: { sku: 'INS-MEDMAL-NS' } } } }],
    },
    ...subscription,
  };
  const base = w.fetchImpl;
  const ok = body => json(body);
  w.fetchImpl = async (url, init = {}) => {
    const u = String(url);
    const du = decodeURIComponent(u);
    const method = init.method || 'GET';
    if (u.startsWith('https://api.stripe.com/v1/')) {
      stripeCalls.push({ method, url: u, headers: init.headers, body: init.body });
      if (method !== 'GET')
        w.events.push('stripe:' + method + ':' + u.replace('https://api.stripe.com/v1', '').split('?')[0]);
      if (stripeStatus !== 200) return json({}, stripeStatus);
      // The write side: ending the subscription and creating refunds.
      if (method === 'POST' && /\/subscriptions\/sub_1$/.test(u)) {
        w.subscriptionPosts.push(new URLSearchParams(init.body));
        ended = true;
        return ok({ ...SUB, cancel_at: 1 });
      }
      if (method === 'DELETE' && /\/subscriptions\/sub_1/.test(u)) {
        w.subscriptionDeletes.push(u);
        ended = true;
        return ok({ ...SUB, status: 'canceled' });
      }
      if (method === 'POST' && u.endsWith('/v1/refunds')) {
        if (failRefunds > 0) {
          failRefunds -= 1;
          return json({ error: { code: 'charge_disputed' } }, 400);
        }
        const params = new URLSearchParams(init.body);
        const refund = {
          id: 're_' + (w.refunds.length + 1),
          amount: Number(params.get('amount')),
          status: 'succeeded',
          payment_intent: params.get('payment_intent'),
          metadata: { cancellation_id: params.get('metadata[cancellation_id]') },
          idempotencyKey: init.headers['Idempotency-Key'],
          params,
        };
        w.refunds.push(refund);
        return ok(refund);
      }
      if (u.includes('/refunds?')) return ok({ data: w.refunds });
      if (u.includes('/invoices?'))
        return ok({ data: [{ id: 'in_1', amount_paid: invoiceAmount, created: 1700000000, payment_intent: 'pi_1' }] });
      if (u.includes('/checkout/sessions/cs_1')) return ok(SESSION);
      if (u.includes('/subscriptions/search')) return ok({ data: [{ id: 'sub_1' }] });
      if (u.includes('/checkout/sessions?')) return ok({ data: [SESSION] });
      if (u.includes('/subscriptions/sub_1')) return ok(ended ? { ...SUB, cancel_at: 1 } : SUB);
      return json({}, 404);
    }
    // The CRM cancellation record (a module the Guild has yet to create) and its Note.
    if (du.includes('/crm/v3/Membership_Cancellations')) {
      if (noCancellationModule) return json({ code: 'INVALID_MODULE' }, 400);
      if (method === 'POST') {
        w.events.push('crm:create');
        const rec = { id: String(++seq), ...JSON.parse(init.body).data[0] };
        w.cancellations.push(rec);
        return ok({ data: [{ status: 'success', details: { id: rec.id } }] });
      }
      if (method === 'PUT') {
        w.events.push('crm:update');
        const id = du.split('/Membership_Cancellations/')[1];
        Object.assign(
          w.cancellations.find(r => r.id === id),
          JSON.parse(init.body).data[0],
        );
        return ok({ data: [{ status: 'success', details: { id } }] });
      }
      if (du.includes('/search?')) {
        const hash = /Inputs_Hash:equals:([0-9a-f]+)/.exec(du);
        const rows = w.cancellations.filter(r => !hash || r.Inputs_Hash === hash[1]);
        return rows.length ? ok({ data: rows }) : { status: 204, ok: true, json: async () => ({}) };
      }
      const id = /Membership_Cancellations\/(\d+)/.exec(du);
      return ok({ data: w.cancellations.filter(r => id && r.id === id[1]) });
    }
    if (method === 'POST' && du.endsWith('/crm/v3/Notes')) {
      w.events.push('crm:note');
      return ok({ data: [{ status: 'success', details: { id: '9' } }] });
    }
    if (u.includes('Insurance_Policy/pol1?fields='))
      return json({ data: [{ id: 'pol1', Stripe_Checkout_Session_ID: policySession }] });
    return base(url, init);
  };
  w.stripeCalls = stripeCalls;
  return w;
}
const ASSOCIATE = {
  deal: {
    id: DEAL,
    Deal_Name: 'Associate Member',
    Stage: 'Active',
    Membership_Type: 'Associate Member',
    Start_Date: iso(-5),
    Expiry_Date: iso(360),
    Contact_Name: { id: ME },
  },
  policies: [],
};

module.exports = { cancelWorld, ASSOCIATE };
