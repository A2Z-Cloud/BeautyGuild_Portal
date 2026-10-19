'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {normalisePostcode} = require('../src/postcode');
const {tokens, nameScore, groupRows, screenSubject, searchPrefixes, searchTerms} = require('../src/sanctionsMatch');
const {createAnalyticsClient, parseCsv, AnalyticsError} = require('../src/analytics');
const {createRiskChecks} = require('../src/riskChecks');
const {loadConfig} = require('../src/config');

const csvText = rows => rows.map(r => r.map(v => /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v).join(',')).join('\n');
const HEAD = ['Unique ID', 'OFSI Group ID', 'Name 1', 'Name 2', 'Name 3', 'Name 4', 'Name 5', 'Name 6', 'Name type', 'Alias strength', 'Designation Type', 'D.O.B', 'Address Country', 'Nationality(/ies)', 'Regime Name'];
const row = (id, forenames, surname, extra = {}) => ({'Unique ID': id, 'OFSI Group ID': '1' + id.replace(/\D/g, ''), 'Name 1': forenames[0] || '', 'Name 2': forenames[1] || '', 'Name 3': '', 'Name 4': '', 'Name 5': '',
  'Name 6': surname, 'Name type': 'Primary name', 'Alias strength': '', 'Designation Type': 'Individual', 'D.O.B': '', 'Address Country': '', 'Nationality(/ies)': '', 'Regime Name': 'Test regime', ...extra});
const toCsv = rows => csvText([HEAD, ...rows.map(r => HEAD.map(h => r[h] || ''))]);

test('postcodes are matched whole, whatever the spacing and case', () => {
  for (const v of ['AB10 1AU', 'ab101au', ' ab10  1au ', 'AB10-1AU']) assert.deepEqual(normalisePostcode(v), {key: 'AB101AU', display: 'AB10 1AU', outward: 'AB10', inward: '1AU'});
  assert.equal(normalisePostcode('M1 1AA').key, 'M11AA');
  assert.equal(normalisePostcode('EC1A 1BB').display, 'EC1A 1BB');
  assert.equal(normalisePostcode('GIR 0AA').display, 'GIR 0AA');
  for (const v of ['', null, 'AB10', 'ABC 123', '12345', 'AB10 1AUU', "x'; DROP"]) assert.equal(normalisePostcode(v), null, String(v));
});

test('names are compared as word sets: order, middle names, spelling and transliteration', () => {
  const t = tokens;
  assert.ok(nameScore(t('John Smith'), t('John Smith')) >= 0.99);
  assert.ok(nameScore(t('Smith John'), t('John Smith')) >= 0.99, 'reversed');
  assert.ok(nameScore(t('John Smith'), t('John Michael Smith')) >= 0.95, 'missing middle name');
  assert.ok(nameScore(t('John Michael Smith'), t('John Smith')) >= 0.95, 'extra middle name');
  assert.ok(nameScore(t('Jon Smyth'), t('John Smith')) >= 0.88, 'spelling');
  assert.ok(nameScore(t('Muhammad Ali'), t('Mohammed Aly')) >= 0.95, 'transliteration');
  assert.ok(nameScore(t('José Núñez'), t('Jose Nunez')) >= 0.99, 'accents');
  assert.ok(nameScore(t('John Smith'), t('Smith')) < 0.7, 'a lone surname does not match a full name');
  assert.ok(nameScore(t('John Smith'), t('Maria Garcia')) < 0.6);
  assert.ok(nameScore(t('Acme Trading Ltd'), t('Acme Trading')) >= 0.99, 'company suffix ignored');
});

test('screenSubject: DOB and country adjust the score but are never required; low quality aliases weigh less', () => {
  const groups = groupRows([
    row('A1', ['Omar'], 'Shishani', {'Name type': 'Alias', 'Alias strength': 'Low quality a.k.a', 'D.O.B': '11/01/1986', 'Address Country': 'Syria'}),
    row('A1', ['Omar', 'Al'], 'Shishani', {'D.O.B': '11/01/1986', 'Address Country': 'Syria'}),
    row('B2', ['Ivan'], 'Petrov', {'D.O.B': 'dd/mm/1970'}),
    row('C3', [], 'TARIQ GIDAR GROUP (TGG)', {'Designation Type': 'Entity'}),
  ]);
  assert.equal(groups.length, 3);
  const hit = screenSubject({name: 'Omar Shishani'}, groups);
  assert.equal(hit.length, 1);
  assert.equal(hit[0].id, 'A1');
  assert.ok(hit[0].score >= 0.88);
  assert.equal(screenSubject({name: 'Ivan Petrov'}, groups, {threshold: 0.88}).length, 1, 'no DOB needed');
  const wrongYear = screenSubject({name: 'Ivan Petrov', dob: '1985-05-05'}, groups)[0];
  assert.ok(!wrongYear || wrongYear.score < 0.95, 'a different year lowers the score');
  assert.equal(screenSubject({name: 'Ivan Petrov', dob: '1970-02-02'}, groups)[0].score, 1);
  assert.equal(screenSubject({name: 'Tariq Gidar Group'}, groups).length, 1, 'entities too');
  assert.equal(screenSubject({name: 'Sarah Jones'}, groups).length, 0);
  assert.deepEqual(searchPrefixes('Omar Al-Shishani'), ['omar', 'shis']);
  assert.deepEqual(searchPrefixes('李 伟'), []);
  assert.deepEqual(searchTerms('Bo Ng'), {prefixes: [], exact: ['bo', 'ng']});
  assert.deepEqual(searchTerms('Li Wu Chen'), {prefixes: ['chen'], exact: ['li', 'wu']});
});

test('parseCsv handles quotes, doubled quotes, line breaks in fields and a BOM', () => {
  const rows = parseCsv('﻿a,b\r\n"x, y","say ""hi"""\n"two\nlines",z\n');
  assert.deepEqual(rows, [{a: 'x, y', b: 'say "hi"'}, {a: 'two\nlines', b: 'z'}]);
  assert.deepEqual(parseCsv(''), []);
});

// ---- Analytics client ----
const res = (body, status = 200) => ({status, ok: status < 300, json: async () => body, text: async () => (typeof body === 'string' ? body : JSON.stringify(body))});
function analyticsFake(opts = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    url = String(url); calls.push({url, headers: init.headers});
    if (opts.down) throw new Error('network');
    if (url.endsWith('/orgs')) return res({data: {orgs: opts.orgs || [{orgId: '555', orgName: 'Guild'}]}});
    if (url.includes('/views?CONFIG')) return res({data: {views: [{viewId: 'V9', viewName: 'UK-Sanctions-List'}]}});
    if (url.endsWith('/views/V9')) return res({data: {views: {viewId: 'V9', lastModifiedTime: opts.modified === undefined ? String(Date.now() - 3600e3) : opts.modified}}});
    if (url.includes('/bulk/workspaces/W1/data?CONFIG=')) {
      const sql = JSON.parse(decodeURIComponent(url.split('CONFIG=')[1])).sqlQuery;
      calls.sql = (calls.sql || []).concat(sql);
      return res({data: {jobId: /COUNT/.test(sql) ? 'JC' : 'JS'}});
    }
    if (url.includes('/exportjobs/J') && url.endsWith('/data')) return res(/JC/.test(url) ? 'n\n' + (opts.count ?? 58609) : toCsv(opts.rows || []));
    if (url.includes('/exportjobs/J')) { calls.polls = (calls.polls || 0) + 1; return res({data: {jobCode: opts.jobCode || (calls.polls < 2 ? 1002 : 1004)}}); }
    return res({}, 404);
  };
  return {fetchImpl, calls};
}
const client = (fake, extra = {}) => createAnalyticsClient({getAnalyticsHeaders: async () => ({Authorization: 'Zoho-oauthtoken x'}), apiDomain: 'https://analyticsapi.zoho.eu', workspaceId: 'W1',
  fetchImpl: fake.fetchImpl, sleep: async () => {}, ...extra});

test('Analytics: finds the organisation, runs SQL as an export job, reads the view', async () => {
  const fake = analyticsFake({rows: [row('A1', ['Omar'], 'Shishani')]});
  const a = client(fake);
  const rows = await a.sql({}, 'SELECT 1');
  assert.equal(rows[0]['Name 6'], 'Shishani');
  assert.ok(fake.calls.some(c => c.headers && c.headers['ZANALYTICS-ORGID'] === '555'));
  const v = await a.view({}, 'UK-Sanctions-List');
  assert.equal(v.id, 'V9');
  assert.ok(v.lastModified instanceof Date);
});
test('Analytics: an unclear organisation, an error status, a failed job and a timeout all raise AnalyticsError', async () => {
  await assert.rejects(client(analyticsFake({orgs: [{orgId: '1'}, {orgId: '2'}]})).sql({}, 'x'), AnalyticsError);
  await assert.rejects(client(analyticsFake({down: true}), {orgId: '1'}).sql({}, 'x'), AnalyticsError);
  await assert.rejects(client(analyticsFake({jobCode: 1003}), {orgId: '1'}).sql({}, 'x'), /failed/);
  let t = 0;
  await assert.rejects(client(analyticsFake({jobCode: 1002}), {orgId: '1', now: () => (t += 20000)}).sql({}, 'x'), /timed out/);
});

// ---- Risk checks ----
const POSTCODES = {Flood: new Map(), Subsidence: new Map()};
function creatorFake(state) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    url = String(url); calls.push(url);
    if (state.down) throw new Error('network');
    const report = decodeURIComponent(url.split('/report/')[1].split('?')[0]), kind = report.includes('Flood') ? 'Flood' : 'Subsidence';
    const criteria = decodeURIComponent(url.split('criteria=')[1] || '');
    if (state.broken) return res({code: 2945, message: 'Invalid report'}, 400);
    // Creator only accepts 200, 500 or 1000 here (found against the real API).
    if (!['200', '500', '1000'].includes(new URL(url).searchParams.get('max_records'))) return res({code: 9250, message: "Please enter a valid input for 'max_records' key."}, 400);
    if (criteria === 'Active==true') return res(state.empty ? {code: 9280, message: 'No records found matching the given criteria.'} : {code: 3000, data: [{Postcode_Key: 'XX', List_Date: '2024-01-01'}]});
    const key = /"([A-Z0-9 ]+)"/.exec(criteria)[1].replace(/ /g, ''), hit = state[kind] && state[kind][key];
    return hit ? res({code: 3000, data: [{Postcode_Key: key, Outcome: hit}]}) : res({code: 9280, message: 'No records found matching the given criteria.'}, 400);
  };
  return {fetchImpl, calls};
}
function riskWorld({env = {}, analytics = {}, creator = {}} = {}) {
  const cfg = loadConfig({PORTAL_RISK_SANCTIONS: 'true', PORTAL_RISK_FLOOD: 'true', PORTAL_RISK_SUBSIDENCE: 'true', ANALYTICS_ORG_ID: '555', ANALYTICS_WORKSPACE_ID: 'W1', ...env}).risk;
  const a = analyticsFake(analytics), c = creatorFake(creator);
  const fetchImpl = (url, init) => (String(url).includes('analyticsapi') ? a.fetchImpl(url, init) : c.fetchImpl(url, init));
  const risk = createRiskChecks({config: cfg, getAnalyticsHeaders: async () => ({}), getCreatorHeaders: async () => ({}), fetchImpl, sleep: async () => {}});
  return {risk, a, c};
}
const INS = (extra = {}) => ({insNamedPeopleCover: false, insNamedPeople: [], insPremisesAddress: {postcode: 'AB10 1AU'}, ...extra});
const screen = (w, extra = {}) => w.risk.screen({req: {}, ins: INS(), country: 'United Kingdom', contact: null, input: {firstName: 'Nia', lastName: 'New'}, premises: true, ...extra});

test('a clean screening: every check passes, nothing blocks, one audit row per check', async () => {
  const w = riskWorld({analytics: {rows: [row('A1', ['Omar'], 'Shishani')]}});
  const r = await screen(w);
  assert.deepEqual(r.results, []);
  assert.equal(r.ran, true);
  assert.deepEqual(r.audits.map(a => [a.check, a.result]), [['Sanctions', 'Clear'], ['Flood', 'Clear'], ['Subsidence', 'Clear']]);
  assert.match(r.audits[0].dataVersion, /list loaded .* 58609 rows/);
  assert.match(r.audits[0].screenedAt, /\+00:00$/);
  assert.equal(r.audits[0].inputsHash.length, 64);
  assert.ok(!r.audits.some(a => JSON.stringify(a).includes('Nia')) === false, 'subject names the person for staff');
});
test('a sanctions match is a REFER whose customer wording never mentions sanctions', async () => {
  const w = riskWorld({analytics: {rows: [row('A1', ['Nia'], 'New', {'Regime Name': 'Secret regime'})]}});
  const r = await screen(w);
  assert.equal(r.results.length, 1);
  assert.equal(r.results[0].status, 'REFER');
  assert.equal(r.results[0].customerMessage, 'We cannot complete this online. Please contact the Guild on 01332 224830.');
  assert.equal(r.riskMessage, r.results[0].customerMessage);
  assert.ok(!/sanction|list|match/i.test(JSON.stringify(r.results.map(x => x.customerMessage)) + r.riskMessage), 'nothing customer-facing says sanctions');
  assert.equal(r.audits[0].result, 'Potential match');
  assert.match(r.audits[0].detail, /"id":"A1"/);
});
test('named employees and subcontractors are screened too', async () => {
  const w = riskWorld({env: {PORTAL_RISK_FLOOD: 'false', PORTAL_RISK_SUBSIDENCE: 'false'}, analytics: {rows: [row('B2', ['Ada'], 'Lee')]}});
  const r = await screen(w, {ins: INS({insNamedPeopleCover: true, insNamedPeople: [{type: 'employee', firstName: 'Ada', lastName: 'Lee'}, {type: 'subcontractor', firstName: 'Bo', lastName: 'Ng'}]})});
  assert.deepEqual(r.audits.map(a => [a.subject, a.result]), [['Buyer: Nia New', 'Clear'], ['Employee: Ada Lee', 'Potential match'], ['Subcontractor: Bo Ng', 'Clear']]);
});
test('sanctions fails closed: Analytics down, stale data, too few rows, a truncated result, an unscreenable name', async () => {
  const cases = [
    [{analytics: {down: true}}, /could not be reached/], [{analytics: {modified: String(Date.now() - 5 * 86400e3)}}, /out of date/],
    [{analytics: {modified: ''}}, /no last-modified/], [{analytics: {count: 120}}, /too few rows/], [{analytics: {jobCode: 1003}}, /failed/],
  ];
  for (const [opts, why] of cases) {
    const r = await screen(riskWorld({env: {PORTAL_RISK_FLOOD: 'false', PORTAL_RISK_SUBSIDENCE: 'false'}, ...opts}));
    assert.equal(r.results[0].status, 'REFER', String(why));
    assert.equal(r.results[0].code, 'RISK_CHECK_UNAVAILABLE');
    assert.match(r.results[0].customerMessage, /could not finish our checks/);
    assert.equal(r.audits[0].result, 'Error');
    assert.match(r.audits[0].detail, why);
  }
  const w = riskWorld({env: {PORTAL_RISK_FLOOD: 'false', PORTAL_RISK_SUBSIDENCE: 'false'}});
  const r = await screen(w, {input: {firstName: '李', lastName: '伟'}});
  assert.equal(r.audits[0].result, 'Error');
  assert.match(r.audits[0].detail, /could not be screened automatically/);
  assert.equal(w.a.calls.sql, undefined, 'no query is sent for a name that cannot be screened');
});
test('a repeat screening is served from the cache, an error is not cached', async () => {
  const w = riskWorld({env: {PORTAL_RISK_FLOOD: 'false', PORTAL_RISK_SUBSIDENCE: 'false'}});
  await screen(w); await screen(w);
  assert.equal(w.a.calls.sql.filter(q => !/COUNT/.test(q)).length, 1);
  const bad = riskWorld({env: {PORTAL_RISK_FLOOD: 'false', PORTAL_RISK_SUBSIDENCE: 'false'}, analytics: {down: true}});
  await screen(bad); await screen(bad);
  assert.ok(bad.a.calls.length > 2);
});
test('the candidate query is built only from safe letters and digits', async () => {
  const w = riskWorld({env: {PORTAL_RISK_FLOOD: 'false', PORTAL_RISK_SUBSIDENCE: 'false'}});
  await screen(w, {input: {firstName: "Robert'); DROP TABLE x;--", lastName: 'O"Neil'}});
  const q = w.a.calls.sql.find(s => !/COUNT/.test(s));
  assert.match(q, /LOWER\("Name 6"\) LIKE '%robe%'/);
  assert.ok(!/DROP|--|;/.test(q.replace(/;?\s*$/, '')));
});
test('flood and subsidence: a listed postcode refers or stops, an unlisted one passes, whole postcode only', async () => {
  const w = riskWorld({env: {PORTAL_RISK_SANCTIONS: 'false'}, creator: {Flood: {AB101AU: 'Refer'}, Subsidence: {AB101AU: 'Stop'}}});
  const r = await screen(w, {ins: INS({insPremisesAddress: {postcode: 'ab10 1au'}})});
  assert.deepEqual(r.audits.map(a => [a.check, a.result, a.status]), [['Flood', 'Listed postcode', 'REFER'], ['Subsidence', 'Listed postcode', 'STOP']]);
  assert.match(r.results[0].customerMessage, /review the flood risk/);
  assert.match(r.results[1].customerMessage, /cannot continue this quotation online based on the subsidence risk/);
  assert.match(r.audits[0].dataVersion, /list 2024-01-01/);
  assert.ok(w.c.calls.some(u => decodeURIComponent(u).includes('Postcode=="AB10 1AU"')));
  const other = await screen(w, {ins: INS({insPremisesAddress: {postcode: 'AB10 1AV'}})});
  assert.deepEqual(other.results, [], 'a neighbouring postcode is not listed');
});
test('flood and subsidence fail closed: Creator down, a bad report, an empty list; a bad postcode is the member to fix', async () => {
  for (const creator of [{down: true}, {broken: true}, {empty: true}]) {
    const r = await screen(riskWorld({env: {PORTAL_RISK_SANCTIONS: 'false'}, creator}));
    assert.deepEqual(r.audits.map(a => [a.check, a.result, a.code]), [['Flood', 'Error', 'RISK_CHECK_UNAVAILABLE'], ['Subsidence', 'Error', 'RISK_CHECK_UNAVAILABLE']], JSON.stringify(creator));
  }
  const w = riskWorld({env: {PORTAL_RISK_SANCTIONS: 'false'}});
  const bad = await screen(w, {ins: INS({insPremisesAddress: {postcode: 'NOT A POSTCODE'}})});
  assert.equal(bad.results[0].status, 'INCOMPLETE');
  assert.equal(bad.results[0].code, 'RISK_POSTCODE_INVALID');
  const none = await screen(w, {ins: INS({insPremisesAddress: {postcode: ''}})});
  assert.deepEqual(none.audits, [], 'no postcode yet (a quote): nothing to check');
  const noPremises = await screen(w, {premises: false});
  assert.deepEqual(noPremises.audits, [], 'no property cover: no postcode check');
});
test('everything off: nothing runs and nothing is claimed', async () => {
  const w = riskWorld({env: {PORTAL_RISK_SANCTIONS: 'false', PORTAL_RISK_FLOOD: 'false', PORTAL_RISK_SUBSIDENCE: 'false'}});
  assert.equal(w.risk.enabled, false);
  assert.deepEqual(await screen(w), {ran: false, results: [], audits: [], riskMessage: null});
  assert.equal(w.a.calls.length + w.c.calls.length, 0);
});
test('config: defaults, bounds and refusal of unsafe table names', () => {
  const d = loadConfig({}).risk;
  assert.deepEqual([d.sanctionsEnabled, d.floodEnabled, d.subsidenceEnabled], [false, false, false]);
  assert.equal(d.guildPhone, '01332 224830');
  assert.equal(d.creator.app, 'insurance-check');
  assert.equal(d.creator.subsidenceReport, 'Subsidence_Postcodes_Report');
  assert.equal(d.analytics.table, 'UK-Sanctions-List');
  assert.equal(d.maxAgeHours, 72);
  assert.throws(() => loadConfig({ANALYTICS_SANCTIONS_TABLE: 'x"; DROP TABLE y'}), /not allowed/);
});
