# Beauty Guild | MTA Management (CRM Widget)

**Status: PROJECT SCAFFOLD ONLY - NOT IMPLEMENTED OR DEPLOYED.**
**Workstream:** Mid-Term Adjustments (MTAs) to Guild membership and insurance.
**Location:** widgets/crm/mta-management/
**Host:** Zoho CRM widget, independently packaged; not a Catalyst portal application.

## Purpose

Give authorised Guild staff one controlled place to review a member's current membership and insurance position, propose changes, see a calculated before/after comparison, route exceptions, and track approval, settlement, effective date and document fulfilment. Portal V2 self-service will later use the **same backend MTA services**, with a narrower set of eligible actions.

This is **not** the general-purpose Staff Workspace. The Staff Workspace may supply a customer, Membership Deal, Insurance Policy or Revision context and offer a "Manage MTA" entry point, but the MTA process remains a separate widget.

## Proposed journeys (subject to approval)

- Membership-only adjustments: additional branches and selected member extras.
- Policy MTAs: named people, treatments, teaching, property and liability changes where eligible.
- Combined membership/insurance adjustments in one review.
- Changes resulting in referrals, manual review, credit/refund or replacement/cancellation policies.
- Effective-dated amendments with a clear pre-change and post-change comparison.
- Document packs, transaction history and staff audit evidence.

The initial CRM widget should be developed as staff-assisted processing. Portal self-service eligibility is applied separately and must **never** be inferred from the fact a staff action is available.

## Design and system ownership

- **CRM is the record authority.** Policy_Revisions is the proposed MTA transaction header, linked to Insurance_Policy and/or a membership transaction (Deals).
- **A backend service is the pricing/underwriting authority.** The widget does not calculate premiums or tax or bypass referral rules.
- **Payment status comes from trusted fulfilment/webhook reconciliation**, not Stripe redirects or a staff-entered status value.
- **Applying a revision must be atomic/idempotent as far as the integration allows.** Avoid direct edits to active policy cover when saving a draft.
- Retain snapshots, effective dates, approval evidence, monetary components and versioned documents. Treat reductions/refunds and salon/non-salon replacement as separate controls.
- Use CRM user permissions for the staff UI; backend services must independently authorise all sensitive operations.
- No tokens, customer data exports, secrets or real policy records are stored in GitHub.

## Intended UI (minimal and contextual)

1. Context header: member, membership transaction, policy, term, state.
2. Current position (read-only), with expansions for people, treatments, premises, covers, extensions and branches.
3. Select change categories, then edit proposed state only.
4. Before/after comparison, effective date, net premium delta, IPT, fees, credits and total due/refund.
5. Declarations, underwriting outcome, staff review/approval and permitted fee waiver.
6. Checkout/manual settlement status, application/scheduling and versioned documents.
7. Revision history, exception recovery and explicit "Open in CRM".

Keep Staff Workspace navigation context on return; deep-link by stable IDs (not names). Record ownership and link permissions must be checked by the receiving widget/service.

## Project contents

- app/widget.html, app/styles.css, app/widget.js: **visual shell only**. No CRM SDK calls or working MTA actions yet.
- src/components/README.md: planned reusable widget screens.
- src/services/README.md: planned clients and ownership boundaries.
- src/workflows/README.md: proposed status-machine boundaries.
- docs/mta-process.md: proposed process and exception routes.
- docs/crm-field-mapping.md: known modules and field validation backlog.
- docs/uat-scenarios.md: journey-based acceptance checklist.
- tests/README.md: test plan (no tests claimed as executed).
- [MTA requirements](../../../requirements/mta/README.md): source register and unresolved decisions.
- [MTA API contract](../../../docs/api-contracts/mta.md): **draft endpoint proposal; none implemented here**.
- [Delivery phases](../../../docs/delivery/mta-plan.md): work breakdown and release gates.

## Build / deployment boundary

No package manager, ZET manifest, CRM SDK configuration, API connection, Stripe key, backend function or deployment has been added. The app/ files are only a static review shell.

After approving the workflow and actual CRM relationships, initialise a **dedicated ZET project**, integrate its SDK/permissions in this widget, build and run `zet validate` and `zet pack` locally, then review the package before any CRM installation. Never assume running the root repository deploys this project.

## Sources and verification

The design draws on the earlier MTA workbook, sample Membership Adjustment Letter and insurance Endorsement Schedule, example receipt/document pack, CRM Cartographer snapshot, and existing Beauty Guild Catalyst code review. Those customer documents are **not committed**. Proposed rules are not treated as underwriter-approved until reconciled by the Guild.

**No widget build, pricing model or CRM record mutation should be considered approved merely because this scaffold exists.**
