// Fill a journey's fields from the member's CRM contact. Only empty fields are filled, and a choice field is only filled
// with a value it actually offers. V1 read the same Contact fields (Salutation, names, email, Phone/Mobile, the correspondence address).
const phoneOrMobile = d => d.mobile || d.phone;
const COMMON = { title: 'title', firstName: 'firstName', lastName: 'lastName', email: 'email' };
const MAPS = {
  membership: {
    ...COMMON,
    mobile: phoneOrMobile,
    address1: 'addressLine1',
    address2: 'addressLine2',
    town: 'town',
    county: 'county',
    postcode: 'postcode',
    territory: 'country',
  },
  accreditation: {
    ...COMMON,
    phone: 'phone',
    mobile: 'mobile',
    contactCountry: 'country',
    address1: 'addressLine1',
    address2: 'addressLine2',
    address3: 'addressLine3',
    town: 'town',
    county: 'county',
    postcode: 'postcode',
  },
  insurance: {
    firstName: 'firstName',
    lastName: 'lastName',
    email: 'email',
    mobile: phoneOrMobile,
    country: 'country',
    postcode: 'postcode',
  },
};
export function prefillFor(kind, details, fields, answers = {}) {
  const map = MAPS[kind];
  if (!map || !details) return {};
  const byName = Object.fromEntries(fields.map(f => [f.name, f]));
  const out = {};
  for (const [name, source] of Object.entries(map)) {
    const field = byName[name];
    if (!field) continue;
    const current = answers[name];
    if (current !== undefined && current !== null && String(current).trim() !== '') continue;
    const value = typeof source === 'function' ? source(details) : details[source];
    if (!value) continue;
    if (Array.isArray(field.options) && !field.options.some(o => String(o.value ?? o) === value)) continue;
    out[name] = value;
  }
  return out;
}
// The country choices offered on the buy pages: use the contact's country when it is one of them.
export const countryFor = (details, options) => (options.includes(details?.country) ? details.country : '');
