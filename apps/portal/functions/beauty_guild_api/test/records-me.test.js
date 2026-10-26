'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');
const { loadConfig } = require('../src/config');
const { mapDetails } = require('../src/records');

const ME = '1011174000000000001';
const json = body => ({ status: 200, ok: true, json: async () => body });
async function withApp(rows, fn) {
  const seen = [];
  const app = createApp({
    config: loadConfig({ PORTAL_RECORDS_ENABLED: 'true' }),
    getCurrentUser: async () => ({ id: 'u1', email: 'ada@example.test' }),
    getCrmHeaders: async () => ({ Authorization: 'x' }),
    fetchImpl: async url => {
      url = String(url);
      seen.push(decodeURIComponent(url));
      if (url.includes('Contacts/search')) return json({ data: [{ id: ME, Email: 'ada@example.test' }] });
      if (url.includes('Contacts/' + ME)) return json({ data: rows });
      return json({ data: [] });
    },
  });
  const server = await new Promise(resolve => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  try {
    await fn(async () => {
      const r = await fetch('http://127.0.0.1:' + server.address().port + '/portal/records/me');
      return { status: r.status, body: await r.json() };
    }, seen);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test('my details are the signed-in contact only, with the V1 fields, trimmed and empty-safe', async () => {
  await withApp(
    [
      {
        id: ME,
        Salutation: 'Ms',
        First_Name: ' Ada ',
        Last_Name: 'Lovelace',
        Email: 'ada@example.test',
        Phone: null,
        Mobile: '07700 900123',
        Correspondence_Address_Line_1: '1 Test Street',
        Correspondence_Postcode: 'SP1 2AP',
        Correspondence_Country: 'United Kingdom',
        Interests: ['Beauty', 'Nails'],
      },
    ],
    async (get, seen) => {
      const r = await get();
      assert.equal(r.status, 200);
      assert.equal(r.body.details.firstName, 'Ada');
      assert.equal(r.body.details.phone, '');
      assert.equal(r.body.details.mobile, '07700 900123');
      assert.equal(r.body.details.addressLine1, '1 Test Street');
      assert.equal(r.body.details.addressLine2, '');
      assert.deepEqual(r.body.details.interests, ['Beauty', 'Nails']);
      assert.ok(
        seen.some(
          u =>
            u.includes('Contacts/' + ME + '?fields=') &&
            u.includes('Correspondence_Postcode') &&
            u.includes('Interests'),
        ),
      );
    },
  );
});
test('a contact record that is not the signed-in contact is never returned', async () => {
  await withApp([{ id: '1011174000000000999', First_Name: 'Someone', Last_Name: 'Else' }], async get => {
    assert.equal((await get()).status, 404);
  });
});
test('mapDetails tolerates missing values', () => {
  assert.deepEqual(mapDetails({}).interests, []);
  assert.equal(mapDetails({}).firstName, '');
});
