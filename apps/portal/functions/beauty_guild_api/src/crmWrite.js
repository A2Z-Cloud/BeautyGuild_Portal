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
    if (!response.ok || !result || result.status !== 'success') {
      // For the log only, never the caller: the CRM's own error code and the field it names (for example INVALID_DATA and the API name of a field
      // that does not exist), so a wrong module or field name is found in one look. No token or header.
      const detail = (result && result.details) || {};
      throw Object.assign(failed(), {
        diag: {
          crmHttp: response.status,
          crmCode: String((result && result.code) || (body && body.code) || '').slice(0, 60),
          crmField: String(detail.api_name || detail.expected_data_type || '').slice(0, 80),
          crmMessage: String((result && result.message) || (body && body.message) || '').slice(0, 160),
        },
      });
    }
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
