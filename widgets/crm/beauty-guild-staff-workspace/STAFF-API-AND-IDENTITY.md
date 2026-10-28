# Staff API and identity (design)

**Status (28 October 2026):** the signed channel and the first routes are **built, tested and on `main`, but not deployed**. The wire contract is `docs/api-contracts/staff-api.md` and the handoff note is `docs/delivery/staff-api-handoff.md`, both on `main`; where this document and the contract differ, **the contract wins** (section 6 says where). The design was written 27 October 2026. It turns the staff API outline in [V1.2-BUILD-BRIEF.md](V1.2-BUILD-BRIEF.md) section 5 into a design the Catalyst and CRM developers can build, and records the API Gateway decision.
**Related:** [SPECIFICATION.md](SPECIFICATION.md) sections 6, 7 and 9, [WORKFLOW-FIELD-EDITING.md](WORKFLOW-FIELD-EDITING.md), [STAFF-ASSISTED-MTA.md](STAFF-ASSISTED-MTA.md). On `main`: `docs/delivery/vouchers-staff-route-spec.md`.

## 1. Decisions in one place

1. **Staff routes live in the existing function.** They are `/staff/...` routes on `apps/portal/functions/beauty_guild_api`, sharing its pricing, risk and checkout code. No second pricing engine, no second backend.
2. **Each staff request is signed by a CRM-side function.** The widget never holds a secret. A CRM custom function holds the signing secret, adds the logged-in staff user, and signs the request. The Catalyst function verifies the signature, then checks the staff user in the CRM before it does anything.
3. **This does not need API Gateway.** It works on Security Rules as they are today. API Gateway is a later, separate hardening step (section 8). It must not be enabled during customer UAT.
4. **The server decides everything that matters:** who the staff member is, what role they hold, which Contact the request is about, every price and every discount.
5. **The widget calls the CRM function with an action name, never a path** (decided 28 October 2026). The function maps each name to one fixed route, so it can only ever sign routes that exist. See section 3.
6. **Decided 28 October 2026 (Guild):** allowed CRM profiles are `Administrator` and `Standard`; approved staff may act for **any** Contact; replay protection is a five minute window plus a per-instance nonce check plus repeat-safe routes (no durable store yet); who saved a revision is recorded as a **CRM Note** on it.

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

**The widget calls the function by action name.** The CRM function takes `action` and `body`, and maps the name to one route and method:

| Action | Method and route (as the Catalyst function receives it) |
| --- | --- |
| `me` | `GET /staff/me` |
| `quote` | `POST /staff/quote` |
| `save_revision` | `POST /staff/insurance-change/revision` |
| `ping` (diagnostic) | `GET /staff/ping` |

An unknown action returns an error without signing anything. New routes are added to this list deliberately. A GET is signed with an empty body.

**Verified, 28 October 2026 (CRM Development):** the widget **cannot supply a different user id**: the function signs the real logged-in user. The CRM variables `staff_api_secret` and `staff_api_base_url` are read correctly by the function.

**Still to verify** (the handoff note, sections 2 and 4, has the steps):
- The HMAC output matches the published test vector. Deluge returns **base64**, which the Catalyst function accepts as it is. A newline written `"\n"` stays two characters in Deluge, so build a real newline, or the signature will not match.
- How the widget calls the function in practice (`ZOHO.CRM.FUNCTIONS.execute`) and what a function error looks like to the widget.
- Who can read the CRM variable that holds the secret: keep the list of people with Developer Hub access short.

## 4. The signed request

The same technique already protects the Stripe webhook (`plans.verifyStripeSignature`): an HMAC over a timestamp and the raw body, with a tolerance window and a constant-time compare.

| Item | Rule |
| --- | --- |
| Headers | `X-Staff-User` (CRM user id), `X-Staff-Time` (seconds since 1970, 10 digits), `X-Staff-Nonce` (random, 32 to 128 lower case hex characters), `X-Staff-Signature` |
| Signature | HMAC-SHA256 over six lines: method, path including the query (as the function receives it, **without** `/server/beauty_guild_api`), SHA-256 of the body as lower case hex, time, nonce, user id; no trailing newline. Sent as **64 hex characters or standard base64** (44 characters ending `=`). Two published test vectors are in `docs/api-contracts/staff-api.md`: reproduce them first |
| Secret | At least 32 random bytes (`openssl rand -hex 32`, 64 characters). On the Catalyst side: environment variables `STAFF_API_SECRET` and `STAFF_API_SECRET_PREVIOUS` (rotation: accept both, retire the old one after the CRM function is updated). On the CRM side: the CRM variable `staff_api_secret`, read with `zoho.crm.getOrgVariable("staff_api_secret")`. The same value in both places, **a different value per environment**. Never in the widget, a repository, a chat or a log |
| Window | Reject if the time differs from the function clock by more than 5 minutes |
| Replay | **Decided:** reject a nonce seen inside the window, held in the function's memory (per instance, best effort), with every staff write safe to repeat and the window short. A durable store (Catalyst Cache or Data Store) is a later hardening option, not needed yet |
| Compare | Constant time. Reject with one generic 401 for any failure, so a caller learns nothing about which check failed |
| Size | Reject bodies over a fixed size before hashing |

## 5. After the signature: who is this and may they act

A valid signature proves the CRM function sent the request. It does not prove the person is allowed. The function then:

1. Fetches the CRM user by `X-Staff-User` with its own CRM connection. The user must exist and be **active**.
2. Checks the user's **profile or role** against an allow-list, the setting `PORTAL_STAFF_API_ROLES`: **`Administrator, Standard`** (the CRM profile names; case-insensitive; an empty list allows nobody). One list covers every action today; a narrower rule per action (for example payment links) can replace it later.
3. Takes the user's name and email **from the CRM**, never from the request, for the audit record.
4. Verifies the selected Contact and any application, policy or revision named in the route exist and belong together (for example, a policy belongs to the Contact it is quoted for).
5. Builds the actor object the shared code needs: `{ type: 'staff', id, name, email, canWaive }` (`type`, not `kind`: that is what the discount engine reads). `canWaive` is true for every allowed role today (Guild answer, 26 October 2026). A customer can never produce it.

**The Catalyst CRM connection.** The function uses the project's existing Zoho CRM connection, named `zohocrm` (`CRM_CONNECTION_NAME`). Reading users needs the scope `ZohoCRM.users.READ` in addition to its module scopes; if it is missing, `/staff/me` returns `503 STAFF_LOOKUP_UNAVAILABLE` and the function refuses to act. Creating the audit Note needs `ZohoCRM.modules.ALL` (or `ZohoCRM.modules.notes.CREATE`).

**Known limit:** the function uses its own CRM connection, which sees every record. It does **not** enforce a staff member's CRM record-level sharing rules. If the Guild needs staff to act only on Contacts they can see in CRM, that has to be added deliberately (open decision 2). The Guild has said any member of staff may waive and assist, so the default is that approved roles may act for any Contact (**decided 28 October 2026**).

## 6. Routes

### 6.1 Built (on `main`, 28 October 2026, not deployed)

Off unless `PORTAL_STAFF_API_ENABLED` is `true`. Every route needs the signed headers, then an active user on the allow-list. Quotes and assessments are side-effect free: nothing is charged, no Stripe session is made, nothing is written to the CRM. The customer routes `POST /portal/checkout` and its relatives are never called for a staff quote.

| Action | Route | Purpose | Writes |
| --- | --- | --- | --- |
| `ping` | `GET /staff/ping` | Proves the channel and the signing. No CRM call. Returns `seenPath`, the exact path to sign | None |
| `me` | `GET /staff/me` | The staff user as the CRM says they are, plus the `actor` object | None |
| `quote` | `POST /staff/quote` | Prices for a Contact the staff member chose. **Also the assessment**: insurance answers come back as a decision or a referral, as the customer's quote does. Takes `contactId`, the same inputs as `POST /portal/checkout/quote`, `waivers` and `voucherCode` | **None** |
| `save_revision` | `POST /staff/insurance-change/revision` | Saves a quoted insurance change as a revision for the Contact (Quoted with draft rows, or Under Review), no payment. Safe to repeat: the same change saves once. Refused until `PORTAL_INSURANCE_CHANGES_ENABLED` and `PORTAL_INSURANCE_CHANGES_WRITES` are on | Revision and rows, plus a CRM **Note** naming the staff member |

**These differ from the sketch in the older table below.** The built routes take the Contact in the request body (`contactId`, which the server looks up and checks exists) and are not nested under `/staff/applications/:id`. **Build the widget against the built routes.** The full request and response shapes, error codes and test vectors are in `docs/api-contracts/staff-api.md` on `main`.

Limits: 300 requests a minute per caller, 20 failures a minute, 60 quote or save calls a minute per staff user, bodies up to 256 KB. Every failure of the signature, the time, the nonce, the user or the role returns the **same** `401 STAFF_AUTH_FAILED`.

### 6.2 Still to design and build

| Route | Method | Purpose | Writes |
| --- | --- | --- | --- |
| `/staff/applications` | GET, POST | Find or start a Contact's application or draft | Draft only |
| `/staff/applications/:id` | GET, PUT | Resume or save with a revision and ownership check, so the customer can resume the same application in Portal V2 | Draft only |
| `/staff/applications/:id/assess` | POST | A separate assessment with a stored history. Today the assessment comes back from `quote` and is not stored | Screening audit only |
| `/staff/applications/:id/assessment-history` | GET | Earlier outcomes and decisions (restricted fields by role) | None |
| `/staff/applications/:id/payment-link` | POST | Create or resume the Stripe Checkout Session for the customer. **Not in V1.2.** Only after Creator V2 is ready and approved, and it needs its own design (it touches the Creator contract) | Waive_Logs, reservation, session |
| `/staff/policies/:policyId/cover`, `/changes/quote`, `/changes`, `/changes/payment-link`, `/staff/memberships/:dealId/options`, `/staff/revisions/:id` | various | Staff-assisted mid-term adjustments. Detail in STAFF-ASSISTED-MTA.md | See that note |

Every route returns what the server computed. The widget never prices, rates or decides eligibility.

## 7. Vouchers, referral codes and waivers

The pricing logic is built in the portal function (the discount engine, merged to `main`). It takes the actor as a parameter and does not know how anyone signed in, so it needs only the verified staff actor from sections 4 and 5. It is off by default behind `PORTAL_DISCOUNTS_ENABLED` and `PORTAL_VOUCHER_REDEMPTION_ENABLED`. The full specification is `docs/delivery/vouchers-staff-route-spec.md` on `main`. In summary:

| Route | Discount behaviour |
| --- | --- |
| `quote` (built) | Accepts `waivers` and `voucherCode`, calls the engine with the staff actor, returns the discounted quote. **Writes nothing.** `voucherCode` is **refused for now**: a voucher's use history is read from Creator and no reader is wired, so it fails closed. Waivers work (they need only the CRM). Both return `503 DISCOUNTS_DISABLED` while `PORTAL_DISCOUNTS_ENABLED` is off |
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

- **Built:** every staff call writes a `staff_request` line to the function log: staff user id, role, route, the Contact id, the service, the outcome and a request id (never the secret or the body).
- **Built, decided 28 October 2026:** a staff revision save adds a CRM **Note** on each new revision ("Saved by Sam Staff (CRM user id) through the Staff Workspace", the quote reference and status). No new CRM field is needed. The Catalyst connection writes the record, so the CRM's own `Modified_By` is the **connection's user, not the staff member: do not rely on it**. If the Note fails, the revision stays saved and the response says `auditNote: false`. The Note payload shape is unverified against the live CRM: check the first one in Development.
- Still to build: the CRM-visible record for other state-changing calls (draft saves, waivers, payment links) as the spec requires.
- Sanctions and screening detail is returned only to roles allowed to see it. Never return raw match evidence to a role that cannot act on it.
- Rate limit repeated assessments, avoid duplicate sanctions queries and duplicate `Risk_Screenings`, and keep the previous result when a new one is stale, incomplete or errors.
- No secret, Stripe key or privileged Analytics or Creator token appears in widget code, in a response or in a log.

## 10. Decisions

**Decided on 28 October 2026**
1. Replay protection: a five minute window, a per-instance nonce check, repeat-safe routes. No durable store yet.
2. Staff are **not** limited to Contacts they can see in the CRM: approved roles may act for any Contact.
3. Approved roles: CRM profiles `Administrator` and `Standard`, for every action for now.
4. The widget cannot supply the staff user id (verified in CRM Development). The secret lives in the CRM variable `staff_api_secret`.
5. API Gateway is not needed for any of this (section 8).
6. Who saved a revision: a CRM Note on the revision.

**Still open**
1. Whether the roles should differ by action (view, screening detail, manual decisions, save, waive, payment link). Today one list covers all.
2. Whether and when API Gateway is enabled (section 8), and not during customer UAT.
3. Vouchers: a Creator reader for use history, where "Reserved" is held, the redemption key field name, what `Source_Invoice` points at, and the Waive_Logs fields (section 7).
4. Staff payment links: design and approval, after Creator V2.
5. How the widget handles a function error, a `401` and a `503` (what staff see).

## 11. Build order and tests

1. The verification in section 3 in CRM Development. **Partly done** (user id cannot be supplied; variables read). Signature test vector still to match.
2. Signature verification, the CRM user and role check, the audit record, and a single read route, with tests. **Built, on `main`.**
3. Quote (which is also the assessment) and revision save routes, no payment. **Built, on `main`.** Then the widget screens that use them.

**Before the widget can be tested against a real endpoint** (the handoff note, sections 3 to 6, has the detail):
- The CRM function exists, signs correctly (test vector) and uses the action names above.
- The `zohocrm` connection has `ZohoCRM.users.READ` (and can create notes).
- The function is deployed to Development with `STAFF_API_SECRET`, `PORTAL_STAFF_API_ENABLED=true` and `PORTAL_STAFF_API_ROLES=Administrator, Standard`. A person with deploy access does this, **not during customer UAT**.
- `/staff/ping`, then `/staff/me` with a real CRM user id, then a quote, then a revision save with the Note checked.
4. Draft save and resume shared with Portal V2.
5. Discount inputs on the quote, then the waiver audit.
6. Payment link, only after Creator V2 is live and approved.

| ID | Scenario | Expected |
| --- | --- | --- |
| SA-01 | Valid signed request from an active, allowed user | Handled; audit record written |
| SA-02 | Wrong signature, or no signature | 401, nothing read or written |
| SA-03 | Time outside the window | 401 |
| SA-04 | Same nonce sent twice | Second request refused (or harmless if idempotent) |
| SA-05 | Inactive CRM user, or a role not on the list | 401 (the same body as any other failure), nothing done |
| SA-06 | A Contact id in the request that does not match the record | Refused |
| SA-07 | A quote | Same total as the portal, no CRM or Stripe writes |
| SA-08 | A customer sends `canWaive` or a waiver | Ignored or refused |
| SA-09 | A staff voucher that is outside its dates or limit | "That code is not valid" |
| SA-10 | A second joining-fee waiver for the same person | Refused, earlier waiver shown |
| SA-11 | A secret rotation | Old and new accepted during the overlap, old refused after |
