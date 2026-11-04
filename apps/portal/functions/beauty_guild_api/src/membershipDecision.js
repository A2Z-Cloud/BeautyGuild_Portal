'use strict';
// Which membership a customer gets, decided only from their answers (docs/delivery/combined-membership-flow-spec.md, section 2).
// The customer no longer chooses a level. The portal, the staff API and the draft routes all call this one function, so they cannot disagree.
const { HttpError } = require('./errors');

// Placeholder until the Guild sends its wording. Changing the text here is the only change needed.
const INTERNATIONAL_NO_INSURANCE_TEXT =
  'Insurance is not available outside the UK, so you will join as an International member without insurance.';

// How you work: one or more of these. Four are non-salon; owning or operating a salon is the salon route. Any mix is non-salon
// unless the salon option is ticked (Guild, UAT round 2).
const WORKING = Object.freeze({
  insWorkingFromHome: 'non_salon',
  insMobile: 'non_salon',
  insRentedRoom: 'non_salon',
  insSubcontractor: 'non_salon',
  insSalon: 'salon',
});

// The UK group is the four nations and the United Kingdom itself, the same set the accreditation journey treats as UK. The Channel Islands, the Isle of Man,
// Ireland and Other are outside it: those members join as International (Guild, 30 October 2026).
const UK_GROUP = new Set(['united kingdom', 'uk', 'great britain', 'england', 'scotland', 'wales', 'northern ireland']);

// No Membership details step for Associate and International: the membership starts on payment and the pay frequency is chosen on the price panel.
const STEPS_SIMPLE = Object.freeze(['about_you', 'extras', 'review']);
const STEPS_FULL = Object.freeze([
  'about_you',
  'how_you_work',
  'business',
  'cover_options',
  'declarations',
  'extras',
  'review',
]);

const invalid = (code, message) => new HttpError(422, code, message);

const inUkGroup = country =>
  UK_GROUP.has(
    String(country || '')
      .trim()
      .toLowerCase(),
  );

// Yes or no, as a boolean or the strings the forms send. Anything else is not an answer.
function yesNo(value) {
  if (value === true || value === 'yes' || value === 'true') return true;
  if (value === false || value === 'no' || value === 'false') return false;
  return null;
}

// "How you work" may arrive as one value, or as the list a multiple choice form sends. The salon route is any list with the salon option in it.
function workingRoute(value) {
  const list = (Array.isArray(value) ? value : value == null || value === '' ? [] : [value]).map(String);
  if (!list.length) throw invalid('MISSING_ANSWER', 'Tell us how you work.');
  if (!list.every(x => Object.hasOwn(WORKING, x)))
    throw invalid('INVALID_WORKING', 'Choose how you work from the list.');
  return list.some(x => WORKING[x] === 'salon') ? 'salon' : 'non_salon';
}

/**
 * @param {{ country?: string, insuranceRequired?: boolean|string, working?: string|string[] }} answers
 * @returns {{ level: 'international'|'associate'|'full_non_salon'|'full_salon', insurance: boolean, route: 'salon'|'non_salon'|null,
 *   ukGroup: boolean, steps: readonly string[], message: string|null }}
 */
function decideMembership(answers) {
  const a = answers && typeof answers === 'object' ? answers : {};
  const country = String(a.country || '').trim();
  if (!country) throw invalid('MISSING_ANSWER', 'Tell us where you are based.');
  if (!inUkGroup(country))
    return {
      level: 'international',
      insurance: false,
      route: null,
      ukGroup: false,
      steps: STEPS_SIMPLE,
      message: INTERNATIONAL_NO_INSURANCE_TEXT,
    };
  const required = yesNo(a.insuranceRequired);
  if (required === null) throw invalid('MISSING_ANSWER', 'Tell us whether you require insurance.');
  if (!required)
    return { level: 'associate', insurance: false, route: null, ukGroup: true, steps: STEPS_SIMPLE, message: null };
  const route = workingRoute(a.working);
  return {
    level: route === 'salon' ? 'full_salon' : 'full_non_salon',
    insurance: true,
    route,
    ukGroup: true,
    steps: STEPS_FULL,
    message: null,
  };
}

module.exports = { decideMembership, inUkGroup, INTERNATIONAL_NO_INSURANCE_TEXT, WORKING };
