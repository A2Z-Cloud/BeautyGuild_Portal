'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadConfig } = require('../src/config');
const { createApp } = require('../src/app');
const {
  signStaffRequest,
  verifyStaffRequest,
  canonicalString,
  createNonceStore,
  isAllowedStaff,
} = require('../src/staff');

// The same values are printed in docs/api-contracts/staff-api.md so the CRM function's author can check their own signing.
const SECRET = 'staff-test-secret-0123456789-abcdefghijklmnop';
const PREVIOUS = 'previous-secret-0123456789-abcdefghijklmnopqrstu';
const USER = '1011174000000000042';
const NONCE = '00112233445566778899aabbccddeeff';
const NOW_S = 1800000000;
const VECTOR_GET = '02b0be8f0900428fa06c8f0d98a81d60fde47a2bce68c09cd52e19e124a9f798';
const VECTOR_POST = '68fb5f61c5741c761bf577b92a98bd80af36e2c9920f85b65c9d7e6fdb0745fd';
const ENV = {
  PORTAL_STAFF_API_ENABLED: 'true',
  STAFF_API_SECRET: SECRET,
  PORTAL_STAFF_API_ROLES: 'Guild Staff, Administrator',
};
const json = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const crmUser = (over = {}) => ({
  users: [
    {
      id: USER,
      full_name: 'Sam Staff',
      email: 'Sam@BeautyGuild.com',
      status: 'active',
      profile: { name: 'Guild Staff' },
      role: { name: 'Processing' },
      ...over,
    },
  ],
});

async function withStaffApp({ env = ENV, crm = () => json(crmUser()), nowMs = NOW_S * 1000 } = {}, fn) {
  const logs = [];
  const crmCalls = [];
  const app = createApp({
    config: loadConfig(env),
    now: () => nowMs,
    log: line => logs.push(String(line)),
    getCrmHeaders: async () => ({ Authorization: 'Zoho-oauthtoken T' }),
    fetchImpl: async (url, init) => {
      crmCalls.push(String(url));
      return crm(String(url), init);
    },
  });
  const server = await new Promise(resolve => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  // A request signed the way the CRM function signs it.
  const call = async (
    path,
    {
      method = 'GET',
      body = '',
      secret = SECRET,
      userId = USER,
      time = String(NOW_S),
      nonce = NONCE,
      sign = true,
      headers = {},
    } = {},
  ) => {
    const signature = signStaffRequest({ secret, method, path, body, time, nonce, userId });
    const res = await fetch(base + path, {
      method,
      ...(body ? { body } : {}),
      headers: {
        ...(sign
          ? { 'X-Staff-User': userId, 'X-Staff-Time': time, 'X-Staff-Nonce': nonce, 'X-Staff-Signature': signature }
          : {}),
        ...headers,
      },
    });
    return { status: res.status, body: await res.json() };
  };
  try {
    return await fn({ call, base, logs, crmCalls });
  } finally {
    await new Promise(r => server.close(r));
  }
}
const nonce = n => n.toString(16).padStart(32, '0');

test('signing matches the published test vectors (checked independently with OpenSSL)', () => {
  const base = { method: 'GET', path: '/staff/me', body: '', time: String(NOW_S), nonce: NONCE, userId: USER };
  assert.equal(
    canonicalString(base),
    `GET\n/staff/me\ne3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855\n${NOW_S}\n${NONCE}\n${USER}`,
  );
  assert.equal(signStaffRequest({ secret: SECRET, ...base }), VECTOR_GET);
  const post = { ...base, method: 'post', path: '/staff/applications/123/quote?x=1', body: '{"code":"ABC"}' };
  assert.equal(signStaffRequest({ secret: SECRET, ...post }), VECTOR_POST);
  // The body is part of what is signed: change one byte and the signature changes.
  assert.notEqual(signStaffRequest({ secret: SECRET, ...post, body: '{"code":"ABD"}' }), VECTOR_POST);
});

test('verifyStaffRequest: accepts a good request and says why it refuses a bad one', () => {
  const parts = {
    method: 'GET',
    path: '/staff/me',
    body: Buffer.alloc(0),
    time: String(NOW_S),
    nonce: NONCE,
    userId: USER,
  };
  const headers = (over = {}) => ({
    'x-staff-user': USER,
    'x-staff-time': String(NOW_S),
    'x-staff-nonce': NONCE,
    'x-staff-signature': signStaffRequest({ secret: SECRET, ...parts }),
    ...over,
  });
  const check = (h, over = {}) =>
    verifyStaffRequest({
      secrets: [SECRET],
      method: 'GET',
      path: '/staff/me',
      body: Buffer.alloc(0),
      headers: h,
      nowMs: NOW_S * 1000,
      windowSeconds: 300,
      ...over,
    });
  assert.deepEqual(check(headers()), { ok: true, userId: USER, nonce: NONCE });
  assert.equal(check(headers({ 'x-staff-signature': undefined })).reason, 'missing_header');
  assert.equal(check(headers({ 'x-staff-user': 'abc' })).reason, 'bad_user');
  assert.equal(check(headers({ 'x-staff-time': '12' })).reason, 'bad_time');
  assert.equal(check(headers({ 'x-staff-nonce': 'zz' })).reason, 'bad_nonce');
  assert.equal(check(headers({ 'x-staff-signature': 'abc' })).reason, 'bad_signature_format');
  assert.equal(check(headers({ 'x-staff-signature': 'f'.repeat(64) })).reason, 'bad_signature');
  // The CRM's Deluge gives base64, so the same signature as base64 (or upper case hex) is accepted too.
  const sig = signStaffRequest({ secret: SECRET, ...parts });
  assert.equal(check(headers({ 'x-staff-signature': Buffer.from(sig, 'hex').toString('base64') })).ok, true);
  assert.equal(check(headers({ 'x-staff-signature': sig.toUpperCase() })).ok, true);
  assert.equal(check(headers({ 'x-staff-signature': Buffer.alloc(32, 7).toString('base64') })).reason, 'bad_signature');
  assert.equal(check(headers({ 'x-staff-signature': 'A'.repeat(43) + '!' })).reason, 'bad_signature_format');
  assert.equal(check(headers(), { path: '/staff/ping' }).reason, 'bad_signature');
  assert.equal(check(headers(), { method: 'POST' }).reason, 'bad_signature');
  assert.equal(check(headers(), { body: Buffer.from('x') }).reason, 'bad_signature');
  // Window: 5 minutes either side, no more.
  assert.equal(check(headers(), { nowMs: (NOW_S + 300) * 1000 }).ok, true);
  assert.equal(check(headers(), { nowMs: (NOW_S + 301) * 1000 }).reason, 'stale');
  assert.equal(check(headers(), { nowMs: (NOW_S - 301) * 1000 }).reason, 'stale');
  // Rotation: either secret works, a different one does not.
  assert.equal(check(headers(), { secrets: [PREVIOUS, SECRET] }).ok, true);
  assert.equal(check(headers(), { secrets: [PREVIOUS] }).reason, 'bad_signature');
});

test('nonce store refuses a repeat inside its life and allows it after', () => {
  let t = 1000;
  const use = createNonceStore({ ttlMs: 500, now: () => t });
  assert.equal(use('a'), true);
  assert.equal(use('a'), false);
  assert.equal(use('b'), true);
  t = 1600;
  assert.equal(use('a'), true);
});

test('only active users on the allow-list pass, by profile or role, and an empty list allows nobody', () => {
  const user = { status: 'active', profile: 'Guild Staff', role: 'Processing' };
  assert.equal(isAllowedStaff(user, ['guild staff']), true);
  assert.equal(isAllowedStaff(user, ['PROCESSING']), true);
  assert.equal(isAllowedStaff(user, ['Administrator']), false);
  assert.equal(isAllowedStaff(user, []), false);
  assert.equal(isAllowedStaff({ ...user, status: 'inactive' }, ['Guild Staff']), false);
  assert.equal(isAllowedStaff(null, ['Guild Staff']), false);
});

test('config: off by default, secrets required and long enough when on, roles and window parsed', () => {
  const off = loadConfig({});
  assert.equal(off.staffApiEnabled, false);
  assert.deepEqual(off.staffApiSecrets, []);
  assert.throws(() => loadConfig({ PORTAL_STAFF_API_ENABLED: 'true' }), /STAFF_API_SECRET is required/);
  assert.throws(() => loadConfig({ PORTAL_STAFF_API_ENABLED: 'true', STAFF_API_SECRET: 'short' }), /at least 32/);
  assert.throws(() => loadConfig({ ...ENV, STAFF_API_SECRET_PREVIOUS: 'short' }), /at least 32/);
  const on = loadConfig({ ...ENV, STAFF_API_SECRET_PREVIOUS: PREVIOUS, PORTAL_STAFF_API_WINDOW_SECONDS: '9999' });
  assert.deepEqual(on.staffApiSecrets, [SECRET, PREVIOUS]);
  assert.deepEqual(on.staffApiRoles, ['Guild Staff', 'Administrator']);
  assert.equal(on.staffApiWindowSeconds, 600);
  // A secret set while the switch is off is ignored, not validated.
  assert.deepEqual(loadConfig({ STAFF_API_SECRET: 'short' }).staffApiSecrets, []);
});

test('with the switch off the routes do not exist', async () => {
  await withStaffApp({ env: {} }, async ({ call }) => {
    assert.equal((await call('/staff/ping')).status, 404);
    assert.equal((await call('/staff/me')).status, 404);
  });
});

test('ping proves the channel and shows the path the function saw', async () => {
  await withStaffApp({}, async ({ call, crmCalls }) => {
    const r = await call('/staff/ping?probe=1');
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
    assert.equal(r.body.seenPath, '/staff/ping?probe=1');
    assert.equal(r.body.serverTime, NOW_S);
    assert.equal(r.body.staffUserId, USER);
    assert.match(r.body.requestId, /^[0-9a-f-]{36}$/);
    assert.equal(crmCalls.length, 0, 'ping does not touch the CRM');
  });
});

test('time gives the function clock in whole seconds with no sign-in, and does not touch the CRM', async () => {
  await withStaffApp({}, async ({ base, crmCalls, logs }) => {
    const r = await fetch(base + '/staff/time');
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { serverTime: NOW_S });
    assert.match(String(NOW_S), /^\d{10}$/);
    assert.equal(crmCalls.length, 0);
    assert.equal(logs.length, 0, 'a clock reading is not an audited staff request');
  });
  // A request signed with the time this route gave is accepted.
  await withStaffApp({}, async ({ call, base }) => {
    const { serverTime } = await (await fetch(base + '/staff/time')).json();
    assert.equal((await call('/staff/ping', { time: String(serverTime) })).status, 200);
  });
  // Off with the switch.
  await withStaffApp({ env: { ...ENV, PORTAL_STAFF_API_ENABLED: 'false' } }, async ({ base }) => {
    assert.equal((await fetch(base + '/staff/time')).status, 404);
  });
});

test('every way of failing the signature gets the same 401 and tells the caller nothing', async () => {
  await withStaffApp({}, async ({ call, logs }) => {
    const refused = [
      await call('/staff/ping', { sign: false }),
      await call('/staff/ping', { secret: 'x'.repeat(40), nonce: nonce(1) }),
      await call('/staff/ping', { time: String(NOW_S - 1000), nonce: nonce(2) }),
      await call('/staff/ping', { userId: 'abc', nonce: nonce(3) }),
      await call('/staff/ping', { headers: { 'X-Staff-Signature': 'f'.repeat(64) }, nonce: nonce(4) }),
    ];
    for (const r of refused) {
      assert.equal(r.status, 401);
      assert.deepEqual(r.body, { error: 'Not authorised.', code: 'STAFF_AUTH_FAILED' });
    }
    // The reasons are in the log for us, and no secret or signature is.
    const text = logs.join('\n');
    assert.match(text, /"reason":"missing_header"/);
    assert.match(text, /"reason":"bad_signature"/);
    assert.match(text, /"reason":"stale"/);
    assert.doesNotMatch(text, new RegExp(SECRET));
  });
});

test('a bad signature logs what was expected to be signed (lengths and a short hash), and tells the caller nothing', async () => {
  await withStaffApp({}, async ({ call, logs }) => {
    const wrong = 'x'.repeat(40);
    const r = await call('/staff/ping', { secret: wrong });
    assert.equal(r.status, 401);
    assert.deepEqual(r.body, { error: 'Not authorised.', code: 'STAFF_AUTH_FAILED' });
    const entry = JSON.parse(logs.find(l => l.includes('bad_signature')));
    const canonical = canonicalString({
      method: 'GET',
      path: '/staff/ping',
      body: '',
      time: String(NOW_S),
      nonce: NONCE,
      userId: USER,
    });
    assert.deepEqual(entry.lineLengths, [3, 11, 64, 10, 32, 19]);
    assert.equal(entry.pathSeen, '/staff/ping');
    assert.equal(
      entry.messageSha256,
      require('node:crypto').createHash('sha256').update(canonical).digest('hex').slice(0, 16),
    );
    assert.deepEqual(entry.secretLengths, [SECRET.length]);
    assert.equal(entry.receivedForm, 'hex');
    // Nothing secret or reusable is in the log: not either secret, not the expected signature, not the one sent.
    const text = logs.join('\n');
    const sent = signStaffRequest({
      secret: wrong,
      method: 'GET',
      path: '/staff/ping',
      body: '',
      time: String(NOW_S),
      nonce: NONCE,
      userId: USER,
    });
    for (const hidden of [SECRET, wrong, VECTOR_GET, sent]) assert.equal(text.includes(hidden), false);
  });
});

test('a captured request cannot be sent twice, but a bad one does not use up its nonce', async () => {
  await withStaffApp({}, async ({ call }) => {
    assert.equal((await call('/staff/ping', { secret: 'x'.repeat(40) })).status, 401);
    assert.equal((await call('/staff/ping')).status, 200, 'the nonce was not burned by the bad attempt');
    const again = await call('/staff/ping');
    assert.equal(again.status, 401);
    assert.equal(again.body.code, 'STAFF_AUTH_FAILED');
  });
});

test('the previous secret still works during a rotation, and the old one stops when removed', async () => {
  const env = { ...ENV, STAFF_API_SECRET_PREVIOUS: PREVIOUS };
  await withStaffApp({ env }, async ({ call }) => {
    assert.equal((await call('/staff/ping', { secret: PREVIOUS, nonce: nonce(10) })).status, 200);
    assert.equal((await call('/staff/ping', { secret: SECRET, nonce: nonce(11) })).status, 200);
  });
  await withStaffApp({}, async ({ call }) => {
    assert.equal((await call('/staff/ping', { secret: PREVIOUS })).status, 401);
  });
});

test('me returns the CRM user and the actor, looked up by id in the CRM and never from the request', async () => {
  await withStaffApp({}, async ({ call, crmCalls, logs }) => {
    const r = await call('/staff/me');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.staff, {
      id: USER,
      name: 'Sam Staff',
      email: 'sam@beautyguild.com',
      profile: 'Guild Staff',
      role: 'Processing',
    });
    assert.deepEqual(r.body.actor, {
      type: 'staff',
      id: USER,
      name: 'Sam Staff',
      email: 'sam@beautyguild.com',
      canWaive: true,
    });
    assert.deepEqual(crmCalls, [`https://www.zohoapis.eu/crm/v3/users/${USER}`]);
    assert.match(logs.join('\n'), /"event":"staff_request".*"outcome":"ok"/);
  });
});

test('me refuses an inactive user, a profile not on the list, an unknown user and an empty list, all as the same 401', async () => {
  const cases = [
    ['inactive', () => json(crmUser({ status: 'inactive' })), ENV],
    ['not on the list', () => json(crmUser({ profile: { name: 'Sales' }, role: { name: 'Sales' } })), ENV],
    ['unknown user', () => json({}, 204), ENV],
    ['id mismatch', () => json(crmUser({ id: '999' })), ENV],
    ['empty allow-list', () => json(crmUser()), { ...ENV, PORTAL_STAFF_API_ROLES: '' }],
  ];
  for (const [label, crm, env] of cases) {
    await withStaffApp({ env, crm }, async ({ call }) => {
      const r = await call('/staff/me');
      assert.equal(r.status, 401, label);
      assert.deepEqual(r.body, { error: 'Not authorised.', code: 'STAFF_AUTH_FAILED' }, label);
    });
  }
});

test('me fails closed, with a 503, when the CRM cannot say (for example a missing users scope)', async () => {
  await withStaffApp(
    { crm: () => json({ code: 'OAUTH_SCOPE_MISMATCH', message: 'invalid oauth scope to access this API' }, 401) },
    async ({ call, logs }) => {
      const r = await call('/staff/me');
      assert.equal(r.status, 503);
      assert.deepEqual(
        r.body,
        { error: 'Staff lookup is unavailable.', code: 'STAFF_LOOKUP_UNAVAILABLE' },
        'nothing extra to the caller',
      );
      // The log says why, so a missing scope can be told from a wrong URL or a broken connection.
      const entry = JSON.parse(logs.find(l => l.includes('lookup_unavailable')));
      assert.equal(entry.stage, 'crm');
      assert.equal(entry.crmStatus, 401);
      assert.equal(entry.crmCode, 'OAUTH_SCOPE_MISMATCH');
      assert.match(entry.crmMessage, /oauth scope/);
      assert.equal(logs.join('\n').includes('Zoho-oauthtoken'), false, 'no token in the log');
    },
  );
  await withStaffApp({ crm: () => json({}, 400) }, async ({ call, logs }) => {
    assert.equal((await call('/staff/me', { nonce: nonce(21) })).status, 503);
    assert.equal(JSON.parse(logs.find(l => l.includes('lookup_unavailable'))).crmStatus, 400);
  });
  await withStaffApp(
    {
      crm: () => {
        throw new Error('network');
      },
    },
    async ({ call }) => {
      assert.equal((await call('/staff/me', { nonce: nonce(20) })).status, 503);
    },
  );
});

test('a staff user id that is not a CRM id is refused before any CRM call', async () => {
  await withStaffApp({}, async ({ call, crmCalls }) => {
    const r = await call('/staff/me', { userId: '../../x' });
    assert.equal(r.status, 401);
    assert.equal(crmCalls.length, 0);
  });
});

test('a run of failures from one caller is slowed with a 429', async () => {
  await withStaffApp({}, async ({ call }) => {
    let last;
    for (let i = 0; i < 25; i += 1) last = await call('/staff/ping', { sign: false });
    assert.equal(last.status, 429);
    assert.equal(last.body.code, 'RATE_LIMIT');
  });
});

test('a body over the size limit is refused cleanly, not as a server error', async () => {
  await withStaffApp({}, async ({ base }) => {
    const res = await fetch(base + '/staff/ping', { method: 'POST', body: 'x'.repeat(300 * 1024) });
    assert.equal(res.status, 413);
  });
});

test('unknown staff routes are 404, and the existing routes are unaffected by the staff switch', async () => {
  await withStaffApp({}, async ({ call, base }) => {
    assert.equal((await call('/staff/nothing')).status, 404);
    assert.equal((await (await fetch(base + '/health')).json()).ok, true);
    const post = await fetch(base + '/address/find', { method: 'POST' });
    assert.equal(post.status, 405, 'the read-only rule still holds outside /staff');
  });
});
