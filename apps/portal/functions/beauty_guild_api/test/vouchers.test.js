'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');
const { loadConfig } = require('../src/config');
const { voucherState, mapVoucher } = require('../src/vouchers');

const ME = '1011174000000000001';
const NOW = Date.parse('2026-11-01T10:00:00Z');
const json = body => ({ status: 200, ok: true, json: async () => body });
async function withApp(env, rows, fn) {
  const seen = [];
  const app = createApp({
    config: loadConfig(env),
    now: () => NOW,
    getCurrentUser: async () => ({ id: 'u1', email: 'ada@example.test' }),
    getCrmHeaders: async () => ({ Authorization: 'x' }),
    fetchImpl: async url => {
      url = String(url);
      seen.push(decodeURIComponent(url));
      if (url.includes('Contacts/search')) return json({ data: [{ id: ME, Email: 'ada@example.test' }] });
      if (url.includes('/search')) return json({ data: rows });
      return json({ data: [] });
    },
  });
  const server = await new Promise(resolve => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  try {
    await fn(async () => {
      const r = await fetch('http://127.0.0.1:' + server.address().port + '/portal/vouchers');
      return { status: r.status, body: await r.json() };
    }, seen);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}
const row = o => ({
  id: '2',
  Voucher_Code: '7F15B4AE',
  Voucher_Type: 'Personal £25 GTI',
  Assigned_Contact: { id: ME },
  Discount_Value: 25,
  Valid_From: '2026-11-01T00:00:00+00:00',
  Valid_To: '2027-10-31T23:59:59+00:00',
  Active: true,
  Maximum_Total_Uses: 1,
  Current_Usage_Count: 0,
  ...o,
});

test('the route is off unless switched on', async () => {
  await withApp({}, [], async get => assert.equal((await get()).status, 503));
});
test('an active voucher shows its code, value and date, and the search names this contact, type and Active', async () => {
  await withApp({ PORTAL_VOUCHERS_ENABLED: 'true' }, [row()], async (get, seen) => {
    const r = await get();
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.vouchers, [
      {
        id: '2',
        title: '£25 Off GTi Course Voucher',
        explanation: 'Get £25 off your next GTi Course by using the discount code.',
        code: '7F15B4AE',
        value: 25,
        validFrom: '2026-11-01',
        validUntil: '2027-10-31',
        status: 'Active',
        usable: true,
      },
    ]);
    assert.ok(
      seen.some(u =>
        u.includes(
          'Discount_Voucher/search?criteria=((Assigned_Contact:equals:' +
            ME +
            ')and(Voucher_Type:equals:Personal £25 GTI)and(Active:equals:true))',
        ),
      ),
    );
  });
});
test('a used or expired voucher never exposes its code', async () => {
  const rows = [row({ id: '4', Current_Usage_Count: 1 }), row({ id: '5', Valid_To: '2026-10-31T23:59:59+00:00' })];
  await withApp({ PORTAL_VOUCHERS_ENABLED: 'true' }, rows, async get => {
    const { vouchers } = (await get()).body;
    assert.deepEqual(vouchers.map(v => v.status).sort(), ['Expired', 'Used']);
    for (const v of vouchers) {
      assert.equal(v.code, null);
      assert.equal(v.usable, false);
    }
  });
});
test('a voided, bespoke or other contact\'s voucher in the result is dropped', async () => {
  const rows = [
    row({ id: '6', Active: false }),
    row({ id: '7', Voucher_Type: 'Bespoke Generic' }),
    row({ id: '8', Assigned_Contact: { id: '999' } }),
  ];
  await withApp({ PORTAL_VOUCHERS_ENABLED: 'true' }, rows, async get => {
    assert.deepEqual((await get()).body.vouchers, []);
  });
});
test('the module name is a setting', async () => {
  await withApp({ PORTAL_VOUCHERS_ENABLED: 'true', PORTAL_VOUCHER_MODULE: 'Vouchers' }, [row()], async (get, seen) => {
    assert.equal((await get()).status, 200);
    assert.ok(seen.some(u => u.includes('Vouchers/search')));
  });
});
test('voucherState and mapVoucher handle missing values', () => {
  assert.equal(voucherState({ Active: true }, NOW), 'Active');
  assert.equal(voucherState({}, NOW), 'Void');
  const v = mapVoucher({ id: 1, Active: true }, NOW);
  assert.equal(v.value, null);
  assert.equal(v.code, null);
});
