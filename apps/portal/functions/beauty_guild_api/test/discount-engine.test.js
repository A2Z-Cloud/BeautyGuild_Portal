'use strict';
// Phase 2a (the discount engine) and phase 3 (the additional branch coupon) of docs/delivery/vouchers-review.md.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');
const { loadConfig } = require('../src/config');
const plans = require('../src/plans');
const { world, IDS } = require('./helpers/world');
const { applyDiscounts, DiscountError, METADATA_LIMIT } = require('../src/discountEngine');
const { FIELDS, toVoucher, toCrmWaiverLog, toCrmRedemption, createCrmStore } = require('../src/voucherAdapter');
const { branchCouponPlan, createBranchCoupon } = require('../src/branchCoupon');
const { NOT_VALID } = require('../src/discounts');

const line = (item, sku, name, unitPence, quantity = 1, term = 'year_one') => ({
  item,
  sku,
  name,
  quantity,
  unitPence,
  totalPence: unitPence * quantity,
  term,
  priceId: 'price_' + sku.replace(/\W/g, '') + '00000',
  interval: null,
});
const basketLines = () => [
  line('membership_associate_annual', 'MEM-ASSOC-Y', 'Associate membership (annual)', 5500, 1, 'ongoing'),
  line('joining_fee', 'MEM-JOIN', 'Membership joining fee', 1000),
  line('membership_branch', 'MEM-BRANCH', 'Additional branch', 1500, 1, 'ongoing'),
  line('addon_badge', 'MEM-BADGE', 'Badge', 400, 2),
  line('addon_certificate', 'MEM-CERT', 'Certificate', 400),
];
const STAFF = { type: 'staff', id: 'u-77', email: 'sam@guild.example' };
const CUSTOMER = { type: 'customer', id: 'user-1' };
const TODAY = '2026-10-27';

// A fake CRM store with the same three methods as the real one.
function fakeStore({ vouchers = [], redeemed = {}, waived = [] } = {}) {
  const calls = [];
  return {
    calls,
    async findVoucher(code) {
      calls.push(['findVoucher', code]);
      return vouchers.find(v => v.code === code) || null;
    },
    async redemptionsBy(voucherId, contactId) {
      return redeemed[voucherId + ':' + contactId] || 0;
    },
    async joiningWaivers() {
      return waived;
    },
  };
}
const voucher = (over = {}) => ({
  id: 'v1',
  code: 'SPRING',
  kind: 'fixed',
  value: 500,
  startDate: '2026-10-01',
  endDate: '2026-12-31',
  usageLimit: 0,
  used: 0,
  membersOnly: false,
  allowedItems: ['MEM-JOIN', 'MEM-BADGE', 'MEM-CERT', 'MEM-BRANCH', 'MEM-BUNDLE', 'MEM-STICKER'],
  contactId: '',
  active: true,
  ...over,
});
const base = (over = {}) => ({
  lines: basketLines(),
  contactId: '555',
  applicationId: 'app-1',
  member: false,
  today: TODAY,
  ...over,
});
const refused = async (promise, code, reason) => {
  await assert.rejects(promise, e => {
    assert.ok(e instanceof DiscountError, String(e));
    assert.equal(e.code, code);
    if (reason) assert.equal(e.detail.reason, reason);
    return true;
  });
};

test('referral code: the joining fee is left out, one entry, recorded as the customer', async () => {
  const r = await applyDiscounts(base(), {
    referral: { code: 'ACC-0155', school: { id: 'S1', accreditationId: 'A1' } },
    actor: CUSTOMER,
  });
  assert.ok(!r.lines.some(l => l.sku === 'MEM-JOIN'));
  assert.equal(r.totalDiscountPence, 1000);
  assert.deepEqual(JSON.parse(r.metadata), [
    {
      source: 'referral',
      code: 'ACC-0155',
      school_id: 'S1',
      accreditation_id: 'A1',
      applied_by: 'customer',
      sku: 'MEM-JOIN',
      list_amount: '10.00',
      amount: '10.00',
    },
  ]);
  assert.deepEqual(r.waiverLogs, []);
  assert.deepEqual(r.redemptions, [], 'Creator records a referral redemption, not the engine');
});

test('a referral code with no joining fee in the basket discounts nothing and records nothing', async () => {
  const lines = basketLines().filter(l => l.sku !== 'MEM-JOIN');
  const r = await applyDiscounts(base({ lines }), { referral: { code: 'ACC-0155', school: {} }, actor: CUSTOMER });
  assert.equal(r.totalDiscountPence, 0);
  assert.equal(r.metadata, '');
});

test('monthly spread: a lowered one-off line is shared over the first 12 payments, to the penny', async () => {
  const waivers = [
    { sku: 'MEM-BADGE', amountPence: 250, reason: 'Promotion' },
    { sku: 'MEM-CERT', reason: 'Goodwill Gesture' },
  ];
  const listPlan = plans.splitMonthly(basketLines(), 150);
  const r = await applyDiscounts(base(), { waivers, actor: STAFF, store: fakeStore() });
  const badge = r.lines.find(l => l.sku === 'MEM-BADGE');
  assert.equal(badge.totalPence, 800 - 250);
  assert.equal(badge.priceId, null, 'a lowered line is inline, not the catalogue price');
  assert.equal(badge.quantity, 1);
  assert.equal(badge.origQuantity, 2);
  assert.equal(badge.name, 'Badge x 2');
  assert.ok(!r.lines.some(l => l.sku === 'MEM-CERT'), 'a free line is dropped');
  assert.equal(r.totalDiscountPence, 650);
  const split = plans.splitMonthly(r.lines, 150);
  const total = r.lines.reduce((t, l) => t + l.totalPence, 0);
  // Every payment is the rounded-up twelfth of what the customer owes, and the shares add up to it exactly.
  assert.equal(split.firstPaymentPence, Math.ceil(total / 12) + 150);
  assert.equal(
    split.lines.reduce((t, l) => t + l.monthlyPence, 0),
    Math.ceil(total / 12),
  );
  assert.equal(
    listPlan.lines.reduce((t, l) => t + l.totalPence, 0) - total,
    650,
    'the whole discount comes off the year one total',
  );
  assert.ok(split.firstPaymentPence < listPlan.firstPaymentPence);
  assert.equal(split.laterPaymentPence, listPlan.laterPaymentPence, 'payment 13 onward is untouched');
});

test('the waiver log and the metadata say who, what and why', async () => {
  const r = await applyDiscounts(base(), {
    waivers: [{ sku: 'MEM-JOIN', reason: 'Other', note: 'Rang us twice' }],
    actor: STAFF,
    store: fakeStore(),
  });
  assert.deepEqual(r.waiverLogs, [
    {
      kind: 'waiver_log',
      contactId: '555',
      applicationId: 'app-1',
      sku: 'MEM-JOIN',
      amountPence: 1000,
      listPence: 1000,
      reason: 'Other',
      note: 'Rang us twice',
      appliedBy: 'staff:sam@guild.example',
      date: TODAY,
    },
  ]);
  const [entry] = JSON.parse(r.metadata);
  assert.equal(entry.source, 'staff_waiver');
  assert.equal(entry.reason, 'Other');
  assert.equal(entry.applied_by, 'staff:sam@guild.example');
  assert.equal(entry.code, undefined);
  assert.deepEqual(toCrmWaiverLog(r.waiverLogs[0]).Staff_Member, 'staff:sam@guild.example');
});

test('once per person: a second waiver of the joining fee is refused and says who waived it before', async () => {
  const prior = { date: '2026-03-01', reason: 'Complaint', appliedBy: 'staff:kim', applicationId: 'old-app' };
  const waive = [{ sku: 'MEM-JOIN', reason: 'Goodwill Gesture' }];
  await assert.rejects(
    applyDiscounts(base(), { waivers: waive, actor: STAFF, store: fakeStore({ waived: [prior] }) }),
    e => e.code === 'WAIVER_ALREADY_USED' && /2026-03-01, Complaint, staff:kim/.test(e.message),
  );
  // A waiver made before the current joining fee began (the person lapsed for over 30 days since) is an earlier fee's.
  const fresh = await applyDiscounts(base({ joiningFeeSince: '2026-06-01' }), {
    waivers: waive,
    actor: STAFF,
    store: fakeStore({ waived: [prior] }),
  });
  assert.equal(fresh.totalDiscountPence, 1000);
  // A waiver made after it still counts.
  await refused(
    applyDiscounts(base({ joiningFeeSince: '2026-02-01' }), {
      waivers: waive,
      actor: STAFF,
      store: fakeStore({ waived: [prior] }),
    }),
    'WAIVER_ALREADY_USED',
  );
  // A retry of the same application does not count against itself.
  const retry = await applyDiscounts(base({ applicationId: 'old-app' }), {
    waivers: waive,
    actor: STAFF,
    store: fakeStore({ waived: [prior] }),
  });
  assert.equal(retry.totalDiscountPence, 1000);
  // A waiver of another item is not limited.
  const other = await applyDiscounts(base(), {
    waivers: [{ sku: 'MEM-CERT', reason: 'Promotion' }],
    actor: STAFF,
    store: fakeStore({ waived: [prior] }),
  });
  assert.equal(other.totalDiscountPence, 400);
});

test('waiver rules: reason from the list, a note for Other, discountable items only, in the basket, a sensible amount', async () => {
  const run = (waivers, lines) =>
    applyDiscounts(base(lines ? { lines } : {}), { waivers, actor: STAFF, store: fakeStore() });
  await refused(run([{ sku: 'MEM-CERT', reason: 'Because' }]), 'INVALID_WAIVER');
  await refused(run([{ sku: 'MEM-CERT', reason: 'Other' }]), 'INVALID_WAIVER');
  await refused(run([{ sku: 'MEM-CERT', reason: 'Other', note: '   ' }]), 'INVALID_WAIVER');
  await refused(run([{ sku: 'MEM-STICKER', reason: 'Complaint' }]), 'NOT_IN_BASKET');
  await refused(run([{ sku: 'MEM-CERT', amountPence: 401, reason: 'Complaint' }]), 'INVALID_WAIVER');
  await refused(run([{ sku: 'MEM-CERT', amountPence: 0, reason: 'Complaint' }]), 'INVALID_WAIVER');
  await refused(run([{ sku: 'MEM-CERT', amountPence: 1.5, reason: 'Complaint' }]), 'INVALID_WAIVER');
  await refused(run([{ sku: 'MEM-JOIN', amountPence: 400, reason: 'Complaint' }]), 'INVALID_WAIVER');
  await refused(
    run([
      { sku: 'MEM-CERT', reason: 'Complaint' },
      { sku: 'MEM-CERT', reason: 'Complaint' },
    ]),
    'INVALID_WAIVER',
  );
  for (const reason of ['Goodwill Gesture', 'Complaint', 'Upgrade', 'Promotion', 'Payment Problem'])
    assert.equal((await run([{ sku: 'MEM-CERT', reason }])).totalDiscountPence, 400);
});

test('non-discountable items: the membership fee, accreditation, insurance, IPT, employee and admin fees refuse a waiver', async () => {
  for (const sku of ['MEM-ASSOC-Y', 'ACC-STD', 'INS-CORE', 'INS-IPT', 'MEM-ADMIN', 'MEM-FULLS-Y']) {
    const lines = [...basketLines(), line(null, sku, sku, 1000, 1, 'ongoing')];
    await refused(
      applyDiscounts(base({ lines }), {
        waivers: [{ sku, reason: 'Goodwill Gesture' }],
        actor: STAFF,
        store: fakeStore(),
      }),
      'NOT_DISCOUNTABLE',
    );
  }
});

test('a voucher never touches a non-discountable item, even one it lists', async () => {
  const lines = [...basketLines(), line(null, 'INS-IPT', 'IPT', 300, 1, 'ongoing')];
  const v = voucher({ kind: 'percent', value: 100, allowedItems: ['MEM-ASSOC-Y', 'INS-IPT', 'MEM-CERT'] });
  const r = await applyDiscounts(base({ lines }), {
    code: 'spring',
    actor: STAFF,
    store: fakeStore({ vouchers: [v] }),
  });
  assert.equal(r.totalDiscountPence, 400, 'only the certificate');
  assert.equal(r.lines.find(l => l.sku === 'MEM-ASSOC-Y').totalPence, 5500);
  assert.equal(r.lines.find(l => l.sku === 'INS-IPT').totalPence, 300);
  await refused(
    applyDiscounts(base({ lines: [lines[0], lines[5]] }), {
      code: 'SPRING',
      actor: STAFF,
      store: fakeStore({ vouchers: [v] }),
    }),
    'NOT_VALID',
    'nothing_to_discount',
  );
});

test('a voucher outside its dates is refused with the one message', async () => {
  for (const [today, reason] of [
    ['2026-09-30', 'not_started'],
    ['2027-01-01', 'expired'],
  ]) {
    await assert.rejects(
      applyDiscounts(base({ today }), { code: 'SPRING', actor: STAFF, store: fakeStore({ vouchers: [voucher()] }) }),
      e => e.message === NOT_VALID && e.code === 'NOT_VALID' && e.detail.reason === reason,
    );
  }
  for (const today of ['2026-10-01', '2026-12-31'])
    assert.ok(
      (
        await applyDiscounts(base({ today }), {
          code: 'SPRING',
          actor: STAFF,
          store: fakeStore({ vouchers: [voucher()] }),
        })
      ).totalDiscountPence > 0,
      'the first and last day are inside',
    );
});

test('a voucher whose usage limit is reached is refused; one below it works', async () => {
  const run = v => applyDiscounts(base(), { code: 'SPRING', actor: STAFF, store: fakeStore({ vouchers: [v] }) });
  await refused(run(voucher({ usageLimit: 10, used: 10 })), 'NOT_VALID', 'limit_reached');
  await refused(run(voucher({ usageLimit: 10, used: 11 })), 'NOT_VALID', 'limit_reached');
  assert.ok((await run(voucher({ usageLimit: 10, used: 9 }))).totalDiscountPence > 0);
  assert.ok((await run(voucher({ usageLimit: 0, used: 999 }))).totalDiscountPence > 0, 'no limit');
});

test('voucher restrictions: members only, issued to one person, once per person, switched off, unknown', async () => {
  const run = (v, over = {}, redeemed = {}) =>
    applyDiscounts(base(over), {
      code: 'SPRING',
      actor: STAFF,
      store: fakeStore({ vouchers: v ? [v] : [], redeemed }),
    });
  await refused(run(voucher({ membersOnly: true })), 'NOT_VALID', 'members_only');
  assert.ok((await run(voucher({ membersOnly: true }), { member: true })).totalDiscountPence > 0);
  await refused(run(voucher({ contactId: '999' })), 'NOT_VALID', 'other_person');
  assert.ok((await run(voucher({ contactId: '555' }))).totalDiscountPence > 0);
  await refused(run(voucher(), {}, { 'v1:555': 1 }), 'NOT_VALID', 'already_used');
  await refused(run(voucher({ active: false })), 'NOT_VALID', 'inactive');
  await refused(run(voucher({ kind: '' })), 'NOT_VALID', 'unusable');
  await refused(run(null), 'NOT_VALID', 'unknown');
});

test('a fixed voucher is shared down the basket until used up; a percentage takes its share of each allowed line', async () => {
  const fixed = await applyDiscounts(base(), {
    code: 'SPRING',
    actor: STAFF,
    store: fakeStore({ vouchers: [voucher({ value: 1200, allowedItems: ['MEM-JOIN', 'MEM-CERT'] })] }),
  });
  assert.deepEqual(
    fixed.breakdown.filter(b => b.discountPence).map(b => [b.sku, b.discountPence]),
    [
      ['MEM-JOIN', 1000],
      ['MEM-CERT', 200],
    ],
  );
  const pct = await applyDiscounts(base(), {
    code: 'SPRING',
    actor: STAFF,
    store: fakeStore({ vouchers: [voucher({ kind: 'percent', value: 25, allowedItems: ['MEM-JOIN', 'MEM-BADGE'] })] }),
  });
  assert.deepEqual(
    pct.breakdown.filter(b => b.discountPence).map(b => [b.sku, b.listPence, b.discountPence]),
    [
      ['MEM-JOIN', 1000, 250],
      ['MEM-BADGE', 800, 200],
    ],
  );
  assert.deepEqual(pct.redemptions, [
    {
      kind: 'voucher_redemption',
      voucherId: 'v1',
      code: 'SPRING',
      contactId: '555',
      applicationId: 'app-1',
      amountPence: 450,
      skus: ['MEM-JOIN', 'MEM-BADGE'],
      appliedBy: 'staff:sam@guild.example',
      date: TODAY,
    },
  ]);
  assert.equal(toCrmRedemption(pct.redemptions[0]).Status, 'Pending');
  const entries = JSON.parse(pct.metadata);
  assert.ok(entries.every(e => e.source === 'voucher' && e.code === 'SPRING' && e.voucher_id === 'v1'));
});

test('a voucher and a referral code can share a basket, each on its own line, and a waiver on a free line is refused', async () => {
  const v = voucher({ allowedItems: ['MEM-CERT'], value: 300 });
  const r = await applyDiscounts(base(), {
    referral: { code: 'ACC-0155', school: {} },
    code: 'SPRING',
    actor: STAFF,
    store: fakeStore({ vouchers: [v] }),
  });
  assert.equal(r.totalDiscountPence, 1300);
  assert.deepEqual(
    JSON.parse(r.metadata).map(e => e.source),
    ['referral', 'voucher'],
  );
  await refused(
    applyDiscounts(base(), {
      referral: { code: 'ACC-0155', school: {} },
      waivers: [{ sku: 'MEM-JOIN', reason: 'Complaint' }],
      actor: STAFF,
      store: fakeStore(),
    }),
    'NOT_IN_BASKET',
  );
});

test('only staff may apply a voucher or a waiver; the actor must be known', async () => {
  await refused(
    applyDiscounts(base(), { code: 'SPRING', actor: CUSTOMER, store: fakeStore({ vouchers: [voucher()] }) }),
    'NOT_PERMITTED',
  );
  await refused(
    applyDiscounts(base(), {
      waivers: [{ sku: 'MEM-CERT', reason: 'Complaint' }],
      actor: CUSTOMER,
      store: fakeStore(),
    }),
    'NOT_PERMITTED',
  );
  await refused(applyDiscounts(base(), { actor: undefined }), 'NOT_PERMITTED');
  await refused(applyDiscounts(base(), { actor: { type: 'robot', id: 'x' } }), 'NOT_PERMITTED');
  await refused(applyDiscounts(base(), { actor: { type: 'staff' } }), 'NOT_PERMITTED');
});

test('the additional branch is never lowered: the line keeps its price and the discount goes to a coupon', async () => {
  const r = await applyDiscounts(base(), {
    waivers: [{ sku: 'MEM-BRANCH', amountPence: 500, reason: 'Promotion' }],
    actor: STAFF,
    store: fakeStore(),
  });
  assert.equal(r.lines.find(l => l.sku === 'MEM-BRANCH').totalPence, 1500);
  assert.equal(r.lines.find(l => l.sku === 'MEM-BRANCH').term, 'ongoing');
  assert.equal(r.branchDiscount.discountPence, 500);
  assert.equal(r.branchDiscount.listPence, 1500);
  assert.deepEqual(
    r.breakdown.find(b => b.sku === 'MEM-BRANCH'),
    {
      item: 'membership_branch',
      sku: 'MEM-BRANCH',
      name: 'Additional branch',
      listPence: 1500,
      discountPence: 500,
      chargedPence: 1500,
      viaCoupon: true,
    },
  );
  // A waiver cannot take more than the branch costs.
  await refused(
    applyDiscounts(base(), {
      waivers: [{ sku: 'MEM-BRANCH', amountPence: 1501, reason: 'Promotion' }],
      actor: STAFF,
      store: fakeStore(),
    }),
    'INVALID_WAIVER',
  );
  // A voucher over the branch price is capped at it.
  const capped = await applyDiscounts(base(), {
    code: 'SPRING',
    actor: STAFF,
    store: fakeStore({ vouchers: [voucher({ value: 9000, allowedItems: ['MEM-BRANCH'] })] }),
  });
  assert.equal(capped.branchDiscount.discountPence, 1500);
});

test('the metadata value stays within Stripe’s 500 characters, dropping detail before refusing', async () => {
  const skus = ['MEM-JOIN', 'MEM-BRANCH', 'MEM-BUNDLE', 'MEM-CERT', 'MEM-BADGE', 'MEM-STICKER'];
  const lines = skus.map(s => line(null, s, s, 1000));
  const who = { type: 'staff', id: 'u', email: 'a.very.long.staff.address@guild.example' };
  const r = await applyDiscounts(base({ lines, contactId: '' }), {
    waivers: skus.map(sku => ({ sku, reason: 'Payment Problem' })),
    actor: who,
    store: fakeStore(),
  });
  assert.ok(r.metadata.length <= METADATA_LIMIT, String(r.metadata.length));
  assert.equal(JSON.parse(r.metadata).length, 6);
  const many = Array.from({ length: 6 }, (_, i) => ({
    source: 'voucher',
    code: 'LONGCODE' + i,
    sku: 'MEM-CERT',
    amount: '4.00',
  }));
  const { discountsMetadata } = require('../src/discountEngine');
  assert.throws(
    () => discountsMetadata([...many, ...many, ...many]),
    e => e.code === 'TOO_MANY_DISCOUNTS',
  );
});

test('the adapter keeps every CRM field name in one place and fails closed on the logs that do not exist yet', async () => {
  const row = {
    id: '123',
    [FIELDS.code]: ' spring ',
    [FIELDS.kind]: 'Percentage',
    [FIELDS.value]: '25',
    [FIELDS.start]: '2026-10-01',
    [FIELDS.end]: '',
    [FIELDS.usageLimit]: '5',
    [FIELDS.used]: 2,
    [FIELDS.restriction]: 'Members only',
    [FIELDS.allowedItems]: 'MEM-BADGE, mem-cert',
    [FIELDS.contact]: { id: '555' },
    [FIELDS.status]: 'Active',
  };
  assert.deepEqual(toVoucher(row), {
    id: '123',
    code: 'SPRING',
    kind: 'percent',
    value: 25,
    startDate: '2026-10-01',
    endDate: '',
    usageLimit: 5,
    used: 2,
    membersOnly: true,
    allowedItems: ['MEM-BADGE', 'MEM-CERT'],
    contactId: '555',
    active: true,
  });
  assert.equal(toVoucher({ ...row, [FIELDS.kind]: 'Fixed', [FIELDS.value]: '12.50' }).value, 1250);
  assert.equal(toVoucher({ ...row, [FIELDS.status]: 'Inactive' }).active, false);
  assert.equal(toVoucher({ id: '1' }).value, 0, 'an unreadable voucher discounts nothing');
  const asked = [];
  const store = createCrmStore({
    req: {},
    crm: async (req, path) => {
      asked.push(path);
      return path.includes('NOPE') ? [] : [row];
    },
  });
  assert.equal((await store.findVoucher('SPRING')).id, '123');
  assert.equal(await store.findVoucher('NOPE'), null);
  assert.equal(await store.findVoucher('x)or(y'), null, 'search syntax never reaches the CRM');
  assert.equal(asked.length, 2);
  assert.ok(asked[0].startsWith('Discount_Voucher/search?criteria='));
  await assert.rejects(store.joiningWaivers('1'), e => e.code === 'DISCOUNT_LOG_UNAVAILABLE');
  await assert.rejects(store.redemptionsBy('1', '2'), e => e.code === 'DISCOUNT_LOG_UNAVAILABLE');
});

test('branchCouponPlan: once on a yearly purchase, 12 repeating months on a monthly plan, never above the branch price', () => {
  assert.deepEqual(branchCouponPlan({ discountPence: 500, listPence: 1500, monthly: false }), {
    duration: 'once',
    months: null,
    amountOffPence: 500,
    totalPence: 500,
  });
  assert.equal(branchCouponPlan({ discountPence: 9999, listPence: 1500, monthly: false }).amountOffPence, 1500);
  // £10 over 12 payments is 83p a payment: the customer really gets £9.96 and the quote says so.
  assert.deepEqual(branchCouponPlan({ discountPence: 1000, listPence: 1500, monthly: true, branchMonthlyPence: 125 }), {
    duration: 'repeating',
    months: 12,
    amountOffPence: 83,
    totalPence: 996,
  });
  // Never more than the branch's own monthly share.
  assert.equal(
    branchCouponPlan({ discountPence: 1500, listPence: 1500, monthly: true, branchMonthlyPence: 125 }).amountOffPence,
    125,
  );
  assert.equal(
    branchCouponPlan({ discountPence: 5, listPence: 1500, monthly: true, branchMonthlyPence: 125 }),
    null,
    'rounds to nothing',
  );
  assert.equal(branchCouponPlan({ discountPence: 0, listPence: 1500, monthly: false }), null);
});

test('createBranchCoupon sends a one-use fixed amount coupon with the voucher id in its metadata', async () => {
  const sent = [];
  const stripe = async (method, path, params) => {
    sent.push({ method, path, body: new URLSearchParams(params.body), key: params.key });
    return { id: 'co_test1' };
  };
  const id = await createBranchCoupon(
    stripe,
    { duration: 'repeating', months: 12, amountOffPence: 83, totalPence: 996 },
    { entries: [{ source: 'voucher', voucher_id: 'v1', code: 'SPRING' }], key: 'k1' },
  );
  assert.equal(id, 'co_test1');
  const b = sent[0].body;
  assert.equal(sent[0].path, '/coupons');
  assert.equal(sent[0].key, 'k1');
  for (const [k, v] of Object.entries({
    amount_off: '83',
    currency: 'gbp',
    duration: 'repeating',
    duration_in_months: '12',
    max_redemptions: '1',
    'metadata[voucher_id]': 'v1',
    'metadata[sku]': 'MEM-BRANCH',
  }))
    assert.equal(b.get(k), v, k);
});

// ---- the whole checkout, with a staff request injected the way the staff route (2b) will ----

async function withStaffApp(state, request, fn, billing = 'annual') {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    if (String(url).endsWith('/v1/coupons') && init.method === 'POST') {
      const body = new URLSearchParams(init.body);
      calls.push(body);
      return {
        status: 200,
        ok: true,
        json: async () => ({ id: 'co_test_' + calls.length, amount_off: Number(body.get('amount_off')) }),
      };
    }
    return state.fetchImpl(url, init);
  };
  const app = createApp({
    config: loadConfig({
      PORTAL_BILLING_ENABLED: 'true',
      PORTAL_DISCOUNTS_ENABLED: 'true',
      STRIPE_SECRET_KEY: 'sk_test_example_only',
      PORTAL_PUBLIC_ORIGIN: 'https://portal.example.test',
      PORTAL_RISK_SANCTIONS: 'false',
    }),
    getCurrentUser: async () => ({ id: 'user-1', email: 'alice@example.test' }),
    getCrmHeaders: async () => ({ Authorization: 'Bearer test' }),
    getAnalyticsHeaders: async () => ({ Authorization: 'a' }),
    getCreatorHeaders: async () => ({ Authorization: 'c' }),
    fetchImpl,
    discountRequestFor: async () => request,
  });
  const server = await new Promise(resolve => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  try {
    const base = 'http://127.0.0.1:' + server.address().port;
    const body = {
      service: 'membership',
      level: 'associate',
      branch: 'beauty',
      branches: 'hair',
      billing,
      accepted: 'yes',
      firstName: 'Nia',
      lastName: 'New',
    };
    const quote = async () =>
      (await (await fetch(base + '/portal/checkout/quote?' + new URLSearchParams({ ...body, quote: '1' }))).json())
        .quote;
    const pay = async () => {
      const r = await fetch(base + '/portal/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return { status: r.status, body: await r.json() };
    };
    await fn({ quote, pay, coupons: calls });
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}
const branchWaiver = amountPence => ({
  actor: STAFF,
  store: fakeStore(),
  waivers: [{ sku: 'MEM-BRANCH', amountPence, reason: 'Promotion' }],
});

test('checkout, yearly: a branch discount is a once coupon, the branch line stays at full price', async () => {
  const state = world({ unlinked: false });
  await withStaffApp(state, branchWaiver(500), async ({ quote, pay, coupons }) => {
    const q = await quote();
    // membership 55.00 + joining 10.00 + branch 15.00 = 80.00; the coupon takes 5.00 off the first invoice
    assert.equal(q.totalPence, 7500);
    assert.equal(q.lines.find(l => /branch/i.test(l.name)).totalPence, 1500);
    assert.deepEqual(q.discounts, [
      { source: 'staff_waiver', code: '', reason: 'Promotion', sku: 'MEM-BRANCH', amountPence: 500 },
    ]);
    assert.equal(coupons.length, 0, 'a quote makes no coupon');
    const r = await pay();
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(coupons.length, 1);
    assert.equal(coupons[0].get('amount_off'), '500');
    assert.equal(coupons[0].get('duration'), 'once');
    assert.equal(coupons[0].get('duration_in_months'), null);
    const session = state.stripePosts[0].params;
    assert.equal(session.get('discounts[0][coupon]'), 'co_test_1');
    const entries = JSON.parse(session.get('metadata[discounts]'));
    assert.deepEqual(entries[0].stripe_coupon_id, 'co_test_1');
    assert.equal(entries[0].amount, '5.00');
    assert.equal(session.get('metadata[branch_addon_amount]'), '15.00', 'the invoice line is the list price');
  });
});

test('checkout, monthly: a branch discount repeats for 12 months at the monthly share and the quote shows the real total', async () => {
  let list;
  await withStaffApp(world(), null, async ({ quote }) => (list = (await quote()).plan), 'monthly');
  const state = world();
  await withStaffApp(
    state,
    branchWaiver(1000),
    async ({ quote, pay, coupons }) => {
      const q = await quote();
      assert.equal(q.discounts[0].amountPence, 996, '12 x 83p, not the £10.00 asked for');
      assert.equal(q.plan.firstPaymentPence, list.firstPaymentPence - 83);
      assert.equal(q.plan.yearOneTotalPence, (list.firstPaymentPence - 83) * 12);
      assert.equal(q.plan.laterPaymentPence, list.laterPaymentPence, 'payment 13 onward is untouched');
      assert.equal(q.totalPence, q.plan.firstPaymentPence);
      const r = await pay();
      assert.equal(r.status, 201, JSON.stringify(r.body));
      assert.equal(coupons[0].get('amount_off'), '83');
      assert.equal(coupons[0].get('duration'), 'repeating');
      assert.equal(coupons[0].get('duration_in_months'), '12');
      assert.equal(state.stripePosts[0].params.get('discounts[0][coupon]'), 'co_test_1');
    },
    'monthly',
  );
});

test('checkout: a customer cannot reach vouchers or waivers (no request hook means referral only)', async () => {
  const state = world({ unlinked: false });
  await withStaffApp(state, null, async ({ quote }) => {
    const q = await quote();
    assert.equal(q.discounts, undefined);
  });
});

test('checkout: a refused waiver stops the quote with its own message, never a silent drop', async () => {
  const state = world({ unlinked: false });
  await withStaffApp(
    state,
    { actor: STAFF, store: fakeStore(), waivers: [{ sku: 'MEM-ASSOC-Y', reason: 'Complaint' }] },
    async ({ pay }) => {
      const r = await pay();
      assert.equal(r.status, 422);
      assert.equal(r.body.error?.code ?? r.body.code, 'NOT_DISCOUNTABLE');
      assert.equal(state.stripePosts.length, 0);
    },
  );
});

test('checkout: a waived joining fee leaves the line out and makes no coupon', async () => {
  const state = world({ unlinked: false });
  await withStaffApp(
    state,
    { actor: STAFF, store: fakeStore(), waivers: [{ sku: 'MEM-JOIN', reason: 'Goodwill Gesture' }] },
    async ({ quote, pay }) => {
      const q = await quote();
      assert.ok(!q.lines.some(l => /joining/i.test(l.name)));
      assert.equal(q.discount, undefined, 'the `discount` key is the referral code only');
      assert.equal(q.discounts[0].sku, 'MEM-JOIN');
      const r = await pay();
      assert.equal(r.status, 201, JSON.stringify(r.body));
      assert.equal(state.stripePosts[0].params.get('discounts[0][coupon]'), null, 'no coupon for a joining fee waiver');
    },
  );
});
