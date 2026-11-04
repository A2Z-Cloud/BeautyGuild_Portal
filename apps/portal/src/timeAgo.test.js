import test from 'node:test';
import assert from 'node:assert/strict';
import { timeAgo } from './timeAgo.js';

test('timeAgo reads like V1: minutes, hours, days, months, years', () => {
  const now = 1_000_000_000_000;
  assert.equal(timeAgo(null, now), '');
  assert.equal(timeAgo(now - 5000, now), 'Just now');
  assert.equal(timeAgo(now - 60_000, now), '1 minute ago');
  assert.equal(timeAgo(now - 3 * 86400_000, now), '3 days ago');
  assert.equal(timeAgo(now - 400 * 86400_000, now), '1 year ago');
});
