// The combined Membership and Insurance journey's own planning: which steps to show for the answers so far, and which insurance questions
// belong to which step (docs/delivery/combined-membership-flow-spec.md, sections 2 and 3). The server's membershipDecision.js is the
// authority on the level and the price. This only decides what to SHOW before the server has been asked, and membershipPlan.test.js checks
// it against the server function for every row of the matrix so the two cannot drift.
import { INSURANCE_STEPS, visibleSteps } from './insuranceInputs.js';
import { validate } from './logic.mjs';

const UK_GROUP = ['united kingdom', 'uk', 'great britain', 'england', 'scotland', 'wales', 'northern ireland'];
export const inUkGroup = country =>
  UK_GROUP.includes(
    String(country || '')
      .trim()
      .toLowerCase(),
  );

// Placeholder wording until the Guild sends its own (same text as the server's INTERNATIONAL_NO_INSURANCE_TEXT).
export const INTERNATIONAL_NO_INSURANCE_TEXT =
  'Insurance is not available outside the UK, so you will join as an International member without insurance.';

// Associate and International: no Membership details step. The start date is the day of payment and the pay frequency is chosen on the price panel.
export const STEPS_SIMPLE = ['about_you', 'extras', 'review'];
export const STEPS_FULL = [
  'about_you',
  'how_you_work',
  'business',
  'cover_options',
  'declarations',
  'membership_details',
  'extras',
  'review',
];
export const STEP_TITLES = {
  about_you: 'About you',
  how_you_work: 'How you work',
  business: 'Business information',
  cover_options: 'Cover options',
  declarations: 'Declarations',
  membership_details: 'Membership details',
  extras: 'Personalise your membership',
  review: 'Review and pay',
};

// How you work: one choice. The options and their wording come from the insurance questions, so there is one source.
export const WORKING_FIELD = INSURANCE_STEPS.find(s => s.id === 'business').fields.find(f => f.name === 'insWorking');
export const WORKING_OPTIONS = WORKING_FIELD.options;
export const SALON_WORKING = 'insSalon';

// What the answers so far mean. `ready` is true once every answer the decision needs is in; until then the level is not known and the steps
// shown are the shortest list (or the full one once the customer has said they need insurance).
export function planFor({ country, insuranceRequired, working } = {}) {
  const none = { ready: false, level: null, insurance: false, steps: STEPS_SIMPLE, message: null };
  if (!String(country || '').trim()) return none;
  if (!inUkGroup(country))
    return {
      ready: true,
      level: 'international',
      insurance: false,
      steps: STEPS_SIMPLE,
      message: INTERNATIONAL_NO_INSURANCE_TEXT,
    };
  if (insuranceRequired === 'no')
    return { ready: true, level: 'associate', insurance: false, steps: STEPS_SIMPLE, message: null };
  if (insuranceRequired !== 'yes') return none;
  const known = WORKING_OPTIONS.some(o => o.value === working);
  return {
    ready: known,
    level: known ? (working === SALON_WORKING ? 'full_salon' : 'full_non_salon') : null,
    insurance: true,
    steps: STEPS_FULL,
    message: null,
  };
}

// The `answers` the server decides from. Insurance required is sent only where it matters, and how you work only with insurance.
export function answersRequest({ country, insuranceRequired, working }) {
  const out = { country: String(country || '').trim() };
  if (inUkGroup(country) && insuranceRequired) out.insuranceRequired = insuranceRequired;
  if (inUkGroup(country) && insuranceRequired === 'yes' && working) out.working = working;
  return out;
}

// Which insurance questions each journey step shows. Every question in INSURANCE_STEPS appears in exactly one step (tested).
export const INSURANCE_GROUPS = {
  how_you_work: ['business'],
  business: ['people', 'standardTreatments', 'treatments', 'teaching', 'property'],
  cover_options: ['equipment', 'el', 'contents', 'money', 'buildings', 'bi', 'propertyAway'],
  declarations: ['declarations', 'demands'],
};
export const isInsuranceStep = key => Object.hasOwn(INSURANCE_GROUPS, key);

// The insurance questions to show on one journey step for the answers so far.
export const stepsOf = (key, values) => visibleSteps(values).filter(s => (INSURANCE_GROUPS[key] || []).includes(s.id));
export const fieldsOf = (key, values) =>
  stepsOf(key, values)
    .flatMap(s => s.fields)
    .filter(f => !f.when || f.when(values));

// What is still missing on an insurance step. `working` comes from About you's sibling step, so how_you_work also needs it chosen.
export function insuranceStepErrors(key, values) {
  const errors = validate(fieldsOf(key, values), values);
  if (key === 'how_you_work' && !(values.insWorking || []).length) errors.insWorking = 'Choose how you work.';
  return errors;
}

export function aboutYouErrors({ country, insuranceRequired, interests }, { askInsurance = true } = {}) {
  const errors = {};
  if (!String(country || '').trim()) errors.country = 'Choose where you are based.';
  else if (askInsurance && inUkGroup(country) && !insuranceRequired)
    errors.insuranceRequired = 'Tell us whether you require insurance.';
  if (!Array.isArray(interests) || !interests.length) errors.interests = 'Choose at least one interest.';
  return errors;
}
// The branch is chosen on Personalise your membership.
export const extrasErrors = ({ branch }) => (branch ? {} : { branch: 'Choose your membership branch.' });

// What the member is interested in. Training has no branch of its own.
export const INTERESTS = [
  { id: 'beauty', name: 'Beauty' },
  { id: 'holistic', name: 'Holistic' },
  { id: 'nails', name: 'Nails' },
  { id: 'hair', name: 'Hair' },
  { id: 'training', name: 'Training' },
];
// The first branch ticked from the interests, in this order (the Guild, UAT round 1). Training is not a branch.
export const BRANCH_PRIORITY = ['beauty', 'holistic', 'nails', 'hair'];
export const defaultBranch = (interests = []) => BRANCH_PRIORITY.find(id => interests.includes(id)) || '';
// The branches that match an interest but are not yet chosen, offered as suggestions.
export const suggestedBranches = (interests = [], { branch, branches = [] } = {}) =>
  BRANCH_PRIORITY.filter(id => interests.includes(id) && id !== branch && !branches.includes(id));
// One list of branches: the first ticked is the included one, any after it are the additional (£15) ones. Unticking the first promotes the next.
export function toggleBranchChoice({ branch = '', branches = [] }, id) {
  if (id === branch) return { branch: branches[0] || '', branches: branches.slice(1) };
  if (branches.includes(id)) return { branch, branches: branches.filter(b => b !== id) };
  return branch ? { branch, branches: [...branches, id] } : { branch: id, branches };
}
// England, Scotland, Wales and Northern Ireland are the United Kingdom in the country list.
export const ukOnce = country =>
  ['england', 'scotland', 'wales', 'northern ireland'].includes(
    String(country || '')
      .trim()
      .toLowerCase(),
  )
    ? 'United Kingdom'
    : country;

// The next and previous step key within the steps shown; an unknown key counts as the first step.
export function stepIndex(steps, key) {
  const i = steps.indexOf(key);
  return i < 0 ? 0 : i;
}

// One sentence on what the answers give the customer, shown as soon as it is known. The International and Associate wording is placeholder text
// until the Guild sends its own (the Associate line replaces the old "choose Associate or Full" copy: the customer no longer chooses).
export const LEVEL_TEXT = {
  international: INTERNATIONAL_NO_INSURANCE_TEXT,
  associate: 'You will join as an Associate member, without insurance. You can add insurance later by upgrading.',
  full_non_salon: 'You will join as a Full member (Non-Salon), with insurance.',
  full_salon: 'You will join as a Full member (Salon), with insurance.',
};
export const outcomeText = plan => (plan.ready && plan.level ? LEVEL_TEXT[plan.level] : '');
