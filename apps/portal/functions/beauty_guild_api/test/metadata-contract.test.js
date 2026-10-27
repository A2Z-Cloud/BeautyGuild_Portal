'use strict';
// Creator reads the metadata the portal puts on Stripe. This builds every purchase type through the real code and
// checks the keys against src/metadataContract.js, so a key cannot be renamed, dropped or added without the contract
// (and the generated doc) changing with it.
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const contract = require('../src/metadataContract');
const { world, withApp } = require('./helpers/world');
const { SCENARIOS } = require('./helpers/scenarios');

async function build() {
  const sessions = [];
  for (const [label, opts, body] of SCENARIOS) {
    const state = world(opts);
    await withApp(state, async ({ post }) => {
      const r = await post(body);
      assert.equal(r.status, 201, label + ' did not make a session: ' + JSON.stringify(r.body));
    });
    const params = state.stripePosts[0].params;
    const keys = [...params.keys()].filter(k => k.startsWith('metadata[')).map(k => k.slice('metadata['.length, -1));
    const subscription = [...params.keys()]
      .filter(k => k.startsWith('subscription_data[metadata]['))
      .map(k => k.slice('subscription_data[metadata]['.length, -1));
    const filled = keys.filter(k => params.get('metadata[' + k + ']') !== '');
    sessions.push({ label, type: params.get('metadata[type]'), keys, filled, subscription, params });
  }
  return sessions;
}

test("every purchase type sends exactly the keys in the contract, and stays under Stripe's 50 key limit", async () => {
  for (const s of await build()) {
    const { required, optional } = contract.keysFor(s.type);
    const allowed = new Set([...required, ...optional]);
    // At the 50 key limit the portal leaves out the net of a zero amount (see fitToStripeLimit).
    const mayBeLeftOut = k =>
      s.filled.length >= 50 &&
      k.endsWith('_amount_net') &&
      s.params.get('metadata[' + k.replace(/_net$/, '') + ']') === '0.00';
    assert.deepEqual(
      required.filter(k => !s.keys.includes(k) && !mayBeLeftOut(k)),
      [],
      s.label + ': missing keys',
    );
    assert.deepEqual(
      s.keys.filter(k => !allowed.has(k)),
      [],
      s.label + ': keys not in the contract',
    );
    // Checked against Stripe test mode on 24 Oct 2026: 51 filled keys are rejected, but empty values do not count.
    assert.ok(s.filled.length <= 50, s.label + ': ' + s.filled.length + ' filled metadata keys');
    assert.equal(new Set(s.keys).size, s.keys.length, s.label + ': a key is sent twice');
  }
});
test('every contract key is exercised by at least one scenario, so none is dead', async () => {
  const sessions = await build();
  for (const type of Object.keys(contract.SESSION_TYPES).filter(t => !contract.TESTED_ELSEWHERE.has(t))) {
    const seen = new Set(sessions.filter(s => s.type === type).flatMap(s => s.keys));
    const { required, optional } = contract.keysFor(type);
    assert.deepEqual(
      [...required, ...optional].filter(k => !seen.has(k)),
      [],
      type + ': keys never sent',
    );
  }
});
test('subscription metadata matches the contract', async () => {
  for (const s of await build()) {
    assert.deepEqual(
      s.subscription.filter(k => !(k in contract.SUBSCRIPTION)),
      [],
      s.label + ': unknown subscription keys',
    );
    if (s.params.get('mode') === 'subscription') {
      assert.deepEqual(
        contract.SUBSCRIPTION_REQUIRED.filter(k => !s.subscription.includes(k)),
        [],
        s.label + ': subscription keys missing',
      );
    } else assert.deepEqual(s.subscription, [], s.label + ': a one-off payment carries no subscription metadata');
  }
});
test('every inline line carries a price list code', async () => {
  for (const s of await build()) {
    const lines = new Set([...s.params.keys()].map(k => k.match(/^line_items\[(\d+)\]/)?.[1]).filter(Boolean));
    for (const i of lines) {
      const inline = s.params.has(`line_items[${i}][price_data][unit_amount]`);
      if (!inline) continue;
      assert.match(
        s.params.get(`line_items[${i}][price_data][product_data][metadata][sku]`) || '',
        /^[A-Z][A-Z0-9-]+$/,
        s.label + ': line ' + i + ' has no price list code',
      );
    }
  }
});
test('every key has a description and docs/api-contracts/stripe-metadata.md is current', () => {
  for (const type of Object.keys(contract.SESSION_TYPES)) {
    const { required, optional } = contract.keysFor(type);
    assert.deepEqual(
      [...required, ...optional].filter(k => !contract.DESCRIPTIONS[k]),
      [],
      type + ': keys with no description',
    );
  }
  const page = readFileSync(
    join(__dirname, '..', '..', '..', '..', '..', 'docs', 'api-contracts', 'stripe-metadata.md'),
    'utf8',
  );
  assert.equal(page, contract.renderMarkdown(), 'the page is out of date: run npm run docs:metadata in apps/portal');
});
