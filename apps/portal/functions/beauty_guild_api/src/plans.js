'use strict';
// Monthly plans. A monthly plan is the yearly price plus the monthly admin fee, divided by 12, with every payment rounded up to the
// next penny (agreed with the Guild, 21 October). Some lines last for the first 12 payments only (the joining fee, badges, bundles and the
// like, "year_one"); the rest carry on ("ongoing"). Stripe Checkout cannot end a line after 12 payments, so the subscription is put on a
// schedule once it exists (ensureSchedule): phase one keeps every line for 12 months, phase two keeps the ongoing lines.
const crypto = require('node:crypto');

const PAYMENTS = 12;

// Shares a whole number of pence between lines, in proportion to their yearly amount, so the shares add up to `target` exactly.
// Each line gets the whole pence of its exact share; the pence still owed go to the largest fractions first.
function allocate(lines, target) {
  const exact = lines.map(l => l.totalPence / PAYMENTS),
    shares = exact.map(Math.floor);
  let owed = target - shares.reduce((t, n) => t + n, 0);
  const order = exact.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, i] of order) {
    if (owed <= 0) break;
    shares[i] += 1;
    owed -= 1;
  }
  return shares;
}

// lines: [{totalPence, term: 'ongoing' | 'year_one', ...}] with yearly amounts in pence. adminPence is the monthly admin fee.
// The ongoing lines pay exactly the same in both years, so the schedule only has to drop the year_one lines at payment 13.
function splitMonthly(lines, adminPence) {
  const ongoing = lines.filter(l => l.term !== 'year_one'),
    yearOne = lines.filter(l => l.term === 'year_one');
  const ongoingTotal = ongoing.reduce((t, l) => t + l.totalPence, 0),
    yearOneTotal = yearOne.reduce((t, l) => t + l.totalPence, 0);
  const ongoingMonthly = Math.ceil(ongoingTotal / PAYMENTS),
    firstMonthly = Math.ceil((ongoingTotal + yearOneTotal) / PAYMENTS);
  const ongoingShares = allocate(ongoing, ongoingMonthly),
    yearOneShares = allocate(yearOne, firstMonthly - ongoingMonthly);
  const monthly = new Map();
  ongoing.forEach((l, i) => monthly.set(l, ongoingShares[i]));
  yearOne.forEach((l, i) => monthly.set(l, yearOneShares[i]));
  return {
    lines: lines.map(l => ({ ...l, monthlyPence: monthly.get(l) })),
    firstPaymentPence: firstMonthly + adminPence,
    laterPaymentPence: ongoingMonthly + adminPence,
    yearOneTotalPence: (firstMonthly + adminPence) * PAYMENTS,
    yearTwoTotalPence: (ongoingMonthly + adminPence) * PAYMENTS,
    adminPence,
  };
}

// URL-encoded form body for Stripe, nested objects and arrays included.
function form(obj, prefix = '') {
  const out = new URLSearchParams();
  const walk = (value, key) => {
    if (value && typeof value === 'object')
      for (const [k, v] of Object.entries(value)) walk(v, key ? key + '[' + k + ']' : k);
    else if (value !== undefined && value !== null) out.append(key, String(value));
  };
  walk(obj, prefix);
  return out;
}

// Puts a monthly subscription on its schedule: 12 months with every line, then the lines that carry on. Safe to call again: a
// subscription that already has a schedule, or has nothing to drop, is left alone. Called from the payment return page and from the webhook.
// stripe(method, path, params) is the checkout helper (params = {body, key}).
async function ensureSchedule(stripe, subscriptionId) {
  const id = String(subscriptionId || '');
  if (!/^sub_[A-Za-z0-9]+$/.test(id)) return { status: 'invalid' };
  const sub = await stripe('GET', '/subscriptions/' + id + '?expand[]=items.data.price.product&expand[]=discounts');
  if (!['active', 'trialing', 'past_due'].includes(sub.status)) return { status: 'inactive' };
  if (sub.schedule) return { status: 'already' };
  const items = (sub.items?.data || []).map(i => ({
    price: i.price.id,
    quantity: i.quantity || 1,
    phase: i.price.product?.metadata?.phase || 'ongoing',
  }));
  // A coupon on the subscription (the additional branch discount, branchCoupon.js) is passed into phase one explicitly: the phases are
  // rebuilt from the items only, and a phase that names no discount may not carry the subscription's. Its own duration (once, or 12
  // months) still ends it, so phase two needs no discount.
  const coupons = (sub.discounts || [])
    .map(d => (typeof d === 'string' ? '' : d.source?.coupon?.id || d.source?.coupon || d.coupon?.id || ''))
    .filter(c => typeof c === 'string' && /^[A-Za-z0-9_-]+$/.test(c));
  const keep = items.filter(i => i.phase !== 'year_one');
  if (keep.length === items.length || !keep.length) return { status: 'none' };
  let schedule;
  try {
    schedule = await stripe('POST', '/subscription_schedules', {
      body: form({ from_subscription: id }),
      key: 'portal-sched-' + id,
    });
  } catch (e) {
    const again = await stripe('GET', '/subscriptions/' + id).catch(() => null);
    if (again?.schedule) return { status: 'already' };
    throw e;
  }
  const phase = list => list.map(({ price, quantity }) => ({ price, quantity }));
  const start = schedule.phases?.[0]?.start_date;
  await stripe('POST', '/subscription_schedules/' + encodeURIComponent(schedule.id), {
    key: 'portal-sched-set-' + id,
    body: form({
      end_behavior: 'release',
      phases: [
        {
          start_date: start,
          items: phase(items),
          ...(coupons.length ? { discounts: coupons.map(coupon => ({ coupon })) } : {}),
          duration: { interval: 'month', interval_count: PAYMENTS },
          proration_behavior: 'none',
        },
        { items: phase(keep), duration: { interval: 'month', interval_count: PAYMENTS }, proration_behavior: 'none' },
      ],
    }),
  });
  return { status: 'scheduled', dropped: items.length - keep.length };
}

// Stripe's webhook signature: HMAC-SHA256 of "<timestamp>.<raw body>" with the endpoint's signing secret, within five minutes.
function verifyStripeSignature(rawBody, header, secret, nowMs = Date.now(), toleranceSeconds = 300) {
  if (!secret || !header || !Buffer.isBuffer(rawBody)) return false;
  const parts = String(header)
    .split(',')
    .map(p => p.trim().split('='));
  const t = parts.find(([k]) => k === 't')?.[1],
    signatures = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!t || !/^\d+$/.test(t) || !signatures.length) return false;
  if (Math.abs(nowMs / 1000 - Number(t)) > toleranceSeconds) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(t + '.')
    .update(rawBody)
    .digest('hex');
  return signatures.some(
    s => s.length === expected.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected)),
  );
}

module.exports = { PAYMENTS, allocate, splitMonthly, form, ensureSchedule, verifyStripeSignature };
