'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { prorata, prorate } = require('../src/prorata');

test('days remaining over days on the policy, counting both end days (the Guild, 26 October)', () => {
  // GBP 200.00 from 07/10/2026 to 29/09/2027 on a policy that started 30/09/2026: 358 of 365 days.
  const p = prorata({ start: '2026-09-30', end: '2027-09-29', from: '2026-10-07' });
  assert.deepEqual(p, { days: 358, total: 365 });
  assert.equal(prorate(20000, p), 19616, 'GBP 196.16, not the sample letter GBP 196.15 (the old 364 day basis)');
  // The Guild's spreadsheet: 01/01/2026 to 31/12/2026, cancelled from 01/07/2026 leaves 184 of 365 days.
  assert.deepEqual(prorata({ start: '2026-01-01', end: '2026-12-31', from: '2026-07-01' }), { days: 184, total: 365 });
  assert.equal(prorate(10000, { days: 184, total: 365 }), 5041, 'GBP 50.41');
  assert.deepEqual(prorata({ start: '2026-10-26', end: '2027-10-25', from: '2027-07-04' }), { days: 114, total: 365 });
});
test('a leap year term runs 366 days, and a change on the first day pays the whole term', () => {
  assert.equal(prorata({ start: '2027-09-30', end: '2028-09-29', from: '2027-09-30' }).total, 366);
  assert.deepEqual(prorata({ start: '2026-09-30', end: '2027-09-29', from: '2026-09-30' }), { days: 365, total: 365 });
});
test('the days left are held between none and the whole term', () => {
  assert.equal(prorata({ start: '2026-01-01', end: '2026-12-31', from: '2027-02-01' }).days, 0);
  assert.equal(prorata({ start: '2026-01-01', end: '2026-12-31', from: '2025-12-01' }).days, 365);
  assert.equal(prorate(1500, { days: 0, total: 365 }), 0);
});
