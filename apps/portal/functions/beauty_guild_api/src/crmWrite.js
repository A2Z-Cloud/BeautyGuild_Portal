'use strict';
// Strict CRM writes for the cancellation record: a failure is an error, never swallowed, because Stripe must not be touched unless the record
// that tracks it exists. (The customer checkout's own writes are best effort in places; these are not.)
const { HttpError } = require('./errors');

function createCrmWriter({ getCrmHeaders, crmApiDomain, fetchImpl = fetch }) {
  async function send(req, method, path, payload) {
    const failed = () =>
      new HttpError(502, 'CRM_UNAVAILABLE', 'The CRM did not confirm the change. Nothing further was done.');
    let response;
    let body;
    try {
      response = await fetchImpl(crmApiDomain + '/crm/v3/' + path, {
        method,
        signal: AbortSignal.timeout(15000),
        headers: { ...(await getCrmHeaders(req)), 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: [payload] }),
      });
      body = await response.json();
    } catch {
      throw failed();
    }
    const result = body && body.data && body.data[0];
    if (!response.ok || !result || result.status !== 'success') throw failed();
    return result;
  }
  return {
    async create(req, module, record) {
      const result = await send(req, 'POST', module, record);
      if (!result.details || !result.details.id)
        throw new HttpError(502, 'CRM_UNAVAILABLE', 'The CRM did not confirm the change. Nothing further was done.');
      return String(result.details.id);
    },
    async update(req, module, id, fields) {
      await send(req, 'PUT', module + '/' + id, fields);
    },
  };
}

module.exports = { createCrmWriter };
