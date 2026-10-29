import test from 'node:test';
import assert from 'node:assert/strict';
import { canUpgrade, isAssociate, upgradableRecord, upgradeLink } from './membershipUpgrade.js';

const TODAY = '2026-10-29';

test('only a current Associate membership can be upgraded', () => {
  assert.equal(canUpgrade({ type: 'Associate Member', status: 'Active', endDate: '2027-01-01' }, TODAY), true);
  assert.equal(canUpgrade({ type: 'Associate Member', status: 'active', endDate: TODAY }, TODAY), true);
  assert.equal(canUpgrade({ type: 'Full Member (Non-Salon)', status: 'Active', endDate: '2027-01-01' }, TODAY), false);
  assert.equal(canUpgrade({ type: 'Associate Member', status: 'Expired', endDate: '2027-01-01' }, TODAY), false);
  assert.equal(canUpgrade({ type: 'Associate Member', status: 'Active', endDate: '2026-10-28' }, TODAY), false);
  assert.equal(canUpgrade({ type: '', status: 'Active' }, TODAY), false);
});
test('the upgrade link names the membership and is safe to put in a URL', () => {
  assert.equal(upgradeLink('1011174000000000003'), '/membership/buy?renew=1011174000000000003&change=upgrade');
  assert.equal(upgradeLink('a b&c'), '/membership/buy?renew=a%20b%26c&change=upgrade');
  assert.equal(isAssociate('associate member'), true);
});
test("the insurance page picks the member's current Associate record, not an expired one or a Full one", () => {
  const rows = [
    { id: '1', type: 'Full Member (Non-Salon)', status: 'Active', endDate: '2027-01-01' },
    { id: '2', type: 'Associate Member', status: 'Expired', endDate: '2025-01-01' },
    { id: '3', type: 'Associate Member', status: 'Active', endDate: '2027-01-01' },
  ];
  assert.equal(upgradableRecord(rows, TODAY).id, '3');
  assert.equal(upgradableRecord(rows.slice(0, 2), TODAY), null);
  assert.equal(upgradableRecord(null, TODAY), null);
});
