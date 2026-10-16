# Planned MTA widget components

These are design slots, not implemented UI components.

| Candidate component | Purpose |
| --- | --- |
| ContextHeader | Verified Contact/Deal/Policy identifiers, term and status |
| CurrentCover | Read-only policy baseline grouped by people, treatments, premises and other cover |
| AmendmentPicker | Only change categories eligible for this staff member and record |
| ChangeEditor | Proposed changes without mutating active CRM cover |
| QuoteComparison | Before/after lines, effective dates, premium, IPT, fees, credits |
| UnderwritingDecision | Pass, refer or stop with reasons and required staff action |
| ReviewAndApproval | Declarations, approvals, waiver controls and consent evidence |
| SettlementStatus | Trusted payment/refund status, no client-side activation |
| RevisionTimeline | Audit and policy versions, documents and delivery history |

Use compact sections and progressive disclosure. Preserve navigation state when opening related records and returning from native CRM. Components may live in app/ until a build step is explicitly selected.
