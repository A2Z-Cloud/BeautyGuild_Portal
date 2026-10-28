# Staff API (foundation)

**Status (27 October 2026):** the signature check, the staff user and role check, and two routes (`/staff/ping`, `/staff/me`) are built in `apps/portal/functions/beauty_guild_api/src/staff.js` and covered by tests. **Off by default and not deployed.** Quote, assess, save, waiver and payment-link routes are **not built**; this is the base they will sit on.
**Design and the reasons behind it:** `widgets/crm/beauty-guild-staff-workspace/STAFF-API-AND-IDENTITY.md` (on the Slate branch, PR 92). **How to wire up the CRM side:** [staff-api-handoff.md](../delivery/staff-api-handoff.md).

## What it is for

The CRM Staff Workspace widget runs in a browser and cannot hold a secret. A CRM custom function holds the secret, adds the logged-in staff user, signs the request and calls these routes. The function here proves the request came from that CRM function, then asks the CRM whether the user is real, active and allowed. The caller never supplies a name, role or Contact that the server believes.

## Switches and settings

Set on the function (the deploy script sends them; values are never committed).

| Name | Kind | Meaning |
| --- | --- | --- |
| `PORTAL_STAFF_API_ENABLED` | Switch | `true` turns the routes on. Anything else: the routes do not exist (404). **Default off** |
| `STAFF_API_SECRET` | Secret | The signing secret. At least 32 characters. Required when the switch is on, otherwise the function refuses to start |
| `STAFF_API_SECRET_PREVIOUS` | Secret | Optional. The retiring secret during a rotation. Either secret is accepted |
| `PORTAL_STAFF_API_ROLES` | Setting | Comma separated CRM **profile or role names** allowed to use the API, for example `Administrator, Standard` (the roles agreed on 28 October 2026). Matched case-insensitively. **Empty allows nobody** |
| `PORTAL_STAFF_API_WINDOW_SECONDS` | Setting | How far the request time may differ from the function's clock. Default 300, between 30 and 600 |

Generate a secret with `openssl rand -hex 32` (64 characters). Use a different secret in each environment.

## The signed request

Every request carries four headers.

| Header | Value |
| --- | --- |
| `X-Staff-User` | The CRM user id of the logged-in staff member (10 to 25 digits) |
| `X-Staff-Time` | Seconds since 1 January 1970, 10 digits |
| `X-Staff-Nonce` | A fresh random value for every request: 32 to 128 hex characters (lower case) |
| `X-Staff-Signature` | HMAC-SHA256 of the string below, keyed with the secret, as 64 hex characters (lower or upper case) **or** as standard base64 (44 characters ending `=`, which is what Deluge returns). Both forms of the same signature are accepted |

**The string that is signed** is six values joined by a single newline (`\n`), with no trailing newline:

```text
METHOD
PATH
BODYHASH
TIME
NONCE
USERID
```

| Value | Rule |
| --- | --- |
| `METHOD` | Upper case: `GET`, `POST` |
| `PATH` | The path **and query string exactly as the function receives them**, for example `/staff/me` or `/staff/applications/123/quote?x=1`. **Do not include** `/server/beauty_guild_api`: Catalyst removes it before the function sees the request. `/staff/ping` echoes `seenPath` so you can check this |
| `BODYHASH` | SHA-256 of the raw request body bytes, as lower case hex. For a request with no body, the hash of nothing: `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `TIME`, `NONCE`, `USERID` | The same values as in the headers |

### Test vectors

Use these to check your signing before you call anything. Both were also checked with OpenSSL.

```text
secret : staff-test-secret-0123456789-abcdefghijklmnop
time   : 1800000000
nonce  : 00112233445566778899aabbccddeeff
user   : 1011174000000000042
```

| Request | String that is signed | Signature |
| --- | --- | --- |
| `GET /staff/me`, no body | `GET\n/staff/me\ne3b0c442…b855\n1800000000\n00112233445566778899aabbccddeeff\n1011174000000000042` | `02b0be8f0900428fa06c8f0d98a81d60fde47a2bce68c09cd52e19e124a9f798` |
| `POST /staff/applications/123/quote?x=1`, body `{"code":"ABC"}` (14 bytes, no trailing newline) | body hash `785e0e32e60cba4c247ca052ed0b60fe28eb95e9b8845710499880848046ace6` | `68fb5f61c5741c761bf577b92a98bd80af36e2c9920f85b65c9d7e6fdb0745fd` |

## What the function checks, in order

1. The switch is on (otherwise 404).
2. The caller is not over the request limit (300 a minute per caller, best effort).
3. All four headers are present and well formed.
4. The time is within the window of the function's clock (5 minutes by default).
5. The signature matches the current or the previous secret (constant time).
6. The nonce has not been used before inside the window. A nonce is remembered only after a valid signature, so bad requests cannot fill the memory.
7. For `/staff/me`: the CRM says the user exists, is **active**, and their profile or role is on `PORTAL_STAFF_API_ROLES`.

## Routes

### `GET /staff/time`
**No signature needed.** Returns the function's own clock: `{ "serverTime": 1793199782 }` (Unix time in whole seconds, 10 digits). The CRM function should **sign with this time** instead of its own clock, because Deluge's clock and time zone handling can be out by hours (seen on 28 October 2026: an hour behind, with the CRM time zone set to GMT). It reveals nothing secret and weakens nothing: a request still needs the secret, a time within the window and a fresh nonce. Limited to 300 requests a minute per caller; 404 while the switch is off.

### `GET /staff/ping`
Proves the channel and the signing. Does not call the CRM.

```json
{ "ok": true, "serverTime": 1793120250, "seenPath": "/staff/ping", "staffUserId": "1011174000000000042", "requestId": "18b42335-ec39-4589-82e6-0b5c5a851169" }
```

### `GET /staff/me`
The channel and the person. The user is read from the CRM by the id in the signed header, never from the request.

```json
{
  "requestId": "…",
  "staff": { "id": "1011174000000000042", "name": "Sam Staff", "email": "sam@beautyguild.com", "profile": "Guild Staff", "role": "Processing" },
  "actor": { "type": "staff", "id": "1011174000000000042", "name": "Sam Staff", "email": "sam@beautyguild.com", "canWaive": true }
}
```

`actor` is the object the pricing and discount code takes. `canWaive` is true for every allowed role today (Guild answer, 26 October 2026) and will be narrowed if the roles are agreed otherwise.

### `POST /staff/quote`
Prices for a Contact the staff member chose. **Nothing is charged, saved or sent**, and no Stripe session is made. It is also the assessment: insurance answers come back as a decision or a referral, exactly as the customer's quote does. The body is signed JSON.

| Field | Notes |
| --- | --- |
| `contactId` | Required. A CRM Contact id. 422 if it is not an id, 404 if there is no such Contact |
| `service`, `level`, `branch`, `billing`, `addons`, `insurance`, `change`, `changes`, `recordId`, `previousId`, `start`, ... | The same inputs as the customer's `POST /portal/checkout/quote` |
| `voucherCode` | Optional. A bespoke voucher code. **Not usable yet**: a voucher's use history is read from Creator and no reader is wired, so it is refused (fails closed) |
| `waivers` | Optional. `[{ "sku": "MEM-JOIN", "reason": "Goodwill Gesture", "note": "" }]`. Up to 6. The reason must be on the list; `Other` needs a note; the joining fee can be waived once per person |
| `applicationId` | Optional. Ties a voucher use to one application |

`voucherCode` and `waivers` return `503 DISCOUNTS_DISABLED` while `PORTAL_DISCOUNTS_ENABLED` is off. The response is `{ "requestId", "contact": { "id", "name" }, "quote": { ... } }`, where `quote` is the same shape as the customer's quote.

### `POST /staff/insurance-change/revision`
Saves a quoted insurance change as a revision for the Contact, as the customer's own route does (a payable change as Quoted with draft rows, a referred one as Under Review). **No payment.** Same body as `/staff/quote` with `service` forced to `insurance_change`, plus `recordId` (the membership). Refused with `503 NOT_AVAILABLE` until `PORTAL_INSURANCE_CHANGES_ENABLED` and `PORTAL_INSURANCE_CHANGES_WRITES` are on. Responds `201` with `{ revision, revisions, contact, created: true, auditNote: true }`, or `200` when the same change was already saved.

**Who saved it.** Each new revision gets a CRM **Note** ("Saved by Sam Staff (CRM user id) through the Staff Workspace", with the quote reference and status). The function connection writes the record, so the CRM's own `Modified_By` shows the connection's user, not the staff member; the Note is the record. The revision is saved first: if the Note fails the response is still `201` with `"auditNote": false` and the failure is logged. The connection needs permission to create notes (`ZohoCRM.modules.ALL`, or `ZohoCRM.modules.notes.CREATE`). The Note payload shape is **unverified against the CRM**: check one in Development. The function log has a `staff_request` line for every call either way.

Both routes limit each staff user to 60 calls a minute (best effort).

### `GET /staff/membership-options?contactId=...&recordId=...`
Read only. What the customer can choose when changing a membership: each branch and whether they already hold it. `recordId` is the membership (Deal) id. `503 NOT_AVAILABLE` until `PORTAL_MEMBERSHIP_CHANGES_ENABLED` is on. Returns `{ requestId, contact: { id }, options }`, the same `options` as the customer's `GET /portal/checkout/membership-options`.

### `GET /staff/cover?contactId=...&recordId=...`
Read only. The customer's current cover for one membership, with the change (revision) history, as `{ requestId, contact: { id }, cover }`. The same `cover` as the customer's `GET /portal/records/membership/:id/cover`. The membership must belong to the Contact (404 otherwise).

### `/staff/drafts` (the portal's draft services for a Contact the staff member chose)
The customer's own draft router, mounted behind the signed channel and the role check, so **a draft started by staff is the customer's own draft in Portal V2, and the other way round**. The Contact comes from `contactId` (in the **body** for `POST` and `PUT`, in the **query string** for `GET` and `DELETE`); it must be an existing Contact (422 if it is not an id, 404 if there is none). **A staff draft never creates a Contact.** The body is signed JSON and is otherwise identical to the customer's.

| Method and path | Same as the customer's |
| --- | --- |
| `POST /staff/drafts` | `POST /portal/drafts` (save a new draft; 201) |
| `GET /staff/drafts?contactId=...` | `GET /portal/drafts` (list the Contact's drafts) |
| `GET /staff/drafts/:service/:id?contactId=...` | `GET /portal/drafts/:service/:id` (resume) |
| `PUT /staff/drafts/:service/:id` | `PUT /portal/drafts/:service/:id` (save with the current `revision`) |
| `DELETE /staff/drafts/:service/:id?contactId=...` | `DELETE /portal/drafts/:service/:id` (discard) |
| `POST /staff/drafts/accreditation/submit` | `POST /portal/drafts/accreditation/submit` |

`service` is `membership`, `insurance` or `accreditation`. `503 DRAFTS_DISABLED` while `PORTAL_CRM_DRAFTS_ENABLED` is off, and accreditation needs its own switch as for customers. Every call writes a `staff_request` log line with the method, status and Contact.

## Responses

| Status | Code | When |
| --- | --- | --- |
| 200 | | Success |
| 400 | `INVALID_REQUEST` | The body is not a JSON object |
| 422, 404 | `INVALID_REQUEST`, `NOT_FOUND` | No usable `contactId`, or no such Contact. Pricing rules answer as they do for a customer (for example `409 MEMBERSHIP_EXISTS`) |
| 401 | `STAFF_AUTH_FAILED` | **Any** signature problem, a replayed nonce, an unknown, inactive or not-allowed user. The body is always the same, so a caller learns nothing about which check failed. The reason is in the function log |
| 404 | `NOT_FOUND` | The switch is off, or no such route |
| 413 | `TOO_LARGE` | Body over 256 KB |
| 429 | `RATE_LIMIT` | Too many requests, or a run of failures (20 a minute) |
| 503 | `STAFF_LOOKUP_UNAVAILABLE` | The CRM could not answer, including a missing CRM scope for reading users. The function **refuses to act** rather than guess |

## Logging and audit

Every request writes one JSON line to the function log: `event: "staff_request"`, the route, the outcome, a request id, the staff user id and (on success) profile and role, or a short reason code on refusal. Secrets and signatures are never logged. CRM-visible audit records for state-changing routes come with those routes.

## Known limits (see the design for the decisions they feed)

- **Replay memory is per instance.** The nonce store lives in the memory of one function instance, like the portal's other limiters. With several instances a replay could land on a different one. The time window bounds it, and routes that write must be idempotent. A durable store (Catalyst Cache or Data Store) is an open decision.
- **The function's CRM connection sees every record.** It does not apply a staff member's CRM sharing rules. Approved roles may act for any Contact unless the Guild decides otherwise.
- **The CRM connection needs permission to read users** (the CRM users scope). If it does not have it, `/staff/me` returns 503 until it is added. This is checked in the CRM Development spike.
- **Rate limits are best effort.** Real platform throttling would need API Gateway, which is a separate later decision.

## Rotating the secret

1. Set the new value as `STAFF_API_SECRET` and move the old one to `STAFF_API_SECRET_PREVIOUS`. Deploy. Both work.
2. Update the secret in the CRM.
3. Remove `STAFF_API_SECRET_PREVIOUS`. Deploy. The old secret stops working.

## Not built

`/staff/applications...`, `/staff/policies...`, `/staff/memberships...`, `/staff/revisions...`, discount and waiver inputs, assess, assessment history, payment link, and the CRM-visible audit records. Each reuses this module's check and is added behind its own switch.
