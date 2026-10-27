'use strict';
// The school referral code: the only code a customer enters online. The code is the school's Accreditation Reference. It takes the
// joining fee off a membership (the fee is left out before a monthly plan is split, so yearly and monthly are both exact). Everything
// here is behind PORTAL_DISCOUNTS_ENABLED. Redemptions are recorded by Creator from the `discounts` metadata, not by the portal.
// Whether a joining fee is due is decided in catalogue.js (joiningFeeDue). Vouchers and goodwill waivers are staff-only and not part of this module. Plan: docs/delivery/vouchers-review.md, phases 0 and 1.
const { HttpError } = require('./errors');

const NOT_VALID = 'That code is not valid';
const NOT_DUE = 'You do not need a code: there is no joining fee to pay on this membership.';
const LIMITED = 'Too many codes have been tried. Please wait an hour and try again.';
const WRONG_PER_HOUR = 10;
const HOUR = 60 * 60 * 1000;
const FOUND_TTL = 60 * 1000;
// The Accreditation Reference (the Training_Centre_Accred autonumber, shown "ACC - 0140"). "ACC-0140" and "acc 0140" are the same
// reference. Anything else is refused before the CRM is asked, so a code can never alter a search.
const SHAPE = /^([A-Z]{1,10})[\s-]*(\d{1,12})$/;
// A reference that was really issued: the accreditation was granted at some point, so an expired school still gives the £10 (Guild).
// Drafts and rejected applications also hold a reference, so they do not count.
const ISSUED = new Set(['verified', 'expired', 'closed', 'suspended', 'revoked']);

const normaliseCode = raw => {
  const m = String(raw ?? '')
    .trim()
    .toUpperCase()
    .match(SHAPE);
  return m ? m[1] + '-' + m[2] : '';
};
const crmReference = code => code.replace('-', ' - ');
// referenceField is the API name of the Accreditation Reference on Training_Centre_Accred.
function createDiscounts({ crm, referenceField, now = Date.now }) {
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

  // The school whose Accreditation Reference this is, or null. Matching ignores case and spacing. References are unique, but more than
  // one match is still refused rather than guessed. Accreditation_Status says whether the reference was issued; an expired school
  // is not refused (the Guild confirmed students still get the £10).
  async function findSchool(req, code) {
    if (!referenceField)
      throw new HttpError(503, 'CODE_UNAVAILABLE', 'Codes cannot be checked right now. Please try again later.');
    const hit = found.get(code);
    if (hit && now() - hit.at < FOUND_TTL) return hit.school;
    const rows = await crm(
      req,
      'Training_Centre_Accred/search?criteria=' +
        encodeURIComponent('(' + referenceField + ':equals:' + crmReference(code) + ')') +
        '&fields=' +
        encodeURIComponent(referenceField + ',Account,Accreditation_Status'),
    );
    const same = rows.filter(
      r =>
        normaliseCode(r[referenceField]) === code &&
        ISSUED.has(
          String(r.Accreditation_Status || '')
            .trim()
            .toLowerCase(),
        ),
    );
    const school =
      same.length === 1
        ? {
            id: String(same[0].Account?.id || ''),
            name: String(same[0].Account?.name || ''),
            accreditationId: String(same[0].id),
          }
        : null;
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

  return { check, findSchool };
}

module.exports = {
  NOT_VALID,
  NOT_DUE,
  LIMITED,
  WRONG_PER_HOUR,
  normaliseCode,
  createDiscounts,
};
