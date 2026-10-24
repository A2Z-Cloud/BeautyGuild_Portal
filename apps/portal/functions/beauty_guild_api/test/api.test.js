'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadConfig } = require('../src/config');
const { createApp } = require('../src/app');

const SECRET = 'SECRET-LOQATE-KEY-123';
const baseEnv = { LOQATE_API_KEY: SECRET, LOQATE_COUNTRY_FILTER: 'GBR', LOQATE_MAX_RESULTS: '2' };
const quiet = () => {};
const json = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

async function withServer(opts, fn) {
  const app = createApp({ log: quiet, getCrmHeaders: async () => ({ Authorization: 'Zoho-oauthtoken T' }), ...opts });
  const server = await new Promise(resolve => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    return await fn(base);
  } finally {
    await new Promise(r => server.close(r));
  }
}
const get = async (base, path, init) => {
  const res = await fetch(base + path, init);
  return { status: res.status, headers: res.headers, body: await res.json() };
};

test('config: https origins only and bounded values', () => {
  assert.equal(loadConfig({}).crmApiDomain, 'https://www.zohoapis.eu');
  assert.equal(loadConfig({ LOQATE_MAX_RESULTS: '9999' }).loqateMaxResults, 100);
  assert.equal(loadConfig({ LOQATE_MAX_RESULTS: 'abc' }).loqateMaxResults, 40);
  assert.throws(() => loadConfig({ CRM_API_DOMAIN: 'http://example.com' }));
  assert.throws(() => loadConfig({ LOQATE_API_BASE_URL: 'https://example.com/path' }));
});

test('address/find returns only whitelisted fields, trims to max, sends key and filter upstream', async () => {
  const calls = [];
  const fetchImpl = async url => {
    calls.push(String(url));
    return json({
      Items: [
        { Id: 'GB|1', Type: 'Postcode', Text: 'AB1 2CD', Description: '5 Addresses', Extra: 'drop-me' },
        { Id: 'GB|2', Type: 'Address', Text: '1 High St', Description: 'Town' },
        { Id: 'GB|3', Type: 'Address', Text: '2 High St', Description: 'Town' },
      ],
    });
  };
  await withServer({ config: loadConfig(baseEnv), fetchImpl }, async base => {
    const r = await get(base, '/address/find?text=AB1%202CD&container=GB%7C9');
    assert.equal(r.status, 200);
    assert.equal(r.body.items.length, 2);
    assert.deepEqual(Object.keys(r.body.items[0]).sort(), ['Description', 'Id', 'Text', 'Type']);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    const url = new URL(calls[0]);
    assert.equal(url.searchParams.get('Key'), SECRET);
    assert.equal(url.searchParams.get('Text'), 'AB1 2CD');
    assert.equal(url.searchParams.get('Container'), 'GB|9');
    assert.equal(url.searchParams.get('Countries'), 'GBR');
    assert.ok(!JSON.stringify(r.body).includes(SECRET));
  });
});

test('address/find allows ".." in search text and validates input', async () => {
  const fetchImpl = async () => json({ Items: [] });
  await withServer({ config: loadConfig(baseEnv), fetchImpl }, async base => {
    assert.equal((await get(base, '/address/find?text=Flat%201..%20High%20St')).status, 200);
    assert.equal((await get(base, '/address/find')).status, 400);
    assert.equal((await get(base, '/address/find?text=ab')).status, 400);
    assert.equal((await get(base, `/address/find?text=${'x'.repeat(101)}`)).status, 400);
    assert.equal((await get(base, '/address/find?text=abc&container=a%20b%26c')).status, 400);
    assert.equal((await get(base, '/address/find?text=abc&text=def')).status, 200);
  });
});

test('address/retrieve maps the address and rejects bad ids', async () => {
  const fetchImpl = async () =>
    json({
      Items: [
        {
          Company: 'Glow Salon',
          Street: 'High St',
          BuildingNumber: '12',
          City: 'Leeds',
          ProvinceName: 'West Yorkshire',
          PostalCode: 'LS1 1AA',
          CountryName: 'United Kingdom',
        },
      ],
    });
  await withServer({ config: loadConfig(baseEnv), fetchImpl }, async base => {
    const r = await get(base, '/address/retrieve?id=GB%7C123');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.address, {
      addressLine1: 'Glow Salon',
      addressLine2: '12 High St',
      addressLine3: '',
      town: 'Leeds',
      county: 'West Yorkshire',
      postcode: 'LS1 1AA',
      country: 'United Kingdom',
    });
    assert.equal((await get(base, '/address/retrieve')).status, 400);
    assert.equal((await get(base, '/address/retrieve?id=../../x')).status, 400);
  });
});

test('upstream failures are hidden from the browser and never expose the key', async () => {
  const leak = `Loqate said bad key ${SECRET} at /srv/x.js`;
  const cases = [
    async () => json({ Items: [{ Error: '2', Description: leak }] }),
    async () => json({ error: leak }, 500),
    async () => {
      throw new Error(leak);
    },
  ];
  for (const fetchImpl of cases) {
    await withServer({ config: loadConfig(baseEnv), fetchImpl }, async base => {
      const r = await get(base, '/address/find?text=abc');
      assert.equal(r.status, 502);
      assert.equal(r.body.code, 'ADDRESS_UNAVAILABLE');
      assert.ok(!JSON.stringify(r.body).includes('SECRET') && !JSON.stringify(r.body).includes('srv'));
    });
  }
});

test('missing Loqate key returns 503 without calling upstream', async () => {
  const fetchImpl = async () => {
    throw new Error('must not be called');
  };
  await withServer({ config: loadConfig({}), fetchImpl }, async base => {
    assert.equal((await get(base, '/address/find?text=abc')).status, 503);
  });
});

test('address routes are rate limited per client', async () => {
  const fetchImpl = async () => json({ Items: [] });
  await withServer({ config: loadConfig(baseEnv), fetchImpl, addressLimit: 3 }, async base => {
    const statuses = [];
    for (let i = 0; i < 5; i += 1) statuses.push((await get(base, '/address/find?text=abc')).status);
    assert.deepEqual(statuses, [200, 200, 200, 429, 429]);
    const other = await get(base, '/address/find?text=abc', { headers: { 'x-forwarded-for': '203.0.113.9' } });
    assert.equal(other.status, 200);
  });
});

test('courses maps CRM records, uses connection headers, and caches', async () => {
  let calls = 0;
  let seen;
  const fetchImpl = async (url, init) => {
    calls += 1;
    seen = { url: String(url), init };
    return json({
      data: [
        {
          id: '1',
          Name: 'Facials L3',
          Course_Category: 'Beauty',
          CPD_Points: 0,
          Member_Price: 99,
          Secret_Field: 'drop-me',
        },
      ],
    });
  };
  let t = 1000;
  await withServer({ config: loadConfig(baseEnv), fetchImpl, now: () => t }, async base => {
    const r = await get(base, '/courses');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.courses[0], {
      id: '1',
      name: 'Facials L3',
      category: 'Beauty',
      treatmentGroup: null,
      courseType: null,
      duration: null,
      cpdPoints: 0,
      memberPrice: 99,
      nonMemberPrice: null,
      entryRequirements: null,
    });
    assert.equal(seen.init.headers.Authorization, 'Zoho-oauthtoken T');
    assert.ok(seen.url.startsWith('https://www.zohoapis.eu/crm/v3/Courses/search?criteria='));
    assert.ok(decodeURIComponent(seen.url).includes('Status:equals:Active'));
    await get(base, '/courses');
    assert.equal(calls, 1);
    t += 6 * 60 * 1000;
    await get(base, '/courses');
    assert.equal(calls, 2);
  });
});

test('courses: 204 is an empty list; CRM or connection failures are generic 502', async () => {
  await withServer(
    {
      config: loadConfig(baseEnv),
      fetchImpl: async () => ({
        ok: true,
        status: 204,
        json: async () => {
          throw new Error('no body');
        },
      }),
    },
    async base => {
      assert.deepEqual((await get(base, '/courses')).body, { courses: [] });
    },
  );
  const failures = [
    { fetchImpl: async () => json({ message: 'INTERNAL SECRET' }, 500) },
    { fetchImpl: async () => json({ nope: true }) },
    {
      fetchImpl: async () => json({}),
      getCrmHeaders: async () => {
        throw new Error('connection INTERNAL SECRET');
      },
    },
  ];
  for (const f of failures) {
    await withServer({ config: loadConfig(baseEnv), ...f }, async base => {
      const r = await get(base, '/courses');
      assert.equal(r.status, 502);
      assert.equal(r.body.code, 'COURSES_UNAVAILABLE');
      assert.ok(!JSON.stringify(r.body).includes('SECRET'));
    });
  }
});

test('read-only: non-GET methods and unknown routes are rejected', async () => {
  const fetchImpl = async () => {
    throw new Error('must not be called');
  };
  await withServer({ config: loadConfig(baseEnv), fetchImpl }, async base => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      assert.equal((await get(base, '/courses', { method })).status, 405, method);
    }
    assert.equal((await get(base, '/accreditations/draft', { method: 'POST' })).status, 405);
    assert.equal((await get(base, '/contacts/lookup?email=a@b.c')).status, 404);
    assert.equal((await get(base, '/payments/checkout')).status, 404);
    assert.deepEqual((await get(base, '/health')).body, { ok: true });
  });
});
