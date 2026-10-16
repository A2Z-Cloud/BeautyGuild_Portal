# CRM MTA data mapping | verification register

**Status: initial mapping based on the October CRM Cartographer snapshot and Catalyst V1 code review.** The widget does not contain live CRM metadata; verify all API names, required fields, permissions and supported relations against the target CRM organisation before write operations.

| CRM module | Known/observed relationship | MTA use | Verification |
| --- | --- | --- | --- |
| Contacts | Contact ID, email and correspondence fields | Member identity and communications | Verify permission and verified account binding |
| Deals | Membership transaction (separate from Member Profile) | Membership context, payment and subscription | Confirm Deal layout and active record logic |
| Membership | Member Profile | Member reference | Do not confuse with Deals |
| Insurance_Policy | Membership lookup to Deals; Policy_Type, Previous_Policy | Current insured policy, version/replacement | Verify current state, period and policy references |
| Policy_Revisions | Policy lookup to Insurance_Policy; Membership lookup to Deals | **Proposed** revision header | Validate creation rules, required fields and workflow |
| Insurance_Extension | Policy and cover rows in existing Catalyst code | Changed cover items, premium deltas | Check version/supersession semantics |
| Insured_People | Policy and named person records | Add/remove/swap staff | Check historical/end-date rules |
| Insured_Premises | Policy and insured address details | Property cover changes | Check multi-premises and underwriting |
| Declarations | Insurance_Policy association in Catalyst code | New signed declaration answers | Confirm explicit revision linkage |
| Membership_Extension | Linked to Deals in current portal API | Additional branches and extras | Confirm linking changes to the revision |
| Creator / Books | Invoicing/settlement integration outside this repo | Payments, invoices, refunds/credits | Obtain actual integration and webhook mapping |
| WorkDrive | Existing portal document browsing | Versioned schedules and attachment history | Confirm folder and access model |

## Observed Policy_Revisions fields

From the CRM Cartographer snapshot:
- Policy: lookup to Insurance_Policy.
- Membership: lookup to Deals.
- Change_Type: options observed include MTA, Cancellation, Upgrade, Downgrade.
- Change_Scope: options observed include Policy Only, Membership Only, Both.
- Requested_Effective_Date: date.

The earlier review also noted financial, approval, waiver, effective-date and WorkDrive fields within Policy_Revisions; **their exact API names, limits, mandatory rules and automation behaviour require a fresh live metadata check**. Do not guess or create new fields until mappings are approved.

## Proposed additional data/links (not confirmed present)

- Immutable original-state snapshot/hash, quote-version and pricing rule version.
- Unique revision/idempotency keys; payment session and verified settlement references.
- Item-level before/after deltas and a link from each changed Membership_Extension/Insurance_Extension to its revision.
- Approval and fee-waiver audit (role, reason, timestamp); credit/refund reference.
- Declaration version and document-generation/delivery status; policy replacement reason.
- Applied-at and effective-at timestamps with an explicit failure/retry state.

## Before enabling writes

1. Obtain fresh CRM metadata for affected modules, picklists, lookups, required fields and Blueprint transitions.
2. Confirm whether Policy_Revisions can represent a membership-only adjustment with no policy.
3. Verify module field permissions for Guild staff roles and required CRM SDK scope.
4. Check existing Creator automation on Deal, Policy, Extension and Revision creation/update to avoid duplicate side effects.
5. Approve each write mapping before any data mutation.
