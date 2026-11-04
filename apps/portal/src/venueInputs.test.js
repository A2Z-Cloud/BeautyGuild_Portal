import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VENUE_FIELDS,
  emptyVenue,
  venueFromDetails,
  venuePayload,
  venueErrors,
  isUkVenue,
  isConfirming,
  CONFIRMING_MS,
} from './venueInputs.js';

const complete = () => ({
  ...emptyVenue(),
  name: 'Grace Studio',
  postcode: 'DE1 1AA',
  address1: '1 Test Street',
  town: 'Derby',
  email: 'studio@example.test',
  mobile: '+44 7700 900123',
  courseIds: ['3000000000001'],
});

test('a complete venue passes, and each required answer is asked for', () => {
  assert.deepEqual(venueErrors(complete()), {});
  for (const name of ['name', 'address1', 'town', 'email', 'mobile', 'postcode'])
    assert.ok(venueErrors({ ...complete(), [name]: '' })[name], name);
  assert.ok(venueErrors({ ...complete(), courseIds: [] }).courseIds);
  assert.ok(venueErrors({ ...complete(), email: 'nope' }).email);
  assert.deepEqual(
    VENUE_FIELDS.filter(f => !f.required).map(f => f.name),
    ['address2', 'address3', 'county', 'phone', 'contactName'],
  );
});

test('a venue outside the UK needs no postcode, and Other needs a country name', () => {
  assert.equal(isUkVenue(complete()), true);
  const abroad = { ...complete(), country: 'France', postcode: '' };
  assert.equal(isUkVenue(abroad), false);
  assert.deepEqual(venueErrors(abroad), {});
  assert.ok(venueErrors({ ...abroad, country: 'Other', countryOther: '' }).countryOther);
  assert.deepEqual(venueErrors({ ...abroad, country: 'Other', countryOther: 'Narnia' }), {});
});

test('the payload carries one country name and the venue id when editing', () => {
  const other = { ...complete(), country: 'Other', countryOther: 'Narnia' };
  const sent = venuePayload(other, '1000000000009');
  assert.equal(sent.country, 'Narnia');
  assert.equal(sent.venueId, '1000000000009');
  assert.equal('countryOther' in sent, false);
  assert.equal('venueId' in venuePayload(complete()), false);
});

test('a venue read from the CRM fills the form, with an unlisted country shown as Other', () => {
  const back = venueFromDetails({ name: 'Studio', country: 'United Kingdom', courseIds: [1, 2] });
  assert.equal(back.country, 'United Kingdom');
  assert.deepEqual(back.courseIds, ['1', '2']);
  const odd = venueFromDetails({ country: 'Narnia' });
  assert.equal(odd.country, 'Other');
  assert.equal(odd.countryOther, 'Narnia');
  assert.equal(venueFromDetails({}).country, 'United Kingdom');
});

test('a return from Stripe counts as confirming for an hour', () => {
  const now = 1_000_000_000_000;
  assert.equal(isConfirming(String(now - 1000), now), true);
  assert.equal(isConfirming(String(now - CONFIRMING_MS - 1), now), false);
  assert.equal(isConfirming('', now), false);
  assert.equal(isConfirming(null, now), false);
});
