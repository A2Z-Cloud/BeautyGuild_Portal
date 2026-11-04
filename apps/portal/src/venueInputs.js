// The details of an additional venue (UAT round 1, S12): the same details the main training centre has, plus the courses that run there.
// The server (functions/beauty_guild_api/src/schoolServices.js, readVenue) checks the same rules again.
import { ACCREDITATION_COUNTRIES } from './JourneyConfig.js';
import { UK_COUNTRIES, validate } from './logic.mjs';
import { resolveFields } from './accreditationInputs.js';

const f = (name, label, type = 'text', required = true, extra = {}) => ({ name, label, type, required, ...extra });
const PHONE_HINT = 'Choose the country code, then enter the number without the first 0.';
export const venueCountry = v => String(v.country === 'Other' ? v.countryOther || '' : v.country || '').trim();
export const isUkVenue = v => UK_COUNTRIES.has(venueCountry(v).toLowerCase());

export const VENUE_FIELDS = [
  f('name', 'Venue name'),
  f('country', 'Country', 'select', true, { options: ACCREDITATION_COUNTRIES.map(c => ({ value: c, label: c })) }),
  f('countryOther', 'Country name', 'text', true, { when: v => v.country === 'Other' }),
  f('postcode', 'Postcode', 'text', isUkVenue, { hint: 'Not needed outside the UK.' }),
  f('address1', 'Address line 1'),
  f('address2', 'Address line 2', 'text', false),
  f('address3', 'Address line 3', 'text', false),
  f('town', 'Town / city'),
  f('county', 'County', 'text', false),
  f('email', 'Venue email', 'email'),
  f('mobile', 'Venue mobile', 'tel', true, { hint: PHONE_HINT, countryFrom: 'country', placeholder: '7700 900123' }),
  f('phone', 'Venue telephone', 'tel', false, { hint: PHONE_HINT, countryFrom: 'country', placeholder: '1332 224830' }),
  f('contactName', 'Contact name', 'text', false),
];

export const emptyVenue = () => ({
  name: '',
  country: 'United Kingdom',
  countryOther: '',
  postcode: '',
  address1: '',
  address2: '',
  address3: '',
  town: '',
  county: '',
  email: '',
  mobile: '',
  phone: '',
  contactName: '',
  courseIds: [],
});
// A venue read back from the CRM: a country the form does not list becomes Other plus its name.
export function venueFromDetails(d = {}) {
  const base = { ...emptyVenue(), ...d, courseIds: (d.courseIds || []).map(String) };
  const wanted = String(d.country || '').trim();
  const listed = ACCREDITATION_COUNTRIES.find(c => c !== 'Other' && c.toLowerCase() === wanted.toLowerCase());
  if (!wanted) return { ...base, country: 'United Kingdom' };
  return listed ? { ...base, country: listed } : { ...base, country: 'Other', countryOther: wanted };
}
// What is sent to the server: one country name, and nothing the form does not own.
export function venuePayload(values, venueId) {
  const { countryOther, ...rest } = values;
  void countryOther;
  return { ...rest, country: venueCountry(values), ...(venueId ? { venueId } : {}) };
}
export function venueErrors(values) {
  const errors = validate(resolveFields(VENUE_FIELDS, values), values);
  if (!(values.courseIds || []).length) errors.courseIds = 'Choose at least one course that runs at this venue.';
  return errors;
}
// What a venue's state means to the member. Draft is saved and unpaid; Creator sets Paid; the Guild sets Verified.
export const VENUE_STATE_TEXT = {
  main: 'Main centre',
  draft: 'Saved, awaiting payment',
  paid: 'Paid, awaiting verification',
  verified: 'Verified',
  other: 'With the Guild',
};
// After paying, the venue stays Draft until Creator has the payment. This tab remembers the return from Stripe for an hour so it can say so.
export const CONFIRMING_MS = 60 * 60 * 1000;
export const confirmingKey = id => 'venue_paid_' + id;
export const isConfirming = (paidAt, now = Date.now()) =>
  Boolean(paidAt) && now - Number(paidAt) < CONFIRMING_MS && now >= Number(paidAt);
