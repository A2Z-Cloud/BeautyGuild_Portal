'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadConfig } = require('../src/config');
const { createApp } = require('../src/app');

async function profileFor(acc) {
  const upstream = url => {
    const u = decodeURIComponent(String(url));
    if (u.includes('Contacts/search')) return { data: [{ id: '101', Email: 'owner@example.test' }] };
    if (u.includes('Training_Centre_Accred/1011174000000000301'))
      return {
        data: [
          {
            id: '1011174000000000301',
            Applicant_Contact: { id: '101' },
            Account: { id: '201', name: 'Grace School' },
            Accreditation_Status: 'Accredited',
            ...acc,
          },
        ],
      };
    return { data: [] };
  };
  const app = createApp({
    config: loadConfig({ PORTAL_SCHOOL_SERVICES_ENABLED: 'true' }),
    getCurrentUser: async () => ({ id: 'u1', email: 'owner@example.test' }),
    getCrmHeaders: async () => ({ Authorization: 'x' }),
    getCreatorHeaders: async () => ({ Authorization: 'y' }),
    fetchImpl: async url => ({ status: 200, ok: true, json: async () => upstream(url) }),
  });
  const server = await new Promise(resolve => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  try {
    const r = await fetch(
      'http://127.0.0.1:' + server.address().port + '/portal/management/schools/1011174000000000301/profile',
    );
    const j = await r.json();
    return j.profile;
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test('an accreditation awaiting payment can be paid for', async () => {
  const p = await profileFor({ Application_Stage: 'Awaiting Payment', Payment_Status: 'Not Paid' });
  assert.deepEqual([p.payable, p.paid], [true, false]);
});
test('a failed or in-progress payment can be retried', async () => {
  assert.equal(
    (await profileFor({ Application_Stage: 'Payment Failed', Payment_Status: 'Payment Fail' })).payable,
    true,
  );
  assert.equal(
    (await profileFor({ Application_Stage: 'Payment Processing', Payment_Status: 'Payment Processing' })).payable,
    true,
  );
});
test('a paid accreditation shows as paid and offers nothing to pay, whatever its stage', async () => {
  for (const stage of ['Awaiting Payment', 'Paid', 'Approved']) {
    const p = await profileFor({ Application_Stage: stage, Payment_Status: 'Paid' });
    assert.deepEqual([p.payable, p.paid], [false, true], stage);
  }
});
test('an accreditation that is not at a payment stage has nothing to pay', async () => {
  for (const stage of ['Draft', 'Submitted', 'Under Review', 'Approved', undefined]) {
    assert.equal(
      (await profileFor({ Application_Stage: stage, Payment_Status: 'Not Paid' })).payable,
      false,
      String(stage),
    );
  }
});
