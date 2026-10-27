// The form logic for changing an insurance policy part way through the term (MTA R3-4). Pure: it decides what the member can choose from
// their current cover and turns the form into the request the function prices. The function decides everything that matters (price,
// eligibility, the rules); this only avoids offering what it will refuse and keeps the form tidy.
import { DECLARATION_EXPECTED, TREATMENT_OPTIONS, CONFIRMATIONS, withIpt } from './insuranceInputs.js';

export const MAX_CHANGES = 3;
export const EQUIPMENT_TIERS = [5000, 10000, 15000, 20000];
export const EL_TIERS = [1, 3, 5];
export const TEACHING = [
  { value: 'standard', label: 'Teaching and Training including Student Cover', price: withIpt(75) },
  {
    value: 'additional',
    label: 'Teaching and Training including Student Cover and Additional Treatments Purchased',
    price: withIpt(150),
  },
];
const day = ms => new Date(ms).toISOString().slice(0, 10);
const treatmentCode = id => 'TREATMENT_' + id.toUpperCase();

// One change: what the member wants from one start date.
export const emptyChange = effectiveDate => ({
  effectiveDate,
  addPeople: [],
  removePeople: [],
  treatments: [],
  teaching: '',
  equipmentTier: 0,
  elTier: 0,
});
export const isEmptyChange = c =>
  !c.addPeople.length && !c.removePeople.length && !c.treatments.length && !c.teaching && !c.equipmentTier && !c.elTier;

// Can this policy be changed online at all? The function checks again; this says so up front. Only a Non-Salon policy paid yearly.
export function eligibility(cover) {
  const policy = cover && cover.insurance;
  if (!policy) return { online: false, reason: 'We could not find a current insurance policy on this membership.' };
  if (policy.route !== 'non_salon')
    return { online: false, reason: 'Changes to this policy are made by the office for now. Please call the office.' };
  if (policy.paymentFrequency !== 'Annual')
    return {
      online: false,
      reason: 'Changes to a policy paid monthly are made by the office. Please call the office.',
    };
  return { online: true, reason: '' };
}

// The start dates the member may choose: today up to 30 days ahead, never after the policy ends.
export function dateRange(cover, now = Date.now()) {
  const min = day(now);
  const end = cover && cover.insurance && cover.insurance.endDate;
  const max = day(now + 30 * 864e5);
  return { min, max: end && end < max ? end : max };
}

const held = (cover, code) => (cover.insurance.covers || []).find(c => c.code === code);

// What can be added or raised, from the current cover.
export function options(cover) {
  const heldCodes = new Set((cover.insurance.covers || []).map(c => c.code));
  const eq = held(cover, 'BUSINESS_EQUIPMENT');
  const currentEq = eq && EQUIPMENT_TIERS.includes(eq.sumInsured) ? eq.sumInsured : null;
  return {
    people: cover.insurance.people || [],
    treatments: TREATMENT_OPTIONS.filter(t => !heldCodes.has(treatmentCode(t.value))),
    teaching: heldCodes.has('TEACHING_PLUS')
      ? []
      : heldCodes.has('TEACHING')
        ? TEACHING.filter(t => t.value === 'additional')
        : TEACHING,
    // New equipment needs the premises details, which the form does not collect: the office adds it. A held level can only be raised
    // when it is known.
    equipment: !eq
      ? { office: 'Adding business equipment cover is done by the office for now. Please call the office.', tiers: [] }
      : currentEq
        ? { current: currentEq, tiers: EQUIPMENT_TIERS.filter(t => t > currentEq) }
        : { office: 'We could not confirm your current business equipment level. Please call the office.', tiers: [] },
    // Employers' Liability can be added; a level already held is changed by the office.
    employersLiability: held(cover, 'EMPLOYERS_LIABILITY')
      ? {
          office: "Changes to your Employers' Liability level are made by the office for now. Please call the office.",
          tiers: [],
        }
      : { tiers: EL_TIERS },
  };
}

// The answers, as the function expects them (the same mapping as new business): "I agree" is the expected answer to each statement.
export function answersToRequest(a) {
  const out = {
    declarations: DECLARATION_EXPECTED.map((expected, i) => {
      const x = a['insDecl' + (i + 1)];
      return x === 'agree' ? expected : x === 'disagree' ? (expected === 'yes' ? 'no' : 'yes') : '';
    }),
    qualified:
      a.insQualifiedForTreatments === 'yes' || a.insQualifiedForTreatments === 'no' ? a.insQualifiedForTreatments : '',
    patchTesting: a.insPatchTesting === 'yes' || a.insPatchTesting === 'no' ? a.insPatchTesting : '',
  };
  for (const k of CONFIRMATIONS) out[k] = a[k] === true ? 'yes' : '';
  return out;
}

// The request body for a quote, a saved request or a payment. Each change carries the repeated answers; the function merges changes that
// start on the same day.
export function toBody(recordId, changes, answers) {
  const repeated = answersToRequest(answers);
  return {
    service: 'insurance_change',
    recordId,
    changes: changes
      .filter(c => !isEmptyChange(c))
      .map(c => ({
        ...c,
        addPeople: c.addPeople.map(p => ({ type: p.type, firstName: p.firstName.trim(), lastName: p.lastName.trim() })),
        ...repeated,
      })),
  };
}

// Things to fix before going on, in the member's words.
export function problems(changes, cover, now = Date.now()) {
  const range = dateRange(cover, now);
  const real = changes.filter(c => !isEmptyChange(c));
  const out = [];
  if (!real.length) out.push('Choose a change to make.');
  for (const c of real) {
    if (!c.effectiveDate || c.effectiveDate < range.min || c.effectiveDate > range.max)
      out.push('Choose a start date from ' + range.min + ' to ' + range.max + '.');
    if (c.addPeople.some(p => !p.firstName.trim() || !p.lastName.trim()))
      out.push('Enter the first name and surname of each person you add.');
    if (
      c.teaching === 'additional' &&
      !c.treatments.length &&
      !(cover.insurance.covers || []).some(x => /^TREATMENT_/.test(x.code || ''))
    )
      out.push('Teaching with additional treatments needs a treatment extension.');
  }
  return [...new Set(out)];
}

// Is a treatment chosen anywhere (so the qualification and patch testing questions are needed)?
export const needsTreatmentAnswers = changes => changes.some(c => c.treatments.length > 0);
export const declarationsDone = (answers, changes) =>
  DECLARATION_EXPECTED.every(
    (_, i) => answers['insDecl' + (i + 1)] === 'agree' || answers['insDecl' + (i + 1)] === 'disagree',
  ) &&
  CONFIRMATIONS.every(k => answers[k] === true) &&
  (!needsTreatmentAnswers(changes) || (Boolean(answers.insQualifiedForTreatments) && Boolean(answers.insPatchTesting)));
