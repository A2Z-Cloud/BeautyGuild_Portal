'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');
const { loadConfig } = require('../src/config');
const { voucherState, mapVoucher, DEFAULT_FIELDS } = require('../src/vouchers');

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
  Voucher_Code: 'GTI-ABCD-2345',
  Contact: { id: ME },
  Value: 25,
  Valid_Until: '2027-10-31',
  Status: 'Active',
  ...o,
});

test('the route is off unless switched on', async () => {
  await withApp({}, [], async get => assert.equal((await get()).status, 503));
});
test('an active voucher shows its code, value and date, and the search names this contact', async () => {
  await withApp({ PORTAL_VOUCHERS_ENABLED: 'true' }, [row()], async (get, seen) => {
    const r = await get();
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.vouchers, [
      { id: '2', code: 'GTI-ABCD-2345', value: 25, validUntil: '2027-10-31', status: 'Active', usable: true },
    ]);
    assert.ok(seen.some(u => u.includes('Discount_Voucher/search?criteria=(Contact:equals:' + ME + ')')));
  });
});
test('a void, used or expired voucher never exposes its code', async () => {
  const rows = [
    row({ id: '3', Status: 'Void' }),
    row({ id: '4', Status: 'Used' }),
    row({ id: '5', Valid_Until: '2026-10-31' }),
  ];
  await withApp({ PORTAL_VOUCHERS_ENABLED: 'true' }, rows, async get => {
    const { vouchers } = (await get()).body;
    assert.equal(vouchers.length, 3);
    for (const v of vouchers) {
      assert.equal(v.code, null);
      assert.equal(v.usable, false);
    }
    assert.deepEqual(vouchers.map(v => v.status).sort(), ['Expired', 'Used', 'Void']);
  });
});
test("another contact's voucher in the result is dropped", async () => {
  await withApp({ PORTAL_VOUCHERS_ENABLED: 'true' }, [row({ Contact: { id: '999' } })], async get => {
    assert.deepEqual((await get()).body.vouchers, []);
  });
});
test('field names and module can be set without code changes, and bad names are ignored', async () => {
  const env = {
    PORTAL_VOUCHERS_ENABLED: 'true',
    PORTAL_VOUCHER_MODULE: 'Vouchers',
    PORTAL_VOUCHER_FIELDS: JSON.stringify({ code: 'Name', status: 'bad name!' }),
  };
  await withApp(env, [row({ Name: 'XYZ' })], async (get, seen) => {
    const r = await get();
    assert.equal(r.body.vouchers[0].code, 'XYZ');
    assert.ok(seen.some(u => u.includes('Vouchers/search')));
  });
  assert.equal(loadConfig({ PORTAL_VOUCHER_FIELDS: 'not json' }).voucherFields.code, undefined);
});
test('voucherState and mapVoucher handle missing values', () => {
  assert.equal(voucherState('Active', null, '2026-11-01'), 'Active');
  assert.equal(voucherState('', null, '2026-11-01'), 'Unknown');
  assert.equal(mapVoucher({ id: 1 }, DEFAULT_FIELDS, '2026-11-01').value, null);
});
