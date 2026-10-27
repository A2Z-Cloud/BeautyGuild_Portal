'use strict';
// The discount engine (phase 2a of docs/delivery/vouchers-review.md). Route-agnostic: no Express, no sign-in, no CRM or Stripe writes. The
// caller passes in WHO is acting (actor) and a store to read from, and gets back the priced lines, the `discounts` metadata and the log
// records to write. A staff route, the customer checkout and the payment link can all call it and price the same.
//
// applyDiscounts(basket, { referral, code, waivers, actor, store, now }) -> result
//   basket   { lines, contactId, applicationId, memberType, joiningFeeSince, today }
//              lines: [{ item, sku, name, quantity, unitPence, totalPence, term, priceId, interval, ... }] already priced, BEFORE any
//              monthly split (plans.splitMonthly), so a monthly plan spreads the discount over the first 12 payments exactly.
//              joiningFeeSince: the day the current joining fee started to apply (previous expiry + 30 days), or '' for a new person.
//   referral a school code already checked by discounts.check: { code, school }. Takes the joining fee off.
//   code     a bespoke voucher code (staff only).
//   waivers  [{ sku, amountPence?, reason, note? }] (staff only). No amount means the whole line.
//   actor    { type: 'customer' | 'staff', id, name?, email? }
//   store    { findVoucher(code), redemptionsBy(voucherId, contactId), joiningWaivers(contactId) } (see voucherAdapter.js)
// Throws DiscountError when anything is refused; nothing is partly applied.
const { NOT_VALID } = require('./discounts');
const { validAt } = require('./voucherAdapter');

const JOIN = 'MEM-JOIN';
const BRANCH = 'MEM-BRANCH';
// What the Guild allows to be discounted (answer 7). Never the membership fee, accreditation, insurance, IPT, the named employee fee or
// the admin fee. The £5 adjustment fee joins this list when it is in the catalogue.
const DISCOUNTABLE = Object.freeze(new Set([JOIN, BRANCH, 'MEM-BUNDLE', 'MEM-CERT', 'MEM-BADGE', 'MEM-STICKER']));
const REASONS = Object.freeze(['Goodwill Gesture', 'Complaint', 'Upgrade', 'Promotion', 'Payment Problem', 'Other']);
const ACTOR_TYPES = new Set(['customer', 'staff']);
// Stripe's metadata value limit. The `discounts` key is one JSON value.
const METADATA_LIMIT = 500;

class DiscountError extends Error {
  // code: NOT_VALID, NOT_PERMITTED, INVALID_WAIVER, NOT_DISCOUNTABLE, NOT_IN_BASKET, WAIVER_ALREADY_USED, TOO_MANY_DISCOUNTS ...
  // detail is for staff and logs (for example why a voucher failed); the message is what the caller may show.
  constructor(code, message, detail) {
    super(message);
    this.name = 'DiscountError';
    this.code = code;
    this.status = 422;
    this.detail = detail;
  }
}
const notValid = reason => new DiscountError('NOT_VALID', NOT_VALID, { reason });

const money = pence => (pence / 100).toFixed(2);
const day = ms => new Date(ms).toISOString().slice(0, 10);

function describeActor(actor) {
  if (!actor || !ACTOR_TYPES.has(actor.type))
    throw new DiscountError('NOT_PERMITTED', 'Who is applying the discount is not known.');
  const ref = String(actor.email || actor.name || actor.id || '').trim();
  if (actor.type === 'staff' && !ref)
    throw new DiscountError('NOT_PERMITTED', 'The staff member applying the discount is not known.');
  return { staff: actor.type === 'staff', appliedBy: actor.type === 'staff' ? 'staff:' + ref : 'customer' };
}

async function applyDiscounts(basket, { referral = null, code = '', waivers = [], actor, store, now = Date.now } = {}) {
  const who = describeActor(actor);
  const today = basket.today || day(now());
  const rows = basket.lines.map(line => ({
    line,
    sku: String(line.sku || '').toUpperCase(),
    list: line.totalPence,
    off: 0,
  }));
  const room = r => r.list - r.off;
  const entries = [],
    waiverLogs = [],
    redemptions = [];
  const take = (row, pence, entry) => {
    row.off += pence;
    entries.push({ ...entry, sku: row.sku, list_amount: money(row.list), amount: money(pence) });
  };
  const rowFor = sku => rows.find(r => r.sku === sku);
  if ((code || waivers.length) && !who.staff)
    throw new DiscountError('NOT_PERMITTED', 'Only Guild staff can apply a voucher or a waiver.');

  // 1. The school referral code: the joining fee, in full. A fee that is not being charged leaves nothing to take off.
  if (referral) {
    const join = rowFor(JOIN);
    if (join && room(join) > 0)
      take(join, room(join), {
        source: 'referral',
        code: referral.code,
        school_id: referral.school?.id || '',
        accreditation_id: referral.school?.accreditationId || '',
        applied_by: who.appliedBy,
      });
  }

  // 2. A bespoke voucher (staff only). Every refusal shows the same message; the reason is only in `detail`.
  if (code) {
    const typed = String(code).trim().toUpperCase();
    const voucher = typed ? await store.findVoucher(typed) : null;
    if (!voucher) throw notValid('unknown');
    // Only generic vouchers: the personal £25 GTi voucher is a GTi course voucher (phase 4) and never discounts a membership.
    if (!voucher.bespoke) throw notValid('wrong_type');
    if (!voucher.active) throw notValid('inactive');
    if (!voucher.kind || !voucher.value) throw notValid('unusable');
    const outside = validAt(voucher, now());
    if (outside) throw notValid(outside);
    if (voucher.usageLimit && voucher.used >= voucher.usageLimit) throw notValid('limit_reached');
    // Eligible member types: the level being bought or held. An empty list means anyone.
    if (voucher.memberTypes.length && !voucher.memberTypes.includes(basket.memberType || ''))
      throw notValid('member_type');
    if (voucher.contactId && voucher.contactId !== String(basket.contactId || '')) throw notValid('other_person');
    if (voucher.onePerPerson && basket.contactId && (await store.redemptionsBy(voucher.id, basket.contactId)) > 0)
      throw notValid('already_used');
    // Percent: of each allowed line. Fixed: shared down the basket until it is used up. The joining fee comes first, as in the basket.
    const allowed = new Set(voucher.allowedItems);
    let left = voucher.kind === 'fixed' ? voucher.value : Infinity;
    const applied = [];
    for (const row of rows) {
      if (!DISCOUNTABLE.has(row.sku) || !allowed.has(row.sku) || room(row) <= 0 || left <= 0) continue;
      const wanted = voucher.kind === 'percent' ? Math.round((row.list * Math.min(voucher.value, 100)) / 100) : left;
      const pence = Math.min(wanted, room(row));
      if (pence <= 0) continue;
      if (voucher.kind === 'fixed') left -= pence;
      take(row, pence, { source: 'voucher', code: voucher.code, voucher_id: voucher.id, applied_by: who.appliedBy });
      applied.push({ sku: row.sku, pence });
    }
    if (!applied.length) throw notValid('nothing_to_discount');
    redemptions.push({
      kind: 'voucher_redemption',
      voucherId: voucher.id,
      code: voucher.code,
      contactId: basket.contactId || '',
      applicationId: basket.applicationId || '',
      amountPence: applied.reduce((t, a) => t + a.pence, 0),
      skus: applied.map(a => a.sku),
      appliedBy: who.appliedBy,
      date: today,
    });
  }

  // 3. Staff waivers: a reason from the list, discountable items only, the joining fee once per person.
  const seen = new Set();
  for (const w of waivers) {
    const sku = String(w?.sku || '').toUpperCase();
    if (!DISCOUNTABLE.has(sku)) throw new DiscountError('NOT_DISCOUNTABLE', 'That item cannot be discounted.', { sku });
    if (seen.has(sku)) throw new DiscountError('INVALID_WAIVER', 'Waive each item once.', { sku });
    seen.add(sku);
    if (!REASONS.includes(w.reason))
      throw new DiscountError('INVALID_WAIVER', 'Choose a reason from the list.', { sku });
    const note = String(w.note || '')
      .trim()
      .slice(0, 300);
    if (w.reason === 'Other' && !note)
      throw new DiscountError('INVALID_WAIVER', 'Say why, because the reason is Other.', { sku });
    const row = rowFor(sku);
    if (!row) throw new DiscountError('NOT_IN_BASKET', 'That item is not in this basket.', { sku });
    if (room(row) <= 0) throw new DiscountError('NOT_IN_BASKET', 'That item is already free.', { sku });
    const pence = w.amountPence === undefined || w.amountPence === null ? room(row) : w.amountPence;
    if (!Number.isInteger(pence) || pence <= 0 || pence > room(row))
      throw new DiscountError(
        'INVALID_WAIVER',
        'The amount must be more than nothing and no more than the item costs.',
        { sku },
      );
    if (sku === JOIN && pence !== room(row))
      throw new DiscountError('INVALID_WAIVER', 'The joining fee is waived in full.', { sku });
    if (sku === JOIN && basket.contactId) {
      // Once per person, per joining fee: a waiver made before the current fee began (before the old membership lapsed for good) is
      // an earlier fee's, and a retry of this very application does not count against itself.
      const earlier = (await store.joiningWaivers(basket.contactId)).filter(
        p =>
          String(p.applicationId || '') !== String(basket.applicationId || '') &&
          (!basket.joiningFeeSince || String(p.date) > basket.joiningFeeSince),
      );
      if (earlier.length) {
        const p = earlier[0];
        throw new DiscountError(
          'WAIVER_ALREADY_USED',
          'The joining fee has already been waived for this person (' +
            [p.date, p.reason, p.appliedBy].filter(Boolean).join(', ') +
            ').',
          { previous: p },
        );
      }
    }
    take(row, pence, { source: 'staff_waiver', code: '', reason: w.reason, applied_by: who.appliedBy });
    waiverLogs.push({
      kind: 'waiver_log',
      contactId: basket.contactId || '',
      applicationId: basket.applicationId || '',
      sku,
      amountPence: pence,
      listPence: row.list,
      reason: w.reason,
      note,
      appliedBy: who.appliedBy,
      date: today,
    });
  }

  // Price the lines. A line that is free is dropped. A one-off line that is part-discounted is lowered (inline, one unit, so a monthly plan
  // can split it). The ADDITIONAL BRANCH is never lowered: it recurs, so the lower price would repeat at renewal. Its discount goes to a
  // one-year Stripe coupon instead (branchCoupon.js) and the line keeps its full price.
  const lines = [],
    breakdown = [];
  let branch = null;
  for (const row of rows) {
    const { line } = row;
    breakdown.push({
      item: line.item,
      sku: row.sku,
      name: line.name,
      listPence: row.list,
      discountPence: row.off,
      chargedPence: row.sku === BRANCH ? row.list : row.list - row.off,
      viaCoupon: row.sku === BRANCH && row.off > 0,
    });
    if (!row.off) lines.push(line);
    else if (row.sku === BRANCH) {
      lines.push(line);
      branch = {
        sku: BRANCH,
        listPence: row.list,
        discountPence: row.off,
        entries: entries.filter(e => e.sku === BRANCH),
      };
    } else if (row.list - row.off > 0) {
      lines.push({
        ...line,
        name: line.name + (line.quantity > 1 && !line.fee ? ' x ' + line.quantity : ''),
        quantity: 1,
        origQuantity: line.origQuantity ?? line.quantity,
        priceId: null,
        interval: null,
        unitPence: row.list - row.off,
        totalPence: row.list - row.off,
      });
    }
  }
  return {
    lines,
    breakdown,
    entries,
    metadata: discountsMetadata(entries),
    branchDiscount: branch,
    redemptions,
    waiverLogs,
    totalDiscountPence: rows.reduce((t, r) => t + r.off, 0),
  };
}

// The single `discounts` metadata value: a JSON array, one entry per discounted item
// { source, code, reason, applied_by, amount, sku, list_amount } plus the school ids for a referral and the voucher id for a voucher. Stripe's value limit is
// 500 characters, so when a big basket would not fit, optional detail is dropped (list price and ids, then the reason) before it is refused. The log
// records keep everything. '' when there is nothing to record.
function discountsMetadata(entries) {
  if (!entries.length) return '';
  const strip = (list, keys) =>
    list.map(e => Object.fromEntries(Object.entries(e).filter(([k, v]) => v !== '' && !keys.includes(k))));
  const optional = ['list_amount', 'school_id', 'accreditation_id'];
  for (const drop of [[], optional, [...optional, 'reason'], [...optional, 'reason', 'applied_by']]) {
    const json = JSON.stringify(strip(entries, drop));
    if (json.length <= METADATA_LIMIT) return json;
  }
  throw new DiscountError('TOO_MANY_DISCOUNTS', 'Too many discounts on one purchase. Apply fewer at once.');
}

module.exports = {
  applyDiscounts,
  DiscountError,
  discountsMetadata,
  DISCOUNTABLE,
  REASONS,
  JOIN,
  BRANCH,
  METADATA_LIMIT,
};
