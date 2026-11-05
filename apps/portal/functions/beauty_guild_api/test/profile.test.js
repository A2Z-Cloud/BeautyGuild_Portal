'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');
const { loadConfig } = require('../src/config');

const ME = '1011174000000000001';
const OTHER = '1011174000000000002';
const NOW = Date.parse('2026-11-05T10:20:30.456Z');
const json = (body, status = 200) => ({ status, ok: status < 400, json: async () => body });
const ON = { PORTAL_RECORDS_ENABLED: 'true', PORTAL_PROFILE_ENABLED: 'true' };

async function withApp(env, fn, { row = {}, refuse = () => false } = {}) {
  const writes = [];
  const app = createApp({
    config: loadConfig(env),
    now: () => NOW,
    getCurrentUser: async () => ({ id: 'u1', email: 'ada@example.test' }),
    getCrmHeaders: async () => ({ Authorization: 'x' }),
    fetchImpl: async (url, init = {}) => {
      url = String(url);
      if (init.method === 'PUT') {
        const data = JSON.parse(init.body).data[0];
        writes.push({ url, data });
        if (refuse(data)) return json({ data: [{ status: 'error', code: 'INVALID_DATA' }] }, 400);
        return json({ data: [{ status: 'success', details: { id: ME } }] });
      }
      if (url.includes('Contacts/search')) return json({ data: [{ id: ME, Email: 'ada@example.test' }] });
      if (url.includes('Contacts/' + ME)) return json({ data: [{ id: ME, ...row }] });
      return json({ data: [] });
    },
  });
  const server = await new Promise(resolve => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const send = async (method, path, body) => {
    const r = await fetch('http://127.0.0.1:' + server.address().port + '/portal/profile' + path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: r.status, body: await r.json() };
  };
  try {
    await fn(send, writes);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}
const ALL_OFF = { email: false, sms: false, post: false, guildGazette: false, newsAndOffers: false };
const DETAILS = {
  phone: '',
  mobile: '07700 900123',
  addressLine1: '1 Test Street',
  town: 'Derby',
  postcode: 'de1 2ab',
  country: 'United Kingdom',
};

test('profile is off unless both switches are on', async () => {
  await withApp({ PORTAL_RECORDS_ENABLED: 'true' }, async send => {
    assert.equal((await send('GET', '/preferences')).status, 503);
  });
  await withApp({ PORTAL_PROFILE_ENABLED: 'true' }, async send => {
    assert.equal((await send('GET', '/preferences')).status, 503);
  });
});

test('preferences read: unticked unless the Contact says true', async () => {
  await withApp(
    ON,
    async send => {
      const r = await send('GET', '/preferences');
      assert.equal(r.status, 200);
      assert.deepEqual(r.body.preferences, {
        updatedOn: '2026-10-01T09:00:00+00:00',
        email: true,
        sms: false,
        post: false,
        guildGazette: true,
        newsAndOffers: false,
      });
    },
    {
      row: {
        Contact_by_Email: true,
        Contact_by_SMS: null,
        Guild_Gazette: true,
        Preferences_Updated_On: '2026-10-01T09:00:00+00:00',
      },
    },
  );
});

test('preferences save: five answers, the server sets the date and the source, and only this Contact is written', async () => {
  await withApp(ON, async (send, writes) => {
    const r = await send('PUT', '/preferences', { ...ALL_OFF, email: true, guildGazette: true, id: OTHER });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.preferences.email, true);
    assert.equal(writes[0].url.includes('Contacts/' + ME), true);
    assert.deepEqual(writes[0].data, {
      Contact_by_Email: true,
      Contact_by_SMS: false,
      Contact_by_Post: false,
      Guild_Gazette: true,
      News_and_Special_Offers: false,
      Preferences_Updated_On: '2026-11-05T10:20:30+00:00',
    });
    assert.deepEqual(writes[1].data, { Preferences_Source: 'Portal Account' });
    assert.ok(writes.every(w => !w.url.includes(OTHER)));
  });
});

test('preferences save: every answer must be true or false, never guessed', async () => {
  await withApp(ON, async (send, writes) => {
    const { sms, ...missing } = ALL_OFF; // eslint-disable-line no-unused-vars
    for (const body of [{}, missing, { ...ALL_OFF, post: 'yes' }]) {
      const r = await send('PUT', '/preferences', body);
      assert.equal(r.status, 422);
      assert.equal(r.body.code, 'INVALID_PREFERENCES');
    }
    assert.equal(writes.length, 0);
  });
});

test('a refused Preferences Source does not undo a saved consent', async () => {
  await withApp(
    ON,
    async send => {
      const r = await send('PUT', '/preferences', { ...ALL_OFF, sms: true });
      assert.equal(r.status, 200);
    },
    { refuse: data => 'Preferences_Source' in data },
  );
});

test('a refused consent write is an error, not a success', async () => {
  await withApp(
    ON,
    async send => {
      assert.equal((await send('PUT', '/preferences', ALL_OFF)).status, 502);
    },
    { refuse: () => true },
  );
});

test('details save: phone, mobile and address only, UK postcode tidied, nothing else written', async () => {
  await withApp(ON, async (send, writes) => {
    const r = await send('PUT', '/details', { ...DETAILS, firstName: 'Mallory', email: 'x@example.test' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(
      Object.keys(writes[0].data).sort(),
      [
        'Correspondence_Address_Line_1',
        'Correspondence_Address_Line_2',
        'Correspondence_Address_Line_3',
        'Correspondence_County',
        'Correspondence_Country',
        'Correspondence_Postcode',
        'Correspondence_Town',
        'Mobile',
        'Phone',
      ].sort(),
    );
    assert.equal(writes[0].data.Correspondence_Postcode, 'DE1 2AB');
    assert.equal(writes[0].data.Phone, null);
    assert.equal(writes[0].data.Mobile, '07700 900123');
  });
});

test('details save: bad input is refused with a clear message', async () => {
  await withApp(ON, async (send, writes) => {
    const cases = [
      [{ ...DETAILS, mobile: '' }, 'Enter a phone or mobile number.'],
      [{ ...DETAILS, mobile: '123' }, /Mobile: Enter a valid number/],
      [{ ...DETAILS, postcode: 'NOPE' }, 'Enter a valid UK postcode.'],
      [{ ...DETAILS, addressLine1: ' ' }, 'Address line 1 is required.'],
      [{ ...DETAILS, town: '' }, 'Town is required.'],
      [{ ...DETAILS, country: '' }, 'Country is required.'],
    ];
    for (const [body, message] of cases) {
      const r = await send('PUT', '/details', body);
      assert.equal(r.status, 422, JSON.stringify(body));
      const text = r.body.error;
      typeof message === 'string' ? assert.equal(text, message) : assert.match(text, message);
    }
    assert.equal(writes.length, 0);
  });
});

test('details save: an overseas postcode is kept as typed', async () => {
  await withApp(ON, async (send, writes) => {
    const r = await send('PUT', '/details', {
      ...DETAILS,
      country: 'France',
      mobile: '+33 6 12 34 56 78',
      postcode: '75001',
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(writes[0].data.Correspondence_Postcode, '75001');
  });
});
