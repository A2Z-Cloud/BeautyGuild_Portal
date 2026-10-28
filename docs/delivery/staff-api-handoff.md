# Staff API: handoff note for the Staff Workspace build

**Status (28 October 2026):** the backend foundation and the first routes (`/staff/quote`, `/staff/insurance-change/revision`) are built and tested; the foundation is on `main`. **Nothing is deployed.** This note is for the people building the CRM side and the widget. The contract is [staff-api.md](../api-contracts/staff-api.md). The design is `STAFF-API-AND-IDENTITY.md` in the Staff Workspace folder on the Slate branch.

## What exists and what does not

| Exists (in the portal function, off by default) | Does not exist yet |
| --- | --- |
| Signature check (hex or base64), time window, nonce check | The CRM custom function that signs requests |
| CRM user lookup, active check and role allow-list | Assessment history (see below), vouchers on payment links |
| `GET /staff/ping` and `GET /staff/me` | A deployed, switched-on Development endpoint |
| `POST /staff/quote` (also the assessment), `POST /staff/insurance-change/revision`, `GET /staff/membership-options`, `GET /staff/cover`, the shared drafts under `/staff/drafts`, and `POST /staff/payment-link` (own switch, test mode, no discounts yet) | Vouchers (needs a Creator reader for use history) |
| `POST /staff/quote` (also the assessment) and `POST /staff/insurance-change/revision` | A staff payment link or any charge |
| Staff waivers on the quote (joining fee, once per person) | Vouchers (needs a Creator reader for use history) |
| Tests and two checked test vectors | CRM-visible audit records beyond an optional text field |

The function is not deployed with this change. A person with deploy access sets the secret and the switch in Development when you are ready (section 6).

## 1. The idea in one paragraph

The widget cannot keep a secret, so it never talks to Catalyst directly. It asks a **CRM custom function** to make the call. That function knows who is logged in, signs the request with a secret only it holds, and calls the Catalyst function. The Catalyst function checks the signature, then asks the CRM whether that person is an active, allowed staff member. No browser-supplied name, role or Contact id is ever trusted.

```text
Widget (Slate) -> CRM custom function (signs) -> beauty_guild_api /staff/... (verifies, asks the CRM) -> result
```

## 2. Do this first: the identity spike (about half a day, CRM Development)

Nothing else is worth building until these four things are proven. They are the unknowns the design could not settle from documentation.

1. **Which user does the function run as, and can the widget fake it?** Make a custom function that returns `zoho.loginuserid`. Call it from a test widget with `ZOHO.CRM.FUNCTIONS.execute`. Sign in as two different staff users and check the id changes. Then try to make the widget pass a different id as an argument, and confirm the function still returns the real logged-in one. **If the id can be supplied by the widget, stop: the identity must come from somewhere the widget cannot influence, and the design needs changing.**
2. **Does your HMAC match ours?** In the function, compute the signature for the published test vector (secret, time, nonce and user in [staff-api.md](../api-contracts/staff-api.md)) and compare it with `02b0be8f…f798`. Check the empty-body hash too (`e3b0c442…b855`). If they differ, the usual causes are a trailing newline, or `\n` not becoming a real newline (in Deluge it can stay as two characters, so build the newline explicitly). Hex or base64 output are both accepted.
3. **Where can the secret live?** Find where a CRM function can read a secret that only admins can see (for example a CRM variable or a connection parameter), and who can read it.
4. **Can the Catalyst function read CRM users?** Its CRM connection needs the permission to read users. Call `/staff/me` once the function is deployed with the switch on. A `503 STAFF_LOOKUP_UNAVAILABLE` usually means the scope is missing.

You can test the Catalyst side **without the CRM at all** using the script in section 5.

## 3. CRM setup

- **Catalyst connection:** no new connection. The function already uses the project's Zoho CRM connection named `zohocrm` (`CRM_CONNECTION_NAME`). The staff routes add one need: it must be allowed to **read users** (scope `ZohoCRM.users.READ`), alongside the module scopes it already has (`ZohoCRM.modules.ALL`, or the narrower ones for Contacts, Deals and the insurance modules). If the connection was made without the users scope, `/staff/me` returns `503 STAFF_LOOKUP_UNAVAILABLE`; add the scope to the connection in the Catalyst console and authorise it again.
- **Who saved it:** the Catalyst connection writes the records, so the CRM's `Modified_By` is the connection's user, not the staff member. Each staff save therefore adds a CRM **Note** on the revision naming the staff member. The connection needs permission to create notes (`ZohoCRM.modules.ALL` covers it). No new field is needed.

- **Secret:** generate 32 random bytes (`openssl rand -hex 32`). Store it in the CRM where only admins can read it (spike item 3). Use a **different** secret for Development and Production.
- **Allowed roles:** agree which CRM profiles or roles may use the staff routes. They go in `PORTAL_STAFF_API_ROLES`, agreed on 28 October 2026: `Administrator, Standard` (CRM profile names). Empty means nobody.
- **Field permissions:** the workflow-field editor in the widget (see `WORKFLOW-FIELD-EDITING.md`) can only be as safe as the CRM's own field-level edit permissions. Set them for the fields that fire workflows.
- **The signing function:** takes a route, method and body from the widget, signs, calls the Catalyst function, and returns the response.

## 4. An unverified sketch of the CRM function

> **UNVERIFIED.** This was written without access to your CRM. Every Deluge function name and behaviour below must be checked in CRM Development (spike items 1 to 3). Treat it as a description of the steps, not as working code. The check that matters is that it reproduces the test vector exactly.

```deluge
// UNVERIFIED SKETCH: check each marked line in CRM Development before relying on it.
// The widget sends an ACTION NAME, never a path. The function maps it to one fixed route, so it can only ever sign routes we built.
map staff_api_call(string action, string body)
{
	// action -> method and route (the route is exactly what the Catalyst function receives, no "/server/beauty_guild_api")
	routes = Map();
	routes.put("me",            {"method":"GET",  "route":"/staff/me"});
	routes.put("quote",         {"method":"POST", "route":"/staff/quote"});
	routes.put("save_revision", {"method":"POST", "route":"/staff/insurance-change/revision"});
	if(!routes.containKey(action))
	{
		return {"ok":false,"error":"Unknown action"};
	}
	method = routes.get(action).get("method");
	route = routes.get(action).get("route");
	if(method == "GET")
	{
		body = "";                                               // a GET is signed with an empty body
	}

	base_url = zoho.crm.getOrgVariable("staff_api_base_url");
	secret = zoho.crm.getOrgVariable("staff_api_secret");        // never log this
	user_id = zoho.loginuserid.toString();                       // VERIFY (spike item 1): the real logged-in user, not an argument

	// Sign with the SERVER's clock, not Deluge's: Deluge's time can be out by hours (it was an hour behind on 28 October 2026).
	time_response = invokeurl [ url :base_url + "/staff/time"  type :GET ];
	time = time_response.get("serverTime").toLong().toString();  // VERIFY: exactly 10 digits, e.g. 1793199782
	nonce = zoho.encryption.sha256(zoho.currenttime.toString() + user_id + zoho.currenttime.toLong().toString()).subString(0,32);
	                                                             // VERIFY: any fresh 32+ hex characters will do

	nl = zoho.encryption.urlDecode("%0A");                       // VERIFY: a REAL newline ("\n" stays two characters in Deluge)
	body_hash = zoho.encryption.sha256(body);                    // VERIFY: lower case hex; empty body gives e3b0c442...b855
	to_sign = method + nl + route + nl + body_hash + nl + time + nl + nonce + nl + user_id;
	signature = zoho.encryption.hmacsha256(secret, to_sign);     // base64 is fine: the function accepts hex or base64

	headers = Map();
	headers.put("X-Staff-User", user_id);
	headers.put("X-Staff-Time", time);
	headers.put("X-Staff-Nonce", nonce);
	headers.put("X-Staff-Signature", signature);
	headers.put("Content-Type", "application/json");

	// VERIFY: the body must be sent as exactly the same text that was hashed (no re-formatting). For POST use parameters :body.
	if(method == "GET")
	{
		response = invokeurl [ url :base_url + route  type :GET  headers :headers ];
	}
	else
	{
		response = invokeurl [ url :base_url + route  type :POST  parameters :body  headers :headers ];
	}
	return response;
}
```

When the function exists, **first** check it reproduces the test vector, then call `/staff/ping`, then `/staff/me`.

## 5. Test the Catalyst side without the CRM

This needs only `bash`, `openssl` and `curl`. It signs exactly as the function expects (checked against a local copy of the function: a signed ping succeeds, a wrong secret and an unsigned request both get the same 401).

```bash
#!/usr/bin/env bash
# Usage: STAFF_API_SECRET=... STAFF_USER_ID=<CRM user id> BASE=https://host/server/beauty_guild_api ./staff-ping.sh [/staff/ping]
set -euo pipefail
ROUTE="${1:-/staff/ping}"                 # the path exactly as the function receives it (no /server/beauty_guild_api in front)
TIME="$(date +%s)"
NONCE="$(openssl rand -hex 16)"
BODY_HASH="$(printf '' | openssl dgst -sha256 | sed 's/.*= //')"
SIGNATURE="$(printf 'GET\n%s\n%s\n%s\n%s\n%s' "$ROUTE" "$BODY_HASH" "$TIME" "$NONCE" "$STAFF_USER_ID" \
  | openssl dgst -sha256 -hmac "$STAFF_API_SECRET" | sed 's/.*= //')"
curl -sS "$BASE$ROUTE" \
  -H "X-Staff-User: $STAFF_USER_ID" -H "X-Staff-Time: $TIME" -H "X-Staff-Nonce: $NONCE" -H "X-Staff-Signature: $SIGNATURE"
echo
```

Expected for `/staff/ping`: `{"ok":true,"serverTime":…,"seenPath":"/staff/ping","staffUserId":"…","requestId":"…"}`. Check that `seenPath` is exactly what you signed. Use a real CRM user id for `/staff/me`.

## 5a. Reading the function log when a signed request is refused

The caller always gets the same `401`. The function log has the reason (`staff_request` lines, `outcome: refused`):

| `reason` | Meaning |
| --- | --- |
| `missing_header` | One of the four `X-Staff-...` headers is absent or empty |
| `bad_user`, `bad_time`, `bad_nonce` | The value is not in the right format (time is 10 digit seconds; nonce 32 to 128 lower case hex; user a CRM id) |
| `bad_signature_format` | The signature is neither 64 hex characters nor base64 |
| `stale` | Format fine, but the time is more than the window (5 minutes) from the function's clock. Sign with `GET /staff/time` |
| `bad_signature` | The signature does not match what the function expected |
| `replay` | The nonce was already used |

When `/staff/me` returns `503 STAFF_LOOKUP_UNAVAILABLE`, the log line (`outcome: error`, `reason: lookup_unavailable`) says why:

| `stage` | Meaning |
| --- | --- |
| `connection` | The function could not get CRM credentials from the Catalyst connection (wrong connection name, not authorised, deleted). `error` and `message` say what |
| `request` | The call to the CRM did not complete (network, timeout) |
| `crm` | The CRM answered with an error. `crmStatus`, `crmCode` and `crmMessage` are the CRM's own. `OAUTH_SCOPE_MISMATCH` or `INVALID_OAUTH_SCOPE` means the connection lacks `ZohoCRM.users.READ`; `INVALID_URL_PATTERN` or a 400 would mean the users endpoint path is wrong |

For `bad_signature` the log line also carries, with **no secret and no signature in it**:
- `lineLengths`: the length of each of the six signed lines, in order (method, path, body hash, time, nonce, user id). For `GET /staff/ping` with a 19 digit user id: `[3, 11, 64, 10, 32, 19]`. A line with a different length is the one that differs (a path with the `/server/beauty_guild_api` prefix, a `\n` written as two characters, an empty or upper case body hash).
- `pathSeen`: the path the function saw. This is the exact string to sign.
- `messageSha256`: the first 16 characters of the SHA-256 of the string the function expected to be signed. In the CRM function, print `zoho.encryption.sha256(to_sign).subString(0,16)` (lower case) and compare: if they match, the message is right and the fault is the secret or the HMAC step; if not, the message differs.
- `receivedForm` (`hex` or `base64`) and `secretLengths` (the length of each secret the function holds; yours should be 64).

 (someone with deploy access)

1. Put `STAFF_API_SECRET` in the Development env file, and `PORTAL_STAFF_API_ENABLED=true` and `PORTAL_STAFF_API_ROLES=...` in the flags file. The deploy script already allows these names.
2. Deploy the function. **Do not do this during customer UAT**: the function is the portal's backend. With the switch off, nothing changes for anyone.
3. Run the section 5 script against `/staff/ping`, then `/staff/me` with a real staff user id.
4. Look at the function log for the `staff_request` lines.

## 7. Rules for everyone building on this

- Never put the secret in the widget, a repository, a chat or a log.
- Never send the widget's own idea of the user, role or Contact to the server as the truth. Send the signed user id only.
- Quotes must have no side effects. Never call the customer routes (`/portal/checkout` and similar) for a staff quote.
- The widget never prices, rates or decides eligibility.
- Every route that writes must be safe to repeat, because replay protection is per instance.
- Keep the Development and Production secrets and allowed roles separate.

## 7a. What is deliberately not an API here

- **Assessment history and policy, membership and revision retrieval.** The widget runs inside the CRM, so it can read these records itself through the CRM SDK (`ZOHO.CRM.API`), and the CRM then applies the **staff member's own permissions, including field-level permissions** (so restricted sanctions detail stays restricted). A Catalyst route would use the function's own all-seeing connection and would have to re-implement those permissions. The two things the CRM cannot supply are built: `GET /staff/cover` (the computed cover and change history) and `GET /staff/membership-options`. If the Guild later wants assessment history redacted on the server, that is a small addition.

## 8. Decisions and open questions

Decided on 28 October 2026:
- **Roles:** CRM profiles `Administrator` and `Standard` (`PORTAL_STAFF_API_ROLES=Administrator, Standard`).
- **Contacts:** approved staff may act for any Contact.
- **Replay protection:** a five minute window, a per-instance nonce check, and routes that are safe to repeat. A durable store is not needed yet.
- **API Gateway:** not needed for any of this.

Still open:
1. **The Note payload** (`Parent_Id` with the module's API name) is unverified against the CRM: check the first Note in Development.
2. **Vouchers** need a Creator reader for use history before `voucherCode` can work.
3. **Staff payment links** (charging a customer from the widget) are not built. They create a Stripe session and touch the Creator contract, so they need their own design and approval.
