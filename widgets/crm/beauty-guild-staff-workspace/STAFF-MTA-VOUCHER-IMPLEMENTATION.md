# Staff Workspace MTA and voucher implementation handoff
Date: 28 October 2026
Branch: feature/beauty-guild-staff-workspace-slate

## Widget changes on this branch
- Insurance Policy record action **Manage changes (MTA)** opens a non-mutating current-policy context panel with effective date.
- Membership and Deals record action **Voucher / waiver** opens staff input panel.
- Membership application review displays referral/voucher code and staff waiver fields with required reason/Other note checks.
- Inputs are retained only in the current widget browser session. A disabled live-quote CTA explicitly explains the missing signed adapter.
- No policy activation, CRM save, waiver redemption, payment status change or fabricated quote is performed.

## Backend and customer-portal work required before enabling end to end
1. Deploy existing /staff/ping, /staff/me, /staff/quote and /staff/insurance-change/revision in Catalyst Development behind the existing feature switch. Complete the one-function CRM action dispatcher, including ping, and verify user signing, scopes and error responses. This work is outside the static widget branch.
2. Add a staff-authorised, read-only current-cover endpoint (or approved reusable action) returning policy, insured people, premises, live cover and open revisions with Contact ownership checks. The widget cannot safely infer cover using unrelated CRM rows.
3. Complete the signed staff MTA quoting adapter, using shared Portal V2 change/proration/eligibility rules. Existing /staff/quote is the intended backend quote candidate; validate the exact change payload and responses before enabling the widget button.
4. Wire the already-built staff insurance revision save action to the widget with idempotency, draft-only writes, Note audit and a visible auditNote=false warning. Existing live cover must not be mutated.
5. Confirm eligibility and backend SKU mapping for joining-fee, one-off extras, additional branch and the proposed MTA fee waiver. The generic UI EXTRA and BRANCH values are **placeholders**, not approved catalogue SKUs; never submit them unchanged to the quote endpoint.
6. Complete the Creator voucher usage-history reader, reservation key and redemption handling. Voucher redemption remains disabled until verified; staff quote should show a clear unavailable/error state.
7. Complete shared CRM-backed staff/customer drafts so selected codes, waivers and declaration provenance can be resumed without duplicate applications.
8. Do not expose payment links until Creator V2 verified Stripe payment and revision application are tested. Stripe/Creator retains payment status authority; manual override is a separate reasoned and CRM-Note-audited exception workflow.
9. Synchronise portal-defs with Portal V2 source and add drift tests. Existing copied journey rules are known to diverge.
10. Test live CRM profile/field permissions, signed calls, quote parity, referral handling, waiver exclusions, repeated revision requests, stale application conflicts, and end-to-end Creator processing.

## Current test status
The five updated files have been verified present on GitHub. Automated JavaScript tests, CRM iframe verification and Slate deployment verification have **not** been completed. This is a safe UI integration increment, not a ready-to-transact MTA or voucher release.
