// Due today is the whole first charge: a subscription's first payment plus every one-off line on the same checkout.
export const dueToday = quote => (quote ? quote.totalPence : 0);
// What is charged each period after the first, if anything recurs.
export const thenCharge = quote => {
  // A monthly plan has its own summary (planSummary), with the payments that change after the first year.
  if (quote?.plan) return null;
  // Everything that renews comes back together: the membership, extra branches, insurance premiums, IPT and employee fees.
  const recurring = (quote?.lines || []).filter(l => l.interval);
  if (!recurring.length) return null;
  const interval = recurring[0].interval,
    pence = recurring.filter(l => l.interval === interval).reduce((t, l) => t + l.totalPence, 0);
  return { pence, interval, yearly: interval === 'month' ? pence * 12 : null };
};

// A monthly plan: 12 payments built from the yearly price, with the joining fee and any one-off items charged in full on the first
// payment, so every later payment (and every renewal) is the same, renewing automatically. The first payment is Due today.
export const planSummary = quote => {
  const plan = quote?.plan;
  if (!plan) return null;
  const same = plan.firstPaymentPence === plan.laterPaymentPence;
  return {
    payments: plan.payments,
    firstPence: plan.firstPaymentPence,
    laterPence: plan.laterPaymentPence,
    adminPence: plan.adminFeePence,
    same,
    yearOnePence: plan.yearOneTotalPence,
  };
};
