# Proposed MTA lifecycle (logical model only)

No state machine is implemented or mapped to CRM picklist values. CRM status names, Blueprint and transitions must be confirmed before development.

1. Draft: proposed changes captured against a fixed current policy/membership version.
2. Quoted: backend-generated pricing and underwriting outcome, with expiry/version.
3. Referred or awaiting approval: stop automated checkout until an authorised decision.
4. Awaiting payment (where positive charge exists), or awaiting approved manual settlement (for credits, waivers or refunds).
5. Paid / settlement confirmed: only trusted webhook or reconciliation may confirm this.
6. Scheduled (future effective date) or Applying.
7. Applied: live records changed exactly once, linked to revision/version; document generation and dispatch tracked independently.
8. Exception: failed calculation, stale quote, payment reconciliation, partial CRM updates, document failure, cancellation or reversal.

Rules: a draft must never update active cover; duplicate submissions must be idempotent; a quote must be invalidated if source policy changes; future-dated actions must not be backdated by a client clock; refunds must be staff-authorised. Existing source records must remain auditable, not silently overwritten.
