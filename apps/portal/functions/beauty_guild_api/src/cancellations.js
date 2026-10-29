'use strict';
// Refund and credit calculation for cancellations, downgrades and upgrades (docs/delivery/cancellations-refunds-spec.md, section 3).
// Pure functions: pence in, pence out, ISO dates in, no CRM, no Stripe, no clock and no side effects, so every rule is testable on its own.
// Nothing calls this yet: the staff and portal routes that will are specified, not built. The widget and the portal never calculate; they
// show what the function returns.
//
// Rounding (spec D5): money we refund or credit rounds DOWN to the penny, money we keep rounds UP. IPT is 12% (insurance.IPT_RATE).
// Days: pro-rata counts the first and last day (prorata.js), so a year is 365 days (366 across 29 February), and the day of the change is unused.
const { prorata } = require('./prorata');
const { IPT_RATE } = require('./insurance');

const FEE_PENCE = 1000; // the £10 cancellation fee, netted from the refund and never billed (D9)
const COOLING_OFF_DAYS = 14; // from the insurance start date (D7)
const IPT_PERCENT = Math.round(IPT_RATE * 100);
const DAY = 864e5;
const SCENARIOS = Object.freeze(['cancel_associate', 'cancel_full', 'downgrade_full']);

class CancellationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'CancellationError';
    this.code = code;
  }
}
const fail = (code, message) => {
  throw new CancellationError(code, message);
};

// A whole number of pence, never negative. Floats, strings and negatives are refused, not rounded.
function pence(value, name) {
  if (!Number.isSafeInteger(value) || value < 0)
    fail('INVALID_AMOUNT', name + ' must be a whole number of pence, 0 or more.');
  return value;
}
// A real calendar date as YYYY-MM-DD, as a day number. 2026-02-30 is refused.
function dayNumber(iso, name) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso));
  if (!m) fail('INVALID_DATE', name + ' must be a date as YYYY-MM-DD.');
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const ms = Date.UTC(y, mo - 1, d);
  const check = new Date(ms);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d)
    fail('INVALID_DATE', name + ' is not a real date.');
  return ms / DAY;
}
const isoFromDay = n => new Date(n * DAY).toISOString().slice(0, 10);

// The end date of a membership term that starts on `start`: start + 364 days, which counts as 365 days with both ends (D3).
function termEnd(start) {
  return isoFromDay(dayNumber(start, 'start') + 364);
}

// The days of a term, and how many are used and unused if the change takes effect on `effective`. Before the start nothing is used;
// after the end nothing is unused.
function dayCounts({ start, end, effective }) {
  dayNumber(start, 'start');
  dayNumber(end, 'end');
  dayNumber(effective, 'effective');
  if (dayNumber(end, 'end') < dayNumber(start, 'start')) fail('INVALID_DATE', 'The end is before the start.');
  const { days, total } = prorata({ start, end, from: effective });
  return { termDays: total, usedDays: total - days, unusedDays: days };
}

// Cooling off: the effective date is on or before the insurance start date plus 14 days (so a policy starting 18 May qualifies to 1 June).
// A date before the start (cover has not begun) qualifies.
function isCoolingOff({ start, effective }) {
  return dayNumber(effective, 'effective') - dayNumber(start, 'start') <= COOLING_OFF_DAYS;
}

const iptOf = refundPence => Math.floor((refundPence * IPT_PERCENT) / 100);

// Insurance refund for an annual payer: the unused share of the premium, rounded down, and IPT on that (spec 3.2).
function insuranceRefundAnnual({ premiumNetPence, start, end, effective }) {
  pence(premiumNetPence, 'premiumNetPence');
  const d = dayCounts({ start, end, effective });
  const premiumRefundPence = Math.floor((premiumNetPence * d.unusedDays) / d.termDays);
  const iptRefundPence = iptOf(premiumRefundPence);
  return { ...d, premiumRefundPence, iptRefundPence, refundPence: premiumRefundPence + iptRefundPence };
}

// Insurance refund for a monthly payer: never more than was paid. The value used is rounded up (we keep it); the refund is the premium
// paid less that, and IPT on it, never more than the IPT paid (spec 3.3).
function insuranceRefundMonthly({ annualPremiumNetPence, paidNetPence, paidIptPence, start, end, effective }) {
  pence(annualPremiumNetPence, 'annualPremiumNetPence');
  pence(paidNetPence, 'paidNetPence');
  pence(paidIptPence, 'paidIptPence');
  const d = dayCounts({ start, end, effective });
  const usedNetPence = Math.ceil((annualPremiumNetPence * d.usedDays) / d.termDays);
  const premiumRefundPence = Math.max(0, paidNetPence - usedNetPence);
  const iptRefundPence = Math.min(paidIptPence, iptOf(premiumRefundPence));
  return { ...d, usedNetPence, premiumRefundPence, iptRefundPence, refundPence: premiumRefundPence + iptRefundPence };
}

// The membership fee refund: none unless staff override it, and never more than was paid (the override is refused, not capped).
function membershipRefund({ paidPence, overridePence }) {
  pence(paidPence, 'paidPence');
  if (overridePence === undefined || overridePence === null) return { refundPence: 0, overridden: false };
  pence(overridePence, 'overridePence');
  if (overridePence > paidPence)
    fail('OVERRIDE_TOO_HIGH', 'The membership fee refund is more than the membership fee paid.');
  return { refundPence: overridePence, overridden: true };
}

/**
 * The whole cancel, downgrade or Associate cancel: what is refunded, the fee, and the net (spec 3.4 and 3.5).
 * `membership.paidPence` is the membership fee paid (not the joining fee or admin fees). `insurance` is null when there is no policy.
 * @param {{ scenario: string, effectiveDate: string,
 *   membership: { paidPence: number, overridePence?: number | null },
 *   insurance?: null | { billing: 'annual' | 'monthly', start: string, end: string, premiumNetPence: number, paidNetPence?: number, paidIptPence?: number } }} input
 */
function cancellationQuote({ scenario, effectiveDate, membership, insurance = null }) {
  if (!SCENARIOS.includes(scenario)) fail('INVALID_SCENARIO', 'Unknown scenario.');
  dayNumber(effectiveDate, 'effectiveDate');
  const warnings = [];
  if (scenario === 'cancel_associate' && insurance)
    fail('INSURANCE_NOT_ALLOWED', 'An Associate membership has no insurance.');

  let coolingOff = false;
  let ins = null;
  if (insurance) {
    const { start, end, billing } = insurance;
    if (billing !== 'annual' && billing !== 'monthly') fail('INVALID_BILLING', 'billing must be annual or monthly.');
    coolingOff = isCoolingOff({ start, effective: effectiveDate });
    const premiumNetPence = pence(insurance.premiumNetPence, 'premiumNetPence');
    // What was paid: for an annual payer the whole premium and its IPT; for a monthly payer what the instalments came to.
    const paidNetPence = billing === 'annual' ? premiumNetPence : pence(insurance.paidNetPence ?? 0, 'paidNetPence');
    const paidIptPence =
      insurance.paidIptPence !== undefined
        ? pence(insurance.paidIptPence, 'paidIptPence')
        : billing === 'annual'
          ? Math.round((premiumNetPence * IPT_PERCENT) / 100)
          : 0;
    if (dayNumber(effectiveDate, 'effectiveDate') < dayNumber(start, 'start'))
      warnings.push('The effective date is before the insurance start date.');
    if (dayNumber(effectiveDate, 'effectiveDate') > dayNumber(end, 'end'))
      warnings.push('The effective date is after the insurance end date, so no premium is unused.');
    const d = dayCounts({ start, end, effective: effectiveDate });
    let premiumRefundPence;
    let iptRefundPence;
    if (coolingOff) {
      premiumRefundPence = paidNetPence;
      iptRefundPence = paidIptPence;
    } else if (billing === 'annual') {
      ({ premiumRefundPence, iptRefundPence } = insuranceRefundAnnual({
        premiumNetPence,
        start,
        end,
        effective: effectiveDate,
      }));
    } else {
      ({ premiumRefundPence, iptRefundPence } = insuranceRefundMonthly({
        annualPremiumNetPence: premiumNetPence,
        paidNetPence,
        paidIptPence,
        start,
        end,
        effective: effectiveDate,
      }));
    }
    ins = {
      billing,
      start,
      end,
      ...d,
      premiumPaidPence: paidNetPence,
      iptPaidPence: paidIptPence,
      premiumRefundPence,
      iptRefundPence,
      refundPence: premiumRefundPence + iptRefundPence,
    };
  }

  const paidPence = pence(membership?.paidPence, 'membership.paidPence');
  let mem;
  if (coolingOff) {
    // Cooling off refunds the whole membership fee. A staff override is not needed and is ignored.
    if (membership.overridePence !== undefined && membership.overridePence !== null)
      warnings.push('Cooling off refunds the whole membership fee, so the override was ignored.');
    mem = { refundPence: paidPence, overridden: false };
  } else {
    mem = membershipRefund({ paidPence, overridePence: membership.overridePence });
  }

  const grossRefundPence = mem.refundPence + (ins ? ins.refundPence : 0);
  // The £10 fee comes off a pro-rata refund of a Full membership. None in cooling off, none for an Associate (no refund is automatic).
  const feeApplied = scenario === 'cancel_associate' || coolingOff ? 0 : Math.min(FEE_PENCE, grossRefundPence);
  const netRefundPence = grossRefundPence - feeApplied;
  const noRefundDue = grossRefundPence > 0 && netRefundPence === 0;

  return {
    scenario,
    effectiveDate,
    coolingOff,
    membership: { paidPence, refundPence: mem.refundPence, overridden: mem.overridden },
    insurance: ins,
    feeAppliedPence: feeApplied,
    grossRefundPence,
    netRefundPence,
    noRefundDue,
    warnings,
  };
}

/**
 * The credit for an Associate membership being upgraded to Full: what was paid for the membership fee, less the value used, rounded so the
 * Guild keeps the used part (spec 3.6). An annual payer has paid the whole fee, so this is the fee x unused days / term days rounded down.
 * A monthly payer's credit is limited to what they have paid. The joining fee, admin fee and add-ons are never part of it.
 * @param {{ membershipFeePence: number, paidToDatePence?: number, start: string, end: string, upgradeDate: string }} input
 */
function upgradeCredit({ membershipFeePence, paidToDatePence, start, end, upgradeDate }) {
  pence(membershipFeePence, 'membershipFeePence');
  const paid = paidToDatePence === undefined ? membershipFeePence : pence(paidToDatePence, 'paidToDatePence');
  const d = dayCounts({ start, end, effective: upgradeDate });
  const usedValue = Math.ceil((membershipFeePence * d.usedDays) / d.termDays);
  return {
    creditPence: Math.max(0, paid - usedValue),
    usedDays: d.usedDays,
    unusedDays: d.unusedDays,
    termDays: d.termDays,
  };
}

// What the member pays for the upgrade: the new total less the credit, never below zero. The credit that is actually used is capped at the
// new total, so a credit is never paid out (spec 3.6).
function upgradeNet({ newTotalPence, creditPence }) {
  pence(newTotalPence, 'newTotalPence');
  pence(creditPence, 'creditPence');
  const creditAppliedPence = Math.min(creditPence, newTotalPence);
  return { creditAppliedPence, netPence: newTotalPence - creditAppliedPence };
}

module.exports = {
  CancellationError,
  FEE_PENCE,
  COOLING_OFF_DAYS,
  SCENARIOS,
  termEnd,
  dayCounts,
  isCoolingOff,
  insuranceRefundAnnual,
  insuranceRefundMonthly,
  membershipRefund,
  cancellationQuote,
  upgradeCredit,
  upgradeNet,
};
