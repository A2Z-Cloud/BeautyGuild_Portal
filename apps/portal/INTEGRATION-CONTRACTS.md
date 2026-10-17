# Portal V2 Milestone 2: frontend API integration boundary

**Status: adapter and UI wiring implemented; LIVE CRM DRAFT ROUTES ARE NOT VERIFIED.** This is a stacked frontend PR. It must be reviewed after Milestone 1, and must not be merged or deployed automatically.

## Ownership and current behaviour

- Frontend only: `apps/portal` request/error adapter, service-specific CRM draft adapter, resumable form state, saved-draft navigation and explicit demo-only messages.
- Backend owner only: Catalyst auth/session and hosting, server-side Contact resolution and record ownership, CRM/Creator data and APIs, Stripe, pricing/underwriting, WorkDrive, Loqate, deployment.
- `VITE_DATA_MODE=demo` is the supported preview. Any other mode is labelled `integration-pending`; it **does not** enable network calls or treat fixture records as live.
- No production API route or credentials were inferred. `VERIFIED_DRAFT_CONTRACTS` in `src/services/drafts.mjs` is intentionally empty. No CRM drafts are sent, fetched, discarded or claimed as saved.
- Login/sign-up, account checkpoint, pricing, checkout, underwriting, Creator, document downloads, Loqate and full CRM record views remain demonstrative or unavailable. Do not enter customer or payment data in demo mode.

## Blocking API contracts

The API-contract document in `docs/api-contracts/README.md` defines expectations, **not** implemented endpoints. For each of the 3 services below, the backend owner must provide an explicit contract and evidence that the route exists. Methods/paths in these tables are not asserted or fabricated.

| CRM draft service | Create | List | Get by stable ID | Update | Discard |
| --- | --- | --- | --- | --- | --- |
| Membership | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| Insurance | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| Accreditation | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED |

For **each** operation confirm the exact method, same-origin route, authentication and authorisation controls, frontend request mapping, response mapping, validation errors, stable draft ID, CRM Contact association, status values, current step, restorable answers, updated timestamp and revision/version. Confirm how a discard is acknowledged and whether it means soft discard, deletion or restoration. Confirm permitted transition states, save-as-draft scope and optimistic-concurrency behaviour (including `409`/`412`).

**Auth gate required before any activation:** verify the signed-in Catalyst session server-side and bind it to a CRM Contact; do not accept a Contact ID from request input as authorisation. Specify unauthenticated (401), forbidden (403) and expired-session flows; csrf protection for mutation routes; same-origin hosting or documented cross-origin session handling; Development/Production ZAID separation; and client-side API paths after deployment. The frontend transport sends browser credentials using `credentials: 'include'` on **same-origin only** routes. It does not create accounts or invent tokens. The backend must enforce Contact ownership on all five actions. Confirm public-to-authenticated account checkpoint and how a draft is created after successful sign-in.

## Activation checklist for the backend owner

1. Supply an approved versioned API contract **for each actual draft service** and validate it on a non-production environment with a test Contact. Do not enable operations that are not implemented.
2. Verify each backend operation and ownership check, including another Contact trying to access or discard the draft, expired sessions, concurrent updates and malformed bodies.
3. Supply explicit route, method, request encoder and response decoder per operation to `VERIFIED_DRAFT_CONTRACTS`. Canonical frontend draft shape: `{id,kind,status,revision,step,updatedAt,answers}`. The decoder must normalise the actual backend schema; the code does not assume the CRM field/API names. `:id` is a URL-encoded path placeholder in verified routes only.
4. Wire a confirmed identity adapter into `portalApi.getIdentity`, returning a verified `{id}` when signed in. Only then set identity capability to true; the client identity check improves UX but is not server-side authorisation.
5. Activate a draft capability only when **all five** verified routes and mappers for that service exist, with tested auth. Keep demo mode visibly labelled until this is done. Do not represent local form state as a CRM save.
6. Test returning from sign-in to the intended journey, Save, deep-link resume, refresh, back navigation, latest revision, discard and error paths. Confirm no sensitive data is placed in localStorage/sessionStorage or in query strings (query carries only opaque draft ID).

## Other services: intentionally unconnected

| Capability | Current frontend state | Required backend confirmation |
| --- | --- | --- |
| Catalyst auth / CRM Contact | Account UI only | Session SDK/hosting, signup, login, Contact linkage/duplicate prevention, reset and logout |
| Prices / membership eligibility | Unavailable | Authoritative quote totals, taxes, frequency, catalogue, UK/international entitlements |
| Insurance underwriting/referrals | Unavailable | PASS/REFER/STOP classification, saved referrals, precise status mapping |
| Stripe checkout and fulfilment | Payment preview only | Checkout session API, idempotency, webhook-confirmed success and policy/membership state |
| CRM record dashboard/read | Clearly labelled fixtures | Contact-owned list/get, status timeline and record deep links |
| Creator, Loqate, WorkDrive | Unavailable | Verified access-controlled APIs, read/link policy and document scopes |
| Discount voucher, MTAs | Deferred | Approved rules, source documentation, separate workstream |

No frontend operation creates a payment, declares insurance active or computes authoritative prices. An unsuccessful API call must always produce an actionable error, not a fake success.

## Test and delivery evidence

- `npm run test`: form validation plus API/contract transport tests, default fail-closed behaviour and an injected verified-contract CRUD test (synthetic test-only routes).
- `npm run build`: Vite frontend bundle.
- `npm run check`: runs both.
- GitHub Actions **Portal V2 frontend checks** runs on the stacked PR; use the PR checks before requesting review. A Catalyst session/CRM integration test cannot be completed until backend contract and environment are supplied.

**Stacking:** This feature branch is based on the exact Milestone 1 PR head `feature/portal-v2-m1-preview` at commit `23eb75b0cb6c3b146f77ccea5c6df421578222fb`. The Milestone 2 PR base must be `feature/portal-v2-m1-preview`, not `main`. After Milestone 1 merges to `main`, retarget Milestone 2 to `main` and rebase if necessary, confirming its diff still includes only Milestone 2 changes. No merge or deployment is authorised by this PR.
