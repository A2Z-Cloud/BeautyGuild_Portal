'use strict';
// Saves a quoted insurance change as a revision in the CRM (MTA R3-2): a Policy_Revisions header and, for a change the member can pay
// for, draft Insurance_Extension and Insured_People rows linked to it. Behind PORTAL_INSURANCE_CHANGES_WRITES.
//
// The rules that keep live cover safe (Guild CRM review, 27 October 2026):
//   - Live cover rows are never edited here. Everything written is new, Status Draft, linked to the revision and dated from the effective
//     date to the policy end. An increase or swap names the row it replaces (Supersedes_Extension) and the person it removes is in the
//     request details; Creator ends the old rows when the revision is applied after payment.
//   - The portal only ever sets Revision_Status to Quoted (a payable change) or Under Review (referred, for the office). Awaiting
//     Payment comes with the checkout (R3-3). Approved, Scheduled and Applied are Creator's.
//   - The same quote is saved once: a repeat returns the open revision. A change already in flight (Awaiting Payment, Approved,
//     Scheduled) blocks a new one.
const crypto = require('node:crypto');
const { HttpError } = require('./errors');
const { COVER_TYPE_BY_CODE, IPT_RATE } = require('./insurance');

const uri = s => encodeURIComponent(String(s));
const money2 = pence => Math.round(pence) / 100;
const IN_FLIGHT = new Set(['Awaiting Payment', 'Approved', 'Scheduled']);
const REUSABLE = new Set(['Draft', 'Quoted', 'Under Review']);
const FEE_SKU = 'FEE-MTA';
const EMPLOYEE_FEE_SKU = 'MEM-FULLNS-Y';
// The zero-rated part of the GBP 55.00 membership fee (the rest is standard rated and includes VAT).
const EMPLOYEE_FEE_ZERO_RATED_PENCE = 3800;

// The VAT in what is charged on top of the premium: the adjustment fee (all standard rated, VAT included) and the pro-rated employee
// membership fee (standard rated apart from its zero-rated part). Premiums carry IPT, not VAT.
function vatPence(lines, term) {
  let vat = 0;
  for (const l of lines || []) {
    if (l.sku === FEE_SKU) vat += Math.round(l.totalPence / 6);
    if (l.sku === EMPLOYEE_FEE_SKU) {
      const zero = term ? Math.round((EMPLOYEE_FEE_ZERO_RATED_PENCE * l.quantity * term.days) / term.total) : 0;
      vat += Math.round((l.totalPence - zero) / 6);
    }
  }
  return vat;
}

// A readable, unique name. The quote id is the reference once a policy is known; a request that has none (nothing to quote yet) gets a
// random request reference so the name is still unique.
const revisionName = (prefix, quoteId) =>
  (
    String(prefix || 'MTA').trim() +
    ' ' +
    (quoteId || 'REQ-' + crypto.randomBytes(5).toString('hex').toUpperCase())
  ).slice(0, 120);

// read(path) -> rows, create(module, record) -> id, update(module, id, fields), all against the CRM.
async function saveRevision({
  read,
  create,
  update,
  contactId,
  dealId,
  cover,
  asked,
  quote,
  details,
  outcome,
  reasons,
  lines,
  namePrefix = '',
}) {
  const policy = cover.insurance;
  if (!policy || !details.quoteId)
    throw new HttpError(409, 'NO_POLICY', 'We could not find a current insurance policy on this membership.');
  const existing = await read(
    'Policy_Revisions/search?criteria=' +
      uri('(Policy:equals:' + policy.id + ')') +
      '&fields=' +
      uri('Revision_Status,After_Quote_ID,Policy'),
  );
  const mine = existing.filter(r => String(r.Policy?.id || policy.id) === String(policy.id));
  if (mine.some(r => IN_FLIGHT.has(String(r.Revision_Status || ''))))
    throw new HttpError(
      409,
      'REVISION_IN_PROGRESS',
      'You already have a change in progress on this policy. Please wait for it to finish or call the office.',
    );
  const same = mine.find(r => r.After_Quote_ID === details.quoteId && REUSABLE.has(String(r.Revision_Status || '')));
  if (same)
    return { id: String(same.id), status: same.Revision_Status, quoteId: details.quoteId, reused: true, rows: 0 };

  const payable = outcome === 'PASS';
  const status = payable ? 'Quoted' : 'Under Review';
  // What the member asked for, with the repeated declarations and confirmations, so the office can pick it up without asking again,
  // and so Creator knows which rows the change removes.
  const payload = {
    v: details.rulesVersion || null,
    source: 'portal_v2',
    contactId,
    quoteId: details.quoteId,
    outcome,
    reasons: payable ? [] : reasons,
    term: details.term,
    change: asked,
    items: quote.items.map(i => ({
      code: i.code,
      label: i.label,
      kind: i.kind,
      replacesId: i.replacesId || null,
      netPence: i.netPence,
    })),
    removePeople: asked.removePeople,
    // Rows Creator ends when it applies the revision, each covered up to and including effectiveTo (the day before the new cover starts).
    endings: quote.endings || [],
  };
  const header = {
    // Policy_Revisions.Name is mandatory text of up to 120 characters and not auto-numbered.
    Name: revisionName(namePrefix, details.quoteId),
    Policy: policy.id,
    Membership: dealId,
    Change_Type: 'MTA',
    Change_Scope: 'Policy Only',
    Revision_Status: status,
    Requested_Effective_Date: asked.effectiveDate,
    After_Quote_ID: details.quoteId,
    Request_Details: JSON.stringify(payload),
    ...(payable
      ? {
          Premium_Delta_Net: money2(quote.premiumNetPence),
          IPT_Delta: money2(quote.iptPence),
          VAT_Delta: money2(vatPence(lines, quote.term)),
          MTA_Fee: money2((lines || []).filter(l => l.sku === FEE_SKU).reduce((t, l) => t + l.totalPence, 0)),
          Fee_Waived: false,
        }
      : {}),
  };
  const revisionId = await create('Policy_Revisions', header);
  let rows = 0;
  if (payable) {
    try {
      for (const item of quote.items) {
        let personId;
        if (item.person) {
          personId = await create('Insured_People', {
            Policy: policy.id,
            Policy_Revision: revisionId,
            Name: [item.person.firstName, item.person.lastName].filter(Boolean).join(' ') || 'Unnamed',
            First_Name: item.person.firstName || undefined,
            Last_Name: item.person.lastName || undefined,
            Person_Type: item.person.type === 'subcontractor' ? 'Subcontractors' : 'Employees',
            Status: 'Draft',
            Effective_From: asked.effectiveDate,
            Effective_To: policy.endDate || undefined,
          });
          rows += 1;
        }
        const ipt = Math.round(item.premiumPence * IPT_RATE);
        await create('Insurance_Extension', {
          Policy: policy.id,
          Policy_Revision: revisionId,
          Cover_Type:
            COVER_TYPE_BY_CODE[item.code] || (item.code.startsWith('TREATMENT_') ? 'Treatment' : 'Ad Hoc Adjustment'),
          Cover_Code: item.code,
          Sum_Insured: item.sumInsured || undefined,
          Premium_Net: money2(item.premiumPence),
          IPT_Rate: IPT_RATE,
          IPT_Amount: money2(ipt),
          Gross_Amount: money2(item.premiumPence + ipt),
          VAT_Rate: 0,
          VAT_Amount: 0,
          VAT_Classification: 'Exempt per source',
          Status: 'Draft',
          Effective_From: asked.effectiveDate,
          Effective_To: policy.endDate || undefined,
          Supersedes_Extension: item.replacesId || undefined,
          Insured_Person: personId,
        });
        rows += 1;
      }
    } catch (e) {
      // A half-written revision must not look payable. The draft rows that were made stay Draft and linked to a Withdrawn revision.
      await update('Policy_Revisions', revisionId, { Revision_Status: 'Withdrawn' });
      throw e;
    }
  }
  return { id: String(revisionId), status, quoteId: details.quoteId, reused: false, rows };
}

module.exports = { saveRevision, revisionName, vatPence, IN_FLIGHT, REUSABLE };
