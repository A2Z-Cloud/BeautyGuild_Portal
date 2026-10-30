'use strict';
// The combined membership and insurance flow at the API (docs/delivery/combined-membership-flow-spec.md, sections 2 and 7): with
// PORTAL_COMBINED_FLOW_ENABLED on, the level comes only from the customer's answers. Off, everything is as before.
const test = require('node:test');
const assert = require('node:assert/strict');
const { world, withApp } = require('./helpers/world');
const { BUY, INS_OK } = require('./helpers/scenarios');

const ON = { PORTAL_COMBINED_FLOW_ENABLED: 'true' };
const { level, ...NO_LEVEL } = BUY; // eslint-disable-line no-unused-vars
const asked = (answers, over = {}) => ({ ...NO_LEVEL, answers, ...over });
const UK_NO_INSURANCE = { country: 'England', insuranceRequired: 'no' };
const UK_INSURED = { country: 'United Kingdom', insuranceRequired: 'yes', working: 'insMobile' };

const quoteOf = async (state, body, env = ON) => {
  let out;
  await withApp(state, async ({ quote }) => (out = await quote(body)), env);
  return out;
};
const errorCode = r => r.body.code || r.body.error?.code;

test('switch off: a level is still chosen, answers are ignored and International is still refused', async () => {
  const chosen = await quoteOf(world({ unlinked: true }), { ...BUY, answers: UK_INSURED }, {});
  assert.equal(chosen.status, 200, JSON.stringify(chosen.body));
  assert.equal(chosen.body.quote.decision, undefined);
  const intl = await quoteOf(world({ unlinked: true }), { ...BUY, level: 'international' }, {});
  assert.equal(intl.status, 422);
});

test('switch on: a client that sends a level is refused', async () => {
  const r = await quoteOf(world({ unlinked: true }), { ...BUY, answers: UK_NO_INSURANCE });
  assert.equal(r.status, 422);
  assert.equal(errorCode(r), 'LEVEL_NOT_CHOSEN_BY_CLIENT');
});

test('switch on: missing, mixed or unknown answers are refused, never guessed', async () => {
  for (const [answers, code] of [
    [undefined, 'MISSING_ANSWER'],
    [{ country: 'England' }, 'MISSING_ANSWER'],
    [{ country: 'England', insuranceRequired: 'yes' }, 'MISSING_ANSWER'],
    [{ country: 'England', insuranceRequired: 'yes', working: ['insSalon', 'insMobile'] }, 'INVALID_WORKING'],
  ]) {
    const r = await quoteOf(world({ unlinked: true }), asked(answers));
    assert.equal(r.status, 422, JSON.stringify(answers));
    assert.equal(errorCode(r), code, JSON.stringify(answers));
  }
});

test('outside the UK is International: the MEM-INTL-Y price, no insurance, the message, yearly only', async () => {
  const r = await quoteOf(world({ unlinked: true }), asked({ country: 'France', insuranceRequired: 'yes' }));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const q = r.body.quote;
  assert.equal(q.decision.level, 'international');
  assert.equal(q.decision.insurance, false);
  assert.match(q.decision.message, /not available outside the UK/);
  assert.ok(
    q.lines.some(l => l.name === 'International Member membership (annual)'),
    JSON.stringify(q.lines),
  );
  const monthly = await quoteOf(world({ unlinked: true }), asked({ country: 'Jersey' }, { billing: 'monthly' }));
  assert.equal(monthly.status, 422);
  assert.equal(errorCode(monthly), 'BILLING_NOT_AVAILABLE');
});

test('UK with no insurance is Associate, and any insurance details sent are dropped', async () => {
  const r = await quoteOf(world({ unlinked: true }), asked(UK_NO_INSURANCE, { insurance: INS_OK }));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.quote.decision.level, 'associate');
  assert.equal(r.body.quote.decision.insurance, false);
  assert.ok(
    r.body.quote.lines.every(l => !/insurance|premium/i.test(l.name)),
    JSON.stringify(r.body.quote.lines),
  );
});

test('UK with insurance is Full, and the insurance answers must agree with how the customer said they work', async () => {
  const ok = await quoteOf(
    world({ unlinked: true }),
    asked(UK_INSURED, { insurance: INS_OK, country: 'United Kingdom' }),
  );
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.quote.decision.level, 'full_non_salon');
  assert.equal(ok.body.quote.decision.route, 'non_salon');
  const mismatch = await quoteOf(
    world({ unlinked: true }),
    asked({ ...UK_INSURED, working: 'insSalon' }, { insurance: INS_OK }),
  );
  assert.equal(mismatch.status, 422);
  assert.equal(errorCode(mismatch), 'INVALID_WORKING');
});

test('a country sent beside the answers must match them', async () => {
  const r = await quoteOf(world({ unlinked: true }), asked(UK_NO_INSURANCE, { country: 'France' }));
  assert.equal(r.status, 422);
  assert.equal(errorCode(r), 'COUNTRY_MISMATCH');
});

test('paying as International makes a session with membership_level international and no insurance keys', async () => {
  const state = world({ unlinked: true });
  let r;
  await withApp(state, async ({ post }) => (r = await post(asked({ country: 'Ireland' }, { country: undefined }))), ON);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const params = state.stripePosts[0].params;
  assert.equal(params.get('metadata[membership_level]'), 'international');
  assert.equal(params.get('metadata[type]'), 'membership');
  assert.equal(params.get('metadata[insurance_requested]'), 'false');
  // £55.00 with £38.00 zero-rated: £38.00 plus £17.00 / 1.2 = £52.17 net.
  assert.equal(params.get('metadata[base_membership_amount_net]'), '52.17');
  const insuranceKeys = [...params.keys()].filter(
    k => k.startsWith('metadata[insurance_') && k !== 'metadata[insurance_requested]',
  );
  assert.deepEqual(
    insuranceKeys.filter(k => !['', 'not_requested'].includes(params.get(k))),
    [],
  );
});
