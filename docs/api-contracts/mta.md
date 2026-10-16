# MTA API contract | proposed, unimplemented

**Status:** DRAFT FOR APPROVAL. None of these routes is confirmed deployed or present in the existing Catalyst API. These names are illustrative and must be agreed with the backend owner before implementation.

## General contract

- CRM staff widget is independently hosted; server derives authoritative identity/permissions, validates record access and enforces role-based approvals.
- Customer portal uses a separately authenticated session and narrower service permissions. Neither can authorise itself by supplying a Contact ID or policy ID.
- Read endpoints return current policy, membership, term, change eligibility and stable version identifiers; write endpoints bind the revision to this verified baseline.
- Every mutation requires idempotency, request validation, audit attribution and explicit safe retries.
- All money values should be integer minor units with currency and tax components, or an equivalent approved exact-decimal contract. Never rely on JavaScript floating-point rounding for payment authority.
- Authoritative backend owns price tables, proration, tax, underwriting, approved fees, effective date, payment confirmation and policy application. UI totals are display-only.
- A quote contains quoteId, expiresAt, rulesVersion, baselineVersion, changeSet, lineItems, grossDue/credit, underwriting outcome and reasons. Final payment must be based on this **server-issued quote**, not recalculated by the browser.
- Revise/audit document generation separately from application and payment states.

## Candidate endpoints (proposals, not existing APIs)

| Method | Suggested endpoint | Expected purpose |
| --- | --- | --- |
| GET | /mta/context?dealId=...&policyId=... | Verify current member/policy and return eligible change types and baseline version |
| POST | /mta/quotes | Price a proposed change set and return itemised quote/underwriting decision |
| POST | /mta/revisions | Create a linked draft with exact quote/baseline references |
| GET | /mta/revisions/:revisionId | Fetch revision state, history, approvals, settlement and document status |
| PATCH | /mta/revisions/:revisionId | Edit permitted draft data using expected version/ETag |
| POST | /mta/revisions/:revisionId/submit | Capture declarations and submit for required review |
| POST | /mta/revisions/:revisionId/approve | Staff-only controlled approval or waiver action |
| POST | /mta/revisions/:revisionId/checkout | Open/reuse approved server-calculated Stripe Checkout |
| GET | /mta/revisions/:revisionId/documents | List versioned, access-controlled documents |
| POST | /mta/revisions/:revisionId/apply | **Internal service/worker only**; not exposed to client widgets |

Refunds, cancellation/replacement and document dispatch actions need their own approved contracts before use; do not overload /apply with unrestricted refunds or insurer decisions.

## Suggested request fields for quotation

- Membership Deal ID and/or Insurance Policy ID, derived/verified server-side.
- Requested effective date, baselineVersion and proposed changeSet grouped by change category.
- Idempotency key for create/pay/submit; quoteId for revision creation.
- No client-submitted final premium, IPT, fee-waiver authority or payment success flag.

## Suggested response and errors

- Context: authorised member/policy reference, active term, baselineVersion, current cover and permitted actions.
- Quote: quoteId, status (PASS / REFER / STOP), reasons, effective date, taxable components, discount/fee application and net payable or potential credit.
- Revision: revisionId, logical state, CRM reference(s), allowed next actions, audit timestamps and payment/document statuses.
- Error semantics: 401 unauthenticated; 403 not authorised; 404 inaccessible/missing record; 409 concurrent revision, stale quote or version mismatch; 422 failed validation/referral/stop; 502 downstream CRM/payment provider unavailable. Exact API conventions to agree.

## Security and completion gates

Do not apply active cover from the browser. A Stripe success URL only indicates return navigation; a trusted webhook/reconciliation event must establish settlement. Save retries must not create duplicate Policy_Revisions, Insurance_Extension rows, refunds or policy documents. The backend must never return another member's data on a guessed policy/Contact ID.

**Ownership:** backend/CRM integration team defines and deploys the service; this repo's widget is a consumer. No Catalyst or CRM backend is created by this document.
