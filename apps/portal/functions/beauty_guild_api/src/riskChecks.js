'use strict';
// Insurance risk checks that run with the quote and again when the member pays:
//   Sanctions  the buyer and each named person against the UK sanctions list held in Zoho Analytics,
//   Flood and Subsidence  the premises postcode against two exception lists held in Zoho Creator.
// Every check fails closed: if one cannot run (Analytics or Creator down, data out of date, a name
// that cannot be screened) the result is REFER, never a clear result. A sanctions match is never
// described to the customer as one: they are only told to contact the Guild.
const crypto = require('node:crypto');
const {createAnalyticsClient} = require('./analytics');
const {normalisePostcode} = require('./postcode');
const {groupRows, screenSubject, searchTerms, tokens, NAME_COLUMNS} = require('./sanctionsMatch');

const CACHE_TTL = 10 * 60 * 1000, COUNT_TTL = 6 * 60 * 60 * 1000, CANDIDATE_LIMIT = 20000;
const COLUMNS = ['Unique ID', 'OFSI Group ID', ...NAME_COLUMNS, 'Name type', 'Alias strength', 'Designation Type', 'D.O.B', 'Address Country', 'Nationality(/ies)', 'Regime Name'];
const sha = text => crypto.createHash('sha256').update(text).digest('hex');
const esc = encodeURIComponent;
const clean = (v, max = 60) => String(v == null ? '' : v).trim().slice(0, max);

class CheckError extends Error {}

function createRiskChecks({config, getAnalyticsHeaders, getCreatorHeaders, fetchImpl = fetch, now = Date.now, log = () => {}, sleep = ms => new Promise(r => setTimeout(r, ms))}) {
  const c = config || {};
  const enabled = Boolean(c.sanctionsEnabled || c.floodEnabled || c.subsidenceEnabled);
  const phone = c.guildPhone || '01332 224830';
  const MESSAGE = {
    contact: 'We cannot complete this online. Please contact the Guild on ' + phone + '.',
    unavailable: 'We could not finish our checks just now. Please try again in a few minutes or contact the Guild on ' + phone + '.',
  };
  const analytics = c.sanctionsEnabled ? createAnalyticsClient({getAnalyticsHeaders, apiDomain: c.analytics.apiDomain, orgId: c.analytics.orgId,
    workspaceId: c.analytics.workspaceId, fetchImpl, now, sleep}) : null;
  const cache = new Map(), health = {};
  const retry = async fn => { try { return await fn(); } catch { await sleep(300); return fn(); } };
  const fresh = (key, ttl) => { const hit = cache.get(key); return hit && now() - hit.at < ttl ? hit.value : null; };
  const remember = (key, value) => { if (cache.size > 500) cache.clear(); cache.set(key, {at: now(), value}); return value; };

  // ---- Sanctions -----------------------------------------------------------------------------
  // The list must be recent (loaded daily from the Government) and not suspiciously small.
  async function sanctionsVersion(req) {
    const hit = fresh('sanctions-health', CACHE_TTL);
    if (hit) return hit;
    const info = await retry(() => analytics.view(req, c.analytics.table));
    if (!info.lastModified) throw new CheckError('The sanctions data has no last-modified time.');
    if (now() - info.lastModified.getTime() > c.maxAgeHours * 3600 * 1000) throw new CheckError('The sanctions data is out of date (last loaded ' + info.lastModified.toISOString() + ').');
    let count = fresh('sanctions-count', COUNT_TTL);
    if (count == null) {
      const rows = await retry(() => analytics.sql(req, 'SELECT COUNT(*) AS n FROM "' + c.analytics.table + '"'));
      count = Number(Object.values(rows[0] || {})[0]);
      if (!(count >= c.rowFloor)) throw new CheckError('The sanctions data has too few rows (' + count + ').');
      remember('sanctions-count', count);
    }
    return remember('sanctions-health', 'list loaded ' + info.lastModified.toISOString() + ', ' + count + ' rows');
  }
  const candidateSql = ({prefixes, exact}) => {
    const like = (col, p, contains) => 'LOWER("' + col + '") LIKE \'' + (contains ? '%' : '') + p + '%\'';
    const where = [...prefixes.flatMap(p => NAME_COLUMNS.map(col => like(col, p, col === 'Name 6'))), ...exact.flatMap(w => NAME_COLUMNS.map(col => 'LOWER("' + col + '") = \'' + w + '\''))];
    return 'SELECT ' + COLUMNS.map(col => '"' + col + '"').join(', ') + ' FROM "' + c.analytics.table + '" WHERE "Designation Type" <> \'Ship\' AND (' + where.join(' OR ') + ') LIMIT ' + (CANDIDATE_LIMIT + 1);
  };
  const subjectHash = s => sha(['sanctions', tokens(s.name).join(' '), clean(s.dob, 4), clean(s.country).toLowerCase()].join('|'));

  async function runSanctions(req, subjects) {
    if (!subjects.length) return [];
    const key = 'sanctions|' + sha(subjects.map(subjectHash).sort().join(','));
    const hit = fresh(key, CACHE_TTL);
    if (hit) return hit;
    const base = s => ({check: 'Sanctions', subject: s.role + ': ' + s.name, inputsHash: subjectHash(s)});
    const failed = (s, why, detail) => ({...base(s), result: 'Error', status: 'REFER', code: 'RISK_CHECK_UNAVAILABLE', customerMessage: MESSAGE.unavailable, dataVersion: '', detail: why + (detail ? ' ' + detail : '')});
    const terms = s => searchTerms(s.name), screenable = subjects.filter(s => terms(s).prefixes.length || terms(s).exact.length);
    let findings = subjects.filter(s => !screenable.includes(s)).map(s => failed(s, 'This name could not be screened automatically (no usable Latin-script words).'));
    if (screenable.length) {
      let version, groups, problem = null;
      try {
        version = await sanctionsVersion(req);
        const rows = await analytics.sql(req, candidateSql({prefixes: [...new Set(screenable.flatMap(s => terms(s).prefixes))], exact: [...new Set(screenable.flatMap(s => terms(s).exact))]}));
        if (rows.length > CANDIDATE_LIMIT) throw new CheckError('Too many candidate rows were returned.');
        groups = groupRows(rows);
      } catch (e) { problem = e; log('risk check failed', 'sanctions', e.name, e.message); }
      for (const s of screenable) {
        if (problem) { findings.push(failed(s, 'The sanctions check could not run.', problem.message)); continue; }
        const hits = screenSubject({name: s.name, dob: s.dob, country: s.country}, groups, {threshold: c.sanctionsThreshold});
        findings.push(hits.length
          ? {...base(s), result: 'Potential match', status: 'REFER', code: 'RISK_SANCTIONS_REVIEW', customerMessage: MESSAGE.contact, dataVersion: version, detail: JSON.stringify(hits.slice(0, 3)).slice(0, 2000)}
          : {...base(s), result: 'Clear', status: 'PASS', dataVersion: version, detail: ''});
      }
    }
    return findings.some(f => f.result === 'Error') ? findings : remember(key, findings);
  }

  // ---- Flood and subsidence ------------------------------------------------------------------
  async function creatorRows(req, report, criteria) {
    const url = c.creator.apiDomain + '/creator/v2.1/data/' + esc(c.creator.owner) + '/' + esc(c.creator.app) + '/report/' + esc(report) + '?field_config=all&max_records=200&criteria=' + esc(criteria);
    let r;
    try { r = await fetchImpl(url, {headers: await getCreatorHeaders(req), signal: AbortSignal.timeout(10000)}); } catch { throw new CheckError('Creator could not be reached.'); }
    const body = await r.json().catch(() => null);
    if (r.ok && body?.code === 3000 && Array.isArray(body.data)) return body.data;
    if ((body?.code === 9280 || body?.code === 3100) && /no records/i.test(String(body.message || ''))) return [];
    throw new CheckError('Creator did not return the postcode list (' + r.status + ').');
  }
  // An empty list, a wrong report name or a lost permission would otherwise look like "no postcode listed".
  async function listVersion(req, report) {
    const key = 'list|' + report, hit = fresh(key, CACHE_TTL);
    if (hit) return hit;
    const rows = await retry(() => creatorRows(req, report, 'InActive==false'));
    if (!rows.length) throw new CheckError('The postcode list is empty or unreadable.');
    return remember(key, 'list ' + clean(rows[0].List_Date || 'undated'));
  }
  async function runPostcode(req, check, report, raw, wording) {
    if (!clean(raw, 20)) return [];
    const pc = normalisePostcode(raw), subject = 'Premises: ' + (pc ? pc.display : clean(raw, 12));
    if (!pc) return [{check, subject, inputsHash: sha(check + '|' + clean(raw, 12).toUpperCase()), result: 'Error', status: 'INCOMPLETE', code: 'RISK_POSTCODE_INVALID',
      customerMessage: 'Please enter a valid UK postcode for the insured premises.', dataVersion: '', detail: 'The postcode could not be read.'}];
    const key = check + '|' + pc.key, hit = fresh(key, CACHE_TTL);
    if (hit) return hit;
    const base = {check, subject, inputsHash: sha(check + '|' + pc.key)};
    let findings;
    try {
      const version = await listVersion(req, report);
      const rows = await retry(() => creatorRows(req, report, '(InActive==false && Postcode=="' + pc.display + '")'));
      if (!rows.length) findings = [{...base, result: 'Clear', status: 'PASS', dataVersion: version, detail: ''}];
      else {
        const stop = /^stop/i.test(String(rows[0].Outcome?.display_value ?? rows[0].Outcome ?? ''));
        findings = [{...base, result: 'Listed postcode', status: stop ? 'STOP' : 'REFER', code: 'RISK_' + check.toUpperCase() + '_POSTCODE', dataVersion: version,
          customerMessage: stop ? 'We cannot continue this quotation online based on the ' + wording + ' for these premises.' : 'The Insurance team needs to review the ' + wording + ' for these premises.',
          detail: 'Postcode ' + pc.display + ' is on the ' + check.toLowerCase() + ' list (' + (stop ? 'Stop' : 'Refer') + ').'}];
      }
    } catch (e) {
      log('risk check failed', check, e.name, e.message);
      return [{...base, result: 'Error', status: 'REFER', code: 'RISK_CHECK_UNAVAILABLE', customerMessage: MESSAGE.unavailable, dataVersion: '', detail: 'The ' + check.toLowerCase() + ' check could not run. ' + e.message}];
    }
    return remember(key, findings);
  }

  // ---- Entry point ---------------------------------------------------------------------------
  // Returns {ran, results, audits, riskMessage}. results join the underwriting rules (STOP/REFER/INCOMPLETE);
  // audits are one row per check run, for the Risk_Screenings records (see insurance.js createRecords).
  async function screen({req, ins, country, contact, input = {}, premises}) {
    if (!enabled) return {ran: false, results: [], audits: [], riskMessage: null};
    const subjects = [], buyer = contact ? [contact.First_Name, contact.Last_Name].filter(Boolean).join(' ') : [input.firstName, input.lastName].map(x => clean(x)).filter(Boolean).join(' ');
    if (buyer) subjects.push({role: 'Buyer', name: buyer, dob: contact?.Date_of_Birth, country});
    for (const p of ins.insNamedPeopleCover ? ins.insNamedPeople : []) {
      const name = [p.firstName, p.lastName].filter(Boolean).join(' ');
      if (name) subjects.push({role: p.type === 'subcontractor' ? 'Subcontractor' : 'Employee', name, country});
    }
    const jobs = [];
    if (c.sanctionsEnabled) jobs.push(runSanctions(req, subjects));
    if (premises) {
      if (c.floodEnabled) jobs.push(runPostcode(req, 'Flood', c.creator.floodReport, ins.insPremisesAddress.postcode, 'flood risk'));
      if (c.subsidenceEnabled) jobs.push(runPostcode(req, 'Subsidence', c.creator.subsidenceReport, ins.insPremisesAddress.postcode, 'subsidence risk'));
    }
    const at = new Date(now()).toISOString().replace(/\.\d{3}Z$/, '+00:00');
    const audits = (await Promise.all(jobs)).flat().map(f => ({...f, screenedAt: at}));
    const results = [], seen = new Set();
    for (const a of audits) {
      if (a.status === 'PASS') continue;
      const k = a.code + '|' + a.customerMessage;
      if (!seen.has(k)) { seen.add(k); results.push({status: a.status, code: a.code, customerMessage: a.customerMessage}); }
    }
    const message = audits.find(a => a.code === 'RISK_SANCTIONS_REVIEW') || audits.find(a => a.code === 'RISK_CHECK_UNAVAILABLE');
    return {ran: audits.length > 0, results, audits, riskMessage: message ? message.customerMessage : null};
  }

  return {enabled, screen};
}

module.exports = {createRiskChecks};
