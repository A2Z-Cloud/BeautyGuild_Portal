'use strict';
// Monthly plans. A monthly plan is the yearly price plus the monthly admin fee, divided by 12, with every payment rounded up to the
// next penny (agreed with the Guild, 21 October). The joining fee and the add-ons (badges, bundles and the like, term "year_one") are not
// part of that: they are charged once, in full, on the first payment as one-off lines (Guild suggestion, decided 27 October, MTA-D22), so
// every subscription line is ongoing, the payment is the same at every renewal, and there is no schedule to keep in step.
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
// The ongoing lines are divided into 12 payments. The year_one lines (joining fee, add-ons) are charged once, in full, with the first
// payment, so every later payment, including every renewal, is just the ongoing amount plus the admin fee.
function splitMonthly(lines, adminPence) {
  const ongoing = lines.filter(l => l.term !== 'year_one'),
    once = lines.filter(l => l.term === 'year_one');
  const ongoingTotal = ongoing.reduce((t, l) => t + l.totalPence, 0),
    oneOffPence = once.reduce((t, l) => t + l.totalPence, 0);
  const ongoingMonthly = Math.ceil(ongoingTotal / PAYMENTS);
  const shares = allocate(ongoing, ongoingMonthly);
  const monthly = new Map();
  ongoing.forEach((l, i) => monthly.set(l, shares[i]));
  const laterPaymentPence = ongoingMonthly + adminPence;
  return {
    // monthlyPence is the line's share of each payment; a one-off line has none and is charged at its full totalPence.
    lines: lines.map(l => ({ ...l, monthlyPence: monthly.get(l) ?? 0 })),
    firstPaymentPence: laterPaymentPence + oneOffPence,
    laterPaymentPence,
    oneOffPence,
    // What the member pays over the first twelve months, and over each later year.
    yearOneTotalPence: laterPaymentPence * PAYMENTS + oneOffPence,
    yearTwoTotalPence: laterPaymentPence * PAYMENTS,
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

module.exports = { PAYMENTS, allocate, splitMonthly, form };
