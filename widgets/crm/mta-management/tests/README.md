# Tests (not yet implemented)

This scaffold deliberately includes **no automated tests and claims none have passed**. Build the following before enabling MTA writes:

- Unit: client input state, change-set validation, read-only comparison presentation, navigation persistence, error display.
- Contract: backend quote/version fields, authentication/authorisation, underwriting status, quote expiry and idempotency key.
- Integration: CRM SDK record context, policy/revision lookups, permitted roles, actual Blueprint/workflow side effects, Creator/Books/Stripe reconciliation.
- End-to-end: journey cases listed in docs/uat-scenarios.md including refunds, cancellations and delayed webhooks.
- Regression: existing Staff Workspace record views, membership add-on flows and Catalyst portal records unaffected.

ZET validate/pack, sandbox CRM verification and UAT are future release gates. Do not run against production or import real customer data into tests.
