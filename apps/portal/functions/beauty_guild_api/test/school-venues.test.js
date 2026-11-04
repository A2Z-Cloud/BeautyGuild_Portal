'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict');
const { loadConfig } = require('../src/config');
const { createApp } = require('../src/app');

const SCHOOL = '1000000000301',
  ACCOUNT = '1000000000201',
  MAIN = '1000000000401',
  COURSE_A = '3000000000001',
  COURSE_B = '3000000000002',
  COURSE_C = '3000000000003';
const OWNER = { id: '1000000000101', Email: 'owner@example.test' };
const cfg = loadConfig({ PORTAL_SCHOOL_SERVICES_ENABLED: 'true', PORTAL_SCHOOL_WRITES_ENABLED: 'true' });
const ok = (body, status = 200) => ({ status, ok: status < 300, json: async () => body });
const URL_BASE = '/portal/management/schools/' + SCHOOL;

// A small stateful stand-in for the CRM: the school's main centre, two accredited courses, and whatever the routes create.
function fake({ status = 'Verified' } = {}) {
  let next = 5000000000000;
  const db = {
    centres: { [MAIN]: { id: MAIN, Name: 'Grace School', Centre_Status: 'Verified', Town: 'Derby' } },
    links: [{ id: '4000000000001', Training_Centre: { id: MAIN }, Centre_Relationship_Type: 'Main Centre' }],
    offerings: [
      { id: '6000000000001', Course: { id: COURSE_A, name: 'Brows' }, Training_Centre: { id: MAIN } },
      { id: '6000000000002', Course: { id: COURSE_B, name: 'Lashes' }, Training_Centre: { id: MAIN } },
    ],
  };
  const calls = [];
  const modules = { Training_Centres: 'centres', Accreditation_Centre_Link: 'links', TC_Course_Offering: 'offerings' };
  const fetchImpl = async (url, opts = {}) => {
    const u = decodeURIComponent(String(url)),
      method = opts.method || 'GET',
      body = opts.body ? JSON.parse(opts.body) : null;
    calls.push({ method, u, body });
    if (u.includes('/Contacts/search')) return ok({ data: [OWNER] });
    if (u.includes('Training_Centre_Accred/' + SCHOOL))
      return ok({
        data: [
          {
            id: SCHOOL,
            Applicant_Contact: { id: OWNER.id },
            Account: { id: ACCOUNT, name: 'Grace School' },
            Accreditation_Status: status,
            Valid_To: '2027-11-03',
          },
        ],
      });
    const m = u.match(
      /\/crm\/v3\/(Training_Centres|Accreditation_Centre_Link|TC_Course_Offering)(?:\/(search)|\/(\d+))?/,
    );
    if (m) {
      const key = modules[m[1]];
      if (method === 'POST') {
        const id = String(next++);
        const record = { id, ...body.data[0] };
        if (key === 'centres') db.centres[id] = record;
        else db[key].push(record);
        return ok({ data: [{ status: 'success', details: { id } }] });
      }
      if (method === 'PUT') {
        const id = m[3];
        const target = key === 'centres' ? db.centres[id] : db[key].find(r => r.id === id);
        Object.assign(target, body.data[0]);
        return ok({ data: [{ status: 'success' }] });
      }
      if (method === 'DELETE') {
        const id = new URL(url).searchParams.get('ids');
        if (key === 'centres') delete db.centres[id];
        else db[key] = db[key].filter(r => r.id !== id);
        return ok({ data: [{ status: 'success' }] });
      }
      if (m[2] === 'search') {
        let rows = db[key];
        const centre = (u.match(/Training_Centre:equals:(\d+)/) || [])[1];
        if (centre) rows = rows.filter(r => String(r.Training_Centre?.id) === centre);
        if (key === 'links' && u.includes('Centre_Relationship_Type:equals:Additional Centre'))
          rows = rows.filter(r => r.Centre_Relationship_Type === 'Additional Centre');
        return ok({ data: rows });
      }
      return ok({ data: db.centres[m[3]] ? [db.centres[m[3]]] : [] });
    }
    return ok({ data: [] });
  };
  return { fetchImpl, db, calls };
}
async function withApp(f, action) {
  const app = createApp({
    config: cfg,
    getCurrentUser: async () => ({ id: 'cat-1', email: OWNER.Email }),
    getCrmHeaders: async () => ({}),
    getCreatorHeaders: async () => ({}),
    fetchImpl: f.fetchImpl,
    log: () => {},
  });
  const server = await new Promise(r => {
    const s = app.listen(0, '127.0.0.1', () => r(s));
  });
  try {
    await action(async (path, method = 'GET', body) => {
      const r = await fetch('http://127.0.0.1:' + server.address().port + path, {
        method,
        headers: { 'content-type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      return { status: r.status, body: await r.json() };
    });
  } finally {
    await new Promise(r => server.close(r));
  }
}
const VENUE = {
  name: 'Grace Studio',
  address1: '1 Test Street',
  town: 'Derby',
  county: 'Derbyshire',
  country: 'England',
  postcode: 'DE1 1AA',
  email: 'studio@example.test',
  mobile: '+44 7700 900123',
  courseIds: [COURSE_A],
};
const extra = f => Object.values(f.db.centres).filter(c => c.id !== MAIN);

test('saving a venue makes a Draft centre, an Additional Centre link and a pending offering per course (UAT round 1, S12)', async () => {
  const f = fake();
  await withApp(f, async call => {
    const r = await call(URL_BASE + '/venues', 'POST', { ...VENUE, courseIds: [COURSE_A, COURSE_B] });
    assert.equal(r.status, 201);
    assert.equal(r.body.venue.state, 'draft');
    const [centre] = extra(f);
    assert.equal(centre.Centre_Status, 'Draft');
    assert.equal(centre.Account.id, ACCOUNT);
    assert.equal(centre.Contact.id, OWNER.id);
    assert.equal(centre.Country, 'United Kingdom', 'England is the United Kingdom');
    assert.equal(centre.Email_Address, 'studio@example.test');
    const link = f.db.links.find(l => l.Centre_Relationship_Type === 'Additional Centre');
    assert.equal(link.Training_Centre.id, centre.id);
    assert.equal(link.Accreditation.id, SCHOOL);
    assert.equal(link.End_Date, '2027-11-03');
    const offers = f.db.offerings.filter(o => o.Training_Centre.id === centre.id);
    assert.equal(offers.length, 2);
    assert.ok(offers.every(o => o.Offering_Status === 'Pending Review'));
  });
});

test('saving again edits the same venue, a repeat click makes no second one, and a dropped course is removed', async () => {
  const f = fake();
  await withApp(f, async call => {
    const first = await call(URL_BASE + '/venues', 'POST', { ...VENUE, courseIds: [COURSE_A, COURSE_B] });
    await call(URL_BASE + '/venues', 'POST', { ...VENUE, courseIds: [COURSE_A, COURSE_B] });
    assert.equal(extra(f).length, 1, 'same name, still Draft: reused');
    const again = await call(URL_BASE + '/venues', 'POST', {
      ...VENUE,
      venueId: first.body.venue.id,
      name: 'Grace Studio Two',
      courseIds: [COURSE_B],
    });
    assert.equal(again.status, 201);
    assert.equal(extra(f).length, 1);
    assert.equal(extra(f)[0].Name, 'Grace Studio Two');
    const offers = f.db.offerings.filter(o => o.Training_Centre.id === first.body.venue.id);
    assert.deepEqual(
      offers.map(o => o.Course.id),
      [COURSE_B],
    );
    assert.equal(f.db.links.filter(l => l.Centre_Relationship_Type === 'Additional Centre').length, 1);
  });
});

test('a venue needs a verified school, real details, and only courses the school is accredited for', async () => {
  const unverified = fake({ status: 'Unverified' });
  await withApp(unverified, async call => {
    const r = await call(URL_BASE + '/venues', 'POST', VENUE);
    assert.equal(r.status, 409);
    assert.equal(r.body.code, 'NOT_VERIFIED');
  });
  assert.equal(extra(unverified).length, 0);
  const f = fake();
  await withApp(f, async call => {
    const bad = [
      [{ courseIds: [COURSE_C] }, /accredited/],
      [{ courseIds: [] }, /at least one course/],
      [{ postcode: '' }, /postcode/],
      [{ email: 'nope' }, /valid venue email/],
      [{ name: '' }, /venue name/],
      [{ mobile: '+44 1' }, /mobile/],
    ];
    for (const [change, message] of bad) {
      const r = await call(URL_BASE + '/venues', 'POST', { ...VENUE, ...change });
      assert.equal(r.status, 422, JSON.stringify(change));
      assert.match(r.body.error, message);
    }
    // A venue outside the UK needs no postcode.
    assert.equal((await call(URL_BASE + '/venues', 'POST', { ...VENUE, country: 'France', postcode: '' })).status, 201);
  });
});

test('the venues tab lists the venue with its state, the courses to choose from, and the details of a Draft', async () => {
  const f = fake();
  await withApp(f, async call => {
    await call(URL_BASE + '/venues', 'POST', VENUE);
    const r = await call(URL_BASE + '/venues');
    assert.equal(r.status, 200);
    assert.equal(r.body.canAdd, true);
    assert.deepEqual(r.body.courses.map(c => c.id).sort(), [COURSE_A, COURSE_B]);
    const main = r.body.venues.find(v => v.isMain),
      venue = r.body.venues.find(v => !v.isMain);
    assert.equal(main.state, 'main');
    assert.equal(venue.state, 'draft');
    assert.equal(venue.visible, false);
    assert.equal(venue.details.email, 'studio@example.test');
    assert.deepEqual(venue.details.courseIds, [COURSE_A]);
    // Once Creator has set Paid, it is read-only and carries no details.
    extra(f)[0].Centre_Status = 'Paid';
    const paid = (await call(URL_BASE + '/venues')).body.venues.find(v => !v.isMain);
    assert.equal(paid.state, 'paid');
    assert.equal(paid.details, undefined);
  });
});

test('only a Draft venue can be edited or removed, and removing it clears its records', async () => {
  const f = fake();
  await withApp(f, async call => {
    const { body } = await call(URL_BASE + '/venues', 'POST', VENUE);
    const id = body.venue.id;
    extra(f)[0].Centre_Status = 'Paid';
    assert.equal((await call(URL_BASE + '/venues', 'POST', { ...VENUE, venueId: id })).body.code, 'NOT_DRAFT');
    assert.equal((await call(URL_BASE + '/venues/' + id, 'DELETE')).body.code, 'NOT_DRAFT');
    extra(f)[0].Centre_Status = 'Draft';
    assert.equal((await call(URL_BASE + '/venues/' + id, 'DELETE')).status, 200);
    assert.equal(extra(f).length, 0);
    assert.equal(f.db.links.filter(l => l.Centre_Relationship_Type === 'Additional Centre').length, 0);
    assert.equal(f.db.offerings.filter(o => o.Training_Centre.id === id).length, 0);
    // The main centre is never reachable through the venue routes.
    assert.equal((await call(URL_BASE + '/venues/' + MAIN, 'DELETE')).status, 404);
    assert.ok(f.db.centres[MAIN]);
  });
});
