'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createApp} = require('../src/app');
const {loadConfig} = require('../src/config');

const ME = '1011174000000000001';
const json = body => ({status: 200, ok: true, json: async () => body});
function fakeCrm(seen) {
  return async url => {
    url = String(url);
    seen.push(url);
    if (url.includes('Contacts/search')) return json({data: [{id: ME, Email: 'alice@example.test'}]});
    if (url.includes('Training_Centre_Accred/search')) return json({data: [
      {id: '1011174000000000011', Applicant_Contact: {id: ME}, Application_Stage: 'Draft', Name: 'ACC - 0001'},
      {id: '1011174000000000012', Applicant_Contact: {id: ME}, Application_Stage: 'Awaiting Payment', Name: 'ACC - 0002'}]});
    if (url.includes('Training_Centre_Accred/1011174000000000011')) return json({data: [{id: '1011174000000000011', Applicant_Contact: {id: ME}, Application_Stage: 'Draft'}]});
    if (url.includes('Deals/search')) return json({data: [
      {id: '1011174000000000021', Contact_Name: {id: ME}, Application_Status: 'Draft', Stage: 'Active'},
      {id: '1011174000000000022', Contact_Name: {id: ME}, Application_Status: 'Submitted', Stage: 'Active'}]});
    return json({data: []});
  };
}
async function withApp(env, fn) {
  const seen = [];
  const app = createApp({config: loadConfig({PORTAL_RECORDS_ENABLED: 'true', ...env}), getCurrentUser: async () => ({id: 'u1', email: 'alice@example.test'}),
    getCrmHeaders: async () => ({Authorization: 'Bearer t'}), fetchImpl: fakeCrm(seen)});
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  try {
    const get = async path => { const r = await fetch('http://127.0.0.1:' + server.address().port + '/portal/records' + path); return {status: r.status, body: await r.json()}; };
    await fn({get, seen});
  } finally { await new Promise(resolve => server.close(resolve)); }
}

test('a V1 accreditation saved at stage Draft is not listed as a record, even with V2 drafts off', async () => {
  await withApp({}, async ({get}) => {
    const r = await get('?kind=accreditation');
    assert.deepEqual(r.body.records.map(x => x.id), ['1011174000000000012']);
    assert.equal((await get('/accreditation/1011174000000000011')).status, 404);
  });
});
test('Deals are only filtered on Application_Status once V2 drafts are on, and the field is only asked for then', async () => {
  await withApp({}, async ({get, seen}) => {
    assert.equal((await get('?kind=membership')).body.records.length, 2);
    assert.ok(!seen.filter(u => u.includes('Deals/search')).some(u => u.includes('Application_Status')));
  });
  await withApp({PORTAL_CRM_DRAFTS_ENABLED: 'true'}, async ({get, seen}) => {
    assert.deepEqual((await get('?kind=membership')).body.records.map(x => x.id), ['1011174000000000022']);
    assert.ok(seen.filter(u => u.includes('Deals/search')).some(u => u.includes('Application_Status')));
  });
});
