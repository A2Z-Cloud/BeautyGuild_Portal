import test from 'node:test';
import assert from 'node:assert/strict';
import {
  attentionItems,
  daysUntil,
  headerLine,
  manageActions,
  overviewFields,
  renewalOpen,
  holdsInsurance,
  resolveSection,
  sectionFromTab,
} from './membershipManage.js';

test('old ?tab= links map to the matching section', () => {
  assert.equal(sectionFromTab('details'), 'overview');
  assert.equal(sectionFromTab('cover'), 'cover');
  assert.equal(sectionFromTab('history'), 'history');
  assert.equal(sectionFromTab('addons'), 'extras');
  assert.equal(sectionFromTab('invoices'), 'invoices');
  assert.equal(sectionFromTab('nonsense'), null);
  assert.equal(sectionFromTab(null), null);
});

test('an unknown section shows the overview; policy sections need a policy', () => {
  assert.equal(resolveSection('invoices'), 'invoices');
  assert.equal(resolveSection('rubbish'), 'overview');
  assert.equal(resolveSection(undefined), 'overview');
  assert.equal(resolveSection('cover', true), 'cover');
  assert.equal(resolveSection('cover', false), 'overview');
  assert.equal(resolveSection('history', false), 'overview');
  assert.equal(resolveSection('extras', false), 'extras');
});

test('days until the end of the term', () => {
  assert.equal(daysUntil('2026-11-30', '2026-11-01'), 29);
  assert.equal(daysUntil('2026-10-01', '2026-11-01'), -31);
  assert.equal(daysUntil('', '2026-11-01'), null);
});

test('renew opens 60 days before the end, and stays open after it', () => {
  assert.equal(renewalOpen('2027-01-01', '2026-11-02'), true); // 60 days
  assert.equal(renewalOpen('2027-01-02', '2026-11-02'), false); // 61 days
  assert.equal(renewalOpen('2026-10-01', '2026-11-02'), true);
  assert.equal(renewalOpen(null, '2026-11-02'), true);
});

test('actions show only what applies', () => {
  const today = '2026-11-02';
  const associate = { type: 'Associate Member', status: 'Active', endDate: '2027-06-01' };
  assert.deepEqual(manageActions(associate, { today, canBuy: true, upgradeOn: true }), ['upgrade']);
  assert.deepEqual(manageActions({ ...associate, endDate: '2026-12-01' }, { today, canBuy: true, upgradeOn: true }), [
    'renew',
    'upgrade',
  ]);
  assert.deepEqual(manageActions({ ...associate, endDate: '2026-12-01' }, { today, canBuy: true, upgradeOn: false }), [
    'renew',
  ]);
  const full = { type: 'Full Member (Salon)', status: 'Active', endDate: '2026-12-01' };
  assert.deepEqual(manageActions(full, { today, canBuy: true, upgradeOn: true }), ['renew']);
  assert.deepEqual(manageActions(full, { today, canBuy: false, upgradeOn: true }), []);
  // An expired Associate renews but is not upgraded.
  assert.deepEqual(
    manageActions(
      { type: 'Associate Member', status: 'Expired', endDate: '2026-09-01' },
      { today, canBuy: true, upgradeOn: true },
    ),
    ['renew'],
  );
});

test('header line joins level, status and expiry', () => {
  assert.equal(
    headerLine({ type: 'Full Member (Non-Salon)', status: 'Active', endDate: '2026-11-30' }),
    'Full Member (Non-Salon) · Active · to 30 Nov 2026',
  );
  assert.equal(headerLine({ type: 'International Member' }), 'International Member');
});

test('overview shows labelled fields only, never raw CRM keys', () => {
  const fields = overviewFields(
    {
      id: '123',
      title: 'Jo Smith',
      type: 'Full Member',
      status: 'Active',
      startDate: '2025-12-01',
      endDate: '2026-11-30',
      branches: ['Leeds'],
    },
    { paymentStatus: 'Paid' },
  );
  assert.deepEqual(
    fields.map(f => f.label),
    ['Membership', 'Level', 'Status', 'Start date', 'Expiry date', 'Branches', 'Payment status', 'Reference'],
  );
  assert.equal(fields.find(f => f.label === 'Expiry date').value, '30 Nov 2026');
  assert.equal(fields.find(f => f.label === 'Branches').value, 'Leeds');
  assert.ok(!fields.some(f => /Deal_Name|Stage|Membership_Type/.test(f.label)));
  // Empty values are left out rather than shown as dashes.
  assert.deepEqual(
    overviewFields({ title: 'Jo' }, {}).map(f => f.label),
    ['Membership'],
  );
});

test('attention items', () => {
  const today = '2026-11-02';
  assert.deepEqual(attentionItems({ membership: { endDate: '2027-06-01' } }, today), []);
  assert.deepEqual(attentionItems({ membership: { endDate: '2026-11-30' } }, today), [
    'Your membership ends on 30 Nov 2026. You can renew it now.',
  ]);
  assert.deepEqual(attentionItems({ membership: { endDate: '2026-10-01' } }, today), [
    'Your membership ended on 1 Oct 2026. You can renew it.',
  ]);
  assert.deepEqual(
    attentionItems(
      {
        membership: { endDate: '2027-06-01' },
        paymentStatus: 'Payment failed',
        revisions: [{ status: 'Awaiting payment' }],
      },
      today,
    ),
    ['A payment has not gone through.', 'A change to your cover is waiting for payment.'],
  );
});

test('the insurance sections stay for a membership that expects a policy, even before one is in force', () => {
  assert.equal(holdsInsurance('Full Member (Non-Salon)', false), true);
  assert.equal(holdsInsurance('Full Member (Salon)', false), true);
  assert.equal(holdsInsurance(null, false), true);
  assert.equal(holdsInsurance('Associate Member', false), false);
  assert.equal(holdsInsurance('International Member', false), false);
  assert.equal(holdsInsurance('Associate Member', true), true);
});
