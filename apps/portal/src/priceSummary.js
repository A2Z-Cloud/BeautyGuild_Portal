// Due today is the whole first charge: a subscription's first payment plus every one-off line on the same checkout.
export const dueToday=quote=>quote?quote.totalPence:0;
// What is charged each period after the first, if anything recurs.
export const thenCharge=quote=>{
  // A monthly plan has its own summary (planSummary), with the payments that change after the first year.
  if(quote?.plan)return null;
  const line=quote?.lines?.find(l=>l.interval);
  if(!line)return null;
  return {pence:line.unitPence,interval:line.interval,yearly:line.interval==='month'?line.unitPence*12:null};
};

// A monthly plan: 12 payments built from the yearly price, then the same payment, or a lower one once the joining fee and one-off
// items have been paid off, renewing automatically. The first payment is Due today.
export const planSummary=quote=>{
  const plan=quote?.plan;
  if(!plan)return null;
  const same=plan.firstPaymentPence===plan.laterPaymentPence;
  return {payments:plan.payments,firstPence:plan.firstPaymentPence,laterPence:plan.laterPaymentPence,adminPence:plan.adminFeePence,same,
    yearOnePence:plan.yearOneTotalPence};
};
