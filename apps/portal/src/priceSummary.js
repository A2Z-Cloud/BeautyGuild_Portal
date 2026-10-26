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

// A monthly plan: 12 payments built from the yearly price, then the same payment, or a lower one once the joining fee and one-off
// items have been paid off, renewing automatically. The first payment is Due today.
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

// A school referral code that took the joining fee off: the line to show struck through and marked as waived. A guest's is indicative.
export const waivedLine = quote => {
  const d = quote?.discount;
  return d ? { name: d.lineName, pence: d.amountPence, label: d.label, indicative: Boolean(d.indicative) } : null;
};
// The code box is offered only on a membership quote that says a joining fee is due.
export const offersCode = quote => Boolean(quote?.joiningFee?.due);
