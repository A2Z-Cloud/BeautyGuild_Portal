'use strict';
// The school referral code: the only code a customer enters online. It takes the joining fee off a membership (the fee is
// left out before a monthly plan is split, so yearly and monthly are both exact). Everything here is behind PORTAL_DISCOUNTS_ENABLED.
// Vouchers and goodwill waivers are staff-only and not part of this module. Plan: docs/delivery/vouchers-review.md, phases 0 and 1.
const { HttpError } = require('./errors');

const NOT_VALID = 'That code is not valid';
const NOT_DUE = 'You do not need a code: there is no joining fee to pay on this membership.';
const LIMITED = 'Too many codes have been tried. Please wait an hour and try again.';
// A joining fee is charged to a new person, or to someone whose membership ended more than this many days ago (Guild, 26 October).
const REJOIN_DAYS = 30;
const WRONG_PER_HOUR = 10;
const HOUR = 60 * 60 * 1000;
const FOUND_TTL = 60 * 1000;
// Letters, digits, space, hyphen and underscore only, so the code can never alter a CRM search.
const SHAPE = /^[A-Z0-9][A-Z0-9 _-]{1,39}$/;
// The CRM module and field names for a redemption. The module is created by A2Z (see the hand-over note); names are set in one place.
const REDEMPTION_FIELDS = Object.freeze({
  status: 'Status',
  code: 'Code',
  school: 'School',
  contact: 'Contact',
  application: 'Application_Reference',
  item: 'Item_Code',
  list: 'List_Amount',
  amount: 'Discount_Amount',
  session: 'Stripe_Checkout_Session_ID',
});

const normaliseCode = raw => {
  const code = String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
  return SHAPE.test(code) ? code : '';
};
const dayNumber = iso => Date.parse(String(iso).slice(0, 10) + 'T00:00:00Z') / 864e5;
// Whole days from the expiry date to today (UTC days, like the rest of the catalogue). Null when the date is missing or unreadable.
function daysSinceExpiry(expiry, today) {
  const e = dayNumber(expiry || ''),
    t = dayNumber(today);
  return Number.isFinite(e) && Number.isFinite(t) ? t - e : null;
}
// Is a joining fee due? A new person always pays it. Someone with a previous membership pays it again only when that membership
// expired MORE than 30 days ago: day 30 is still free, day 31 pays. No known expiry date keeps the old rule (no fee on a renewal).
function joiningFeeDue({ previous, expiry, today, rule }) {
  if (!previous) return true;
  if (!rule) return false;
  const days = daysSinceExpiry(expiry, today);
  return days !== null && days > REJOIN_DAYS;
}

function createDiscounts({ crm, crmCreate, crmUpdate, now = Date.now, redemptionModule = 'Discount_Redemptions' }) {
  const found = new Map(), // code -> {at, school}
    wrong = new Map(); // user -> {start, codes:Set}
  const windowOf = user => {
    const t = now();
    let w = wrong.get(user);
    if (!w || t - w.start >= HOUR) {
      if (wrong.size > 5000) for (const [k, v] of wrong) if (t - v.start >= HOUR) wrong.delete(k);
      w = { start: t, codes: new Set() };
      wrong.set(user, w);
    }
    return w;
  };
  const limited = user => windowOf(user).codes.size >= WRONG_PER_HOUR;

  // The school whose Referral_Code this is, or null. Matching ignores case. A school whose accreditation has expired still counts (the Guild
  // confirmed students get the £10), so Referral_Code_Active is not used to refuse a code. A code held by more than one school is refused.
  async function findSchool(req, code) {
    const hit = found.get(code);
    if (hit && now() - hit.at < FOUND_TTL) return hit.school;
    const rows = await crm(
      req,
      'Accounts/search?criteria=' +
        encodeURIComponent('(Referral_Code:equals:' + code + ')') +
        '&fields=' +
        encodeURIComponent('Account_Name,Referral_Code'),
    );
    const same = rows.filter(r => normaliseCode(r.Referral_Code) === code);
    const school = same.length === 1 ? { id: String(same[0].id), name: String(same[0].Account_Name || '') } : null;
    if (school) {
      if (found.size > 500) found.clear();
      found.set(code, { at: now(), school });
    }
    return school;
  }

  // Checks a typed code for one person. The same wrong code is counted once, so re-pricing the page does not use up the allowance.
  // A guest has no account and no CRM access: their code is only checked for shape, and the answer is indicative.
  async function check({ req, raw, userId, guest }) {
    const code = normaliseCode(raw);
    if (!code) return { status: 'invalid', message: NOT_VALID };
    if (guest) return { status: 'ok', code, indicative: true, school: null };
    if (limited(userId)) return { status: 'limited', message: LIMITED };
    const school = await findSchool(req, code);
    if (!school) {
      windowOf(userId).codes.add(code);
      return { status: 'invalid', message: NOT_VALID };
    }
    return { status: 'ok', code, indicative: false, school };
  }

  // The record that says this code was used, written when the customer goes to pay (status Pending). Creator marks it paid when the
  // first payment succeeds. One Pending record per Contact and code: a second attempt reuses it, so a retry never adds a second use.
  async function recordRedemption({ req, code, school, contactId, application, itemCode, listPence, amountPence }) {
    const F = REDEMPTION_FIELDS;
    const open = await crm(
      req,
      redemptionModule +
        '/search?criteria=' +
        encodeURIComponent(
          '((' +
            F.contact +
            ':equals:' +
            contactId +
            ')and(' +
            F.code +
            ':equals:' +
            code +
            ')and(' +
            F.status +
            ':equals:Pending))',
        ) +
        '&fields=' +
        encodeURIComponent('id'),
    ).catch(() => {
      throw new HttpError(
        502,
        'CODE_UNAVAILABLE',
        'We could not apply your code. Please try again, or pay without it.',
      );
    });
    if (open[0]?.id) {
      await crmUpdate(req, redemptionModule, open[0].id, { [F.application]: application });
      return String(open[0].id);
    }
    try {
      return await crmCreate(req, redemptionModule, {
        Name: code + ' / ' + application,
        [F.code]: code,
        [F.school]: school.id,
        [F.contact]: String(contactId),
        [F.application]: application,
        [F.status]: 'Pending',
        [F.item]: itemCode,
        [F.list]: Number((listPence / 100).toFixed(2)),
        [F.amount]: Number((amountPence / 100).toFixed(2)),
      });
    } catch {
      throw new HttpError(
        502,
        'CODE_UNAVAILABLE',
        'We could not apply your code. Please try again, or pay without it.',
      );
    }
  }

  return { check, recordRedemption, findSchool };
}

// The single `discounts` metadata entry (one key: Stripe allows 50 and a membership with insurance is close). Creator reads list and
// discount amounts, the school and the redemption record to mark it paid. Kept well under Stripe's 500 character value limit.
function discountsMetadata({ code, school, itemCode, listPence, amountPence, redemptionId }) {
  return JSON.stringify([
    {
      type: 'referral_code',
      code,
      school_id: school?.id || '',
      item: itemCode,
      list_amount: (listPence / 100).toFixed(2),
      discount_amount: (amountPence / 100).toFixed(2),
      redemption_id: redemptionId || '',
    },
  ]);
}

module.exports = {
  NOT_VALID,
  NOT_DUE,
  LIMITED,
  REJOIN_DAYS,
  WRONG_PER_HOUR,
  REDEMPTION_FIELDS,
  normaliseCode,
  daysSinceExpiry,
  joiningFeeDue,
  createDiscounts,
  discountsMetadata,
};
