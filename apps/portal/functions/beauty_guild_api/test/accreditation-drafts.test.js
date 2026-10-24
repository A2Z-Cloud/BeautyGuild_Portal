'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const {loadConfig} = require('../src/config');
const {createApp} = require('../src/app');
const {readAnswers, annualPeriodEnd, levelFor} = require('../src/accreditationDrafts');

const JOURNEY = 'b0fd218f-9ad6-4c13-9b78-2830f3e270b0';
const ME = {id: 'cat-1', email: 'owner@example.test'};
const MY_CONTACT = '1000000000101', OTHER_CONTACT = '1000000000202';
const COURSE_A = '3000000000001', COURSE_B = '3000000000002';
const env = {PORTAL_CRM_DRAFTS_ENABLED: 'true', PORTAL_CRM_ACCREDITATION_ENABLED: 'true', PORTAL_RECORDS_ENABLED: 'true'};
const STAGES = {fields: [{api_name: 'Application_Stage', pick_list_values: [{actual_value: 'Draft'}, {actual_value: 'Awaiting Payment'}]}]};
const MODULES = ['Accounts', 'Training_Centres', 'Training_Centre_Accred', 'Accreditation_Centre_Link', 'TC_Course_Offering', 'Tutor_Relationships', 'Deals'];
const NAME_OF = {Accounts: 'Account_Name'};

// A small stateful stand-in for Zoho CRM. Lookups come back as {id, name}.
function fakeCrm({contacts = [{id: MY_CONTACT, Email: ME.email, First_Name: 'Ada', Last_Name: 'Lovelace', Phone: '01234', Correspondence_Town: 'Derby'}], stages = STAGES, rows = {}} = {}) {
  const calls = [], store = Object.fromEntries(MODULES.map(m => [m, rows[m] || []])); let seq = 5000000000000;
  const courses = [{id: COURSE_A, Name: 'Facials', Status: 'Active', Course_Type: 'GTI'}, {id: COURSE_B, Name: 'Nails', Status: 'Active', Course_Type: 'GTI'}];
  const json = (body, status = 200) => ({status, ok: status < 300, json: async () => body});
  const present = row => {
    const out = {...row};
    if (row.Account?.id) out.Account = {id: row.Account.id, name: store.Accounts.find(a => a.id === row.Account.id)?.Account_Name};
    return out;
  };
  const matches = (row, criteria) => [...criteria.matchAll(/\((\w+):equals:([^)]+)\)/g)].every(([, f, v]) => String(row[f]?.id ?? row[f]) === v);
  const fetchImpl = async (url, opts = {}) => {
    const u = decodeURIComponent(String(url)), method = opts.method || 'GET', body = opts.body ? JSON.parse(opts.body) : null;
    calls.push({method, u, body});
    if (u.includes('/Contacts/search')) { const e = (u.match(/email=([^&]+)/) || [])[1]; return json({data: e ? contacts.filter(x => String(x.Email).toLowerCase() === e.toLowerCase()) : contacts}); }
    if (method === 'POST' && /\/crm\/v3\/Contacts$/.test(u)) { const rec = {id: String(++seq), ...body.data[0]}; contacts.push(rec); return json({data: [{status: 'success', details: {id: rec.id}}]}); }
    if (u.includes('/settings/fields')) return json(stages);
    if (u.includes('/Courses/search')) return json({data: courses});
    const c = u.match(/\/crm\/v3\/Contacts\/(\d+)/);
    if (c) {
      const row = contacts.find(x => x.id === c[1]);
      if (method === 'PUT') { Object.assign(row, body.data[0]); return json({data: [{status: 'success'}]}); }
      return json({data: row ? [row] : []});
    }
    const m = u.match(/\/crm\/v3\/([A-Za-z_]+)(?:\/(\d+))?(\/search)?(?:\?|$)/), mod = m && m[1], id = m && m[2];
    if (!store[mod]) return json({data: []});
    if (m[3]) {
      const found = store[mod].filter(r => matches(r, u.split('criteria=')[1] || ''));
      return found.length ? json({data: found.map(present)}) : {status: 204, ok: true, json: async () => null};
    }
    if (method === 'POST') { const rec = {id: String(++seq), ...body.data[0]}; store[mod].push(rec); return json({data: [{status: 'success', details: {id: rec.id}}]}); }
    if (method === 'PUT') { const r = store[mod].find(x => x.id === id); if (!r) return json({data: [{status: 'error', code: 'INVALID_DATA'}]}, 400); Object.assign(r, body.data[0]); return json({data: [{status: 'success'}]}); }
    if (method === 'DELETE') {
      const ids = u.split('ids=')[1].split(',');
      store[mod] = store[mod].filter(r => !ids.includes(r.id));
      return json({data: ids.map(i => ({status: 'success', details: {id: i}}))});
    }
    const r = store[mod].find(x => x.id === id);
    return json({data: r ? [present(r)] : []});
  };
  return {fetchImpl, calls, store, writes: () => calls.filter(c => c.method !== 'GET')};
}
async function withApp(crm, action, {user = ME, extraEnv = {}} = {}) {
  const app = createApp({config: loadConfig({...env, ...extraEnv}), getCurrentUser: async () => user, getCrmHeaders: async () => ({Authorization: 't'}),
    getCreatorHeaders: async () => ({}), fetchImpl: crm.fetchImpl, log: () => {}, accreditationSleep: async () => {}});
  const server = await new Promise(ok => { const s = app.listen(0, '127.0.0.1', () => ok(s)); });
  const base = 'http://127.0.0.1:' + server.address().port;
  try { await action(async (path, init) => { const r = await fetch(base + path, init); return {status: r.status, body: await r.json()}; }); }
  finally { await new Promise(ok => server.close(ok)); }
}
const send = (method, body) => ({method, headers: {'content-type': 'application/json'}, body: JSON.stringify(body)});
const day = (offset = 0) => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10);
const answers = (extra = {}) => ({
  phone: '+44 1234 567890', mobile: '+44 7700 900123', address1: '1 High St', address2: '', address3: 'Block C', town: 'Derby', county: 'Derbyshire', postcode: 'DE1 1AA', contactCountry: 'United Kingdom',
  centre: 'Glow Academy', country: 'United Kingdom', centreEmail: 'hello@glow.test', centrePhone: '+44 1332 000000', centreMobile: '+44 7700 900456', centreAddress1: '2 Low Rd', centreAddress2: '', centreAddress3: '',
  centreTown: 'Derby', centreCounty: '', centrePostcode: 'DE2 2BB', qualifiedSixMonths: 'yes', teachingQualification: 'yes', evidenceAvailable: 'yes',
  otherTutors: 'yes', tutorQualified: 'yes', tutorCount: '2', tutors: [{firstName: 'Tess', surname: 'Tutor', email: 'tess@example.test'}, {firstName: 'Tom', surname: 'Teach', email: 'tom@example.test'}], additionalVenues: 'no', terms: true, courseIds: [COURSE_A, COURSE_B], startDate: day(5), ...extra,
});
const body = (a = answers(), extra = {}) => ({service: 'accreditation', journeyId: JOURNEY, step: 2, answers: a, ...extra});
const created = (crm, mod) => crm.writes().filter(c => c.method === 'POST' && c.u.includes('/crm/v3/' + mod));

test('saving writes the V1 record set and the applicant details to the Contact', async () => {
  const crm = fakeCrm();
  await withApp(crm, async call => {
    const res = await call('/portal/drafts/', send('POST', body()));
    assert.equal(res.status, 201);
    assert.ok(/^\d+$/.test(res.body.draft.id));
  });
  const acc = crm.store.Training_Centre_Accred[0], centre = crm.store.Training_Centres[0], link = crm.store.Accreditation_Centre_Link[0];
  assert.equal(crm.store.Accounts[0].Account_Name, 'Glow Academy');
  assert.equal(acc.Application_Stage, 'Draft');
  assert.equal(acc.Applicant_Contact.id, MY_CONTACT);
  assert.equal(acc.Accreditation_Level, 'Standard Accreditation Annual');
  assert.equal(acc.Declaration_1_qualified_for_six_months, 'Yes');
  assert.equal(acc.Other_Tutors_Used, true);
  assert.equal(acc.Number_of_Tutors, 2);
  assert.equal(acc.Additional_Centres_Used, 'No');
  assert.equal(acc.Valid_From, day(5));
  assert.equal(acc.Valid_To, annualPeriodEnd(day(5)));
  assert.equal(acc.Payment_Status, 'Not Paid');
  assert.equal(centre.Centre_Status, 'Unverified');
  assert.equal(centre.Contact.id, MY_CONTACT);
  assert.equal(centre.Address_Line_1, '2 Low Rd');
  assert.equal(link.Centre_Relationship_Type, 'Main Centre');
  assert.equal(link.Name, 'Glow Academy - Main Centre');
  assert.equal(crm.store.TC_Course_Offering.length, 2);
  assert.ok(crm.store.TC_Course_Offering.every(o => o.Offering_Status === 'Pending Review' && o.Accreditation.id === acc.id));
  // No Note or Journey_ID is written. Each listed tutor gets a Contact and an Inactive Tutor_Relationships row, as in V1.
  assert.ok(!crm.calls.some(c => /Notes|Journey_ID/.test(c.u + JSON.stringify(c.body))));
  assert.deepEqual(crm.store.Tutor_Relationships.map(r => [r.Name, r.Status, r.Account.id === crm.store.Accounts[0].id]), [['Tess Tutor', 'Inactive', true], ['Tom Teach', 'Inactive', true]]);
  const contact = crm.calls.find(c => c.method === 'PUT' && c.u.includes('/Contacts/'));
  assert.equal(contact.body.data[0].Phone, '+44 1234 567890');
  assert.equal(contact.body.data[0].Correspondence_Address_Line_3, 'Block C');
  assert.equal(contact.body.data[0].Correspondence_Postcode, 'DE1 1AA');
});

test('a second save updates the same records and never duplicates them', async () => {
  const crm = fakeCrm();
  await withApp(crm, async call => {
    const first = (await call('/portal/drafts/', send('POST', body()))).body.draft;
    const next = await call('/portal/drafts/accreditation/' + first.id, send('PUT', body(answers({centre: 'Glow Academy Ltd', courseIds: [COURSE_B]}), {related: first.related})));
    assert.equal(next.status, 200);
  });
  assert.equal(crm.store.Accounts.length, 1);
  assert.equal(crm.store.Training_Centres.length, 1);
  assert.equal(crm.store.Training_Centre_Accred.length, 1);
  assert.equal(crm.store.Accreditation_Centre_Link.length, 1);
  assert.equal(crm.store.Training_Centres[0].Name, 'Glow Academy Ltd');
  assert.equal(crm.store.Accreditation_Centre_Link[0].Name, 'Glow Academy Ltd - Main Centre');
  assert.deepEqual(crm.store.TC_Course_Offering.map(o => o.Course.id), [COURSE_B]);
});

test('a second save finds its records even when the browser sends no hints (search retry)', async () => {
  const crm = fakeCrm();
  await withApp(crm, async call => {
    const first = (await call('/portal/drafts/', send('POST', body()))).body.draft;
    assert.equal((await call('/portal/drafts/accreditation/' + first.id, send('PUT', body()))).status, 200);
  });
  assert.equal(crm.store.Training_Centres.length, 1);
  assert.equal(crm.store.Accreditation_Centre_Link.length, 1);
  assert.equal(crm.store.TC_Course_Offering.length, 2);
});

test('hints from the browser are verified: a link from another application is ignored', async () => {
  const crm = fakeCrm();
  await withApp(crm, async call => {
    const a = (await call('/portal/drafts/', send('POST', body()))).body.draft;
    const b = (await call('/portal/drafts/', send('POST', body(answers({centre: 'Second School'}))))).body.draft;
    await call('/portal/drafts/accreditation/' + b.id, send('PUT', body(answers({centre: 'Second School'}), {related: a.related})));
  });
  assert.equal(crm.store.Training_Centres.find(c => c.Name === 'Glow Academy').Name, 'Glow Academy');
  assert.equal(crm.store.Accreditation_Centre_Link.length, 2);
});

test('the placeholder Account is renamed once the school is named, but a real Account never is', async () => {
  const crm = fakeCrm();
  await withApp(crm, async call => {
    const first = (await call('/portal/drafts/', send('POST', body(answers({centre: ''}))))).body.draft;
    assert.equal(crm.store.Accounts[0].Account_Name, 'Draft application - ' + MY_CONTACT);
    assert.equal(crm.store.Training_Centres[0].Name, 'Draft application - ' + MY_CONTACT);
    const list = await call('/portal/drafts/');
    assert.equal(list.body.drafts[0].title, null, 'the placeholder is never shown as a school name');
    await call('/portal/drafts/accreditation/' + first.id, send('PUT', body(answers({centre: 'Glow Academy'}), {related: first.related})));
    assert.equal(crm.store.Accounts[0].Account_Name, 'Glow Academy');
    await call('/portal/drafts/accreditation/' + first.id, send('PUT', body(answers({centre: 'Renamed'}), {related: first.related})));
    assert.equal(crm.store.Accounts[0].Account_Name, 'Glow Academy', 'an Account that is no longer the placeholder is left alone');
  });
});

test('resume rebuilds the answers from the CRM records and lists only my drafts', async () => {
  const crm = fakeCrm();
  await withApp(crm, async call => {
    const first = (await call('/portal/drafts/', send('POST', body()))).body.draft;
    const list = await call('/portal/drafts/');
    assert.deepEqual(list.body.drafts.map(d => [d.id, d.service, d.title]), [[first.id, 'accreditation', 'Glow Academy']]);
    const read = await call('/portal/drafts/accreditation/' + first.id);
    assert.equal(read.status, 200);
    const a = read.body.draft.answers;
    assert.equal(a.centre, 'Glow Academy');
    assert.equal(a.centreAddress1, '2 Low Rd');
    assert.equal(a.qualifiedSixMonths, 'yes');
    assert.equal(a.otherTutors, 'yes');
    assert.equal(a.tutorCount, 2);
    assert.equal(a.additionalVenues, 'no');
    assert.deepEqual(a.courseIds.sort(), [COURSE_A, COURSE_B]);
    assert.equal(a.firstName, 'Ada');
    assert.equal(a.phone, '+44 1234 567890');
    assert.equal(a.startDate, day(5));
    assert.equal(read.body.draft.related.centreId, crm.store.Training_Centres[0].id);
  });
});

test('another contact cannot read, change, submit or discard my application', async () => {
  const crm = fakeCrm();
  let id;
  await withApp(crm, async call => { id = (await call('/portal/drafts/', send('POST', body()))).body.draft.id; });
  const other = fakeCrm({contacts: [{id: OTHER_CONTACT, Email: 'other@example.test'}], rows: crm.store});
  await withApp(other, async call => {
    assert.equal((await call('/portal/drafts/accreditation/' + id)).status, 404);
    assert.equal((await call('/portal/drafts/accreditation/' + id, send('PUT', body()))).status, 404);
    assert.equal((await call('/portal/drafts/accreditation/submit', send('POST', {...body(), id}))).status, 404);
    assert.equal((await call('/portal/drafts/accreditation/' + id, {method: 'DELETE'})).status, 404);
    assert.equal((await call('/portal/drafts/')).body.drafts.length, 0);
  }, {user: {id: 'cat-2', email: 'other@example.test'}});
  assert.equal(other.writes().length, 0);
  assert.equal(crm.store.Training_Centre_Accred.length, 1);
});

test('a browser-supplied contact id is ignored and a malformed record id is not found', async () => {
  const crm = fakeCrm();
  await withApp(crm, async call => {
    const res = await call('/portal/drafts/', send('POST', body(answers(), {contactId: OTHER_CONTACT, Applicant_Contact: OTHER_CONTACT})));
    assert.equal(res.status, 201);
    assert.equal(crm.store.Training_Centre_Accred[0].Applicant_Contact.id, MY_CONTACT);
    assert.equal((await call('/portal/drafts/accreditation/abc')).status, 404);
  });
});

test('discard removes the application, its offerings and link, only while Draft', async () => {
  const crm = fakeCrm();
  await withApp(crm, async call => {
    const first = (await call('/portal/drafts/', send('POST', body()))).body.draft;
    const out = await call('/portal/drafts/accreditation/' + first.id, {method: 'DELETE'});
    assert.deepEqual(out.body, {discarded: true});
    assert.equal(crm.store.Training_Centre_Accred.length, 0);
    assert.equal(crm.store.TC_Course_Offering.length, 0);
    assert.equal(crm.store.Accreditation_Centre_Link.length, 0);
    assert.equal(crm.store.Accounts.length, 1, 'the Account and Training Centre may be shared and are left alone');
    assert.equal(crm.store.Training_Centres.length, 1);
  });
  const submitted = fakeCrm({rows: {Training_Centre_Accred: [{id: '4000000000001', Applicant_Contact: {id: MY_CONTACT}, Application_Stage: 'Awaiting Payment'}]}});
  await withApp(submitted, async call => {
    const res = await call('/portal/drafts/accreditation/4000000000001', {method: 'DELETE'});
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'NOT_DRAFT');
  });
  assert.equal(submitted.writes().length, 0);
});

test('submit writes the records, then moves the stage to Awaiting Payment last', async () => {
  const crm = fakeCrm();
  await withApp(crm, async call => {
    const res = await call('/portal/drafts/accreditation/submit', send('POST', body()));
    assert.equal(res.status, 200);
    assert.equal(res.body.accreditation.applicationStage, 'Awaiting Payment');
    assert.equal(res.body.accreditation.international, false);
    assert.equal(res.body.accreditation.level, 'Standard Accreditation Annual');
  });
  const acc = crm.store.Training_Centre_Accred[0];
  assert.equal(acc.Application_Stage, 'Awaiting Payment');
  assert.equal(acc.Purchase_Type, 'New Accreditation');
  assert.equal(acc.Application_Source, 'Portal');
  assert.match(acc.Terms_Accepted_Date, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\+00:00$/);
  assert.equal(crm.store.TC_Course_Offering.length, 2);
  const w = crm.writes().map(c => c.method + ' ' + c.u.split('/crm/v3/')[1].split('?')[0]);
  assert.equal(w[w.length - 1].startsWith('PUT Training_Centre_Accred/'), true, 'stage moves only after every related record is written');
  assert.ok(w.indexOf('POST TC_Course_Offering') < w.length - 1);
  assert.ok(!('Accreditation_Fee' in acc) && !('Total_Quoted' in acc), 'no browser-supplied money is written');
});

test('submitting a saved draft converts it, and a retry changes nothing', async () => {
  const crm = fakeCrm();
  await withApp(crm, async call => {
    const draft = (await call('/portal/drafts/', send('POST', body()))).body.draft;
    const first = await call('/portal/drafts/accreditation/submit', send('POST', {...body(), id: draft.id, related: draft.related}));
    assert.equal(first.body.accreditation.id, draft.id);
    const writes = crm.writes().length;
    const again = await call('/portal/drafts/accreditation/submit', send('POST', {...body(), id: draft.id}));
    assert.equal(again.status, 200);
    assert.equal(again.body.accreditation.applicationStage, 'Awaiting Payment');
    assert.equal(crm.writes().length, writes);
    assert.equal((await call('/portal/drafts/accreditation/' + draft.id, send('PUT', body()))).status, 409, 'a submitted application can no longer be edited');
    assert.equal((await call('/portal/drafts/')).body.drafts.length, 0);
  });
  assert.equal(crm.store.Training_Centre_Accred.length, 1);
});

test('a paid application cannot be submitted again', async () => {
  const crm = fakeCrm({rows: {Training_Centre_Accred: [{id: '4000000000001', Applicant_Contact: {id: MY_CONTACT}, Application_Stage: 'Awaiting Payment', Payment_Status: 'Paid'}]}});
  await withApp(crm, async call => {
    assert.equal((await call('/portal/drafts/accreditation/submit', send('POST', {...body(), id: '4000000000001'}))).status, 409);
  });
  assert.equal(crm.writes().length, 0);
});

test('an international centre is accredited without a UK postcode, at the international level', async () => {
  const crm = fakeCrm();
  await withApp(crm, async call => {
    const intl = answers({country: 'Other', countryOther: 'Nigeria', centrePostcode: '', centreTown: 'Lagos'});
    const res = await call('/portal/drafts/accreditation/submit', send('POST', body(intl)));
    assert.equal(res.status, 200);
    assert.equal(res.body.accreditation.international, true);
    assert.equal(res.body.accreditation.level, 'International Accreditation Annual');
  });
  assert.equal(crm.store.Training_Centres[0].Country, 'Nigeria');
  assert.equal(crm.store.Training_Centre_Accred[0].Accreditation_Level, 'International Accreditation Annual');
});

test('UK nations are the standard level and a UK centre needs a postcode to submit', async () => {
  assert.equal(levelFor('England'), 'Standard Accreditation Annual');
  assert.equal(levelFor('Ireland'), 'International Accreditation Annual');
  assert.equal(levelFor(''), 'Standard Accreditation Annual');
  const crm = fakeCrm();
  await withApp(crm, async call => {
    const res = await call('/portal/drafts/accreditation/submit', send('POST', body(answers({country: 'Scotland', centrePostcode: ''}))));
    assert.equal(res.status, 422);
    assert.equal(res.body.code, 'CENTRE_REQUIRED');
  });
  assert.equal(crm.writes().length, 0);
});

test('submit refuses incomplete applications with fixed wording and writes nothing', async () => {
  const cases = [
    [{centre: ''}, 'CENTRE_REQUIRED'], [{qualifiedSixMonths: 'no'}, 'DECLARATIONS_REQUIRED'], [{terms: false}, 'TERMS_REQUIRED'],
    [{courseIds: []}, 'COURSES_REQUIRED'], [{otherTutors: ''}, 'TUTORS_REQUIRED'],
  ];
  for (const [extra, code] of cases) {
    const crm = fakeCrm();
    await withApp(crm, async call => {
      const res = await call('/portal/drafts/accreditation/submit', send('POST', body(answers(extra))));
      assert.equal(res.status, 422, code);
      assert.equal(res.body.code, code);
    });
    assert.equal(crm.writes().length, 0, code);
  }
});

test('a course that is not an active GTi course is refused', async () => {
  const crm = fakeCrm();
  await withApp(crm, async call => {
    const res = await call('/portal/drafts/', send('POST', body(answers({courseIds: ['3999999999999']}))));
    assert.equal(res.status, 422);
    assert.equal(res.body.code, 'INVALID_COURSE');
  });
  assert.equal(crm.writes().length, 0);
});

test('the start date must be within one month ahead and not in the past', () => {
  assert.throws(() => readAnswers(answers({startDate: day(-1)})), /start date/);
  assert.throws(() => readAnswers(answers({startDate: day(31)})), /start date/);
  assert.equal(readAnswers(answers({startDate: day(30)})).startDate, day(30));
  assert.equal(readAnswers(answers({startDate: ''})).startDate, day(0));
});

test('it fails closed when the CRM stage list lacks Draft or Awaiting Payment', async () => {
  const crm = fakeCrm({stages: {fields: [{api_name: 'Application_Stage', pick_list_values: [{actual_value: 'Draft'}]}]}});
  await withApp(crm, async call => {
    const res = await call('/portal/drafts/', send('POST', body()));
    assert.equal(res.status, 503);
    assert.equal(res.body.code, 'STAGE_NOT_READY');
  });
  assert.equal(crm.writes().length, 0);
});

test('it is off unless the accreditation switch is on', async () => {
  const crm = fakeCrm();
  await withApp(crm, async call => {
    assert.equal((await call('/portal/drafts/', send('POST', body()))).body.code, 'ACCREDITATION_DISABLED');
    assert.equal((await call('/portal/drafts/accreditation/submit', send('POST', body()))).body.code, 'ACCREDITATION_DISABLED');
    assert.deepEqual((await call('/portal/drafts/')).body.drafts, []);
  }, {extraEnv: {PORTAL_CRM_ACCREDITATION_ENABLED: 'false'}});
  assert.equal(crm.writes().length, 0);
});

test('a CRM failure part way is reported with our own wording and no CRM text', async () => {
  const crm = fakeCrm();
  const real = crm.fetchImpl;
  crm.fetchImpl = async (url, opts = {}) => (String(url).includes('/Accreditation_Centre_Link') && opts.method === 'POST'
    ? {status: 400, ok: false, json: async () => ({data: [{status: 'error', code: 'MANDATORY_NOT_FOUND', message: 'internal secret detail'}]})} : real(url, opts));
  await withApp(crm, async call => {
    const res = await call('/portal/drafts/', send('POST', body()));
    assert.equal(res.status, 502);
    assert.ok(!JSON.stringify(res.body).includes('secret'));
  });
});

test('tutors are linked once, an existing member tutor is Active, and a removed tutor is unlinked', async () => {
  const crm = fakeCrm({contacts: [{id: MY_CONTACT, Email: ME.email, First_Name: 'Ada', Last_Name: 'Lovelace'}, {id: '1000000000303', Email: 'tess@example.test', First_Name: 'Tess', Last_Name: 'T'}],
    rows: {Deals: [{id: '9', Contact_Name: {id: '1000000000303'}, Stage: 'Active', Membership_Type: 'Full Member', Start_Date: '2020-01-01', Expiry_Date: '2999-01-01'}]}});
  await withApp(crm, async call => {
    const first = (await call('/portal/drafts/', send('POST', body()))).body.draft;
    assert.equal((await call('/portal/drafts/accreditation/' + first.id, send('PUT', body(answers(), {related: first.related})))).status, 200);
    assert.equal(crm.store.Tutor_Relationships.length, 2);
    assert.equal(crm.store.Tutor_Relationships.find(r => r.Tutor_Contact.id === '1000000000303').Status, 'Active');
    assert.equal(crm.store.Tutor_Relationships.find(r => r.Name === 'Tom Teach').Status, 'Inactive');
    assert.equal(crm.calls.filter(c => c.method === 'POST' && /Contacts$/.test(c.u)).length, 1);
    const one = answers({tutorCount: '1', tutors: [{firstName: 'Tess', surname: 'Tutor', email: 'tess@example.test'}]});
    assert.equal((await call('/portal/drafts/accreditation/' + first.id, send('PUT', body(one, {related: first.related})))).status, 200);
    assert.equal(crm.store.Tutor_Relationships.length, 1);
    const resumed = await call('/portal/drafts/accreditation/' + first.id);
    assert.deepEqual(resumed.body.draft.answers.tutors, [{firstName: 'Tess', surname: 'T', email: 'tess@example.test'}]);
  });
});
test('submit needs a name and a valid email for every tutor, and a mobile and centre contact details', () => {
  const full = {final: true};
  assert.throws(() => readAnswers(answers({tutors: [{firstName: 'Tess', surname: '', email: 'tess@example.test'}, {firstName: 'Tom', surname: 'Teach', email: 'tom@example.test'}]}), full), /tutor/i);
  assert.throws(() => readAnswers(answers({tutors: [{firstName: 'Tess', surname: 'T', email: 'tess@example.test'}, {firstName: 'Tom', surname: 'T', email: 'TESS@example.test'}]}), full), /different email/i);
  assert.throws(() => readAnswers(answers({tutors: [{firstName: 'Tess', surname: 'T', email: 'tess@example.test'}]}), full), /tutor/i);
  assert.throws(() => readAnswers(answers({mobile: ''}), full), /mobile/i);
  assert.throws(() => readAnswers(answers({centreEmail: ''}), full), /email/i);
  assert.throws(() => readAnswers(answers({centreMobile: ''}), full), /mobile/i);
  assert.equal(readAnswers(answers(), full).tutors.length, 2);
});
test('a phone number must be a real length: UK 9 or more digits after the country code', () => {
  const bad = ['+44 123', '01234', '1', '+44 12345678'];
  for (const phone of bad) assert.throws(() => readAnswers(answers({mobile: phone})), /mobile number/i, phone);
  for (const phone of ['+44 7700 900123', '07700 900123', '+971 50 123 4567', '+33 6 12 34 56 78']) assert.doesNotThrow(() => readAnswers(answers({mobile: phone})), phone);
  assert.throws(() => readAnswers(answers({mobile: '+971 1'})), /mobile number/i);
  assert.throws(() => readAnswers(answers({mobile: '+44 77x0 900123'})), /mobile number/i);
});
