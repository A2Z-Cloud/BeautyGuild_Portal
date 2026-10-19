// Due today is the whole first charge: a subscription's first payment plus every one-off line on the same checkout.
export const dueToday=quote=>quote?quote.totalPence:0;
// What is charged each period after the first, if anything recurs.
export const thenCharge=quote=>{
  const line=quote?.lines?.find(l=>l.interval);
  if(!line)return null;
  return {pence:line.unitPence,interval:line.interval,yearly:line.interval==='month'?line.unitPence*12:null};
};
