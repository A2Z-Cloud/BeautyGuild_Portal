'use strict';
// The only place that knows the Guild CRM's names for bespoke vouchers, waivers and redemptions. The engine (discountEngine.js) works on
// the plain shapes below and never sees a CRM field name.
//
// Discount_Voucher names are the real API names (from the CRM field list and the example record GR0001, 27 October), EXCEPT:
//  - `code`: the module's `Name` is an auto number (GR0001), an internal id nobody types. There is no customer-typed code field yet; A2Z is
//    expected to add a unique text field `Voucher_Code` (case-insensitive). UNCONFIRMED until it exists.
//  - Percentage: `Discount_Value` is assumed to be the percent itself (50 means 50%). UNCONFIRMED.
//  - The log fields in toCrmWaiverLog and toCrmRedemption are guesses: those modules do not exist yet.
const { HttpError } = require('./errors');

const MODULE = 'Discount_Voucher';
const FIELDS = Object.freeze({
  code: 'Voucher_Code', // the code staff type (to be added by A2Z)
  type: 'Voucher_Type', // 'Bespoke Generic' or 'Personal £25 GTI'; only the first is accepted here
  method: 'Discount_Method', // 'Fixed Amount' or 'Percentage'
  value: 'Discount_Value', // Currency: pounds for Fixed Amount; the percent for Percentage
  validFrom: 'Valid_From', // DateTime
  validTo: 'Valid_To', // DateTime; empty means no end
  maxUses: 'Maximum_Total_Uses', // empty or 0 means unlimited
  used: 'Current_Usage_Count',
  active: 'Active', // Boolean; false is switched off. "Used up" comes from the count, there is no used or void status
  onePerPerson: 'One_Use_Per_Person', // Boolean
  memberTypes: 'Eligible_Member_Types', // multiselect: Associate, International, Full, GTI Student. Empty means anyone
  appliesTo: 'Applies_To_Type', // multiselect: Courses, Membership, Extension
  items: 'Applicable_Items', // optional multiselect of price list codes that narrows appliesTo further (not in the CRM yet)
  contact: 'Assigned_Contact', // lookup: set when the voucher was issued to one person
});
const BESPOKE = 'Bespoke Generic';
// Applies_To_Type -> the price list codes it covers. Membership is the joining fee only, because the membership fee is never
// discountable. Courses (GTi) is parked and covers nothing, so a voucher with only Courses discounts nothing and is refused.
const APPLIES = Object.freeze({
  MEMBERSHIP: ['MEM-JOIN'],
  EXTENSION: ['MEM-BRANCH', 'MEM-BUNDLE', 'MEM-CERT', 'MEM-BADGE', 'MEM-STICKER'],
  COURSES: [],
});

const pence = pounds => (Number.isFinite(Number(pounds)) ? Math.round(Number(pounds) * 100) : NaN);
const text = v => String(v ?? '').trim();
const list = v => (Array.isArray(v) ? v : text(v).split(/[,;]/)).map(x => text(x?.value ?? x)).filter(Boolean);
const same = (a, b) => text(a).toLowerCase() === text(b).toLowerCase();

// A CRM DateTime -> milliseconds. Zoho sends an offset ("2026-08-31T15:00:00+01:00"), which is exact. A value with no offset is read as
// Europe/London wall-clock time.
function londonOffsetMs(ms) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London',
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(new Date(ms))
      .map(p => [p.type, p.value]),
  );
  return (
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) -
    Math.floor(ms / 1000) * 1000
  );
}
function timestamp(v) {
  const t = text(v);
  if (!t) return null;
  if (/(Z|[+-]\d\d:?\d\d)$/i.test(t)) return Number.isFinite(Date.parse(t)) ? Date.parse(t) : NaN;
  const naive = Date.parse(t.replace(' ', 'T') + (t.length <= 10 ? 'T00:00:00Z' : 'Z'));
  return Number.isFinite(naive) ? naive - londonOffsetMs(naive - londonOffsetMs(naive)) : NaN;
}
// Is the voucher inside its dates at this moment? The ONE place the date rule lives: exact timestamps today (a voucher ending "31 Aug
// 15:00" stops at 15:00). If the Guild wants "to the end of that day", change validTo here.
function validAt(voucher, nowMs) {
  if (voucher.validFrom !== null && nowMs < voucher.validFrom) return 'not_started';
  if (voucher.validTo !== null && nowMs > voucher.validTo) return 'expired';
  return '';
}

// The portal's membership levels -> the CRM's Eligible_Member_Types values.
const MEMBER_TYPE = Object.freeze({
  associate: 'Associate',
  full_non_salon: 'Full',
  full_salon: 'Full',
  international: 'International',
});
const memberTypeOf = level => MEMBER_TYPE[level] || '';

// A CRM row -> the plain voucher the engine uses. Anything unreadable stays unusable rather than guessed (no method, no value or no
// items means the voucher discounts nothing; an unreadable date refuses the voucher).
function toVoucher(row, fields = FIELDS) {
  const kind = same(row[fields.method], 'Percentage')
    ? 'percent'
    : same(row[fields.method], 'Fixed Amount')
      ? 'fixed'
      : '';
  const value = kind === 'percent' ? Number(row[fields.value]) : pence(row[fields.value]);
  const covered = new Set(list(row[fields.appliesTo]).flatMap(a => APPLIES[a.toUpperCase()] || []));
  const narrow = list(row[fields.items]).map(c => c.toUpperCase());
  return {
    id: text(row.id),
    code: text(row[fields.code]).toUpperCase(),
    bespoke: same(row[fields.type], BESPOKE),
    kind,
    value: Number.isFinite(value) && value > 0 ? value : 0,
    validFrom: timestamp(row[fields.validFrom]),
    validTo: timestamp(row[fields.validTo]),
    usageLimit: Math.max(0, Math.floor(Number(row[fields.maxUses]) || 0)),
    used: Math.max(0, Math.floor(Number(row[fields.used]) || 0)),
    active: row[fields.active] === true || same(row[fields.active], 'true'),
    onePerPerson: row[fields.onePerPerson] === true || same(row[fields.onePerPerson], 'true'),
    memberTypes: list(row[fields.memberTypes]),
    allowedItems: [...covered].filter(c => !narrow.length || narrow.includes(c)),
    contactId: text(row[fields.contact]?.id ?? ''),
  };
}

// The Waive_Logs module (CRM, created 28 October). Real API names from the field list. Status values are expected to be Pending, Paid and
// Void; a Void waiver (the checkout was abandoned) does not count against the once-per-person limit.
const WAIVER_MODULE = 'Waive_Logs';
const WAIVER_FIELDS = Object.freeze({
  contact: 'Contact', // lookup
  application: 'Application', // single line
  item: 'Item', // picklist of price list codes
  amount: 'Amount', // currency
  listPrice: 'List_Price', // currency
  reason: 'Reason', // picklist
  note: 'Note',
  staffMember: 'Staff_Member', // single line
  date: 'Date',
  session: 'Stripe_Checkout_Session',
  status: 'Status', // picklist
});
// Voucher redemptions live in Creator (Voucher_Redemptions_Report). Contact and voucher are the CRM ids as text. Creator creates a Used
// row when the payment succeeds and marks it Reversed on a refund or cancellation; only Used counts.
const REDEMPTION_REPORT = 'Voucher_Redemptions_Report';
const REDEMPTION_FIELDS = Object.freeze({
  contact: 'contact',
  voucher: 'voucher',
  status: 'status', // 'Used' or 'Reversed'
  date: 'redemption_date',
});
const CRM_ID = /^\d{10,25}$/;

// The plain waiver record -> the CRM row. Nothing writes it from here: the caller does, once the Stripe session exists (sessionId).
function toCrmWaiverLog(r, { sessionId = '' } = {}, f = WAIVER_FIELDS) {
  return {
    [f.contact]: r.contactId || null,
    [f.application]: r.applicationId || null,
    [f.item]: r.sku,
    [f.amount]: r.amountPence / 100,
    [f.listPrice]: r.listPence / 100,
    [f.reason]: r.reason,
    [f.note]: r.note || null,
    [f.staffMember]: r.appliedBy,
    [f.date]: r.date,
    [f.session]: sessionId || null,
    [f.status]: 'Pending',
  };
}
// A CRM waiver row -> the plain shape the engine compares (date, reason, who, application). Void ones are not returned.
function toWaiver(row, f = WAIVER_FIELDS) {
  return {
    date: text(row[f.date]).slice(0, 10),
    sku: text(row[f.item]).toUpperCase(),
    reason: text(row[f.reason]),
    appliedBy: text(row[f.staffMember]),
    applicationId: text(row[f.application]),
    status: text(row[f.status]),
  };
}

// Read-only store for the engine. crm(req, path) is the portal's CRM client; creator(req, report, criteria) reads a Creator report and
// returns its rows. Vouchers and waivers come from the CRM, redemptions from Creator. Both history checks FAIL CLOSED: if the source cannot
// be read (or no Creator reader is supplied) they throw, so a missing log never quietly allows a second once-only waiver or voucher use.
function createCrmStore({
  crm,
  creator,
  req,
  fields = FIELDS,
  waiverFields = WAIVER_FIELDS,
  redemptionFields = REDEMPTION_FIELDS,
}) {
  const unavailable = what =>
    new HttpError(
      503,
      'DISCOUNT_LOG_UNAVAILABLE',
      'The ' + what + ' cannot be checked right now, so this discount cannot be applied.',
    );
  const id = (value, what) => {
    if (!CRM_ID.test(String(value))) throw unavailable(what);
    return String(value);
  };
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
      const hits = rows.map(r => toVoucher(r, fields)).filter(v => v.code === safe.toUpperCase());
      return hits.length === 1 ? hits[0] : null;
    },
    // How many times this person has redeemed this voucher (Creator rows with status Used; Reversed ones are given back).
    async redemptionsBy(voucherId, contactId) {
      if (!creator) throw unavailable('voucher redemption history');
      const f = redemptionFields;
      const rows = await creator(
        req,
        REDEMPTION_REPORT,
        '(' +
          f.voucher +
          ' == "' +
          id(voucherId, 'voucher') +
          '" && ' +
          f.contact +
          ' == "' +
          id(contactId, 'person') +
          '")',
      );
      return rows.filter(r => same(r[f.status], 'Used')).length;
    },
    // This person's earlier waivers of the joining fee that still count (not Void).
    async joiningWaivers(contactId) {
      const f = waiverFields;
      const rows = await crm(
        req,
        WAIVER_MODULE +
          '/search?criteria=' +
          encodeURIComponent(
            '((' + f.contact + ':equals:' + id(contactId, 'person') + ')and(' + f.item + ':equals:MEM-JOIN))',
          ) +
          '&fields=' +
          encodeURIComponent(['id', ...Object.values(f)].join(',')),
      );
      return rows.map(r => toWaiver(r, f)).filter(w => !same(w.status, 'Void'));
    },
  };
}

module.exports = {
  MODULE,
  FIELDS,
  WAIVER_MODULE,
  WAIVER_FIELDS,
  REDEMPTION_REPORT,
  REDEMPTION_FIELDS,
  validAt,
  memberTypeOf,
  toVoucher,
  toWaiver,
  toCrmWaiverLog,
  createCrmStore,
};
