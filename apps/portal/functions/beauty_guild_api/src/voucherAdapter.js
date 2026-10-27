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
      const hits = rows.map(r => toVoucher(r, fields)).filter(v => v.code === safe.toUpperCase());
      return hits.length === 1 ? hits[0] : null;
    },
    async redemptionsBy() {
      throw unconfigured('voucher redemption');
    },
    async joiningWaivers() {
      throw unconfigured('waiver');
    },
  };
}

module.exports = { MODULE, FIELDS, validAt, memberTypeOf, toVoucher, toCrmWaiverLog, toCrmRedemption, createCrmStore };
