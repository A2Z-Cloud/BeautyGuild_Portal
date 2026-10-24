import test from 'node:test';
import assert from 'node:assert/strict';
import { referralFrom, referralCopy, sameAnswers } from './referral.js';
import { createHttpClient } from './services/transport.mjs';

test('only a well-formed REFERRAL_REQUIRED outcome is read', () => {
  assert.deepEqual(
    referralFrom({ code: 'REFERRAL_REQUIRED', details: { reference: '1011174000000000009', status: 'Referred' } }),
    { reference: '1011174000000000009', status: 'Referred' },
  );
  assert.equal(referralFrom({ code: 'REFERRAL_REQUIRED' }), null, 'an older server sends no details');
  assert.equal(referralFrom({ code: 'VALIDATION', details: { reference: '1', status: 'Referred' } }), null);
  assert.equal(
    referralFrom({ code: 'REFERRAL_REQUIRED', details: { reference: '<b>x</b>', status: 'Referred' } }),
    null,
  );
  assert.equal(referralFrom({ code: 'REFERRAL_REQUIRED', details: { reference: '12', status: 'Sanctions' } }), null);
  assert.equal(referralFrom(null), null);
});
test('a Referred application is confirmed with a link; a Stopped one gives the Guild phone number and no link', () => {
  const r = referralCopy({ reference: '1', status: 'Referred' });
  assert.equal(r.title, 'Your application has been sent to our Insurance team');
  assert.match(r.lines.join(' '), /review it and contact you\. You cannot pay for this cover online/);
  const s = referralCopy({ reference: '1', status: 'Stopped' });
  assert.equal(s.stopped, true);
  assert.match(s.lines.join(' '), /01332 224830/);
  for (const c of [r, s]) assert.ok(!/—|sanction|screen/i.test(JSON.stringify(c)), 'no em dash, no reason given');
  assert.equal(referralCopy(null), null);
});
test('the panel belongs to the answers it was recorded for', () => {
  assert.equal(sameAnswers({ key: 'a' }, 'a'), true);
  assert.equal(sameAnswers({ key: 'a' }, 'b'), false);
  assert.equal(sameAnswers(null, 'a'), false);
});
test('the transport keeps the referral details on a 422 REFERRAL_REQUIRED and nowhere else', async () => {
  const reply = (status, body) =>
    createHttpClient({
      baseUrl: '/api',
      fetchImpl: async () => ({ ok: false, status, text: async () => JSON.stringify(body) }),
    })('/portal/checkout', { method: 'POST', body: {} }).catch(e => e);
  const e = await reply(422, {
    error: 'Needs review.',
    code: 'REFERRAL_REQUIRED',
    details: { reference: '55', status: 'Referred' },
  });
  assert.deepEqual(
    [e.code, e.message, e.details],
    ['REFERRAL_REQUIRED', 'Needs review.', { reference: '55', status: 'Referred' }],
  );
  const other = await reply(422, {
    error: 'Fix this.',
    code: 'INVALID_REQUEST',
    details: { reference: '55', status: 'Referred' },
  });
  assert.equal(other.details, undefined);
});
