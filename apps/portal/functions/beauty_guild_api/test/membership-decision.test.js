'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { decideMembership, inUkGroup, WORKING, INTERNATIONAL_NO_INSURANCE_TEXT } = require('../src/membershipDecision');
const { ITEMS } = require('../src/catalogue');

const refused = (answers, code) =>
  assert.throws(
    () => decideMembership(answers),
    e => e.status === 422 && e.code === code,
  );

test('outside the UK group is International, with no insurance, whatever else was answered', () => {
  for (const country of ['France', 'Ireland', 'Other', 'United States', 'Jersey', 'Guernsey', 'Isle of Man']) {
    const d = decideMembership({ country, insuranceRequired: true, working: 'insSalon' });
    assert.equal(d.level, 'international', country);
    assert.equal(d.insurance, false);
    assert.equal(d.route, null);
    assert.equal(d.ukGroup, false);
    assert.equal(d.message, INTERNATIONAL_NO_INSURANCE_TEXT);
    assert.deepEqual(d.steps, ['about_you', 'extras', 'review']);
  }
});

test('UK without insurance is Associate and skips every insurance step', () => {
  for (const insuranceRequired of [false, 'no', 'false']) {
    const d = decideMembership({ country: 'England', insuranceRequired, working: 'insSalon' });
    assert.equal(d.level, 'associate');
    assert.equal(d.insurance, false);
    assert.equal(d.message, null);
    assert.ok(!d.steps.includes('business') && !d.steps.includes('declarations'));
  }
});

test('UK with insurance is Full: salon only for owning or operating a salon', () => {
  for (const [value, route] of Object.entries(WORKING)) {
    const d = decideMembership({ country: 'United Kingdom', insuranceRequired: 'yes', working: value });
    assert.equal(d.level, route === 'salon' ? 'full_salon' : 'full_non_salon', value);
    assert.equal(d.route, route);
    assert.equal(d.insurance, true);
    assert.deepEqual(d.steps, [
      'about_you',
      'how_you_work',
      'business',
      'cover_options',
      'declarations',
      'extras',
      'review',
    ]);
  }
  assert.equal(WORKING.insSalon, 'salon');
  assert.equal(Object.values(WORKING).filter(r => r === 'non_salon').length, 4);
});

test('a list is accepted: the salon route if the salon option is in it, otherwise non-salon; an unknown answer is refused', () => {
  const level = working => decideMembership({ country: 'Wales', insuranceRequired: true, working }).level;
  assert.equal(level(['insMobile']), 'full_non_salon');
  assert.equal(level(['insMobile', 'insWorkingFromHome']), 'full_non_salon');
  assert.equal(level(['insSalon', 'insMobile']), 'full_salon');
  refused({ country: 'Wales', insuranceRequired: true, working: 'insSomethingElse' }, 'INVALID_WORKING');
});

test('a missing answer is refused rather than guessed', () => {
  refused({}, 'MISSING_ANSWER');
  refused(null, 'MISSING_ANSWER');
  refused({ country: '  ' }, 'MISSING_ANSWER');
  refused({ country: 'England' }, 'MISSING_ANSWER');
  refused({ country: 'England', insuranceRequired: 'maybe' }, 'MISSING_ANSWER');
  refused({ country: 'England', insuranceRequired: true }, 'MISSING_ANSWER');
  refused({ country: 'England', insuranceRequired: true, working: [] }, 'MISSING_ANSWER');
});

test('the UK group is the United Kingdom and its four nations, in any case; the Islands are International', () => {
  for (const c of ['United Kingdom', 'england', 'SCOTLAND', 'Wales', 'Northern Ireland'])
    assert.equal(inUkGroup(c), true, c);
  for (const c of ['Ireland', 'France', 'Other', 'Jersey', 'Guernsey', 'Isle of Man', 'Channel Islands', '', undefined])
    assert.equal(inUkGroup(c), false, String(c));
});

test('International has its own yearly price: lookup key MEM-INTL-Y, £38 zero-rated like the other levels', () => {
  const item = ITEMS.membership_international_annual;
  assert.equal(item.code, 'MEM-INTL-Y');
  assert.equal(item.interval, 'year');
  assert.equal(item.zeroRatedPence, 3800);
  assert.equal(item.zeroRatedPence, ITEMS.membership_associate_annual.zeroRatedPence);
});
