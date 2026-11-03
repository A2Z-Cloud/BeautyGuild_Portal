import test from 'node:test';
import assert from 'node:assert/strict';
import { needsAccountFirst, accountFirstPath } from './accountGate.js';

test('only a signed-out visitor to a live accreditation application is sent to the account step', () => {
  assert.equal(needsAccountFirst({ kind: 'accreditation', live: true, signedIn: false }), true);
  assert.equal(needsAccountFirst({ kind: 'accreditation', live: true, signedIn: null }), false);
  assert.equal(needsAccountFirst({ kind: 'accreditation', live: true, signedIn: true }), false);
  assert.equal(needsAccountFirst({ kind: 'accreditation', live: false, signedIn: false }), false);
  assert.equal(needsAccountFirst({ kind: 'membership', live: true, signedIn: false }), false);
});
test('the account step returns to the application', () => {
  assert.equal(accountFirstPath('accreditation'), '/account/checkpoint?returnTo=%2Faccreditation%2Fnew&intent=start');
});
