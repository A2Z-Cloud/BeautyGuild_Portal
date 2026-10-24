import test from 'node:test';
import assert from 'node:assert/strict';
import { validate } from './logic.mjs';
import { JOURNEYS, COUNTRY_OPTIONS } from './JourneyConfig.js';
import {
  firstIncompleteStep,
  resolveFields,
  restoreAccreditationAnswers,
  centreCountry,
  isUkCentre,
  COPY_HOME_MAP,
  DECLARATIONS_WARNING,
  LEGAL_LINKS,
} from './accreditationInputs.js';
import { phoneIssue, splitPhone, joinPhone, isoForCountry } from './phones.js';
import { groupCourses } from './courseGroups.js';
import { startLimits } from './startDate.js';

const steps = JOURNEYS.accreditation.steps;
const fields = steps.flatMap(s => s.fields);
const byName = name => fields.find(f => f.name === name);
const errorsFor = (stepId, values) => {
  const s = steps.find(x => x.id === stepId);
  return validate(resolveFields(s.fields, values), values);
};
const complete = () => ({
  title: 'Ms',
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.test',
  mobile: '+44 7700 900123',
  phone: '+44 1234 567890',
  contactCountry: 'United Kingdom',
  address1: '1 High St',
  town: 'Derby',
  postcode: 'DE1 1AA',
  centre: 'Glow Academy',
  country: 'United Kingdom',
  centreEmail: 'hello@glow.test',
  centreMobile: '+44 7700 900456',
  centreAddress1: '2 Low Rd',
  centreTown: 'Derby',
  centrePostcode: 'DE2 2BB',
  otherTutors: 'no',
  additionalVenues: 'no',
  courseIds: ['3000000000001'],
  qualifiedSixMonths: 'yes',
  teachingQualification: 'yes',
  evidenceAvailable: 'yes',
  startDate: startLimits().min,
  terms: true,
});

test('each extra tutor is asked for by first name, surname and email, as many rows as the count', () => {
  const row = n => ({ firstName: 'Tess' + n, surname: 'Tutor', email: 'tess' + n + '@example.test' });
  const base = { otherTutors: 'yes', tutorQualified: 'yes', additionalVenues: 'no' };
  assert.ok(errorsFor('tutors', base).tutorCount);
  assert.deepEqual(errorsFor('tutors', { otherTutors: 'no', additionalVenues: 'no' }), {});
  assert.ok(errorsFor('tutors', { ...base, tutorCount: '2' }).tutors, 'two tutors need two filled rows');
  assert.ok(
    errorsFor('tutors', {
      ...base,
      tutorCount: '2',
      tutors: [row(1), { firstName: 'Tom', surname: '', email: 'tom@example.test' }],
    }).tutors,
  );
  assert.ok(errorsFor('tutors', { ...base, tutorCount: '1', tutors: [{ ...row(1), email: 'not-an-email' }] }).tutors);
  assert.match(
    errorsFor('tutors', { ...base, tutorCount: '2', tutors: [row(1), { ...row(2), email: 'TESS1@example.test' }] })
      .tutors,
    /different email/,
  );
  assert.deepEqual(errorsFor('tutors', { ...base, tutorCount: '2', tutors: [row(1), row(2)] }), {});
  assert.deepEqual(
    errorsFor('tutors', { ...base, tutorCount: '1', tutors: [row(1), { firstName: '', surname: '', email: '' }] }),
    {},
    'rows beyond the count are ignored',
  );
  assert.ok(errorsFor('tutors', { ...base, tutorCount: '21' }).tutorCount);
});

test('the centre address has three lines and the postcode is optional outside the UK (AL-ACC-016, 030)', () => {
  for (const name of ['centreAddress1', 'centreAddress2', 'centreAddress3', 'address1', 'address2', 'address3'])
    assert.ok(byName(name), name);
  assert.ok(errorsFor('centre', { ...complete(), centrePostcode: '' }).centrePostcode, 'a UK centre needs a postcode');
  assert.deepEqual(
    errorsFor('centre', { ...complete(), country: 'Other', countryOther: 'Nigeria', centrePostcode: '' }),
    {},
  );
  assert.ok(
    errorsFor('centre', { ...complete(), country: 'Other', countryOther: '' }).countryOther,
    'Other needs a country name',
  );
  assert.deepEqual(
    errorsFor('contact-address', {
      ...complete(),
      contactCountry: 'Other',
      contactCountryOther: 'France',
      postcode: '',
    }),
    {},
  );
  assert.ok(errorsFor('contact-address', { ...complete(), postcode: '' }).postcode);
});

test('the centre country decides UK or international, not the home address', () => {
  assert.equal(centreCountry({ country: 'Other', countryOther: ' Nigeria ' }), 'Nigeria');
  assert.equal(isUkCentre({ country: 'Scotland' }), true);
  assert.equal(isUkCentre({ country: 'Ireland' }), false);
  assert.equal(isUkCentre({ country: 'United Kingdom', contactCountry: 'France' }), true);
});

test('declarations must all be Yes, with the reason shown, and the start date is limited to one month ahead (AL-ACC-046)', () => {
  const declarations = steps.find(s => s.id === 'declarations').fields;
  assert.ok(declarations.filter(f => f.mustBe === 'yes' && f.noMessage).length === 3);
  assert.ok(errorsFor('declarations', { ...complete(), teachingQualification: 'no' }).teachingQualification);
  const { min, max } = startLimits(),
    day = Date.now() + 40 * 864e5;
  assert.deepEqual(errorsFor('declarations', complete()), {});
  assert.ok(
    errorsFor('declarations', { ...complete(), startDate: new Date(day).toISOString().slice(0, 10) }).startDate,
  );
  assert.ok(errorsFor('declarations', { ...complete(), startDate: '2020-01-01' }).startDate);
  assert.deepEqual(errorsFor('declarations', { ...complete(), startDate: max }), {});
  assert.ok(max > min);
});

test('mobile is the required number, the centre needs an email and mobile, and phone numbers must be a real length (AL-ACC-011)', () => {
  assert.equal(byName('mobile').required, true);
  assert.equal(byName('phone').required, false);
  assert.ok(errorsFor('applicant', { ...complete(), mobile: '' }).mobile);
  assert.deepEqual(errorsFor('applicant', { ...complete(), phone: '' }), {});
  assert.ok(errorsFor('applicant', { ...complete(), mobile: '+44 1' }).mobile, 'one digit is not a number');
  assert.ok(
    errorsFor('applicant', { ...complete(), mobile: '+44 12345678' }).mobile,
    'a UK number needs 9 digits after the code',
  );
  assert.deepEqual(errorsFor('applicant', { ...complete(), mobile: '+971 50 123 4567' }), {});
  assert.ok(errorsFor('centre', { ...complete(), centreEmail: '' }).centreEmail);
  assert.ok(errorsFor('centre', { ...complete(), centreMobile: '' }).centreMobile);
  assert.deepEqual(errorsFor('centre', { ...complete(), centrePhone: '' }), {});
  assert.match(byName('mobile').hint, /country code/);
  assert.match(byName('centrePhone').hint, /country code/);
  assert.equal(byName('courseIds').type, 'courses');
  assert.ok(errorsFor('courses', { courseIds: [] }).courseIds);
  assert.deepEqual(errorsFor('courses', { courseIds: ['3000000000001'] }), {});
});

test('resuming rebuilds the form: unlisted countries become Other, old dates and titles are cleaned', () => {
  const out = restoreAccreditationAnswers(
    { country: 'Nigeria', contactCountry: 'united kingdom', startDate: '2020-01-01', title: 'Mrs.' },
    COUNTRY_OPTIONS,
  );
  assert.equal(out.country, 'Other');
  assert.equal(out.countryOther, 'Nigeria');
  assert.equal(out.contactCountry, 'United Kingdom');
  assert.equal(out.startDate, '');
  assert.equal(out.title, 'Mrs');
  assert.equal(restoreAccreditationAnswers({ title: 'Prof.' }, COUNTRY_OPTIONS).title, '');
  const keep = startLimits().min;
  assert.equal(restoreAccreditationAnswers({ startDate: keep }, COUNTRY_OPTIONS).startDate, keep);
});

test('resume goes to the first step with a missing answer, or the review when complete', () => {
  assert.equal(firstIncompleteStep(steps, {}, validate), 0);
  assert.equal(
    firstIncompleteStep(steps, { ...complete(), centre: '' }, validate),
    steps.findIndex(s => s.id === 'centre'),
  );
  assert.equal(
    firstIncompleteStep(steps, { ...complete(), courseIds: [] }, validate),
    steps.findIndex(s => s.id === 'courses'),
  );
  assert.equal(firstIncompleteStep(steps, complete(), validate), steps.length - 1);
});

test('courses can be grouped by treatment group', () => {
  const courses = [
    { id: '1', name: 'Facial', category: 'Beauty', treatmentGroup: 'Skin' },
    { id: '2', name: 'Peel', category: 'Beauty', treatmentGroup: 'Skin' },
    { id: '3', name: 'Gel', category: 'Nails', treatmentGroup: 'Nail enhancement' },
    { id: '4', name: 'Misc', category: 'Beauty', treatmentGroup: null },
  ];
  assert.deepEqual(
    groupCourses(courses, '', 'treatmentGroup').map(g => [g.category, g.items.length]),
    [
      ['Nail enhancement', 1],
      ['Skin', 2],
      ['Other', 1],
    ],
  );
  assert.deepEqual(
    groupCourses(courses).map(g => g.category),
    ['Beauty', 'Nails'],
  );
});

test('phone numbers split into a country code and number, and the code follows the country', () => {
  assert.deepEqual(splitPhone('+44 1332 224830'), { iso: 'GB', local: '1332 224830' });
  assert.deepEqual(splitPhone('01332 224830'), { iso: 'GB', local: '1332 224830' });
  assert.equal(splitPhone('+971 50 123 4567').iso, 'AE');
  assert.equal(joinPhone('GB', '07700 900123'), '+44 7700 900123');
  assert.equal(joinPhone('GB', '  '), '');
  assert.equal(isoForCountry('United Arab Emirates'), 'AE');
  assert.equal(isoForCountry('Scotland'), 'GB');
  assert.equal(isoForCountry(''), 'GB');
  assert.equal(phoneIssue('+44 7700 900123'), '');
  assert.ok(phoneIssue('+44 123'));
  assert.ok(phoneIssue('abc'));
});

test("the centre step can copy the applicant's own details, and the wording follows the customer (UAT)", () => {
  assert.equal(byName('copyHome').type, 'copyHome');
  assert.deepEqual(errorsFor('centre', { ...complete() }), {});
  for (const [from, to] of Object.entries(COPY_HOME_MAP)) {
    assert.ok(byName(to) || to === 'countryOther', to);
    assert.ok(byName(from) || from === 'contactCountryOther', from);
  }
  assert.equal(COPY_HOME_MAP.mobile, 'centreMobile');
  assert.match(DECLARATIONS_WARNING, /GTi accreditation/);
  assert.match(DECLARATIONS_WARNING, /01332 224830/);
  assert.equal(byName('courseIds').label, 'Select the GTi courses you wish to teach');
  assert.ok(byName('terms').links['Terms of Business'].includes('beautyguild.com/Legal'));
  assert.deepEqual(Object.keys(LEGAL_LINKS), ['Terms of Business', 'Privacy Policy']);
});
