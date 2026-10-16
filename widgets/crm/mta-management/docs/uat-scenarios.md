# MTA journey-based UAT plan

**Status: test scenarios only; not executed.** Use synthetic data or explicitly approved test accounts. Capture CRM ID, revision ID, test role, environment, quote version and expected versus actual result.

| ID | Scenario | Expected outcome |
| --- | --- | --- |
| MTA-01 | Staff launch from active Membership Deal | Correct member/policy context, independent authorisation, no unintended write |
| MTA-02 | Staff launch from Insurance Policy and return to Staff Workspace | Selected policy and prior tab/list context retained |
| MTA-03 | Add additional membership branch | Correct eligibility, tax/proration and fee exemption or waiver according to approved rule |
| MTA-04 | Buy membership items only | Item quantities and one-off amounts correct; no insurance policy change |
| MTA-05 | Add named person within allowed limits | Additional premium and declarations; pending until authorised and paid |
| MTA-06 | Remove/swap named people resulting in a credit | Portal blocked/referred where applicable; staff credit/refund process used |
| MTA-07 | Add treatment extension / teaching cover | Correct qualification/referral decisions and revised policy schedule |
| MTA-08 | Increase business equipment sum insured | Before/after insured amount and premium, IPT and fee displayed and saved |
| MTA-09 | Reduce cover | Correct referral/refund route, no accidental automatic refund |
| MTA-10 | Salon / Non-Salon replacement | Original policy remains auditable; cancellation/new term linked and dates valid |
| MTA-11 | Fee waived by authorised staff | Waiver reason and approval recorded; inappropriate role denied |
| MTA-12 | Same-day and future-effective change | Single effective date per amendment where required; no early application |
| MTA-13 | Quote becomes stale after policy change | Quote rejected and recalculated against new baseline |
| MTA-14 | Payment completed, webhook delayed or duplicated | No false activation; eventual exactly-once application |
| MTA-15 | Payment fails / is cancelled | Existing active policy unchanged; revision recoverable |
| MTA-16 | Document generation/email fails after payment | Completed payment not lost; retry only document delivery |
| MTA-17 | Another member's record ID supplied by client | Access denied, no customer data or changes leaked |
| MTA-18 | Verify sample endorsement and letter totals | Separate this-adjustment amount from revised annual policy total; no hardcoded sample prices |
| MTA-19 | Mobile/narrow CRM panel and keyboard navigation | Readable compact UI, accessible controls and no horizontal overflow |
| MTA-20 | CRM SDK/page retrieval interrupted | Explicit recoverable failure rather than incomplete success |

## Evidence and sign-off

For each run capture quote breakdown, state transition trace, CRM before/after records, payment/webhook references (sanitised), document versions, permissions and defect reference. Cover roles: customer, Guild processing staff, authorised approver and Finance/refund staff.

Acceptance: no staff or customer can activate cover through a client-only action; no payment or policy amendment duplicates on retry; all billed amounts are backend authoritative; document links match the correct revision and policy. Set business expected values only after fee/proration/underwriter rules are approved.
