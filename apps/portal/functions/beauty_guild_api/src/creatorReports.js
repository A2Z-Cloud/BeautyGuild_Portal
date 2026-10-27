'use strict';
// A read-only Creator report reader: creator(req, report, criteria) -> rows. For the discount store (voucher redemptions live in Creator).
// Same call as schoolServices.js makes for invoices. An empty report (Creator code 9280) is an empty list; anything else wrong throws.
const { HttpError } = require('./errors');

function createCreatorReader({
  getCreatorHeaders,
  creatorApiDomain,
  creatorAccountOwner,
  creatorAppLinkName,
  fetchImpl = fetch,
}) {
  const esc = v => encodeURIComponent(String(v));
  return async function creator(req, report, criteria) {
    const path =
      '/creator/v2.1/data/' +
      esc(creatorAccountOwner) +
      '/' +
      esc(creatorAppLinkName) +
      '/report/' +
      esc(report) +
      '?field_config=all&max_records=200&criteria=' +
      esc(criteria);
    const unavailable = () => new HttpError(502, 'SERVICE_UNAVAILABLE', 'Creator records are unavailable.');
    let response;
    try {
      response = await fetchImpl(creatorApiDomain + path, {
        headers: await getCreatorHeaders(req),
        signal: AbortSignal.timeout(16000),
      });
    } catch {
      throw unavailable();
    }
    const body = await response.json().catch(() => null);
    if (body?.code === 9280) return [];
    if (!response.ok || body?.code !== 3000 || !Array.isArray(body?.data)) throw unavailable();
    return body.data;
  };
}

module.exports = { createCreatorReader };
