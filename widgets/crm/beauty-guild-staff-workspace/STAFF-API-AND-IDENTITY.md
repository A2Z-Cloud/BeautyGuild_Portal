# Staff API and identity (design)

**Status:** design for approval, written 27 October 2026. Nothing in this document is built, approved or tested. It turns the staff API outline in [V1.2-BUILD-BRIEF.md](V1.2-BUILD-BRIEF.md) section 5 into a design the Catalyst and CRM developers can build, and records the API Gateway decision.
**Related:** [SPECIFICATION.md](SPECIFICATION.md) sections 6, 7 and 9, [WORKFLOW-FIELD-EDITING.md](WORKFLOW-FIELD-EDITING.md), [STAFF-ASSISTED-MTA.md](STAFF-ASSISTED-MTA.md). On `main`: `docs/delivery/vouchers-staff-route-spec.md`.

## 1. Decisions in one place

1. **Staff routes live in the existing function.** They are `/staff/...` routes on `apps/portal/functions/beauty_guild_api`, sharing its pricing, risk and checkout code. No second pricing engine, no second backend.
2. **Each staff request is signed by a CRM-side function.** The widget never holds a secret. A CRM custom function holds the signing secret, adds the logged-in staff user, and signs the request. The Catalyst function verifies the signature, then checks the staff user in the CRM before it does anything.
3. **This does not need API Gateway.** It works on Security Rules as they are today. API Gateway is a later, separate hardening step (section 8). It must not be enabled during customer UAT.
4. **The server decides everything that matters:** who the staff member is, what role they hold, which Contact the request is about, every price and every discount.

## 2. Why the customer routes cannot be reused

The customer routes (`/portal/...`) work out the Contact from the signed-in Catalyst customer. A staff member is a different identity (a CRM user) acting for a Contact they selected. Two rules follow:

- A Contact id sent by the browser is never authority on its own.
- Staff must not impersonate the customer in Catalyst. Stripe's `customer_email`, `client_reference_id` and the metadata Creator reads identify the **customer**. The staff member is recorded separately for audit.

## 3. Request flow

```text
Staff widget (Slate, in a CRM Web Tab)
   |  calls a CRM custom function with the route, method and body
   v
CRM custom function (holds STAFF_API_SECRET; knows the logged-in CRM user)
   |  signs the request, calls the Catalyst function over HTTPS
   v
beauty_guild_api  /staff/...
   1. verify the signature, the time and the nonce
   2. look the staff user up in the CRM: active, and an allowed role
   3. check the selected Contact (and the record) exist and match
   4. run the shared business logic (quote, assess, save)
   5. write the audit record
   v
JSON result back to the widget
```

**To verify in CRM Development before building** (not assumed):
- How the widget calls a CRM custom function (`ZOHO.CRM.FUNCTIONS.execute` or a REST API function) and **which user the function runs as**.
- That the logged-in user id available inside the function (`zoho.loginuserid`) cannot be set by the widget caller. If it can, the identity must come from somewhere the widget cannot influence.
- The secret storage available to a CRM function (for example a CRM variable or connection parameter), and who can read it.

## 4. The signed request

The same technique already protects the Stripe webhook (`plans.verifyStripeSignature`): an HMAC over a timestamp and the raw body, with a tolerance window and a constant-time compare.

| Item | Rule |
| --- | --- |
| Headers | `X-Staff-User` (CRM user id), `X-Staff-Time` (seconds since 1970), `X-Staff-Nonce` (random, at least 16 bytes, hex), `X-Staff-Signature` |
| Signature | HMAC-SHA256, hex, over: method, path including the query, SHA-256 of the body, time, nonce and user id, each on its own line |
| Secret | At least 32 random bytes. Stored as function environment variables `STAFF_API_SECRET` and `STAFF_API_SECRET_PREVIOUS` (rotation: accept both, retire the old one after the CRM function is updated). Never in the widget, a repository or a log |
| Window | Reject if the time differs from the function clock by more than 5 minutes |
| Replay | Reject a nonce seen inside the window. The portal's in-memory limiters are per instance, so use a durable short-lived store (Catalyst Cache or Data Store) for nonces, or keep every staff write idempotent and the window short, and decide which (open decision 1) |
| Compare | Constant time. Reject with one generic 401 for any failure, so a caller learns nothing about which check failed |
| Size | Reject bodies over a fixed size before hashing |

## 5. After the signature: who is this and may they act

A valid signature proves the CRM function sent the request. It does not prove the person is allowed. The function then:

1. Fetches the CRM user by `X-Staff-User` with its own CRM connection. The user must exist and be **active**.
2. Checks the user's **profile or role** against an allow-list (`STAFF_API_ROLES`, proposed). Which roles may view, see screening detail, save, waive and (later) create payment links is an open decision (section 10).
3. Takes the user's name and email **from the CRM**, never from the request, for the audit record.
4. Verifies the selected Contact and any application, policy or revision named in the route exist and belong together (for example, a policy belongs to the Contact it is quoted for).
5. Builds the actor object the shared code needs: `{ kind: 'staff', id, name, canWaive }`. `canWaive` is set only from the role allow-list. A customer can never produce it.

**Known limit:** the function uses its own CRM connection, which sees every record. It does **not** enforce a staff member's CRM record-level sharing rules. If the Guild needs staff to act only on Contacts they can see in CRM, that has to be added deliberately (open decision 2). The Guild has said any member of staff may waive and assist, so the default is that approved roles may act for any Contact.

## 6. Routes

All proposed, none built. Quotes and assessments are side-effect free. The customer routes `POST /portal/checkout` and its relatives are never called for a staff quote, because they create CRM records and a Stripe session.

| Route | Method | Purpose | Writes |
| --- | --- | --- | --- |
| `/staff/applications` | GET, POST | Find or start a Contact's application or draft | Draft only |
| `/staff/applications/:id` | GET, PUT | Resume or save with a revision and ownership check, so the customer can resume the same application in Portal V2 | Draft only |
| `/staff/applications/:id/assess` | POST | Run eligibility, underwriting, sanctions, flood and subsidence checks with clear reasons | Screening audit only |
| `/staff/applications/:id/assessment-history` | GET | Earlier outcomes and decisions (restricted fields by role) | None |
| `/staff/applications/:id/quote` | POST | Payable or non-payable quote: lines, SKU codes, first and later payments, discounts, screening summary | **None** |
| `/staff/applications/:id/payment-link` | POST | Create or resume the Stripe Checkout Session for the customer. **Not in V1.2.** Only after Creator V2 is ready and approved | Waive_Logs, reservation, session |
| `/staff/policies/:policyId/cover`, `/changes/quote`, `/changes`, `/changes/payment-link`, `/staff/memberships/:dealId/options`, `/staff/revisions/:id` | various | Staff-assisted mid-term adjustments. Detail in STAFF-ASSISTED-MTA.md | See that note |

Every route returns what the server computed. The widget never prices, rates or decides eligibility.

## 7. Vouchers, referral codes and waivers

The pricing logic is built in the portal function (the discount engine, merged to `main`). It takes the actor as a parameter and does not know how anyone signed in, so it needs only the verified staff actor from sections 4 and 5. It is off by default behind `PORTAL_DISCOUNTS_ENABLED` and `PORTAL_VOUCHER_REDEMPTION_ENABLED`. The full specification is `docs/delivery/vouchers-staff-route-spec.md` on `main`. In summary:

| Route | Discount behaviour |
| --- | --- |
| `quote` | Accepts `code` and `waivers`, calls the engine with the staff actor, returns the discounted quote. **Writes nothing** |
| save (`PUT`) | Saves the code and waivers with the other answers, so the customer sees them in Portal V2 |
| `payment-link` (later) | Re-prices, then writes the Waive_Logs row (Pending) and the voucher reservation, and creates the session with the `discounts` metadata |

What staff can do (Guild answer, 26 October: any member of staff):
1. Enter a **school referral code**: £10 off the joining fee, only where a joining fee is due.
2. Enter a **bespoke voucher code**: active, inside its dates, under its usage limit, eligible for the member and the items. A personal £25 GTi voucher is always refused for staff entry.
3. Apply a **waiver** to the joining fee, a one-off extra (bundle, certificate, badge, sticker), an additional branch or, once it is in the catalogue, the £5 adjustment fee. A reason from the picklist is required (Goodwill Gesture, Complaint, Upgrade, Promotion, Payment Problem, Other), with a note for Other.

Rules: a joining-fee waiver is allowed once per person (it resets after a lapse of more than 30 days); a customer can never waive; every waiver writes a Waive_Logs row (Pending, then Paid or Void from Creator); the membership fee, accreditation fees, insurance, insurance premium tax, the named employee fee and the admin fee are never discountable. Voucher configuration is kept apart from waiver authority.

**Still open for vouchers:** where "Reserved" is held, the redemption key field name, what `Source_Invoice` points at, and the Waive_Logs fields. Until they are settled, capped vouchers stay off live.

## 8. API Gateway: decision and checklist

### What it is, from Catalyst's documentation
- Today the Development project has API Gateway **disabled** (`catalyst apig:status` shows DISABLED). Access is controlled by **Security Rules**. Our function URL is open (rule `optional`), and the function checks the Catalyst sign-in itself.
- Enabling API Gateway **switches Security Rules off**. Function and web client URLs "will immediately become inaccessible until APIs are created".
- Auto-create can turn the existing Security Rules into APIs, but **only before the first API exists**. Function APIs are named `FunctionName_METHOD`. Web client APIs support GET only. A default login-redirect API is created for the hosted web client.
- Authentication per API: None, API Key (`ZCFKEY` header or query, with a shared key in Development and a different key in Production), Catalyst Users, or OAuth. Throttling per API: general and per IP, over a sliding window, returning 429.
- The CLI has `catalyst apig:enable`, `apig:disable` and `apig:status`. The documentation does not say whether CLI enable also runs auto-create, and the Disable page was not available to read.

### Decision
1. **Build the staff routes without it** (sections 3 to 5). An API key is a shared secret, not an identity: it cannot say which staff member is calling. The signed request carries the identity and works today.
2. **Treat API Gateway as a separate hardening change**, planned on its own. What it adds is real: platform throttling for the public quote and sign-in routes (the portal's own limiters are per instance and in memory), an API key as a second lock on `/staff/*`, and per-route methods.
3. **Do not enable it during customer UAT.** A mistake takes the portal, sign-in and the function away from every tester.

### Checklist before enabling (Development first, Production later and separately)
- [ ] Choose a quiet window. Tell testers.
- [ ] Record `catalyst apig:status` and the current `catalyst.json`. Find out what `apig:disable` restores, and whether Security Rules return as they were, **before** enabling.
- [ ] Decide auto-create (console) or hand-made APIs, and write the full list of APIs needed:
  - the web client under `/app/` (GET) and its login redirect;
  - the function wildcard, with the methods the portal uses;
  - `POST /stripe/webhook`, as **No Authentication** (Stripe cannot send a custom header, and a key in the URL would put a secret in a log; the HMAC signature check in code is the protection);
  - `/staff/*`: API Key plus the signed request, with throttling;
  - the public quote routes: per-IP throttling.
- [ ] Immediately after enabling, test: `/app/` loads, the function health route answers, a guest quote works, sign-in shows the Catalyst form, a signed-in portal call works, the Stripe webhook route accepts a test event, and the Creator and CRM connections still work.
- [ ] Confirm throttles do not block a normal tester, then tighten.
- [ ] Production: repeat with the Production API key. Never copy a Development key.

### Not covered by the documentation we found
CORS behaviour and the full detail of disabling. The widget calls the CRM function, not the Catalyst function from the browser, so CORS should not apply to staff routes, but verify it.

## 9. Audit and abuse controls

- Every staff call writes an audit record: staff user id, role, route, the Contact and record ids, outcome and a request id. State-changing calls also write the CRM-visible record the spec requires (note, revision field or Waive_Logs row).
- Staff identity is stored on the staff-created record separately from the customer. Policy_Revisions needs a field for it (for example `Requested_By_Staff`, name to be agreed, not yet created).
- Sanctions and screening detail is returned only to roles allowed to see it. Never return raw match evidence to a role that cannot act on it.
- Rate limit repeated assessments, avoid duplicate sanctions queries and duplicate `Risk_Screenings`, and keep the previous result when a new one is stale, incomplete or errors.
- No secret, Stripe key or privileged Analytics or Creator token appears in widget code, in a response or in a log.

## 10. Open decisions

1. Replay protection for nonces: a durable store, or a short window plus idempotent routes.
2. Whether staff are limited to Contacts they can see in CRM (record-level sharing), or approved roles may act for any Contact.
3. The approved staff roles for view, screening detail, manual decisions, saving, waiving and payment links.
4. The CRM custom function details: which user it runs as, how the logged-in user id is protected, and where the secret lives.
5. Whether API Gateway is enabled, and when (section 8).
6. The staff-identity field on Policy_Revisions.
7. The voucher items in section 7.

## 11. Build order and tests

1. The verification in section 3 in CRM Development.
2. Signature verification, the CRM user and role check, and the audit record, with a single read route and tests.
3. Quote and assess routes (no writes), then the widget screens that use them.
4. Draft save and resume shared with Portal V2.
5. Discount inputs on the quote, then the waiver audit.
6. Payment link, only after Creator V2 is live and approved.

| ID | Scenario | Expected |
| --- | --- | --- |
| SA-01 | Valid signed request from an active, allowed user | Handled; audit record written |
| SA-02 | Wrong signature, or no signature | 401, nothing read or written |
| SA-03 | Time outside the window | 401 |
| SA-04 | Same nonce sent twice | Second request refused (or harmless if idempotent) |
| SA-05 | Inactive CRM user, or a role not on the list | 403, nothing done |
| SA-06 | A Contact id in the request that does not match the record | Refused |
| SA-07 | A quote | Same total as the portal, no CRM or Stripe writes |
| SA-08 | A customer sends `canWaive` or a waiver | Ignored or refused |
| SA-09 | A staff voucher that is outside its dates or limit | "That code is not valid" |
| SA-10 | A second joining-fee waiver for the same person | Refused, earlier waiver shown |
| SA-11 | A secret rotation | Old and new accepted during the overlap, old refused after |
