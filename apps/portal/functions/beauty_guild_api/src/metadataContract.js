'use strict';
// The contract between the portal and Creator: the metadata the portal puts on a Stripe Checkout Session and on the
// subscription it starts. Creator reads these keys, so a key is never renamed or dropped without telling Creator.
// test/metadata-contract.test.js builds every purchase type through the real code and checks it sends exactly these
// keys; docs/api-contracts/stripe-metadata.md is generated from this file (npm run docs:metadata in apps/portal).
// Stripe allows at most 50 metadata keys on a session (the test checks that too).

// What every key means.
const DESCRIPTIONS = {
  // Always present
  email: "The customer's verified sign-in email.",
  name: "The customer's full name (from the CRM Contact, or the name typed before a Contact exists).",
  currency: 'Always GBP.',
  status: 'Always `pending` when the session is made; the real outcome arrives with the payment events.',
  source: 'Always `portal_v2`, so Creator can tell portal sessions from any other source.',
  type: 'The purchase type: membership, membership_insurance, insurance, accreditation, membership_change, additional_venue or membership_addon.',
  contact_id: 'The CRM Contact id. Always set when paying: the portal makes the Contact first if there is none.',
  // Membership
  quote_reference: 'A reference for this quote (`BGP-` and a time code). Not unique across retries.',
  entry_point: '`member` if the customer already had a Contact, `public` if the portal made one at payment.',
  membership_profile_id: "The member profile of the customer's current membership. Empty for a new member.",
  existing_membership:
    'JSON of the current membership (type, start_date, expiry_date, deal_id) when renewing or upgrading. Empty for a new member.',
  previous_membership_id: 'The Deal being renewed or upgraded. Empty for a new membership.',
  upgrade_credit:
    'Only on an upgrade from Associate to Full with the upgrade credit switched on: the unused Associate membership fee credited against this payment, gross (a one-time Stripe coupon on the first invoice, so `total_amount` is already net of it). Not a cash refund.',
  previous_subscription_id:
    "Only on an upgrade with a credit: the Associate membership's Stripe subscription, which Creator ends at `membership_start` once this payment is verified (the old Associate must not renew).",
  change_type: '`new`, `renewal` or `upgrade` for a purchase; `mta` for a change to a current membership.',
  membership_level: '`associate`, `full_non_salon` or `full_salon`.',
  primary_branch: 'The main branch: `beauty`, `holistic`, `nails` or `hair`.',
  secondary_branches: 'Comma separated additional branches. Empty if none.',
  addons: 'JSON of the add-on quantities, for example `{"badge":1}`. `{}` if none.',
  insurance_requested: '`true` if insurance is part of this purchase.',
  subscription_type: '`annual` or `monthly`.',
  membership_start: 'The start of the membership term (yyyy-mm-dd).',
  membership_expiry: 'The end of the membership term (yyyy-mm-dd).',
  base_membership_amount:
    'Gross amount of the membership line on this payment. On a monthly plan, its monthly share (the joining fee, add-ons and extra branches below follow the same rule: only what renews is a monthly share).',
  base_membership_amount_net:
    'The same without VAT. The zero-rated part of a membership is £38.00 a year (divided by 12 on a monthly plan).',
  joining_fee_amount:
    'Gross joining fee on this payment (`0.00` where it is not charged: a renewal, or a membership starting within a month of the last one ending). On a monthly plan it is the full fee, charged once with the first payment.',
  joining_fee_amount_net: 'Joining fee without VAT.',
  branch_addon_amount: 'Gross amount for extra branches on this payment (`0.00` if none).',
  branch_addon_amount_net: 'Extra branches without VAT.',
  bundle_amount: 'Gross amount for the membership bundle (`0.00` if none).',
  bundle_amount_net: 'Bundle without VAT.',
  certificate_amount: 'Gross amount for extra certificates (`0.00` if none).',
  certificate_amount_net: 'Certificates without VAT.',
  badge_amount: 'Gross amount for badges (`0.00` if none).',
  badge_amount_net: 'Badges without VAT.',
  sticker_amount: 'Gross amount for window stickers (`0.00` if none).',
  sticker_amount_net: 'Window stickers without VAT.',
  business_name: 'The trading name typed on the Join page. Left out when blank.',
  address_line_1: 'Correspondence address typed on the Join page. Left out when blank.',
  address_line_2: 'Correspondence address line 2. Left out when blank.',
  town: 'Correspondence town. Left out when blank.',
  county: 'Correspondence county. Left out when blank.',
  postcode: 'Correspondence postcode. Left out when blank.',
  discounts:
    'Only with PORTAL_DISCOUNTS_ENABLED and a discount applied. One JSON array, one entry per discounted item: `{"source":"referral|voucher|staff_waiver","code":"ACC-0140","reason":"Goodwill Gesture","applied_by":"customer|staff:<who>","sku":"MEM-JOIN","list_amount":"10.00","amount":"10.00"}`. `code` is empty for a waiver and `reason` is only on a waiver. A referral also has `school_id` and `accreditation_id` (`code` is the school\'s Accreditation Reference); a voucher has `voucher_id`; a branch discount has `stripe_coupon_id` (and `amount` is what the coupon really gives). Fields that do not fit under Stripe\'s 500 character limit are dropped in this order: `list_amount`, `school_id`, `accreditation_id`, `reason`, `applied_by`. A fully waived line is not on the invoice (the joining fee shows `joining_fee_amount` `0.00`), so book `list_amount` and `amount` from here; a part-discounted one-off line is on the session at the lowered price. The additional branch keeps its full price and the discount is a Stripe coupon on the invoice (`discount_amounts`). Creator records the redemption from this entry when the first payment succeeds.',
  total_amount:
    'What is charged now, gross. The first payment on a monthly plan: the ongoing monthly payment plus the joining fee and any add-ons in full.',
  total_amount_net: '`total_amount` without VAT. Insurance premiums are VAT exempt, and IPT is not VAT.',
  revision_count: 'Insurance changes: how many revisions (start dates) this payment is for, 1 to 3.',
  revision_ids:
    'Insurance changes: the Policy_Revisions ids paid for, comma separated, in start date order. Creator applies each once.',
  effective_dates:
    'Insurance changes: the start date of each revision (yyyy-mm-dd), comma separated, in the same order as `revision_ids`.',
  quote_ids:
    'Insurance changes: the quote reference of each revision (After_Quote_ID), comma separated, in the same order.',
  mta_fee_amount:
    'Insurance changes: the adjustment fees in this payment, gross (GBP 5.00 for each revision, including VAT). `0.00` if none.',
  mta_scope: '`membership` for a change to the membership only (a branch or items), `policy` for an insurance change.',
  effective_date:
    'The day the change starts (yyyy-mm-dd): today, for a membership change. The pro-rata runs from this day to the end of the term.',
  prorata_days: 'Days left in the term from `effective_date`, both end days counted.',
  prorata_total_days:
    'Days the whole term runs (365, or 366 if it spans 29 February). The pro-rata is `prorata_days` over this.',
  branch_yearly_amount:
    'The full yearly gross price of the extra branches bought, which they cost from the next renewal (what Creator should add to the renewal). `0.00` if none.',
  monthly_plan:
    "Monthly plans only, and only while there is room under Stripe's 50 key limit (it is also on the subscription): JSON of `payments`, `first_payment`, `later_payment`, `one_off_total` (the joining fee and add-ons charged in full with the first payment), `year_one_total` (what is paid over the first twelve months), `admin_fee` and `admin_fee_net`.",
  // Insurance
  insurance_start_date: 'The policy start date (yyyy-mm-dd).',
  insurance_end_date: 'The policy end date (yyyy-mm-dd).',
  insurance_amount: 'Premiums plus IPT for the year, whatever the payment plan.',
  insurance_net_amount: 'Premiums before IPT, for the year.',
  insurance_ipt_amount: 'Insurance Premium Tax for the year.',
  insurance_route: '`salon` or `non_salon`. Empty when insurance is not requested.',
  named_employee_membership:
    'JSON `{"count":1,"amount":"55.00","amount_net":"52.17"}`: the membership fee each named employee pays, charged once per employee. It carries VAT and sits outside `insurance_amount` and IPT.',
  insurance_policy_id: 'The Insurance_Policy created before payment. Empty when insurance is not requested.',
  insured_premises_id: 'The Insured_Premises record, if the cover needs premises. Otherwise empty.',
  insured_people_ids: 'Comma separated Insured_People ids. Empty if none.',
  insurance_extension_ids: 'Comma separated Insurance_Extension ids, one per cover row.',
  insurance_declarations_id: 'The Declarations record.',
  membership_deal_id: "The member's current membership Deal.",
  // Accreditation
  accreditation_id: 'The Training_Centre_Accred record being paid.',
  application_id: 'The same value as `accreditation_id` (kept for V1 compatibility).',
  product_amount: 'What is charged now for the accreditation (the first payment on a monthly plan).',
  product_yearly_amount: 'The yearly accreditation price, whatever the payment plan.',
  product_details: 'A label for what was bought, for example `Accreditation + Associate Membership`.',
  product_name: 'The product name for the invoice.',
  membership_required: '`true` if the school had no membership, so one is bundled with the accreditation.',
  // Named membership_id rather than membership_deal_id (unlike every other purchase type) to match V1:
  // Training_Centre_Accred.Membership is a CRM lookup to Deals, so this must be the Deal's own id.
  membership_id: "The Deal id of the school's current membership. Empty if none.",
  membership_details:
    'JSON of `required`, `type` (Associate or International when bundled), `start_date` and `expiry_date`.',
  // Additional venue
  centre_id: 'The Training_Centres record the venue is for.',
};

const SESSION_COMMON = ['email', 'name', 'currency', 'status', 'source', 'type', 'contact_id'];
const MEMBERSHIP_CORE = [
  'quote_reference',
  'entry_point',
  'membership_profile_id',
  'existing_membership',
  'previous_membership_id',
  'change_type',
  'membership_level',
  'primary_branch',
  'secondary_branches',
  'addons',
  'insurance_requested',
  'subscription_type',
  'membership_start',
  'membership_expiry',
  'base_membership_amount',
  'base_membership_amount_net',
  'joining_fee_amount',
  'joining_fee_amount_net',
  'branch_addon_amount',
  'branch_addon_amount_net',
  'bundle_amount',
  'bundle_amount_net',
  'certificate_amount',
  'certificate_amount_net',
  'badge_amount',
  'badge_amount_net',
  'sticker_amount',
  'sticker_amount_net',
  'insurance_amount',
  'insurance_net_amount',
  'insurance_ipt_amount',
  'insurance_route',
  'insurance_policy_id',
  'insured_premises_id',
  'insured_people_ids',
  'insurance_extension_ids',
  'insurance_declarations_id',
  'total_amount',
  'total_amount_net',
];
const JOIN_DETAILS = ['business_name', 'address_line_1', 'address_line_2', 'town', 'county', 'postcode'];
const INSURANCE_CORE = [
  'insurance_start_date',
  'insurance_end_date',
  'insurance_amount',
  'insurance_net_amount',
  'insurance_ipt_amount',
  'insurance_route',
  'named_employee_membership',
  'insurance_policy_id',
  'insured_premises_id',
  'insured_people_ids',
  'insurance_extension_ids',
  'insurance_declarations_id',
  'total_amount',
  'total_amount_net',
];

// Keys per purchase type, on top of SESSION_COMMON. `required` is on every session of the type, `optional` only sometimes.
const SESSION_TYPES = {
  membership: {
    required: MEMBERSHIP_CORE,
    optional: [...JOIN_DETAILS, 'monthly_plan', 'discounts'],
  },
  membership_insurance: {
    required: [
      ...MEMBERSHIP_CORE.filter(k => k !== 'insurance_route'),
      ...INSURANCE_CORE.filter(k => !MEMBERSHIP_CORE.includes(k)),
      'insurance_route',
    ],
    optional: [...JOIN_DETAILS, 'monthly_plan', 'discounts', 'upgrade_credit', 'previous_subscription_id'],
  },
  insurance: {
    required: [
      'quote_reference',
      'entry_point',
      'membership_deal_id',
      'membership_profile_id',
      'insurance_requested',
      ...INSURANCE_CORE,
    ],
    optional: [],
  },
  accreditation: {
    required: [
      'accreditation_id',
      'application_id',
      'subscription_type',
      'product_amount',
      'product_yearly_amount',
      'product_details',
      'product_name',
      'membership_required',
      'membership_id',
      'membership_details',
    ],
    optional: ['monthly_plan'],
  },
  additional_venue: { required: ['centre_id', 'accreditation_id'], optional: [] },
  // Exercised by test/insurance-change-quote.test.js (it needs a fake policy and cover, which the shared scenarios do not have).
  insurance_change: {
    required: [
      'quote_reference',
      'membership_deal_id',
      'insurance_policy_id',
      'change_type',
      'mta_scope',
      'revision_count',
      'revision_ids',
      'effective_dates',
      'quote_ids',
      'insurance_amount',
      'insurance_net_amount',
      'insurance_ipt_amount',
      'mta_fee_amount',
      'named_employee_membership',
      'total_amount',
      'total_amount_net',
    ],
    optional: [],
  },
  membership_change: {
    required: [
      'quote_reference',
      'membership_deal_id',
      'membership_profile_id',
      'change_type',
      'mta_scope',
      'effective_date',
      'membership_start',
      'membership_expiry',
      'prorata_days',
      'prorata_total_days',
      'secondary_branches',
      'branch_addon_amount',
      'branch_addon_amount_net',
      'branch_yearly_amount',
      'addons',
      'bundle_amount',
      'bundle_amount_net',
      'certificate_amount',
      'certificate_amount_net',
      'badge_amount',
      'badge_amount_net',
      'sticker_amount',
      'sticker_amount_net',
      'total_amount',
      'total_amount_net',
    ],
    optional: [],
  },
  membership_addon: {
    required: [
      'membership_deal_id',
      'addons',
      'bundle_amount',
      'certificate_amount',
      'badge_amount',
      'sticker_amount',
      'total_amount',
    ],
    optional: [],
  },
};

// Metadata on the Stripe subscription itself (subscription_data.metadata). Renewals and later invoices carry this, not the session's.
const SUBSCRIPTION = {
  plan: '`annual` or `monthly`.',
  contact_id: 'The CRM Contact id, so a renewal can find the customer without the session.',
};
const SUBSCRIPTION_REQUIRED = ['plan', 'contact_id'];

// Product metadata on inline Stripe lines (read by expanding `data.price.product` on the session's line items).
const LINE_PRODUCT = {
  sku: "The price list code (the Books SKU). Catalogue lines have it as the price's `lookup_key` instead.",
};

const keysFor = type => {
  const t = SESSION_TYPES[type];
  return { required: [...SESSION_COMMON, ...t.required], optional: t.optional };
};

// docs/api-contracts/stripe-metadata.md
function renderMarkdown() {
  const row = (k, req) => `| \`${k}\` | ${req} | ${DESCRIPTIONS[k].replace(/\|/g, '\\|')} |`;
  const lines = [
    '# Stripe metadata for Creator',
    '',
    'Generated from `apps/portal/functions/beauty_guild_api/src/metadataContract.js`. Do not edit by hand: run `npm run docs:metadata` in `apps/portal`.',
    'A test sends every purchase type through the real code and fails if the keys differ from this contract, so this page cannot drift from what Creator receives.',
    '',
    'Stripe allows 50 filled metadata keys on a session (empty values do not count). The portal keeps every type under that. In the biggest purchases (address, branch, add-ons, insurance and monthly together) it leaves out each `..._amount_net` whose `..._amount` is `0.00`, then `monthly_plan`. Read a missing `..._amount_net` as `0.00`.',
    '',
    '## Checkout Session metadata (`checkout.session.completed`)',
    '',
    `Every session has: ${SESSION_COMMON.map(k => `\`${k}\``).join(', ')}.`,
  ];
  for (const type of Object.keys(SESSION_TYPES)) {
    const { required, optional } = SESSION_TYPES[type];
    lines.push('', `### \`${type}\``, '', '| Key | Present | Meaning |', '| --- | --- | --- |');
    for (const k of required) lines.push(row(k, 'always'));
    for (const k of optional) lines.push(row(k, 'sometimes'));
  }
  lines.push('', '### Common keys', '', '| Key | Present | Meaning |', '| --- | --- | --- |');
  for (const k of SESSION_COMMON) lines.push(row(k, 'always'));
  lines.push(
    '',
    '## Subscription metadata (`customer.subscription.*`, and on invoices as `parent.subscription_details.metadata`)',
    '',
    '| Key | Present | Meaning |',
    '| --- | --- | --- |',
  );
  for (const [k, d] of Object.entries(SUBSCRIPTION))
    lines.push(`| \`${k}\` | ${SUBSCRIPTION_REQUIRED.includes(k) ? 'always' : 'sometimes'} | ${d} |`);
  lines.push('', '## Line item product metadata', '', '| Key | Meaning |', '| --- | --- |');
  for (const [k, d] of Object.entries(LINE_PRODUCT)) lines.push(`| \`${k}\` | ${d} |`);
  return lines.join('\n') + '\n';
}

// Stripe rejects a session with more than 50 filled metadata keys (empty values do not count; checked in test mode on
// 24 Oct 2026), and the biggest purchase (Join page details, a branch, add-ons, insurance, monthly) is right at the limit.
// So that a member is never stopped from paying, the least useful keys go first: a `..._amount_net` whose gross
// `..._amount` is `0.00` (it carries no information), then `monthly_plan` (the plan is also on the subscription).
const MAX_FILLED_KEYS = 50;
const filledCount = meta => Object.values(meta).filter(v => v !== '').length;
function fitToStripeLimit(meta) {
  const out = { ...meta };
  const droppable = Object.keys(out).filter(
    k => k.endsWith('_amount_net') && out[k.replace(/_net$/, '')] === '0.00' && out[k] === '0.00',
  );
  for (const k of [...droppable, 'monthly_plan']) {
    if (filledCount(out) <= MAX_FILLED_KEYS) break;
    delete out[k];
  }
  return out;
}

// Types whose keys are checked by their own test, not by the shared scenarios.
const TESTED_ELSEWHERE = new Set(['insurance_change']);

module.exports = {
  TESTED_ELSEWHERE,
  MAX_FILLED_KEYS,
  filledCount,
  fitToStripeLimit,
  DESCRIPTIONS,
  SESSION_COMMON,
  SESSION_TYPES,
  SUBSCRIPTION,
  SUBSCRIPTION_REQUIRED,
  LINE_PRODUCT,
  keysFor,
  renderMarkdown,
};
