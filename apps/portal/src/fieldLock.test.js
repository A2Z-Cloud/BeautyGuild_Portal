import test from 'node:test';
import assert from 'node:assert/strict';
import { isLocked } from './fieldLock.js';

const field = { name: 'email', readOnly: true };
test('typing into a signed-out visitor email never locks it', () => {
  assert.equal(isLocked(field, 'e', ''), false);
  assert.equal(isLocked(field, 'e', undefined), false);
});
test('locks only when the value is the signed-in account email', () => {
  assert.equal(isLocked(field, 'Me@Example.com ', 'me@example.com'), true);
  assert.equal(isLocked(field, 'other@example.com', 'me@example.com'), false);
});
test('a field that is not marked readOnly is never locked', () => {
  assert.equal(isLocked({ name: 'email' }, 'me@example.com', 'me@example.com'), false);
});
