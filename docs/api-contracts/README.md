# Frontend / backend API contracts

The backend owner will supply/confirm service endpoints. Frontend development may use **explicitly labelled local mocks** pending integration.

For each endpoint, record:
- Method, route and purpose
- Authentication and ownership checks
- Request field names, types and required/optional status
- Response schema including stable IDs and status enums
- Validation and error responses
- Retry/idempotency and payment state transitions
- CRM/Creator/Stripe record authority
- Implementation status and owner

Expected contract groups: identity, drafts, accreditation, membership, insurance, payments, documents and dashboard.

## Security contract

Catalyst session/user identity is verified server-side. Client-provided Contact IDs alone are not authorisation. Public reference documents are distinct from confidential documents belonging to Contacts, members, centres or policies.

## Draft minimum

Each CRM draft should have a stable ID, service type, CRM Contact association, progress/current step, version/revision, status, updated timestamp and a complete restorable payload. The backend owns server-side storage and permissions. The frontend owns restore/navigation and user-facing errors.

## Payments

The frontend displays backend-authoritative totals, calls the backend checkout endpoint and handles success/cancel/pending return states. It must not independently calculate payable totals or mark a policy/membership active because the user returned from Stripe.

These are contract expectations, **not a claim that endpoints already exist**.
