'use strict';
// A small stateful stand-in for Zoho CRM that holds membership, insurance and accreditation drafts. Shared by crm-drafts-routes.test.js and
// staff-routes.test.js.
const JOURNEY = 'b0fd218f-9ad6-4c13-9b78-2830f3e270b0';
const ME = { id: 'cat-1', email: 'owner@example.test' };
const env = {
  PORTAL_CRM_DRAFTS_ENABLED: 'true',
  PORTAL_RECORDS_ENABLED: 'true',
  PORTAL_CRM_DRAFT_STATUS: 'Draft',
  PORTAL_CRM_DRAFT_DEAL_STAGE: 'Draft',
};
const FIELDS = [
  'Application_Status',
  'Journey_ID',
  'Last_Completed_Journey_Step',
  'Draft_State_Reference',
  'Draft_Saved_At',
  'Contact',
  'Membership',
  'Contact_Name',
  'Stage',
  'Deal_Name',
].map(api_name => ({
  api_name,
  data_type: ['Contact', 'Contact_Name', 'Membership'].includes(api_name)
    ? 'lookup'
    : api_name === 'Stage' || api_name === 'Application_Status'
      ? 'picklist'
      : 'text',
  unique: api_name === 'Journey_ID' ? { id: '1' } : undefined,
  pick_list_values: [{ actual_value: 'Draft' }],
}));

// A small stateful stand-in for Zoho CRM, recording every call.
function fakeCrm({
  contacts = [{ id: '1000000000101', Email: ME.email }],
  deals = [],
  searchLag = false,
  contactError = null,
} = {}) {
  const calls = [],
    store = { Insurance_Policy: [], Deals: deals, Notes: [] };
  let seq = 2000000000000;
  const json = (body, status = 200) => ({ status, ok: status < 300, json: async () => body });
  const fetchImpl = async (url, opts = {}) => {
    const u = decodeURIComponent(String(url)),
      method = opts.method || 'GET',
      body = opts.body ? JSON.parse(opts.body) : null;
    calls.push({ method, u, body });
    if (u.includes('/Contacts/search')) return json({ data: searchLag ? [] : contacts });
    if (method === 'POST' && /\/crm\/v3\/Contacts$/.test(u)) {
      if (contactError) return json({ data: [{ status: 'error', code: contactError }] }, 400);
      const c = { id: String(++seq), ...body.data[0] };
      contacts.push(c);
      return json({ data: [{ status: 'success', details: { id: c.id } }] });
    }
    if (method === 'GET' && /\/crm\/v3\/Contacts\/\d+/.test(u)) {
      const c = contacts.find(x => u.includes('/Contacts/' + x.id));
      return json({ data: c ? [c] : [] });
    }
    if (u.includes('/settings/fields')) return json({ fields: FIELDS });
    const m = u.match(/\/crm\/v3\/([A-Za-z_]+)(?:\/(\d+))?(\/Notes)?(?:\/search|\?|$)/);
    const mod = m && m[1],
      id = m && m[2];
    if (u.includes('/search') && store[mod]) {
      const j = u.match(/Journey_ID:equals:([0-9a-f-]+)/);
      return json({ data: store[mod].filter(r => !j || r.Journey_ID === j[1]) });
    }
    if (method === 'POST' && m && m[3]) {
      const note = { id: String(++seq), ...body.data[0] };
      store.Notes.push(note);
      return json({ data: [{ status: 'success', details: { id: note.id } }] });
    }
    if (method === 'POST' && store[mod]) {
      const row = body.data[0];
      if (store[mod].some(r => r.Journey_ID === row.Journey_ID))
        return json({ data: [{ status: 'error', code: 'DUPLICATE_DATA' }] }, 400);
      const rec = { id: String(++seq), ...row };
      store[mod].push(rec);
      return json({ data: [{ status: 'success', details: { id: rec.id } }] });
    }
    if (method === 'PUT' && mod === 'Notes') {
      const n = store.Notes.find(x => x.id === id);
      Object.assign(n, body.data[0]);
      return json({ data: [{ status: 'success' }] });
    }
    if (method === 'PUT' && store[mod]) {
      Object.assign(
        store[mod].find(x => x.id === id),
        body.data[0],
      );
      return json({ data: [{ status: 'success' }] });
    }
    if (method === 'GET' && mod === 'Notes') return json({ data: [store.Notes.find(x => x.id === id)] });
    if (method === 'GET' && store[mod] && id) {
      const r = store[mod].find(x => x.id === id);
      return json({ data: r ? [r] : [] });
    }
    return json({ data: [] });
  };
  return { fetchImpl, calls, store };
}
module.exports = { JOURNEY, ME, env, FIELDS, fakeCrm };
