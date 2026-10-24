'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadConfig } = require('../src/config');
const { createApp } = require('../src/app');
const { assess } = require('../src/publicSchoolVerification');
const { clientKey } = require('../src/rateLimit');

const school = {
  id: '123456789012345',
  Account_Name: 'Example Beauty Training School',
  School_Registration_Number: '12345',
};
const verified = {
  id: '223456789012345',
  Account: { id: school.id },
  Accreditation_Status: 'Verified',
  Application_Stage: 'Approved',
  Valid_From: '2026-01-01',
  Valid_To: '2027-12-31',
};
const response = (data, status = 200) => ({ status, ok: status >= 200 && status < 300, json: async () => data });
const current = () => Date.parse('2026-10-18T11:00:00.000Z');
const config = (more = {}) =>
  loadConfig({
    PUBLIC_SCHOOL_VERIFICATION_ENABLED: 'true',
    PUBLIC_SCHOOL_REGISTRATION_MODULE: 'Accounts',
    PUBLIC_SCHOOL_REGISTRATION_FIELD: 'School_Registration_Number',
    ...more,
  });
async function withServer(options, callback) {
  let calls = [];
  const app = createApp({
    config: config(),
    now: current,
    getCrmHeaders: async () => ({ Authorization: 'Zoho-oauthtoken TEST_SECRET' }),
    getCurrentUser: async () => null,
    fetchImpl: async url => {
      calls.push(String(url));
      if (String(url).includes('/Accounts/search')) return response({ data: [school] });
      if (String(url).includes('/Training_Centre_Accred/search')) return response({ data: [verified] });
      throw Error('unexpected path');
    },
    log: () => {},
    ...options,
  });
  const server = await new Promise(ok => {
    const s = app.listen(0, '127.0.0.1', () => ok(s));
  });
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    return await callback(async path => {
      const res = await fetch(base + path);
      return { status: res.status, body: await res.json(), headers: res.headers };
    }, calls);
  } finally {
    await new Promise(ok => server.close(ok));
  }
}
test('verification defaults off, with no CRM connection or lookup', async () => {
  let queried = false;
  await withServer(
    {
      config: loadConfig({}),
      getCrmHeaders: async () => {
        queried = true;
        throw Error('disabled');
      },
    },
    async get => {
      const r = await get('/public/verify/12345');
      assert.equal(r.status, 503);
      assert.equal(r.body.code, 'VERIFICATION_UNAVAILABLE');
      assert.equal(queried, false);
    },
  );
});
test('missing registration field mapping fails closed', async () => {
  await withServer({ config: loadConfig({ PUBLIC_SCHOOL_VERIFICATION_ENABLED: 'true' }) }, async get =>
    assert.equal((await get('/public/verify/12345')).status, 503),
  );
});
test('valid public verification reads correct CRM account and accreditation data', async () => {
  await withServer({}, async (get, calls) => {
    const r = await get('/public/verify/12345');
    assert.equal(r.status, 200);
    assert.equal(r.body.school.name, school.Account_Name);
    assert.equal(r.body.school.registrationNumber, '12345');
    assert.deepEqual(Object.keys(r.body.school).sort(), ['name', 'registrationNumber']);
    assert.equal(r.body.verification.status, 'accredited');
    assert.equal(r.body.verification.isCurrentlyAccredited, true);
    assert.equal(r.body.verification.expiryDate, '2027-12-31');
    assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.match(calls[0], /Accounts\/search/);
    assert.match(decodeURIComponent(calls[0]), /School_Registration_Number:equals:12345/);
    assert.match(calls[1], /Training_Centre_Accred\/search/);
    assert.match(decodeURIComponent(calls[1]), /Account:equals:123456789012345/);
    assert.equal(JSON.stringify(r.body).includes('TEST_SECRET'), false);
  });
});
test('unmatched school is not found and does not reveal CRM details', async () => {
  await withServer({ fetchImpl: async () => response({ data: [] }) }, async get => {
    const r = await get('/public/verify/12345');
    assert.equal(r.status, 404);
    assert.equal(r.body.code, 'SCHOOL_NOT_FOUND');
  });
});
test('partial CRM number matches are rejected', async () => {
  await withServer(
    {
      fetchImpl: async url =>
        String(url).includes('Accounts/search')
          ? response({ data: [{ ...school, School_Registration_Number: '123456' }] })
          : response({ data: [verified] }),
    },
    async get => assert.equal((await get('/public/verify/12345')).status, 404),
  );
});
test('duplicates must never select an arbitrary school', async () => {
  await withServer(
    { fetchImpl: async () => response({ data: [school, { ...school, id: '333333333333333' }] }) },
    async get => {
      const r = await get('/public/verify/12345');
      assert.equal(r.status, 503);
      assert.equal(r.body.code, 'VERIFICATION_UNAVAILABLE');
    },
  );
});
test('malformed registration numbers are rejected before CRM', async () => {
  await withServer({}, async (get, calls) => {
    for (const q of ['/public/verify/bad%21', '/public/verify/a%3Bb', '/public/verify/12345%3D1']) {
      assert.equal((await get(q)).status, 400);
    }
    assert.equal(calls.length, 0);
  });
});
test('CRM failures do not confirm accreditation or leak response detail', async () => {
  const cases = [
    async () => {
      throw Error('CRM password=secret');
    },
    async () => response({ error: 'Sensitive' }, 502),
    async () => response({ unexpected: true }),
    async () => response({ data: Array(200).fill(school) }),
  ];
  for (const fetchImpl of cases)
    await withServer({ fetchImpl }, async get => {
      const r = await get('/public/verify/12345');
      assert.equal(r.status, 503);
      assert.equal(r.body.code, 'VERIFICATION_UNAVAILABLE');
      assert.equal(JSON.stringify(r.body).includes('secret'), false);
    });
});
test('records belonging to another Account cannot be used', async () => {
  await withServer(
    {
      fetchImpl: async url =>
        String(url).includes('/Accounts/search')
          ? response({ data: [school] })
          : response({ data: [{ ...verified, Account: { id: '999999999999999' } }] }),
    },
    async get => assert.equal((await get('/public/verify/12345')).status, 503),
  );
});
test('rate limiting for public verification prevents repeated enumeration', async () => {
  const app = createApp({
    config: config(),
    now: current,
    getCrmHeaders: async () => ({ Authorization: 'token' }),
    getCurrentUser: async () => null,
    fetchImpl: async () => response({ data: [] }),
    log: () => {},
  });
  const server = await new Promise(ok => {
    const s = app.listen(0, '127.0.0.1', () => ok(s));
  });
  try {
    let latest;
    for (let i = 0; i < 31; i++)
      latest = await fetch('http://127.0.0.1:' + server.address().port + '/public/verify/12345');
    assert.equal(latest.status, 429);
  } finally {
    await new Promise(ok => server.close(ok));
  }
});
test('public verification rate limits each client separately using x-forwarded-for', async () => {
  const app = createApp({
    config: config(),
    now: current,
    getCrmHeaders: async () => ({ Authorization: 'token' }),
    getCurrentUser: async () => null,
    fetchImpl: async () => response({ data: [] }),
    log: () => {},
  });
  const server = await new Promise(ok => {
    const s = app.listen(0, '127.0.0.1', () => ok(s));
  });
  const url = 'http://127.0.0.1:' + server.address().port + '/public/verify/12345';
  const from = ip => fetch(url, { headers: { 'x-forwarded-for': ip + ', 10.0.0.1' } });
  try {
    let latest;
    for (let i = 0; i < 31; i++) latest = await from('203.0.113.7');
    assert.equal(latest.status, 429, 'the noisy client is limited');
    const other = await from('198.51.100.20');
    assert.notEqual(other.status, 429, 'a different client is not limited by the noisy one');
    assert.equal(other.status, 404);
  } finally {
    await new Promise(ok => server.close(ok));
  }
});
test('clientKey prefers the first x-forwarded-for entry and falls back to the socket', () => {
  assert.equal(
    clientKey({ headers: { 'x-forwarded-for': ' 203.0.113.7 , 10.0.0.1' }, socket: { remoteAddress: '10.9.9.9' } }),
    '203.0.113.7',
  );
  assert.equal(clientKey({ headers: {}, socket: { remoteAddress: '10.9.9.9' } }), '10.9.9.9');
  assert.equal(clientKey({ headers: {}, socket: {} }), 'unknown');
});
test('accreditation is confirmed only with approved current dates', () => {
  assert.equal(assess([verified], '2026-10-18').status, 'accredited');
  assert.equal(assess([{ ...verified, Valid_To: '2026-10-17' }], '2026-10-18').status, 'expired');
  assert.equal(assess([{ ...verified, Valid_From: '2026-10-19' }], '2026-10-18').isCurrentlyAccredited, false);
  assert.equal(assess([{ ...verified, Valid_To: null }], '2026-10-18').isCurrentlyAccredited, false);
  assert.equal(
    assess([{ ...verified, Accreditation_Status: 'Unverified' }], '2026-10-18').isCurrentlyAccredited,
    false,
  );
  assert.equal(assess([{ ...verified, Application_Stage: 'Draft' }], '2026-10-18').isCurrentlyAccredited, false);
  assert.equal(
    assess([{ ...verified, Accreditation_Status: 'Suspended' }, verified], '2026-10-18').status,
    'suspended',
  );
  assert.equal(assess([{ ...verified, Accreditation_Status: 'Revoked' }, verified], '2026-10-18').status, 'revoked');
});
test('Training_Centres lookup can resolve centre via its Account', async () => {
  const center = { id: '723456789012345', Name: 'Academy Centre', Account: { id: school.id }, Centre_Reg_No: '00123' };
  await withServer(
    {
      config: config({
        PUBLIC_SCHOOL_REGISTRATION_MODULE: 'Training_Centres',
        PUBLIC_SCHOOL_REGISTRATION_FIELD: 'Centre_Reg_No',
      }),
      fetchImpl: async url =>
        String(url).includes('Training_Centres/search') ? response({ data: [center] }) : response({ data: [verified] }),
    },
    async get => {
      const r = await get('/public/verify/00123');
      assert.equal(r.status, 200);
      assert.equal(r.body.school.registrationNumber, '00123');
      assert.equal(r.body.school.name, 'Academy Centre');
    },
  );
});

test('the accreditation reference works as the registration number, for issued records only', async () => {
  const accred = (over = {}) => ({
    id: '223456789012345',
    Name: 'ACC-00042',
    Account: { id: school.id, name: 'Example Beauty Training School' },
    Accreditation_Status: 'Verified',
    Application_Stage: 'Approved',
    Valid_From: '2026-01-01',
    Valid_To: '2027-12-31',
    ...over,
  });
  const run = async (ref, rows, path = '/public/verify/ACC-00042') => {
    let result;
    await withServer(
      {
        config: config({
          PUBLIC_SCHOOL_REGISTRATION_MODULE: 'Training_Centre_Accred',
          PUBLIC_SCHOOL_REGISTRATION_FIELD: 'Name',
        }),
        fetchImpl: async url => {
          const u = decodeURIComponent(String(url));
          if (u.includes('Training_Centre_Accred/search') && u.includes('Name:equals:')) return response({ data: ref });
          if (u.includes('Training_Centre_Accred/search')) return response({ data: rows });
          throw Error('unexpected ' + u);
        },
      },
      async get => {
        result = await get(path);
      },
    );
    return result;
  };
  const ok = await run([accred()], [accred()]);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.school.name, 'Example Beauty Training School');
  assert.equal(ok.body.school.registrationNumber, 'ACC-00042');
  assert.equal(ok.body.verification.status, 'accredited');
  // an older reference still shows the school's CURRENT status
  const old = accred({
    Name: 'ACC-00007',
    Accreditation_Status: 'Expired',
    Valid_From: '2024-01-01',
    Valid_To: '2024-12-31',
  });
  const viaOld = await run([old], [old, accred()], '/public/verify/ACC-00007');
  assert.equal(viaOld.status, 200);
  assert.equal(viaOld.body.verification.status, 'accredited');
  // applications that were never granted are not revealed
  for (const status of ['Unverified', null, '']) {
    const draft = await run([accred({ Accreditation_Status: status, Application_Stage: 'Draft' })], []);
    assert.equal(draft.status, 404, String(status));
  }
});

test('a spaced reference such as "ACC - 0140" is found with or without the spaces', async () => {
  const rec = {
    id: '223456789012345',
    Name: 'ACC - 0140',
    Account: { id: school.id, name: 'Example Beauty Training School' },
    Accreditation_Status: 'Verified',
    Application_Stage: 'Approved',
    Valid_From: '2026-01-01',
    Valid_To: '2999-12-31',
  };
  for (const path of ['/public/verify/ACC-0140', '/public/verify/ACC%20-%200140', '/public/verify/acc0140']) {
    let criteria = '',
      result;
    await withServer(
      {
        config: config({
          PUBLIC_SCHOOL_REGISTRATION_MODULE: 'Training_Centre_Accred',
          PUBLIC_SCHOOL_REGISTRATION_FIELD: 'Name',
        }),
        fetchImpl: async url => {
          const u = decodeURIComponent(String(url));
          if (u.includes('Name:equals:')) criteria = u;
          return response({ data: [rec] });
        },
      },
      async get => {
        result = await get(path);
      },
    );
    assert.equal(result.status, 200, path);
    assert.match(criteria, /Name:equals:ACC - 0140/, path);
    assert.equal(result.body.school.registrationNumber, 'ACC - 0140', path);
  }
});
