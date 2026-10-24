'use strict';
// The purchases the contract tests run: each is one real checkout request body, plus how the fake CRM should look.
// Shared by metadata-contract.test.js (fake Stripe) and stripe-contract.test.js (real Stripe test mode).
const { IDS } = require('./world');

const INS_OK = {
  insRoute: 'non_salon',
  insMobile: true,
  insEquipmentTier: 5000,
  insStandardConstruction: 'yes',
  insDeclarations: ['no', 'no', 'no', 'no', 'no', 'yes', 'yes'],
  insInformationAccurate: 'yes',
  insEthicsAccepted: 'yes',
  insDemandsNeedsAccepted: 'yes',
  insNonAdvisedAccepted: 'yes',
};
const FULL = {
  id: IDS.deal,
  Stage: 'Active',
  Membership_Type: 'Full Member (Non-Salon)',
  Start_Date: '2020-01-01',
  Expiry_Date: '2999-01-01',
};
const ASSOCIATE = { ...FULL, Membership_Type: 'Associate Member' };
const BUY = {
  service: 'membership',
  level: 'associate',
  branch: 'beauty',
  billing: 'annual',
  accepted: 'yes',
  firstName: 'Nia',
  lastName: 'New',
};
const INSURE = {
  service: 'insurance',
  country: 'United Kingdom',
  accepted: 'yes',
  firstName: 'Nia',
  lastName: 'New',
  insurance: INS_OK,
};
const WITH_EMPLOYEE = {
  ...INS_OK,
  insNamedPeopleCover: true,
  insNamedPeople: [{ type: 'employee', firstName: 'Ada', lastName: 'Lee' }],
};

// Each scenario is one real purchase. Several per type, so "sometimes" keys show up.
const JOIN_DETAILS = {
  businessName: 'Nia Nails',
  address1: '1 High Street',
  address2: 'Flat 2',
  town: 'Leeds',
  county: 'Yorkshire',
  postcode: 'LS1 1AA',
};
const SCENARIOS = [
  ['membership: new, yearly', { unlinked: true }, BUY],
  [
    'membership: Join page details, branch, add-on',
    { unlinked: true },
    { ...BUY, ...JOIN_DETAILS, branches: 'nails', addons: { badge: 1 } },
  ],
  ['membership: monthly', { unlinked: true }, { ...BUY, billing: 'monthly' }],
  ['membership: renewal', { deals: [ASSOCIATE] }, { ...BUY, previousId: IDS.deal }],
  [
    'membership with insurance: yearly',
    { unlinked: true },
    { ...BUY, level: 'full_non_salon', insurance: INS_OK, country: 'United Kingdom' },
  ],
  [
    'membership with insurance: monthly',
    { unlinked: true },
    { ...BUY, level: 'full_non_salon', billing: 'monthly', insurance: INS_OK, country: 'United Kingdom' },
  ],
  [
    'membership with insurance: everything at once, monthly (the most keys)',
    { unlinked: true },
    {
      ...BUY,
      ...JOIN_DETAILS,
      level: 'full_non_salon',
      billing: 'monthly',
      branches: 'nails',
      addons: { badge: 1, sticker: 1, certificate: 1 },
      insurance: WITH_EMPLOYEE,
      country: 'United Kingdom',
    },
  ],
  ['insurance on its own', { deals: [FULL] }, INSURE],
  ['insurance with a named employee', { deals: [FULL] }, { ...INSURE, insurance: WITH_EMPLOYEE }],
  ['accreditation: yearly', {}, { service: 'accreditation', recordId: IDS.acc }],
  ['accreditation: monthly', { deals: [FULL] }, { service: 'accreditation', recordId: IDS.acc, billing: 'monthly' }],
  ['additional venue', {}, { service: 'additional_venue', recordId: IDS.acc, centreId: IDS.centre }],
  ['membership add-ons', { deals: [FULL] }, { service: 'membership_addon', recordId: IDS.deal, addons: { badge: 2 } }],
];

module.exports = { SCENARIOS };
