'use strict';
// Phase 2a (the discount engine) and phase 3 (the additional branch coupon) of docs/delivery/vouchers-review.md.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');
const { loadConfig } = require('../src/config');
const plans = require('../src/plans');
const { world, IDS } = require('./helpers/world');
const { applyDiscounts, DiscountError, METADATA_LIMIT } = require('../src/discountEngine');
const {
  FIELDS,
  toVoucher,
  validAt,
  memberTypeOf,
  toCrmWaiverLog,
  toWaiver,
  WAIVER_FIELDS,
  REDEMPTION_FIELDS,
  createCrmStore,
} = require('../src/voucherAdapter');
const { createCreatorReader } = require('../src/creatorReports');
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
const STAFF = { type: 'staff', id: 'u-77', email: 'sam@guild.example', canWaive: true };
const STAFF_NO_WAIVE = { type: 'staff', id: 'u-78', email: 'pat@guild.example' };
const CUSTOMER = { type: 'customer', id: 'user-1' };
const TODAY = '2026-10-27';
const NOW = Date.parse('2026-10-27T12:00:00+00:00');
// The engine's clock is fixed for the tests; basket.at moves it.
const apply = (basket, opts = {}) =>
  applyDiscounts(basket, { now: () => basket.at ?? NOW, allowVouchers: true, ...opts });

// A fake CRM store with the same three methods as the real one.
function fakeStore({ vouchers = [], redemptions = [], waived = [] } = {}) {
  const calls = [];
  return {
    calls,
    async findVoucher(code) {
      calls.push(['findVoucher', code]);
      return vouchers.find(v => v.code === code) || null;
    },
    // Rows that count against a voucher: { voucherId, contactId, key }.
    async redemptions(voucherId, { contactId } = {}) {
      return redemptions.filter(r => r.voucherId === voucherId && (!contactId || r.contactId === contactId));
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
  bespoke: true,
  validFrom: Date.parse('2026-10-01T00:00:00+01:00'),
  validTo: Date.parse('2026-12-31T23:59:59+00:00'),
  usageLimit: 0,
  used: 0,
  onePerPerson: false,
  memberTypes: [],
  allowedItems: ['MEM-JOIN', 'MEM-BADGE', 'MEM-CERT', 'MEM-BRANCH', 'MEM-BUNDLE', 'MEM-STICKER'],
  contactId: '',
  active: true,
  ...over,
});
const base = (over = {}) => ({
  lines: basketLines(),
  contactId: '555',
  applicationId: 'app-1',
  memberType: 'Associate',
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
  const r = await apply(base(), {
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
  const r = await apply(base({ lines }), { referral: { code: 'ACC-0155', school: {} }, actor: CUSTOMER });
  assert.equal(r.totalDiscountPence, 0);
  assert.equal(r.metadata, '');
});

test('monthly spread: a lowered one-off line is shared over the first 12 payments, to the penny', async () => {
  const waivers = [
    { sku: 'MEM-BADGE', amountPence: 250, reason: 'Promotion' },
    { sku: 'MEM-CERT', reason: 'Goodwill Gesture' },
  ];
  const listPlan = plans.splitMonthly(basketLines(), 150);
  const r = await apply(base(), { waivers, actor: STAFF, store: fakeStore() });
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
  const r = await apply(base(), {
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
      at: '2026-10-27T12:00:00.000Z',
    },
  ]);
  const [entry] = JSON.parse(r.metadata);
  assert.equal(entry.source, 'staff_waiver');
  assert.equal(entry.reason, 'Other');
  assert.equal(entry.applied_by, 'staff:sam@guild.example');
  assert.equal(entry.code, undefined);
  const row = toCrmWaiverLog(r.waiverLogs[0], { sessionId: 'cs_test_1' });
  assert.deepEqual(row, {
    Contact: '555',
    Application: 'app-1',
    Item: 'MEM-JOIN',
    Amount: 10,
    List_Price: 10,
    Reason: 'Other',
    Note: 'Rang us twice',
    Staff_Member: 'staff:sam@guild.example',
    Date: TODAY,
    Stripe_Checkout_Session: 'cs_test_1',
  });
  assert.equal(toCrmWaiverLog(r.waiverLogs[0], { status: 'Pending' }).Status, 'Pending', 'status only when asked for');
});

test('once per person: a second waiver of the joining fee is refused and says who waived it before', async () => {
  const prior = { date: '2026-03-01', reason: 'Complaint', appliedBy: 'staff:kim', applicationId: 'old-app' };
  const waive = [{ sku: 'MEM-JOIN', reason: 'Goodwill Gesture' }];
  await assert.rejects(
    apply(base(), { waivers: waive, actor: STAFF, store: fakeStore({ waived: [prior] }) }),
    e => e.code === 'WAIVER_ALREADY_USED' && /2026-03-01, Complaint, staff:kim/.test(e.message),
  );
  // A waiver made before the current joining fee began (the person lapsed for over 30 days since) is an earlier fee's.
  const fresh = await apply(base({ joiningFeeSince: '2026-06-01' }), {
    waivers: waive,
    actor: STAFF,
    store: fakeStore({ waived: [prior] }),
  });
  assert.equal(fresh.totalDiscountPence, 1000);
  // A waiver made after it still counts.
  await refused(
    apply(base({ joiningFeeSince: '2026-02-01' }), {
      waivers: waive,
      actor: STAFF,
      store: fakeStore({ waived: [prior] }),
    }),
    'WAIVER_ALREADY_USED',
  );
  // A retry of the same application does not count against itself.
  const retry = await apply(base({ applicationId: 'old-app' }), {
    waivers: waive,
    actor: STAFF,
    store: fakeStore({ waived: [prior] }),
  });
  assert.equal(retry.totalDiscountPence, 1000);
  // A waiver of another item is not limited.
  const other = await apply(base(), {
    waivers: [{ sku: 'MEM-CERT', reason: 'Promotion' }],
    actor: STAFF,
    store: fakeStore({ waived: [prior] }),
  });
  assert.equal(other.totalDiscountPence, 400);
});

test('waiver rules: reason from the list, a note for Other, discountable items only, in the basket, a sensible amount', async () => {
  const run = (waivers, lines) => apply(base(lines ? { lines } : {}), { waivers, actor: STAFF, store: fakeStore() });
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
      apply(base({ lines }), {
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
  const r = await apply(base({ lines }), {
    code: 'spring',
    actor: STAFF,
    store: fakeStore({ vouchers: [v] }),
  });
  assert.equal(r.totalDiscountPence, 400, 'only the certificate');
  assert.equal(r.lines.find(l => l.sku === 'MEM-ASSOC-Y').totalPence, 5500);
  assert.equal(r.lines.find(l => l.sku === 'INS-IPT').totalPence, 300);
  await refused(
    apply(base({ lines: [lines[0], lines[5]] }), {
      code: 'SPRING',
      actor: STAFF,
      store: fakeStore({ vouchers: [v] }),
    }),
    'NOT_VALID',
    'nothing_to_discount',
  );
});

test('a voucher outside its dates is refused with the one message; the exact timestamps are the limits', async () => {
  const run = at => apply(base({ at }), { code: 'SPRING', actor: STAFF, store: fakeStore({ vouchers: [voucher()] }) });
  for (const [at, reason] of [
    [Date.parse('2026-09-30T23:59:59+01:00'), 'not_started'],
    [Date.parse('2027-01-01T00:00:00+00:00'), 'expired'],
  ])
    await assert.rejects(run(at), e => e.message === NOT_VALID && e.code === 'NOT_VALID' && e.detail.reason === reason);
  for (const at of [Date.parse('2026-10-01T00:00:00+01:00'), Date.parse('2026-12-31T23:59:59+00:00')])
    assert.ok((await run(at)).totalDiscountPence > 0, 'the first and last moment are inside');
  // A voucher with no end date never expires.
  const open = apply(base({ at: Date.parse('2040-01-01T00:00:00Z') }), {
    code: 'SPRING',
    actor: STAFF,
    store: fakeStore({ vouchers: [voucher({ validTo: null })] }),
  });
  assert.ok((await open).totalDiscountPence > 0);
});

test('a voucher whose usage limit is reached is refused; one below it works', async () => {
  const run = v => apply(base(), { code: 'SPRING', actor: STAFF, store: fakeStore({ vouchers: [v] }) });
  await refused(run(voucher({ usageLimit: 10, used: 10 })), 'NOT_VALID', 'limit_reached');
  await refused(run(voucher({ usageLimit: 10, used: 11 })), 'NOT_VALID', 'limit_reached');
  assert.ok((await run(voucher({ usageLimit: 10, used: 9 }))).totalDiscountPence > 0);
  assert.ok((await run(voucher({ usageLimit: 0, used: 999 }))).totalDiscountPence > 0, 'no limit');
});

test('voucher restrictions: member type, issued to one person, once per person, switched off, wrong type, unknown', async () => {
  const run = (v, over = {}, redemptions = []) =>
    apply(base(over), {
      code: 'SPRING',
      actor: STAFF,
      store: fakeStore({ vouchers: v ? [v] : [], redemptions }),
    });
  await refused(run(voucher({ memberTypes: ['Full', 'International'] })), 'NOT_VALID', 'member_type');
  assert.ok(
    (await run(voucher({ memberTypes: ['Full', 'International'] }), { memberType: 'Full' })).totalDiscountPence > 0,
  );
  assert.ok((await run(voucher({ memberTypes: [] }), { memberType: '' })).totalDiscountPence > 0, 'empty means anyone');
  await refused(run(voucher({ contactId: '999' })), 'NOT_VALID', 'other_person');
  assert.ok((await run(voucher({ contactId: '555' }))).totalDiscountPence > 0);
  const earlier = [{ voucherId: 'v1', contactId: '555', key: 'another-application' }];
  await refused(run(voucher({ onePerPerson: true }), {}, earlier), 'NOT_VALID', 'already_used');
  assert.ok(
    (await run(voucher({ onePerPerson: false }), {}, earlier)).totalDiscountPence > 0,
    'not limited to one use',
  );
  await refused(run(voucher({ active: false })), 'NOT_VALID', 'inactive');
  await refused(run(voucher({ bespoke: false })), 'NOT_VALID', 'wrong_type');
  await refused(run(voucher({ kind: '' })), 'NOT_VALID', 'unusable');
  await refused(run(null), 'NOT_VALID', 'unknown');
});

test('the store reads waivers from the CRM and redemptions from Creator, and ignores Void and Reversed ones', async () => {
  const crmPaths = [],
    creatorCalls = [];
  const W = WAIVER_FIELDS,
    R = REDEMPTION_FIELDS;
  const waiver = (status, over = {}) => ({
    id: 'w' + Math.random(),
    [W.date]: '2026-09-01',
    [W.item]: 'MEM-JOIN',
    [W.reason]: 'Complaint',
    [W.staffMember]: 'staff:kim',
    [W.application]: 'old-app',
    [W.status]: status,
    ...over,
  });
  const store = createCrmStore({
    req: {},
    crm: async (req, path) => {
      crmPaths.push(decodeURIComponent(path));
      return [waiver('Paid'), waiver('Pending'), waiver('Void')];
    },
    creator: async (req, report, criteria) => {
      creatorCalls.push([report, criteria]);
      return [
        { [R.status]: 'Used', [R.contact]: '9', [R.key]: 'k1' },
        { [R.status]: 'Reversed', [R.key]: 'k2' },
        { [R.status]: 'Reserved', [R.key]: 'k3' },
        { [R.status]: 'Applied', [R.key]: 'k4' },
        { [R.status]: 'Failed', [R.key]: 'k5' },
      ];
    },
  });
  const waived = await store.joiningWaivers('1011174000000000099');
  assert.deepEqual(
    waived.map(w => w.status),
    ['Paid', 'Pending'],
  );
  assert.deepEqual(waived[0], {
    date: '2026-09-01',
    sku: 'MEM-JOIN',
    reason: 'Complaint',
    appliedBy: 'staff:kim',
    applicationId: 'old-app',
    status: 'Paid',
  });
  assert.match(
    crmPaths[0],
    /^Waive_Logs\/search\?criteria=\(\(Contact:equals:1011174000000000099\)and\(Item:equals:MEM-JOIN\)\)/,
  );
  const counted = await store.redemptions('1011174000000000001', { contactId: '1011174000000000099' });
  assert.deepEqual(
    counted.map(c => c.key),
    ['k1', 'k3', 'k4'],
    'Reserved, Applied and Used count; Reversed and Failed are given back',
  );
  assert.deepEqual(creatorCalls[0], [
    'Voucher_Redemptions_Report',
    '(voucher == "1011174000000000001" && contact == "1011174000000000099")',
  ]);
  await store.redemptions('1011174000000000001');
  assert.equal(creatorCalls[1][1], '(voucher == "1011174000000000001")', 'for everyone');
  // Ids that are not CRM ids never reach a query, and the checks fail closed.
  await assert.rejects(store.joiningWaivers('1) or (x'), e => e.code === 'DISCOUNT_LOG_UNAVAILABLE');
  await assert.rejects(store.redemptions('1" || 1==1'), e => e.code === 'DISCOUNT_LOG_UNAVAILABLE');
  assert.equal(crmPaths.length + creatorCalls.length, 3);
  const noCreator = createCrmStore({ req: {}, crm: async () => [] });
  await assert.rejects(noCreator.redemptions('1011174000000000001'), e => e.code === 'DISCOUNT_LOG_UNAVAILABLE');
  const down = createCrmStore({
    req: {},
    crm: async () => {
      throw new Error('CRM down');
    },
    creator: async () => {
      throw new Error('Creator down');
    },
  });
  await assert.rejects(down.joiningWaivers('1011174000000000099'));
  await assert.rejects(down.redemptions('1011174000000000001'));
  // A full page of rows cannot be counted safely, so it fails closed rather than undercount.
  const full = createCrmStore({
    req: {},
    crm: async () => [],
    creator: async () => Array(200).fill({ [R.status]: 'Used' }),
  });
  await assert.rejects(full.redemptions('1011174000000000001'), e => e.code === 'DISCOUNT_LOG_UNAVAILABLE');
});

test('one use per person: a counted redemption in Creator refuses the voucher; a Reversed one does not', async () => {
  const mk = status =>
    createCrmStore({
      req: {},
      crm: async () => [],
      creator: async () => [{ [REDEMPTION_FIELDS.status]: status, [REDEMPTION_FIELDS.key]: 'another-application' }],
    });
  const run = status =>
    apply(base({ contactId: '1011174000000000099' }), {
      code: 'SPRING',
      actor: STAFF,
      store: { ...mk(status), findVoucher: async () => voucher({ id: '1011174000000000001', onePerPerson: true }) },
    });
  await refused(run('Reserved'), 'NOT_VALID', 'already_used');
  await refused(run('Applied'), 'NOT_VALID', 'already_used');
  assert.ok((await run('Reversed')).totalDiscountPence > 0);
  assert.ok((await run('Failed')).totalDiscountPence > 0);
});

test('a retry or double click makes the same redemption key and never uses the voucher twice', async () => {
  const first = await apply(base(), { code: 'SPRING', actor: STAFF, store: fakeStore({ vouchers: [voucher()] }) });
  const again = await apply(base(), { code: 'SPRING', actor: STAFF, store: fakeStore({ vouchers: [voucher()] }) });
  const [rec] = first.redemptions;
  assert.equal(rec.status, 'Reserved');
  assert.match(rec.key, /^[0-9a-f]{32}$/);
  assert.equal(again.redemptions[0].key, rec.key);
  const other = await apply(base({ applicationId: 'app-2' }), {
    code: 'SPRING',
    actor: STAFF,
    store: fakeStore({ vouchers: [voucher()] }),
  });
  assert.notEqual(other.redemptions[0].key, rec.key, 'another application is another redemption');
  // The usage limit counts Reserved and Applied rows, but a row with this very key is this application's own and does not count twice.
  const held = [{ voucherId: 'v1', contactId: '555', key: rec.key }];
  const limit1 = voucher({ usageLimit: 1 });
  assert.ok(
    (await apply(base(), { code: 'SPRING', actor: STAFF, store: fakeStore({ vouchers: [limit1], redemptions: held }) }))
      .totalDiscountPence > 0,
    'the retry still gets its own use',
  );
  await refused(
    apply(base({ applicationId: 'app-2' }), {
      code: 'SPRING',
      actor: STAFF,
      store: fakeStore({ vouchers: [limit1], redemptions: held }),
    }),
    'NOT_VALID',
    'limit_reached',
  );
  // The voucher's own counter alone (kept by Creator) also stops a new application.
  await refused(
    apply(base({ applicationId: 'app-3' }), {
      code: 'SPRING',
      actor: STAFF,
      store: fakeStore({ vouchers: [voucher({ usageLimit: 3, used: 3 })] }),
    }),
    'NOT_VALID',
    'limit_reached',
  );
});

test('vouchers are gated: nothing is reserved unless redemption is switched on, and an application reference is needed', async () => {
  const store = fakeStore({ vouchers: [voucher()] });
  await assert.rejects(
    applyDiscounts(base(), { now: () => NOW, code: 'SPRING', actor: STAFF, store }),
    e => e.code === 'VOUCHERS_DISABLED' && e.status === 503,
  );
  assert.deepEqual(store.calls, [], 'the CRM is not even asked');
  await refused(apply(base({ applicationId: '' }), { code: 'SPRING', actor: STAFF, store }), 'INVALID_REQUEST');
  // Referral and waivers are not behind the voucher switch.
  const r = await applyDiscounts(base(), {
    now: () => NOW,
    waivers: [{ sku: 'MEM-CERT', reason: 'Promotion' }],
    actor: STAFF,
    store,
  });
  assert.equal(r.totalDiscountPence, 400);
});

test('a waiver needs the staff capability; a staff member without it can still apply a voucher, a customer can do neither', async () => {
  const waive = [{ sku: 'MEM-CERT', reason: 'Goodwill Gesture' }];
  await refused(apply(base(), { waivers: waive, actor: STAFF_NO_WAIVE, store: fakeStore() }), 'NOT_PERMITTED');
  await refused(
    apply(base(), { waivers: waive, actor: { ...CUSTOMER, canWaive: true }, store: fakeStore() }),
    'NOT_PERMITTED',
  );
  await refused(
    apply(base(), { waivers: waive, actor: { type: 'staff', id: 'x', canWaive: 'yes' }, store: fakeStore() }),
    'NOT_PERMITTED',
  );
  const voucherOnly = await apply(base(), {
    code: 'SPRING',
    actor: STAFF_NO_WAIVE,
    store: fakeStore({ vouchers: [voucher()] }),
  });
  assert.ok(voucherOnly.totalDiscountPence > 0);
  const ok = await apply(base(), { waivers: waive, actor: STAFF, store: fakeStore() });
  assert.equal(ok.waiverLogs[0].at, new Date(NOW).toISOString(), 'who, what, why and when');
});

test('a code that matches two active vouchers is not valid, is logged, and an inactive twin is ignored', async () => {
  const rowFor = (id, active) => ({
    id,
    [FIELDS.code]: ' spring ',
    [FIELDS.type]: 'Bespoke Generic',
    [FIELDS.method]: 'Fixed Amount',
    [FIELDS.value]: '5',
    [FIELDS.active]: active,
    [FIELDS.appliesTo]: ['Extension'],
  });
  const logged = [];
  const storeFor = rows => createCrmStore({ req: {}, crm: async () => rows, log: e => logged.push(e) });
  assert.equal(await storeFor([rowFor('1', true), rowFor('2', true)]).findVoucher('SPRING'), null);
  assert.deepEqual(logged, [{ event: 'duplicate_voucher_code', code: 'SPRING', voucherIds: ['1', '2'] }]);
  assert.equal((await storeFor([rowFor('1', false), rowFor('2', true)]).findVoucher('SPRING')).id, '2');
  assert.equal(
    (await storeFor([rowFor('1', false)]).findVoucher('SPRING')).active,
    false,
    'a lone inactive one says inactive',
  );
  assert.equal(logged.length, 1);
  // The engine normalises what is typed.
  const v = voucher({ code: 'SPRING' });
  assert.ok(
    (await apply(base(), { code: '  spring ', actor: STAFF, store: fakeStore({ vouchers: [v] }) })).totalDiscountPence >
      0,
  );
});

test('voucher values: a percentage must be above 0 and at most 100, a fixed amount above 0; 15 means 15%', () => {
  const v = (method, value) => toVoucher({ id: '1', [FIELDS.method]: method, [FIELDS.value]: value });
  assert.equal(v('Percentage', 15).value, 15);
  assert.equal(v('Percentage', '100.00').value, 100);
  for (const bad of [0, -5, 100.01, 150, 'x', null]) assert.equal(v('Percentage', bad).value, 0, String(bad));
  assert.equal(v('Fixed Amount', 12.5).value, 1250);
  for (const bad of [0, -1, 'x', null]) assert.equal(v('Fixed Amount', bad).value, 0, String(bad));
});

test('the Creator reader asks the report with the criteria, treats an empty report as none, and fails on anything else', async () => {
  const seen = [];
  const reader = body =>
    createCreatorReader({
      getCreatorHeaders: async () => ({ Authorization: 'c' }),
      creatorApiDomain: 'https://creator.example.test',
      creatorAccountOwner: 'owner',
      creatorAppLinkName: 'app',
      fetchImpl: async url => {
        seen.push(url);
        return { ok: true, json: async () => body };
      },
    });
  assert.deepEqual(await reader({ code: 3000, data: [{ a: 1 }] })({}, 'Voucher_Redemptions_Report', '(a == "1")'), [
    { a: 1 },
  ]);
  assert.ok(
    seen[0].startsWith('https://creator.example.test/creator/v2.1/data/owner/app/report/Voucher_Redemptions_Report?'),
  );
  assert.ok(seen[0].endsWith('criteria=' + encodeURIComponent('(a == "1")')));
  assert.deepEqual(await reader({ code: 9280 })({}, 'r', 'c'), []);
  await assert.rejects(reader({ code: 2945 })({}, 'r', 'c'), e => e.status === 502);
});

test('a fixed voucher is shared down the basket until used up; a percentage takes its share of each allowed line', async () => {
  const fixed = await apply(base(), {
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
  const pct = await apply(base(), {
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
      key: pct.redemptions[0].key,
      status: 'Reserved',
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
  const entries = JSON.parse(pct.metadata);
  assert.ok(entries.every(e => e.source === 'voucher' && e.code === 'SPRING' && e.voucher_id === 'v1'));
});

test('a voucher and a referral code can share a basket, each on its own line, and a waiver on a free line is refused', async () => {
  const v = voucher({ allowedItems: ['MEM-CERT'], value: 300 });
  const r = await apply(base(), {
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
    apply(base(), {
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
    apply(base(), { code: 'SPRING', actor: CUSTOMER, store: fakeStore({ vouchers: [voucher()] }) }),
    'NOT_PERMITTED',
  );
  await refused(
    apply(base(), {
      waivers: [{ sku: 'MEM-CERT', reason: 'Complaint' }],
      actor: CUSTOMER,
      store: fakeStore(),
    }),
    'NOT_PERMITTED',
  );
  await refused(apply(base(), { actor: undefined }), 'NOT_PERMITTED');
  await refused(apply(base(), { actor: { type: 'robot', id: 'x' } }), 'NOT_PERMITTED');
  await refused(apply(base(), { actor: { type: 'staff' } }), 'NOT_PERMITTED');
});

test('the additional branch is never lowered: the line keeps its price and the discount goes to a coupon', async () => {
  const r = await apply(base(), {
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
    apply(base(), {
      waivers: [{ sku: 'MEM-BRANCH', amountPence: 1501, reason: 'Promotion' }],
      actor: STAFF,
      store: fakeStore(),
    }),
    'INVALID_WAIVER',
  );
  // A voucher over the branch price is capped at it.
  const capped = await apply(base(), {
    code: 'SPRING',
    actor: STAFF,
    store: fakeStore({ vouchers: [voucher({ value: 9000, allowedItems: ['MEM-BRANCH'] })] }),
  });
  assert.equal(capped.branchDiscount.discountPence, 1500);
});

test('the metadata value stays within Stripe’s 500 characters, dropping detail before refusing', async () => {
  const skus = ['MEM-JOIN', 'MEM-BRANCH', 'MEM-BUNDLE', 'MEM-CERT', 'MEM-BADGE', 'MEM-STICKER'];
  const lines = skus.map(s => line(null, s, s, 1000));
  const who = { type: 'staff', id: 'u', email: 'a.very.long.staff.address@guild.example', canWaive: true };
  const r = await apply(base({ lines, contactId: '' }), {
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

test('the adapter keeps every CRM field name in one place', async () => {
  // Shaped like the example record GR0001, with the expected Voucher_Code field added.
  const row = {
    id: '123',
    [FIELDS.code]: ' spring ',
    [FIELDS.type]: 'Bespoke Generic',
    [FIELDS.method]: 'Percentage',
    [FIELDS.value]: '25',
    [FIELDS.validFrom]: '2026-08-03T09:00:00+01:00',
    [FIELDS.validTo]: '2026-08-31T15:00:00+01:00',
    [FIELDS.maxUses]: '5',
    [FIELDS.used]: 2,
    [FIELDS.active]: true,
    [FIELDS.onePerPerson]: true,
    [FIELDS.memberTypes]: ['Associate', 'Full'],
    [FIELDS.appliesTo]: ['Courses', 'Membership'],
    [FIELDS.contact]: { id: '555' },
  };
  assert.deepEqual(toVoucher(row), {
    id: '123',
    code: 'SPRING',
    bespoke: true,
    kind: 'percent',
    value: 25,
    validFrom: Date.parse('2026-08-03T09:00:00+01:00'),
    validTo: Date.parse('2026-08-31T15:00:00+01:00'),
    usageLimit: 5,
    used: 2,
    active: true,
    onePerPerson: true,
    memberTypes: ['Associate', 'Full'],
    allowedItems: ['MEM-JOIN'],
    contactId: '555',
  });
  const v = over => toVoucher({ ...row, ...over });
  assert.equal(v({ [FIELDS.method]: 'Fixed Amount', [FIELDS.value]: '12.50' }).value, 1250);
  assert.equal(v({ [FIELDS.active]: false }).active, false);
  assert.equal(v({ [FIELDS.type]: 'Personal £25 GTI' }).bespoke, false);
  assert.equal(v({ [FIELDS.validTo]: null }).validTo, null, 'empty means no end');
  assert.equal(toVoucher({ id: '1' }).value, 0, 'an unreadable voucher discounts nothing');
  // Applies_To_Type: Membership is the joining fee only, Extension the five extras, Courses nothing.
  assert.deepEqual(v({ [FIELDS.appliesTo]: ['Courses'] }).allowedItems, []);
  assert.deepEqual(v({ [FIELDS.appliesTo]: ['Extension'] }).allowedItems, [
    'MEM-BRANCH',
    'MEM-BUNDLE',
    'MEM-CERT',
    'MEM-BADGE',
    'MEM-STICKER',
  ]);
  assert.deepEqual(
    v({ [FIELDS.appliesTo]: ['Membership', 'Extension'], [FIELDS.items]: ['MEM-JOIN', 'MEM-CERT', 'ACC-STD'] })
      .allowedItems,
    ['MEM-JOIN', 'MEM-CERT'],
    'Applicable_Items narrows, and never widens',
  );
  assert.deepEqual(v({ [FIELDS.appliesTo]: [] }).allowedItems, []);
  // Dates: an offset is exact; no offset is Europe/London wall-clock time (summer 15:00 is 14:00 UTC, winter 15:00 is 15:00 UTC).
  assert.equal(v({ [FIELDS.validTo]: '2026-08-31 15:00:00' }).validTo, Date.parse('2026-08-31T14:00:00Z'));
  assert.equal(v({ [FIELDS.validTo]: '2026-12-01 15:00:00' }).validTo, Date.parse('2026-12-01T15:00:00Z'));
  assert.equal(validAt(v({}), Date.parse('2026-08-31T14:00:00Z')), '');
  assert.equal(validAt(v({}), Date.parse('2026-08-31T14:00:01Z')), 'expired');
  assert.equal(validAt(v({}), Date.parse('2026-08-03T07:59:59Z')), 'not_started');
  assert.equal(memberTypeOf('full_salon'), 'Full');
  assert.equal(memberTypeOf('full_non_salon'), 'Full');
  assert.equal(memberTypeOf('associate'), 'Associate');
  assert.equal(memberTypeOf('international'), 'International');
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
  assert.ok(
    asked[0].startsWith(
      'Discount_Voucher/search?criteria=' + encodeURIComponent('(' + FIELDS.code + ':equals:SPRING)'),
    ),
  );
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

async function withStaffApp(state, request, fn, billing = 'annual', env = {}) {
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
      ...env,
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

test('checkout: a voucher is refused (503) while PORTAL_VOUCHER_REDEMPTION_ENABLED is off, and applied when it is on', async () => {
  const request = () => ({
    actor: STAFF,
    applicationId: 'app-9',
    code: 'SPRING',
    store: fakeStore({ vouchers: [voucher({ allowedItems: ['MEM-JOIN'] })] }),
  });
  const off = world();
  await withStaffApp(off, request(), async ({ pay }) => {
    const r = await pay();
    assert.equal(r.status, 503, JSON.stringify(r.body));
    assert.equal(off.stripePosts.length, 0);
  });
  const on = world();
  await withStaffApp(
    on,
    request(),
    async ({ quote, pay }) => {
      const q = await quote();
      assert.equal(q.discounts[0].source, 'voucher');
      assert.equal((await pay()).status, 201);
      assert.equal(JSON.parse(on.stripePosts[0].params.get('metadata[discounts]'))[0].voucher_id, 'v1');
    },
    'annual',
    { PORTAL_VOUCHER_REDEMPTION_ENABLED: 'true' },
  );
});
