'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict');
const { loadConfig } = require('../src/config');
const { createApp } = require('../src/app');

const { JOURNEY, ME, env, fakeCrm } = require('./helpers/drafts-fixture');
async function withApp(crm, action, user = ME) {
  const app = createApp({
    config: loadConfig(env),
    getCurrentUser: async () => user,
    getCrmHeaders: async () => ({ Authorization: 't' }),
    getCreatorHeaders: async () => ({}),
    fetchImpl: crm.fetchImpl,
    log: () => {},
  });
  const server = await new Promise(ok => {
    const s = app.listen(0, '127.0.0.1', () => ok(s));
  });
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    await action(async (path, init) => {
      const r = await fetch(base + path, init);
      return { status: r.status, body: await r.json() };
    });
  } finally {
    await new Promise(ok => server.close(ok));
  }
}
const send = (method, body) => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});
const draft = (extra = {}) => ({ service: 'insurance', journeyId: JOURNEY, step: 2, answers: { a: 1 }, ...extra });

test('drafts identify the Contact by verified email, never by a Catalyst user field', async () => {
  const crm = fakeCrm();
  await withApp(crm, async call => {
    assert.equal((await call('/portal/drafts/', send('POST', draft()))).status, 201);
    const search = crm.calls.find(c => c.u.includes('/Contacts/search'));
    assert.ok(search.u.includes('email=owner@example.test'));
    assert.ok(!crm.calls.some(c => c.u.includes('Catalyst_User_ID')));
  });
  await withApp(fakeCrm({ contacts: [] }), async call => {
    assert.equal((await call('/portal/drafts/accreditation/1000000000001', { method: 'GET' })).status, 404);
    assert.equal(
      (await call('/portal/drafts/insurance/1000000000001', { method: 'GET' })).body.code,
      'CONTACT_UNLINKED',
    );
  });
  await withApp(
    fakeCrm({
      contacts: [
        { id: '1000000000101', Email: ME.email },
        { id: '1000000000102', Email: ME.email },
      ],
    }),
    async call => assert.equal((await call('/portal/drafts/', send('POST', draft()))).status, 409),
  );
});

test('a first save is a plain create, never an upsert, and a repeat journey is rejected', async () => {
  const crm = fakeCrm();
  await withApp(crm, async call => {
    const first = await call('/portal/drafts/', send('POST', draft()));
    assert.equal(first.status, 201);
    assert.equal(first.body.draft.revision, 1);
    assert.ok(!crm.calls.some(c => c.u.includes('/upsert')), 'no upsert is used');
    assert.ok(crm.calls.some(c => c.method === 'POST' && /\/crm\/v3\/Insurance_Policy$/.test(c.u)));
    // saving the same journey again without a revision must not silently overwrite it
    const again = await call('/portal/drafts/', send('POST', draft()));
    assert.equal(again.status, 422);
    assert.equal(again.body.code, 'REVISION_REQUIRED');
  });
});

test('updating a draft needs the current revision', async () => {
  const crm = fakeCrm();
  await withApp(crm, async call => {
    const made = (await call('/portal/drafts/', send('POST', draft()))).body.draft;
    const url = '/portal/drafts/insurance/' + made.id;
    const noRev = await call(url, send('PUT', draft({ step: 3 })));
    assert.equal(noRev.status, 422);
    assert.equal(noRev.body.code, 'REVISION_REQUIRED');
    const stale = await call(url, send('PUT', draft({ step: 3, revision: 5 })));
    assert.equal(stale.status, 409);
    assert.equal(stale.body.code, 'REVISION_CONFLICT');
    const ok = await call(url, send('PUT', draft({ step: 3, revision: 1 })));
    assert.equal(ok.status, 200);
    assert.equal(ok.body.draft.revision, 2);
  });
});

test('saved drafts are never listed as real memberships when CRM drafts are on', async () => {
  const owner = { id: '1000000000101' };
  const deals = [
    {
      id: '3000000000001',
      Deal_Name: 'Real membership',
      Stage: 'Closed Won',
      Contact_Name: owner,
      Application_Status: 'Paid',
      Modified_Time: '2026-10-02',
    },
    {
      id: '3000000000002',
      Deal_Name: 'Membership application b0fd218f',
      Stage: 'Draft',
      Contact_Name: owner,
      Application_Status: 'Draft',
      Modified_Time: '2026-10-03',
    },
  ];
  const crm = fakeCrm({ deals });
  await withApp(crm, async call => {
    const list = await call('/portal/records/?kind=membership');
    assert.equal(list.status, 200);
    assert.deepEqual(
      list.body.records.map(r => r.id),
      ['3000000000001'],
    );
    assert.equal((await call('/portal/records/membership/3000000000002')).status, 404);
    assert.equal((await call('/portal/records/membership/3000000000001')).status, 200);
    assert.ok(
      crm.calls.some(c => c.u.includes('Application_Status') && c.u.includes('Deals')),
      'the status field is requested so drafts can be told apart',
    );
  });
});

test('CRM writes use a text step and an offset date-time, which CRM text and date-time fields accept', async () => {
  const crm = fakeCrm();
  await withApp(crm, async call => {
    const r = await call(
      '/portal/drafts',
      send('POST', { service: 'insurance', journeyId: JOURNEY, step: 3, answers: { insWorking: ['home'] } }),
    );
    assert.equal(r.status, 201);
  });
  const writes = crm.calls.filter(
    c => ['POST', 'PUT'].includes(c.method) && /Insurance_Policy/.test(c.u) && c.body?.data?.[0]?.Draft_Saved_At,
  );
  assert.ok(writes.length >= 2);
  for (const w of writes) {
    const row = w.body.data[0];
    assert.equal(typeof row.Last_Completed_Journey_Step, 'string');
    assert.match(row.Draft_Saved_At, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+00:00$/);
  }
  assert.equal(writes[writes.length - 1].body.data[0].Last_Completed_Journey_Step, '3');
});

const NEW_USER = { id: 'cat-2', email: 'new.person@example.test' };
test('a verified user with no Contact gets one at first save, from the verified email only', async () => {
  const crm = fakeCrm({ contacts: [] });
  await withApp(
    crm,
    async call => {
      const r = await call(
        '/portal/drafts/',
        send(
          'POST',
          draft({
            contact: { firstName: ' Nia ', lastName: 'Bright', Email: 'someone@else.test', id: '1000000000999' },
          }),
        ),
      );
      assert.equal(r.status, 201);
      const made = crm.calls.filter(c => c.method === 'POST' && /\/crm\/v3\/Contacts$/.test(c.u));
      assert.equal(made.length, 1);
      assert.deepEqual(made[0].body.data[0], {
        First_Name: 'Nia',
        Last_Name: 'Bright',
        Email: 'new.person@example.test',
      });
      assert.notEqual(
        crm.store.Insurance_Policy[0].Contact.id,
        '1000000000999',
        'a browser-supplied Contact id is never used',
      );
    },
    NEW_USER,
  );
});
test('CRM search lag does not create a second Contact on the next save', async () => {
  const crm = fakeCrm({ contacts: [], searchLag: true });
  await withApp(
    crm,
    async call => {
      const first = await call(
        '/portal/drafts/',
        send('POST', draft({ contact: { firstName: 'Nia', lastName: 'Bright' } })),
      );
      assert.equal(first.status, 201);
      const again = await call(
        '/portal/drafts/insurance/' + first.body.draft.id,
        send('PUT', draft({ revision: 1, answers: { a: 2 } })),
      );
      assert.equal(again.status, 200);
      assert.equal(crm.calls.filter(c => c.method === 'POST' && /\/crm\/v3\/Contacts$/.test(c.u)).length, 1);
    },
    NEW_USER,
  );
});
test('two saves at once for a new user create one Contact', async () => {
  const crm = fakeCrm({ contacts: [], searchLag: true });
  await withApp(
    crm,
    async call => {
      const other = 'c1b0218f-9ad6-4c13-9b78-2830f3e270b1';
      const [a, b] = await Promise.all([
        call('/portal/drafts/', send('POST', draft())),
        call('/portal/drafts/', send('POST', draft({ journeyId: other }))),
      ]);
      assert.deepEqual([a.status, b.status], [201, 201]);
      assert.equal(crm.calls.filter(c => c.method === 'POST' && /\/crm\/v3\/Contacts$/.test(c.u)).length, 1);
    },
    NEW_USER,
  );
});
test('no Contact is made without a name when the surname is missing, and the email is the fallback label', async () => {
  const crm = fakeCrm({ contacts: [] });
  await withApp(
    crm,
    async call => {
      assert.equal((await call('/portal/drafts/', send('POST', draft()))).status, 201);
      assert.equal(
        crm.calls.find(c => c.method === 'POST' && /Contacts$/.test(c.u)).body.data[0].Last_Name,
        'new.person',
      );
    },
    NEW_USER,
  );
});
test('a Contact is not created by reads, updates, discards or accreditation, or when the switch is off', async () => {
  const crm = fakeCrm({ contacts: [] });
  await withApp(
    crm,
    async call => {
      assert.equal((await call('/portal/drafts/', { method: 'GET' })).status, 200);
      assert.deepEqual((await call('/portal/drafts/', { method: 'GET' })).body.drafts, []);
      assert.equal(
        (await call('/portal/drafts/insurance/1000000000001', send('PUT', draft({ revision: 1 })))).status,
        404,
      );
      assert.equal((await call('/portal/drafts/insurance/1000000000001', { method: 'DELETE' })).status, 404);
      assert.equal(crm.calls.filter(c => c.method === 'POST' && /Contacts$/.test(c.u)).length, 0);
    },
    NEW_USER,
  );
  const off = fakeCrm({ contacts: [] }),
    app = createApp({
      config: loadConfig({ ...env, PORTAL_CRM_DRAFT_CREATE_CONTACT: 'false' }),
      getCurrentUser: async () => NEW_USER,
      getCrmHeaders: async () => ({}),
      getCreatorHeaders: async () => ({}),
      fetchImpl: off.fetchImpl,
      log: () => {},
    });
  const server = await new Promise(ok => {
    const s = app.listen(0, '127.0.0.1', () => ok(s));
  });
  try {
    const r = await fetch('http://127.0.0.1:' + server.address().port + '/portal/drafts/', send('POST', draft()));
    assert.equal(r.status, 404);
  } finally {
    await new Promise(ok => server.close(ok));
  }
  assert.equal(off.calls.filter(c => c.method === 'POST' && /Contacts$/.test(c.u)).length, 0);
});
test('a duplicate Contact error asks for manual verification and saves nothing', async () => {
  const crm = fakeCrm({ contacts: [], contactError: 'DUPLICATE_DATA' });
  await withApp(
    crm,
    async call => {
      const r = await call('/portal/drafts/', send('POST', draft()));
      assert.equal(r.status, 409);
      assert.equal(r.body.code, 'CONTACT_AMBIGUOUS');
      assert.equal(crm.store.Insurance_Policy.length, 0);
    },
    NEW_USER,
  );
});
