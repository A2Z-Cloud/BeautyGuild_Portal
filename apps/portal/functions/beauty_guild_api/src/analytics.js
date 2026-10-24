'use strict';
// Read-only Zoho Analytics client (REST API v2) for the sanctions list. It runs a SELECT as a bulk
// export job (the only SQL route, CSV output), reads view metadata, and nothing else. Every failure
// is an AnalyticsError: callers treat that as "the check could not run" and fail closed.
class AnalyticsError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AnalyticsError';
  }
}

// RFC 4180: quoted fields, doubled quotes, line breaks inside quotes; a leading BOM is dropped.
function parseCsv(text) {
  const src = String(text || '').replace(/^﻿/, '');
  const rows = [];
  let row = [],
    field = '',
    quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [head, ...body] = rows.filter(r => r.length > 1 || r[0] !== '');
  if (!head) return [];
  return body.map(r => Object.fromEntries(head.map((h, i) => [h, r[i] === undefined ? '' : r[i]])));
}

const toDate = v => {
  if (v == null || v === '') return null;
  const n = Number(v),
    d = Number.isFinite(n) && n > 1e11 ? new Date(n) : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
};

function createAnalyticsClient({
  getAnalyticsHeaders,
  apiDomain,
  orgId = '',
  workspaceId,
  fetchImpl = fetch,
  now = Date.now,
  sleep = ms => new Promise(r => setTimeout(r, ms)),
  jobTimeoutMs = 15000,
  pollMs = 700,
}) {
  const base = apiDomain + '/restapi/v2';
  let org = orgId || null;
  async function request(req, path, { text = false } = {}) {
    let r;
    try {
      r = await fetchImpl(base + path, {
        signal: AbortSignal.timeout(12000),
        headers: { ...(await getAnalyticsHeaders(req)), ...(org ? { 'ZANALYTICS-ORGID': org } : {}) },
      });
    } catch {
      throw new AnalyticsError('Analytics could not be reached.');
    }
    if (!r.ok) throw new AnalyticsError('Analytics returned ' + r.status + '.');
    try {
      return text ? await r.text() : await r.json();
    } catch {
      throw new AnalyticsError('Analytics returned an unreadable response.');
    }
  }
  async function resolveOrg(req) {
    if (org) return org;
    const orgs = (await request(req, '/orgs'))?.data?.orgs;
    if (!Array.isArray(orgs) || orgs.length !== 1 || !orgs[0].orgId)
      throw new AnalyticsError('Analytics organisation is not set (ANALYTICS_ORG_ID).');
    org = String(orgs[0].orgId);
    return org;
  }
  const api = async (req, path, opts) => {
    await resolveOrg(req);
    return request(req, path, opts);
  };

  // SELECT -> array of {column: text}. Polls the export job until it completes or the deadline passes.
  async function sql(req, query) {
    const config = encodeURIComponent(JSON.stringify({ sqlQuery: query, responseFormat: 'csv' }));
    const jobId = (await api(req, '/bulk/workspaces/' + workspaceId + '/data?CONFIG=' + config))?.data?.jobId;
    if (!jobId) throw new AnalyticsError('Analytics did not start the query.');
    const deadline = now() + jobTimeoutMs,
      jobPath = '/bulk/workspaces/' + workspaceId + '/exportjobs/' + encodeURIComponent(jobId);
    for (;;) {
      const code = Number((await api(req, jobPath))?.data?.jobCode);
      if (code === 1004) break;
      if (code === 1003 || code === 1005) throw new AnalyticsError('The Analytics query failed.');
      if (now() >= deadline) throw new AnalyticsError('The Analytics query timed out.');
      await sleep(pollMs);
    }
    return parseCsv(await api(req, jobPath + '/data', { text: true }));
  }

  // The view's id and last-modified time, found by name (a table or query table in the workspace). The views
  // list carries the data's last-modified time (the table's own details only carry its design times).
  async function view(req, name) {
    const config = encodeURIComponent(JSON.stringify({ keyword: name, viewTypes: [0, 6] }));
    const views = (await api(req, '/workspaces/' + workspaceId + '/views?CONFIG=' + config))?.data?.views;
    const found =
      Array.isArray(views) && views.find(v => String(v.viewName || '').toLowerCase() === name.toLowerCase());
    if (!found?.viewId) throw new AnalyticsError('The sanctions table was not found in Analytics.');
    const id = String(found.viewId);
    const details = (await api(req, '/views/' + encodeURIComponent(id)))?.data;
    const v = Array.isArray(details?.views) ? details.views[0] : details?.views || details?.view || details || {};
    const pick = o => toDate(o.lastModifiedTime || o.modifiedTime || o.lastModified);
    return { id, lastModified: pick(found) || pick(v), details: v, listed: found };
  }
  const orgs = async req => (await request(req, '/orgs'))?.data?.orgs || [];
  return { sql, view, orgs, orgId: resolveOrg, api };
}

module.exports = { createAnalyticsClient, AnalyticsError, parseCsv };
