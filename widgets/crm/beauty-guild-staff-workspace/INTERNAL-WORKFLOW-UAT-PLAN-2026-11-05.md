# Beauty Guild — Internal Workflow, Documents & Communications UAT

**Prepared:** 5 November 2026  
**Execution surface:** Zoho CRM Staff Workspace (Slate branch `feature/beauty-guild-staff-workspace-slate`)  
**Release class:** Internal Development QA only — **not customer UAT; not production sign-off**.

## 1. Objective

Use the staff widget to initiate supported business actions on disposable, synthetic Contacts, membership transactions, insurance policies, accreditation applications and related records. Independently verify **four outputs**:

1. The correct CRM workflow/function executed and the right linked records, dates and statuses changed.
2. Required **documents** were generated in the correct authorised WorkDrive folder, with correct content, source record and version.
3. Required **emails** were actually delivered to the approved QA inbox, using the correct template, recipient, sender, content and timing, with no duplicate send.
4. Stripe test events, Creator processing and Books test invoices/credit notes reconcile with the CRM outcome when the scenario involves money.

A widget success toast or a CRM status change alone is **not evidence** that an email was delivered, a document was issued, or a payment was verified.

## 2. Existing Phase 1 versus this new Phase 2

The current checked-in `app/widget.js` sets `OPERATIONAL_UAT=true`. It deliberately hides or blocks New Application, MTA, cancellation/downgrade, voucher, renewal/upgrade and payment actions. This **must remain protected** for Operational UAT Phase 1.

Prior documentation:
- [Operational QA handover, 3 Nov](OPERATIONAL-UAT-QA-HANDOVER-2026-11-03.md) — O-01 to O-20.
- [Live smoke record, 4 Nov](OPERATIONAL-UAT-SMOKE-TEST-2026-11-04.md) — includes O-11 and O-12, which still require manual tester completion, and unresolved custom-view, restricted-role and server-side checks.

**Phase 2 is a separate controlled Development QA release.** Do not simply set the global `OPERATIONAL_UAT` flag to `false` on the customer-facing build. Independently require staff role/authorisation, QA environment gating and backend permissions for each transaction route. Verify the switch and effective permissions server-side. Use test-mode Stripe and isolated Creator/Books/email integrations.

## 3. Lifecycle-first test design

Use synthetic contacts that each have an intentional lifecycle, so outcomes can be tested together rather than as disconnected buttons.

| Fixture | Seed and run order | What it proves |
|---|---|---|
| QA-A | Contact → Associate Deal → paid → renewal → upgrade | Member profile, CRM transaction states, welcome/renewal messages, acceptance letter, invoice |
| QA-F | Contact → Full membership + Insurance → clear underwriting/sanctions → verified payment → documents → regeneration | Eligibility, policy activation, cover lines, draft/approved document distinction |
| QA-R | Contact → referred/blocked Insurance → review outcome → endorsement/requote | Negative underwriting paths, tasks, no premature payment, stale quote controls |
| QA-C | Training Centre applicant → accreditation → test payment → approval → verification | Receipt, acceptance letter, status transitions, website publication |
| QA-M | Active policy → MTA quote → revision save → payment → effective-date application | Before/after cover, audit, supersession, updated document and communication |
| QA-X | Paid membership → cancellation quote → authorise → refund → retry | No side effect from quoting; idempotent cancellation/Stripe refunds and customer email |

Use a **new Contact and linked records per fixture where practical**, not shared live customer records. Store the fixture IDs, tester, environment, build SHA and baseline status before starting.

## 4. Scenario catalogue

The companion *BeautyGuild_Internal_Workflow_UAT.xlsx* contains **34 detailed cases**, with preconditions, widget actions, independent assertions, priorities, execution status and evidence fields.

| Suite | IDs | Coverage |
|---|---|---|
| Operational carry-forward | OP-11, OP-12 | Safe insurance/accreditation field changes, workflow confirmations and audit evidence |
| Membership | MB-01–MB-05 | New/renewal/upgrade, payment failure, acceptance letter and receipt emails |
| Insurance | INS-01–INS-12 | Member gate, sanctions, review outcomes, endorsement, trusted payment, document generation/regeneration, failure recovery and follow-up |
| Accreditation | AC-01–AC-05 | Submission, paid/failed notices, approval/letter and verification/publication |
| MTA | MT-01–MT-03 | Current cover, quote, referral, revision, payment and effective-date application |
| Cancellation | CN-01–CN-03 | Quote-only, authorisation/refund and idempotent retry |
| Creator/Comms | PAY-01–PAY-03 | Webhook replay, Books reconciliation and email failure |
| Security | SEC-01 | Restricted staff and cross-contact document access |

**P0 first**: paid/unpaid state integrity, fail-closed insurance underwriting, correct recipient and document, no duplicate refunds/emails, safe permissions, cross-contact isolation.

## 5. Workflow inventory: verification status

The existing [Staff Workspace specification](SPECIFICATION.md) includes a historical snapshot of these six active Insurance workflow rules, but **their current configuration and execution results need live reconfirmation**:

- `A2Z - INS Member Gate` → `a2z_ins_member_gate`
- `A2Z - INS Sanctions Roll-up` → `a2z_ins_sanctions_rollup`
- `A2Z - INS Review Completion` → `a2z_ins_review_completion`
- `A2Z - INS Policy Activation` → `a2z_ins_policy_activation`
- `A2Z - INS Documents on Activation` → `a2z_ins_policy_documents`
- `A2Z - INS Documents Regenerate` → `a2z_ins_policy_documents`

The `a2z_ins_incomplete_followup` scheduler must additionally have a verified schedule (a function definition alone does not prove it runs).

For Membership and Accreditation, the existing widget enumerates workflow-triggering fields and describes expected emails, but a separate **current CRM rule / function / template mapping** is required. Do not treat descriptions in `WF_FIELDS` as proof that a configured email was delivered. Record live rule names and template IDs in the workbook's Workflow Inventory.

## 6. Document and communication acceptance

For **each triggered email**, capture:
- trigger and CRM source record; template ID/version; QA inbox and sender;
- provider message ID, timestamp, delivery result, inbox screenshot/export;
- rendered subject, recipient, identifiers, dates, amount, links and footer;
- no duplicate sends on retries; no success messages on failed or blocked workflows.

For **each generated document**, capture:
- WorkDrive file ID, private link/folder, generation time, version and source record;
- correct identity, periods, pricing/tax, cover, wording, declarations and approval state;
- no wrong Contact or public sharing; regenerate and failure/recovery behaviour.

**Important insurance restriction:** the documented `a2z_ins_policy_documents` function produces **DRAFT placeholder** files. A generated placeholder is *not* an issued policy schedule, statement of fact or evidence of insurance. Test and record this as a draft outcome until legal/template approval and formal issuance are established.

For **payment-backed communications**, also inspect Stripe test event IDs, Creator webhook status, subscription and invoice records, and Books item/tax mapping. Never make an ordinary CRM field edit to `Payment_Status=Paid` solely to force a success email or activate insurance.

## 7. Per-case execution (QA operator)

1. Select case and synthetic customer; note case ID, tester, build SHA and test mode.
2. From the Staff Workspace, open the correct record; capture **before-state** and expected side effects.
3. Run the authorised widget action, or its approved native-CRM step if the widget explicitly delegates it. Do not bypass a gated action.
4. Capture immediate output, actual workflow execution status, after-state, Notes/Tasks and source record IDs.
5. Independently check WorkDrive, approved test inbox/provider logs and Creator/Stripe/Books where applicable.
6. Record each independent assertion as **Pass / Fail / Blocked / N/A** and link private evidence.
7. A case is **Pass only if every applicable assertion is Pass**. Any failed assertion is a defect; unavailable/unsafe infrastructure is Blocked.
8. Retest after fixes with a reset or fresh fixture. Do not delete QA evidence while incidents remain open.

The workbook includes a live pass/fail/blocker dashboard, scenario matrix, execution log, communications checklist, environment checklist and verification-pending workflow inventory.

## 8. Proposed QA workbench inside the widget (separate implementation)

The widget should eventually expose an **Internal QA** section only in a separately authorised Development environment, with:

- searchable cases grouped by Membership, Insurance, Accreditation, MTA and Communications;
- *Start run* tied to a synthetic CRM Contact/record, not arbitrary or production IDs;
- step-by-step instructions for the authorised widget action and four independent assertion areas;
- links that open the correct record, related lists and document sections; **no hidden state-changing shortcuts**;
- tester/run/build metadata, evidence links, defect ID and reviewed outcome;
- persistent results in a dedicated QA store (e.g., a separate Creator Development QA app) rather than browser-only state or notes mixed into customer records;
- role-restricted access, QA audit, run export and explicit blocked states.

This workbench is a **proposed next implementation**, not a feature already deployed in the current widget. Its initial version may remain read-only guidance and evidence capture; enabling any transaction requires independent backend permissions and tested Development routes.

## 9. Release gate

No customer UAT until: all P0 scenarios pass or have formally accepted exclusions; current CRM workflow/template mapping has been signed off; generated docs are explicitly draft/issued as appropriate; no unverified payment or duplicate messaging; limited staff permissions verified; failed/retry paths verified; and **QA + CRM + insurance + communications + finance owners approve the same build SHA**.

No production CRM, Creator, Stripe, WorkDrive or email systems should be mutated solely to run this suite.
