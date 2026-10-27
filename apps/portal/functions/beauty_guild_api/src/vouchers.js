'use strict';
// The signed-in member's own personal £25 GTi voucher(s), read from the CRM Discount_Voucher module. Read only:
// Creator creates and voids them (docs/delivery/vouchers-phase-4-gti-voucher.md). Off unless PORTAL_VOUCHERS_ENABLED.
// Field names are the real ones from the Guild CRM. Voucher_Code is a new unique text field A2Z adds to the module.
const express = require('express');
const { HttpError } = require('./errors');
const { createCrmClient, resolveContact } = require('./records');

const PERSONAL_TYPE = 'Personal £25 GTI';
const FIELDS = [
  'Voucher_Code',
  'Voucher_Type',
  'Assigned_Contact',
  'Discount_Value',
  'Valid_To',
  'Active',
  'Maximum_Total_Uses',
  'Current_Usage_Count',
];
const uri = s => encodeURIComponent(String(s));
const text = v => (v == null ? '' : String(v).trim());

// Active is a Boolean (false once voided). Used is derived from the counts. Expired is Valid_To (a DateTime) in the past.
function voucherState(row, nowMs) {
  if (row.Active !== true) return 'Void';
  const max = Number(row.Maximum_Total_Uses);
  if (Number.isFinite(max) && max > 0 && Number(row.Current_Usage_Count || 0) >= max) return 'Used';
  const end = row.Valid_To ? Date.parse(row.Valid_To) : NaN;
  if (Number.isFinite(end) && end < nowMs) return 'Expired';
  return 'Active';
}

function mapVoucher(row, nowMs) {
  const value = Number(row.Discount_Value);
  const state = voucherState(row, nowMs);
  return {
    id: String(row.id),
    // The code is shown only while it can be spent; a used, void or expired code is no use to the member.
    code: state === 'Active' ? text(row.Voucher_Code) || null : null,
    value: Number.isFinite(value) ? value : null,
    validUntil: row.Valid_To ? String(row.Valid_To).slice(0, 10) : null,
    status: state,
    usable: state === 'Active',
  };
}

function registerVoucherRoutes(
  app,
  { enabled, getCurrentUser, getCrmHeaders, crmApiDomain, fetchImpl = fetch, module = 'Discount_Voucher', now = Date.now },
) {
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
      const criteria =
        '((Assigned_Contact:equals:' +
        req.portalContact.id +
        ')and(Voucher_Type:equals:' +
        PERSONAL_TYPE +
        ')and(Active:equals:true))';
      const rows = await call(
        req,
        module + '/search?criteria=' + uri(criteria) + '&fields=' + uri(['id', ...FIELDS].join(',')) + '&per_page=50',
      );
      // Never trust the search alone: only this Contact's active personal vouchers are returned.
      const vouchers = rows
        .filter(
          r =>
            String(r.Assigned_Contact?.id) === String(req.portalContact.id) &&
            r.Voucher_Type === PERSONAL_TYPE &&
            r.Active === true,
        )
        .map(r => mapVoucher(r, now()))
        .sort((a, b) => String(b.validUntil).localeCompare(String(a.validUntil)));
      res.json({ vouchers });
    } catch (e) {
      next(e);
    }
  });
  app.use('/portal/vouchers', router);
}

module.exports = { registerVoucherRoutes, mapVoucher, voucherState, PERSONAL_TYPE };
