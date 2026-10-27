'use strict';
// The signed-in member's own £25 GTi voucher(s), read from the CRM Discount_Voucher module. Read only: Creator
// creates and voids the vouchers (docs/delivery/vouchers-phase-4-gti-voucher.md). Off unless PORTAL_VOUCHERS_ENABLED.
// The module and field API names are NOT yet verified against the Guild CRM, so they are settings, not constants.
const express = require('express');
const { HttpError } = require('./errors');
const { createCrmClient, resolveContact } = require('./records');

const DEFAULT_FIELDS = Object.freeze({
  code: 'Voucher_Code',
  contact: 'Contact',
  value: 'Value',
  validUntil: 'Valid_Until',
  status: 'Status',
});
// Status values that mean the code can still be spent. Anything else (Used, Void, Expired and so on) is shown as not usable.
const DEFAULT_ACTIVE_STATUS = 'Active';
const uri = s => encodeURIComponent(String(s));
const text = v => (v == null ? '' : String(v).trim());

// A voucher is usable when its status is the active one and its valid-until date (a CRM date, yyyy-mm-dd) has not passed.
function voucherState(status, validUntil, today, activeStatus = DEFAULT_ACTIVE_STATUS) {
  if (text(status).toLowerCase() !== activeStatus.toLowerCase()) return text(status) || 'Unknown';
  if (validUntil && String(validUntil).slice(0, 10) < today) return 'Expired';
  return 'Active';
}

function mapVoucher(row, fields, today, activeStatus) {
  const value = Number(row[fields.value]);
  const state = voucherState(row[fields.status], row[fields.validUntil], today, activeStatus);
  return {
    id: String(row.id),
    // The code is shown only while it can be spent; a spent, void or expired code is not useful to the member.
    code: state === 'Active' ? text(row[fields.code]) : null,
    value: Number.isFinite(value) ? value : null,
    validUntil: row[fields.validUntil] ? String(row[fields.validUntil]).slice(0, 10) : null,
    status: state,
    usable: state === 'Active',
  };
}

function registerVoucherRoutes(
  app,
  {
    enabled,
    getCurrentUser,
    getCrmHeaders,
    crmApiDomain,
    fetchImpl = fetch,
    module = 'Discount_Voucher',
    fields = {},
    activeStatus = DEFAULT_ACTIVE_STATUS,
    now = Date.now,
  },
) {
  const f = { ...DEFAULT_FIELDS, ...fields };
  const router = express.Router();
  const { call } = createCrmClient({ getCrmHeaders, crmApiDomain, fetchImpl });
  router.use(async (req, res, next) => {
    try {
      if (!enabled) throw new HttpError(503, 'VOUCHERS_DISABLED', 'Vouchers are not configured.');
      const user = await getCurrentUser(req);
      req.portalContact = await resolveContact(req, call, user);
      next();
    } catch (e) {
      next(e);
    }
  });
  router.get('/', async (req, res, next) => {
    try {
      const criteria = '(' + f.contact + ':equals:' + req.portalContact.id + ')';
      const rows = await call(
        req,
        module +
          '/search?criteria=' +
          uri(criteria) +
          '&fields=' +
          uri(['id', f.code, f.contact, f.value, f.validUntil, f.status].join(',')) +
          '&per_page=50',
      );
      const today = new Date(now()).toISOString().slice(0, 10);
      // Never trust the search alone: only rows that name this Contact are returned.
      const mine = rows.filter(r => String(r[f.contact]?.id ?? r[f.contact]) === String(req.portalContact.id));
      const vouchers = mine
        .map(r => mapVoucher(r, f, today, activeStatus))
        .sort((a, b) => String(b.validUntil).localeCompare(String(a.validUntil)));
      res.json({ vouchers });
    } catch (e) {
      next(e);
    }
  });
  app.use('/portal/vouchers', router);
}

module.exports = { registerVoucherRoutes, mapVoucher, voucherState, DEFAULT_FIELDS };
