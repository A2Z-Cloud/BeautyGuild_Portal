'use strict';
// A member's current cover, read only: the membership, its extras, the insurance policy attached to it (its cover rows, named
// people and premises) and the change history. This is the starting point for mid-term changes (MTAs): nothing here writes to the
// CRM, prices anything or changes cover. Ownership is checked on the server: the Deal must belong to the signed-in Contact.
const { HttpError } = require('./errors');
const { TREATMENT_EXTENSIONS } = require('./insurance');

const uri = s => encodeURIComponent(String(s));
const text = v => (v == null ? '' : String(v).trim());
// The CRM keeps these answers as Yes and No; a change reads them as yes, no or unknown.
const yesNo = v => (/^yes/i.test(text(v)) ? 'yes' : /^no/i.test(text(v)) ? 'no' : null);
const pence = v => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Math.round(Number(v) * 100));
const lookupId = v => (v && typeof v === 'object' ? String(v.id || '') : text(v));

// A policy that is not (yet) cover: a quote, a referral, or one that has run out. Anything else is shown as the member's cover.
const NOT_IN_FORCE = new Set(['Draft', 'Ready for Payment', 'Referred', 'Expired']);
// A cover row or person that has been replaced, cancelled or not yet confirmed is not part of the current cover.
const NOT_CURRENT = new Set(['draft', 'cancelled', 'canceled', 'superseded', 'replaced', 'expired', 'removed']);
const current = row => !NOT_CURRENT.has(text(row.Status).toLowerCase());

const COVER_LABELS = Object.freeze({
  MEDMAL: 'Medical malpractice and public liability',
  NAMED_EMPLOYEES: 'Named employee',
  NAMED_SUBCONTRACTORS: 'Named subcontractor',
  TEACHING: 'Teaching and student cover',
  TEACHING_PLUS: 'Teaching and student cover with additional treatments',
  BUSINESS_EQUIPMENT: 'Business equipment',
  EMPLOYERS_LIABILITY: "Employers' liability",
  CONTENTS: 'Contents',
  MONEY: 'Money',
  BUILDINGS: 'Buildings',
  BUSINESS_INTERRUPTION: 'Business interruption',
  PROPERTY_AWAY: 'Property away and in transit',
});
function coverLabel(code, type) {
  const c = text(code);
  if (COVER_LABELS[c]) return COVER_LABELS[c];
  const t = c.startsWith('TREATMENT_') && TREATMENT_EXTENSIONS.find(x => 'TREATMENT_' + x.id.toUpperCase() === c);
  return t ? t.name : text(type) || c || 'Cover';
}

const DEAL_FIELDS = [
  'Deal_Name',
  'Stage',
  'Membership_Type',
  'Membership_Branch',
  'Start_Date',
  'Expiry_Date',
  'Contact_Name',
  'Application_Status',
];
const POLICY_FIELDS = [
  'Application_Status',
  'Policy_Type',
  'Policy_Start_Date',
  'Policy_End_Date',
  'Contact',
  'Membership',
  'Risk_Status',
  'Payment_Frequency',
  'Annual_Turnover',
  'Annual_Wage_Roll',
  'Modified_Time',
];
const REVISION_FIELDS = [
  'Policy',
  'Membership',
  'Change_Type',
  'Change_Scope',
  'Requested_Effective_Date',
  'Created_Time',
];

const policyRoute = type => (/^non/i.test(text(type)) ? 'non_salon' : text(type) ? 'salon' : null);

// call(req, path) is the CRM client. isDraft(row, definition) is the records route's own rule for hiding saved drafts.
async function loadCover({ call, req, contactId, dealId, isDraft }) {
  const rows = await call(req, 'Deals/' + dealId + '?fields=' + uri(DEAL_FIELDS.join(',')));
  const deal = rows[0];
  if (!deal || lookupId(deal.Contact_Name) !== String(contactId) || (isDraft && isDraft(deal)))
    throw new HttpError(404, 'NOT_FOUND', 'Membership not found.');

  const [extras, policies, revisionRows] = await Promise.all([
    call(req, 'Membership_Extension/search?criteria=' + uri('(Membership_Extension:equals:' + dealId + ')')),
    call(
      req,
      'Insurance_Policy/search?criteria=' +
        uri('((Contact:equals:' + contactId + ')and(Membership:equals:' + dealId + '))') +
        '&fields=' +
        uri(POLICY_FIELDS.join(',')),
    ),
    // Policy_Revisions is the proposed change record and may not exist yet in every CRM: a missing module is an empty history, not an error.
    call(
      req,
      'Policy_Revisions/search?criteria=' +
        uri('(Membership:equals:' + dealId + ')') +
        '&fields=' +
        uri(REVISION_FIELDS.join(',')),
    ).then(
      items => ({ available: true, items }),
      () => ({ available: false, items: [] }),
    ),
  ]);

  const policy = policies
    .filter(
      p =>
        lookupId(p.Contact) === String(contactId) &&
        lookupId(p.Membership) === String(dealId) &&
        !NOT_IN_FORCE.has(text(p.Application_Status)) &&
        !(p.Application_Status === 'Referred' && p.Risk_Status === 'Stopped'),
    )
    .sort((a, b) => text(b.Policy_Start_Date).localeCompare(text(a.Policy_Start_Date)))[0];

  let insurance = null;
  if (policy) {
    // The criteria limit each search to this policy, which has just been checked as the member's own.
    const by = (module, fields) =>
      call(
        req,
        module + '/search?criteria=' + uri('(Policy:equals:' + policy.id + ')') + '&fields=' + uri(fields.join(',')),
      );
    const [covers, people, premises] = await Promise.all([
      by('Insurance_Extension', [
        'Policy',
        'Cover_Code',
        'Cover_Type',
        'Premium_Net',
        'IPT_Amount',
        'Gross_Amount',
        'Status',
        'Sum_Insured',
        'Cover_Option',
        'Insured_Person',
      ]),
      by('Insured_People', ['Policy', 'Name', 'First_Name', 'Last_Name', 'Person_Type', 'Status']),
      by('Insured_Premises', [
        'Policy',
        'Name',
        'Address_Line_1',
        'Address_Line_2',
        'Town',
        'County',
        'Postcode',
        'Country',
        'Standard_Construction',
        'More_Than_15_Percent_Nonstandard',
      ]),
    ]);
    insurance = {
      id: String(policy.id),
      type: text(policy.Policy_Type) || null,
      route: policyRoute(policy.Policy_Type),
      status: text(policy.Application_Status) || null,
      startDate: policy.Policy_Start_Date || null,
      endDate: policy.Policy_End_Date || null,
      paymentFrequency: text(policy.Payment_Frequency) || null,
      annualTurnover:
        Number.isFinite(Number(policy.Annual_Turnover)) && policy.Annual_Turnover != null
          ? Number(policy.Annual_Turnover)
          : null,
      annualWageRoll:
        Number.isFinite(Number(policy.Annual_Wage_Roll)) && policy.Annual_Wage_Roll != null
          ? Number(policy.Annual_Wage_Roll)
          : null,
      covers: covers.filter(current).map(c => ({
        id: String(c.id),
        code: text(c.Cover_Code) || null,
        label: coverLabel(c.Cover_Code, c.Cover_Type),
        type: text(c.Cover_Type) || null,
        netPence: pence(c.Premium_Net),
        iptPence: pence(c.IPT_Amount),
        grossPence: pence(c.Gross_Amount),
        // The level the member chose, saved at new business (the persistence fix). Blank on older policies, which a change cannot verify.
        sumInsured:
          c.Sum_Insured == null || c.Sum_Insured === '' || !Number.isFinite(Number(c.Sum_Insured))
            ? null
            : Number(c.Sum_Insured),
        option: text(c.Cover_Option) || null,
        personId: lookupId(c.Insured_Person) || null,
      })),
      people: people.filter(current).map(p => ({
        id: String(p.id),
        name: text(p.Name) || [text(p.First_Name), text(p.Last_Name)].filter(Boolean).join(' '),
        type: /sub/i.test(text(p.Person_Type)) ? 'subcontractor' : 'employee',
      })),
      premises: premises.map(p => ({
        id: String(p.id),
        country: text(p.Country) || null,
        standardConstruction: yesNo(p.Standard_Construction),
        nonStandardOver15: yesNo(p.More_Than_15_Percent_Nonstandard),
        address: [p.Address_Line_1, p.Address_Line_2, p.Town, p.County, p.Postcode].map(text).filter(Boolean),
      })),
    };
  }

  return {
    membership: {
      id: String(deal.id || dealId),
      title: text(deal.Deal_Name) || 'Membership',
      type: text(deal.Membership_Type) || null,
      status: text(deal.Stage) || null,
      startDate: deal.Start_Date || null,
      endDate: deal.Expiry_Date || null,
      branches: Array.isArray(deal.Membership_Branch)
        ? deal.Membership_Branch.map(text).filter(Boolean)
        : text(deal.Membership_Branch)
          ? [text(deal.Membership_Branch)]
          : [],
      extras: extras.map(x => ({
        id: String(x.id),
        type: text(x.Extension_Type) || null,
        branch: typeof x.Membership_Branch === 'string' ? x.Membership_Branch : null,
        quantity: x.Quantity || null,
        status: text(x.Status) || null,
      })),
    },
    // An Associate membership has no insurance: the page says so and offers to add it.
    includesInsurance: Boolean(insurance),
    insurance,
    revisions: {
      available: revisionRows.available,
      items: revisionRows.items
        .filter(r => lookupId(r.Membership) === String(dealId))
        .map(r => ({
          id: String(r.id),
          type: text(r.Change_Type) || null,
          scope: text(r.Change_Scope) || null,
          effectiveDate: r.Requested_Effective_Date || null,
          requested: r.Created_Time || null,
        }))
        .sort((a, b) => text(b.requested).localeCompare(text(a.requested))),
    },
    // Read only for now: changes are not offered until the change journeys are built and approved.
    canChange: false,
  };
}

module.exports = { loadCover, coverLabel, NOT_IN_FORCE };
