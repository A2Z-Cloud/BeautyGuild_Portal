import test from 'node:test';
import assert from 'node:assert/strict';
import { accreditationState, MANAGE_TEXT } from './accreditationState.js';

const school = (extra = {}) => ({
  id: '11',
  name: 'Glow',
  status: 'Unverified',
  stage: 'Awaiting Payment',
  paid: false,
  payable: false,
  qualificationCount: 0,
  ...extra,
});
test('no application invites you to apply', () => {
  assert.equal(accreditationState().key, 'none');
  assert.equal(accreditationState().title, 'Apply for Guild Accreditation');
});
test('a draft is incomplete with a Continue Application button', () => {
  const s = accreditationState({ drafts: [{ id: '1', service: 'accreditation' }] });
  assert.equal(s.key, 'draft');
  assert.equal(s.title, 'Your Accreditation Application is incomplete.');
  assert.equal(s.action, 'Continue Application');
  assert.equal(accreditationState({ schools: [school({ stage: 'Draft' })] }).key, 'draft');
});
test('an application waiting for payment goes to payment before anything else', () => {
  const s = accreditationState({ schools: [school({ payable: true })], drafts: [{ id: '1' }] });
  assert.equal(s.key, 'payment');
  assert.equal(s.to, '/pay/accreditation/11');
});
test('paid with no qualifications asks for them, then waits for review', () => {
  const paid = school({ stage: 'Paid', paid: true });
  const q = accreditationState({ schools: [paid] });
  assert.equal(q.key, 'qualifications');
  assert.equal(q.text, 'Please upload your outstanding qualifications.');
  assert.equal(q.to, '/schools/11/qualifications');
  const r = accreditationState({ schools: [{ ...paid, qualificationCount: 2 }] });
  assert.equal(r.key, 'review');
  assert.equal(r.title, 'Your accreditation application is being reviewed.');
});
test('an approved school shows the management options', () => {
  const s = accreditationState({
    schools: [school({ status: 'Verified', stage: 'Paid', paid: true, qualificationCount: 1 })],
  });
  assert.equal(s.key, 'approved');
  assert.equal(s.text, MANAGE_TEXT);
  assert.equal(s.to, '/schools/11/profile');
});
