# Mid-term changes (MTAs): the Creator functions, drafted

Drafted 5 November 2026 for the Creator payments app (Zoho Creator app `beauty-guild-payments`), following [creator-payments-app.md](../creator-payments-app.md) sections 6.1 to 6.9. The portal side is merged and deployed to Development with its switches off.

**Status: DRAFT, NOT PASTED INTO CREATOR, UNTESTED.** Nothing here has been run. Do not enable the portal's `PORTAL_INSURANCE_CHANGES_PAYMENT` switch until:
1. The CRM automation check in section 6.7 is done (draft rows and revisions cannot activate cover or send documents).
2. These functions are in Creator, saved without errors, and the tests in section 6.8 pass in Development.

| File | What it is | Spec |
|---|---|---|
| [Stripe.process_log_row.mta-routes.deluge](Stripe.process_log_row.mta-routes.deluge) | A patch to the dispatcher: routes `insurance_change`, `membership_change` and `checkout.session.expired` | 6.2, 6.6 |
| [Creator.process_insurance_change.deluge](Creator.process_insurance_change.deluge) | Verifies a paid insurance change, checks every revision before changing anything, records the invoice and payment, applies the revisions in date order, pushes to Books | 6.2, 6.3, 6.4 |
| [CRM.apply_policy_revision.deluge](CRM.apply_policy_revision.deluge) | Applies ONE revision: Approved, then Scheduled (future date) or applied now (Draft rows Active, replaced rows Superseded, removed people Removed, revision Applied, documents Regenerate). Never touches the policy's own statuses | 6.3 |
| [Creator.apply_scheduled_revisions.deluge](Creator.apply_scheduled_revisions.deluge) | The daily schedule: applies revisions whose date has come, and retries ones stuck in Approved | 6.5 |
| [Creator.expire_insurance_change.deluge](Creator.expire_insurance_change.deluge) | An unpaid checkout expired: revisions back from Awaiting Payment to Quoted | 6.2 |
| [Creator.process_membership_change.deluge](Creator.process_membership_change.deluge) | A paid branch or flat add-on bought mid-term: Membership_Extension rows, invoice, Books | 6.6 |

## Values used

Status values and the `(REC).` spellings are the live CRM picklist values read on 5 November 2026 (see 6.7). Write them exactly as spelt.

| Where | Value | Meaning here |
|---|---|---|
| Insurance_Extension `Status` | Draft, Active | A new row waits Draft, then becomes Active |
| | Superseded | A row replaced by an increase or swap |
| | Cancelled, `Expired (REC).` | Not set by these functions (a removed cover row is not part of the first slice, and expiry is the CRM's) |
| Insured_People `Status` | Draft, Active, Removed | A removed person becomes Removed |
| Policy_Revisions `Revision_Status` | Quoted, Awaiting Payment (portal) | Creator sets Approved, Scheduled, Applied |

## What is not done, and what to confirm

- **Where `Document_Status` lives.** `CRM.apply_policy_revision` assumes `Policy_Revisions` (a variable at the top). Confirm with the CRM owner.
- **Books shows one invoice per payment.** Splitting it by revision (one adjustment per start date, `FEE-MTA` once per date) needs the checkout lines to carry their revision. Not done.
- **Books items.** The premium lines (`INS-*`, `CALC-*`), `INS-IPT`, `FEE-MTA` and `MEM-FULLNS-Y` must all exist in Books by those codes, or the mapping stops with a clear error.
- **A branch's yearly price from the next renewal** (`branch_yearly_amount`): adding it to the renewal subscription is a Stripe write, which Creator does not do today. Decide who does it. `process_membership_change` records the extension for the rest of the term only.
- **A flat add-on and a partial failure.** `process_membership_change` creates the CRM rows once per payment. If it fails part way, a retry could create the flat add-ons again. The comment in the function says what to check.
- **Field names.** `Policy_Revision.id`, `Supersedes_Extension`, `Effective_From`, `Effective_To`, `Request_Details`, `Stripe_Checkout_Session_ID` and `Applied_Effective_Date` follow the portal's writer (`insuranceRevisions.js`) and the R3 plan. Check them against the CRM when pasting.
- **Invoice Records for a one-off payment** follow `process_additional_venue_payment` (blank invoice id, the payment intent as the reference).
- **Not covered:** a revision paid for while one is already Approved or Scheduled is skipped as a repeat. A monthly payer is not payable online (the portal refers it).

## The checks that matter most

The handler does these before it changes anything, and records the reason on the log row if one fails: the amount charged equals `total_amount`, every revision id exists, each is Awaiting Payment for this session with the quote id the metadata names, and each belongs to the policy in the metadata. After that a repeated, retried or out-of-order event is safe because each revision is keyed by its own id and an Applied one is skipped.
