'use strict';
// Which membership a customer gets, decided only from their answers (docs/delivery/combined-membership-flow-spec.md, section 2).
// The customer no longer chooses a level. The portal, the staff API and the draft routes all call this one function, so they cannot disagree.
const { HttpError } = require('./errors');

// Placeholder until the Guild sends its wording. Changing the text here is the only change needed.
const INTERNATIONAL_NO_INSURANCE_TEXT =
  'Insurance is not available outside the UK, so you will join as an International member without insurance.';

// How you work: exactly one of these. Four are non-salon, owning or operating a salon is the salon route. A mix is refused.
const WORKING = Object.freeze({
  insWorkingFromHome: 'non_salon',
  insMobile: 'non_salon',
  insRentedRoom: 'non_salon',
  insSubcontractor: 'non_salon',
  insSalon: 'salon',
});

// The UK group is the United Kingdom, the Channel Islands and the Isle of Man (the wording of the insurance declaration). Ireland and Other are outside it.
const UK_GROUP = new Set([
  'united kingdom',
  'uk',
  'great britain',
  'england',
  'scotland',
  'wales',
  'northern ireland',
  'channel islands',
  'jersey',
  'guernsey',
  'isle of man',
]);

const STEPS_SIMPLE = Object.freeze(['about_you', 'membership_details', 'extras', 'review']);
const STEPS_FULL = Object.freeze([
  'about_you',
  'how_you_work',
  'business',
  'cover_options',
  'declarations',
  'membership_details',
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

// "How you work" may arrive as one value, or as the list a multiple choice form sends. One answer only.
function workingAnswer(value) {
  const list = (Array.isArray(value) ? value : value == null || value === '' ? [] : [value]).map(String);
  if (!list.length) throw invalid('MISSING_ANSWER', 'Tell us how you work.');
  if (list.length > 1 || !Object.hasOwn(WORKING, list[0]))
    throw invalid('INVALID_WORKING', 'Choose one way that you work.');
  return list[0];
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
  const route = WORKING[workingAnswer(a.working)];
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
