import test from 'node:test';
import assert from 'node:assert/strict';
import { insuranceRedirect, liveServices, navItems, COMBINED_TITLE } from './combinedFlow.js';

test('with the flag off nothing is redirected', () => {
  for (const p of ['/insurance', '/insurance/buy', '/insurance/new']) assert.equal(insuranceRedirect(p, false), null);
});
test('with the flag on the standalone insurance pages go to the membership journey', () => {
  assert.equal(insuranceRedirect('/insurance', true), '/membership');
  assert.equal(insuranceRedirect('/insurance/buy', true), '/membership/buy');
  assert.equal(insuranceRedirect('/insurance/new', true), '/membership/buy');
  assert.equal(insuranceRedirect('/insurance/buy/', true), '/membership/buy');
});
test('policy records and other pages are never redirected', () => {
  for (const p of ['/insurance/123456789012', '/membership/buy', '/', '/records/insurance/1'])
    assert.equal(insuranceRedirect(p, true), null);
});
test('dashboard cards: one Membership and Insurance card replaces two', () => {
  const cards = [{ kind: 'membership', title: 'Membership' }, { kind: 'accreditation' }, { kind: 'insurance' }];
  assert.deepEqual(liveServices(cards, false), cards);
  const on = liveServices(cards, true);
  assert.deepEqual(
    on.map(c => c.kind),
    ['membership', 'accreditation'],
  );
  assert.equal(on[0].title, COMBINED_TITLE);
});
test('side navigation: one entry for both', () => {
  const items = [
    { label: 'Membership', path: '/membership' },
    { label: 'Insurance', path: '/insurance' },
    { path: '/records' },
  ];
  assert.deepEqual(navItems(items, false), items);
  assert.deepEqual(
    navItems(items, true).map(i => i.label || i.path),
    [COMBINED_TITLE, '/records'],
  );
});
