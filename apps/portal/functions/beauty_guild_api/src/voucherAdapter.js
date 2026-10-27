'use strict';
// The only place that knows the Guild CRM's names for bespoke vouchers, waivers and redemptions. The engine (discountEngine.js) works on
// the plain shapes below and never sees a CRM field name.
//
// UNVERIFIED: the module is called Discount_Voucher (named by the user, 27 October) but its field names could not be read yet (neither A2Z
// CRM connector reaches the Guild CRM, and the diagnostics route needs a signed-in allow-listed session on the deployed portal). Every name
// in FIELDS is a guess. Read the real ones with GET /portal/diagnostics/fields?module=Discount_Voucher and correct them HERE only; the
// tests build their rows from FIELDS, so they keep passing when a name changes.
const { HttpError } = require('./errors');

const MODULE = 'Discount_Voucher';
const FIELDS = Object.freeze({
  code: 'Name', // the code the customer or staff member types
  kind: 'Discount_Type', // 'Fixed' or 'Percentage'
  value: 'Discount_Value', // pounds for Fixed, a whole number for Percentage
  start: 'Valid_From', // yyyy-mm-dd
  end: 'Valid_Until', // yyyy-mm-dd; empty means no end
  usageLimit: 'Usage_Limit', // empty or 0 means unlimited
  used: 'Times_Used', // redemptions so far
  restriction: 'Restriction', // free text or picklist: contains "member" means members only
  allowedItems: 'Allowed_Items', // price list codes (MEM-BADGE ...), comma separated or a multi select
  contact: 'Contact', // lookup: set when the voucher was issued to one person
  status: 'Status', // anything other than 'Active' (case-insensitive) is treated as switched off; empty counts as active
});

const pence = pounds => (Number.isFinite(Number(pounds)) ? Math.round(Number(pounds) * 100) : NaN);
const text = v => String(v ?? '').trim();
const day = v => (/^\d{4}-\d{2}-\d{2}/.test(text(v)) ? text(v).slice(0, 10) : '');
const list = v =>
  (Array.isArray(v) ? v : text(v).split(/[,;]/)).map(x => text(x?.value ?? x).toUpperCase()).filter(Boolean);

// A CRM row -> the plain voucher the engine uses. Anything unreadable stays unusable rather than guessed (no kind, no value or no items
// means the voucher discounts nothing).
function toVoucher(row, fields = FIELDS) {
  const kind = /^percent/i.test(text(row[fields.kind]))
    ? 'percent'
    : /^fixed/i.test(text(row[fields.kind]))
      ? 'fixed'
      : '';
  const value = kind === 'percent' ? Number(row[fields.value]) : pence(row[fields.value]);
  const status = text(row[fields.status]);
  return {
    id: text(row.id),
    code: text(row[fields.code]).toUpperCase(),
    kind,
    value: Number.isFinite(value) && value > 0 ? value : 0,
    startDate: day(row[fields.start]),
    endDate: day(row[fields.end]),
    usageLimit: Math.max(0, Math.floor(Number(row[fields.usageLimit]) || 0)),
    used: Math.max(0, Math.floor(Number(row[fields.used]) || 0)),
    membersOnly: /member/i.test(text(row[fields.restriction])),
    allowedItems: list(row[fields.allowedItems]),
    contactId: text(row[fields.contact]?.id ?? ''),
    active: !status || /^active$/i.test(status),
  };
}

// The plain log records -> CRM rows. The names on the left are guesses like FIELDS; nothing writes them from here (the caller does).
function toCrmWaiverLog(r) {
  return {
    Contact: r.contactId || null,
    Application: r.applicationId || null,
    Item: r.sku,
    Amount: r.amountPence / 100,
    List_Price: r.listPence / 100,
    Reason: r.reason,
    Note: r.note || null,
    Staff_Member: r.appliedBy,
    Date: r.date,
  };
}
function toCrmRedemption(r) {
  return {
    Voucher: r.voucherId,
    Code: r.code,
    Contact: r.contactId || null,
    Application: r.applicationId || null,
    Amount: r.amountPence / 100,
    Items: r.skus.join(','),
    Applied_By: r.appliedBy,
    Status: 'Pending',
    Date: r.date,
  };
}

// Read-only CRM store for the engine. crm(req, path) is the portal's CRM client. Only vouchers are read from the one module that is known;
// the waiver and redemption history need log modules that do not exist yet, so those checks FAIL CLOSED (they throw) until the modules
// are built and read here: a missing log must never quietly allow a second once-only waiver.
function createCrmStore({ crm, req, fields = FIELDS }) {
  const unconfigured = what =>
    new HttpError(
      503,
      'DISCOUNT_LOG_UNAVAILABLE',
      'The ' + what + ' log is not set up, so this discount cannot be checked.',
    );
  return {
    async findVoucher(code) {
      const safe = /^[A-Za-z0-9_-]{1,40}$/.test(code) ? code : '';
      if (!safe) return null;
      const rows = await crm(
        req,
        MODULE +
          '/search?criteria=' +
          encodeURIComponent('(' + fields.code + ':equals:' + safe + ')') +
          '&fields=' +
          encodeURIComponent(['id', ...Object.values(fields)].join(',')),
      );
      const same = rows.map(r => toVoucher(r, fields)).filter(v => v.code === safe.toUpperCase());
      return same.length === 1 ? same[0] : null;
    },
    async redemptionsBy() {
      throw unconfigured('voucher redemption');
    },
    async joiningWaivers() {
      throw unconfigured('waiver');
    },
  };
}

module.exports = { MODULE, FIELDS, toVoucher, toCrmWaiverLog, toCrmRedemption, createCrmStore };
