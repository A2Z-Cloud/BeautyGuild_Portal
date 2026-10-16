# Mid-Term Adjustment process | design review

**Status: proposed workflow; not an approved operational procedure.**
Covers CRM staff widget first, with later portal self-service consuming the same MTA services.

## 1. Entry and eligibility

Staff open an active membership transaction or insurance policy and select "Manage MTA" (or enter from the Staff Workspace). A server-verified context binds the Contact, CRM Membership Deal, policy, existing cover versions and permissions. Avoid relying on a Contact ID copied from a query string.

Portal users must be shown only explicitly allowed amendment categories; staff have separate approval and override permissions. An action allowed for Guild staff is not automatically eligible for portal users.

## 2. Prepare a change (without altering live cover)

- Read the *current* effective policy and membership state.
- Record requested effective date and proposed changes in an MTA draft linked to Policy_Revisions.
- Support membership-only, insurance-only or combined scopes where supported by the verified CRM schema.
- Distinguish adding/removing/switching people, treatments, teaching, property cover, turnover/wage roll, membership branches and items.
- Protect against stale baseline versions, another open revision and duplicate requests.

## 3. Calculate and decide

An authoritative backend engine calculates cover-by-cover annual values, pro-rata deltas, Insurance Premium Tax, membership tax where relevant, adjustment fee/waiver and total payable or potential refund. Preserve both **this adjustment amount** and **revised annual policy totals**. Store rounding, tax and calculation versions for audit.

Underwriting returns pass, refer or stop with specific reasons; send referral/reduction/refund cases to the permitted staff process. A staff waiver requires an authorised user, reason and stored approval.

### Example for document/UAT comparison only

The earlier customer sample had: annual pre-endorsement total GBP 36.40, endorsement amount GBP 224.69 (including GBP 5.00 fee), and revised annual total GBP 261.09. These are **sample document values, not an approved rate calculation**. Do not hardcode them into the quote engine.

## 4. Declarations, review, approval

Require current declarations appropriate to the chosen amendment and preserve exact answers, consent wording/version, timestamp and the identity that submitted them. Show the full before/after impact before confirmation.

Approval should be explicit where required. A saved draft or a positive quote must not immediately activate insurance.

## 5. Payment and settlement

- Positive-payable cases: create or reuse one server-backed Stripe Checkout for the specific revision/quote. Payment intent/session IDs must be unique and idempotent.
- Zero-charge cases: confirm an approved no-charge fulfilment route; do not force a fake GBP 0 Checkout.
- Credit/refund cases: require CRM staff/Finance decisions, approved amounts and credit-note or refund recording.
- Redirect success is not payment confirmation. Confirm through trusted webhook or reconciliation and protect from replays.

## 6. Apply/schedule revision

After all required approvals, settlement checks and effective-date conditions pass, update the appropriate policy/membership records; link new/removed/superseded cover rows to this revision; retain history. Avoid rewriting earlier schedule/statement documents. Process retries must not duplicate extensions, payments or policy replacements.

Cancellation and new-policy replacement (for example Salon to Non-Salon) must follow separately approved rules; it is not a generic in-place edit.

## 7. Documents, correspondence and audit

Generate the required endorsement schedule, Membership Adjustment Letter, Statement of Fact, membership certificate and relevant approved policy wordings/terms **as applicable to the change**. The sample receipt pack included multiple PDFs, but no universal eight-document rule has been confirmed. Store approved wording versions, document IDs/WorkDrive references, generation/delivery status and the exact customer-facing revision. Make revisions discoverable in portal Documents and staff history.

Failure to generate/send a document is tracked and recoverable without losing a completed payment or reapplying the revision.

## 8. Exceptions and recovery

Surface authorisation failure, referred or stopped underwriting, stale quote, expired policy, missing CRM relationships, payment failure/duplicate, effective-date collision, partial application, document failure and failed email dispatch. No failure may silently mark a member insured, make a refund or record a false "clear" result.

## Key open approvals

See requirements/mta/README.md for business approvals, specifically proration, fee exemptions, insurer minimum premium rules, replacement/cancellation rules, refund/credit authority, document templates and Creator/Books/Stripe reconciliation.
