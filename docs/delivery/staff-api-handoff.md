# Staff API: handoff note for the Staff Workspace build

**Status (27 October 2026):** the backend foundation is built, tested and **not deployed**. This note is for the people building the CRM side and the widget. The contract is [staff-api.md](../api-contracts/staff-api.md). The design is `STAFF-API-AND-IDENTITY.md` in the Staff Workspace folder on the Slate branch.

## What exists and what does not

| Exists (in the portal function, off by default) | Does not exist yet |
| --- | --- |
| Signature check, time window, nonce check | The CRM custom function that signs requests |
| CRM user lookup, active check and role allow-list | Any quote, assess, save, waiver or payment-link route |
| `GET /staff/ping` and `GET /staff/me` | A deployed, switched-on Development endpoint |
| 17 tests and two checked test vectors | CRM-visible audit records |

The function is not deployed with this change. A person with deploy access sets the secret and the switch in Development when you are ready (section 6).

## 1. The idea in one paragraph

The widget cannot keep a secret, so it never talks to Catalyst directly. It asks a **CRM custom function** to make the call. That function knows who is logged in, signs the request with a secret only it holds, and calls the Catalyst function. The Catalyst function checks the signature, then asks the CRM whether that person is an active, allowed staff member. No browser-supplied name, role or Contact id is ever trusted.

```text
Widget (Slate) -> CRM custom function (signs) -> beauty_guild_api /staff/... (verifies, asks the CRM) -> result
```

## 2. Do this first: the identity spike (about half a day, CRM Development)

Nothing else is worth building until these four things are proven. They are the unknowns the design could not settle from documentation.

1. **Which user does the function run as, and can the widget fake it?** Make a custom function that returns `zoho.loginuserid`. Call it from a test widget with `ZOHO.CRM.FUNCTIONS.execute`. Sign in as two different staff users and check the id changes. Then try to make the widget pass a different id as an argument, and confirm the function still returns the real logged-in one. **If the id can be supplied by the widget, stop: the identity must come from somewhere the widget cannot influence, and the design needs changing.**
2. **Does your HMAC match ours?** In the function, compute the signature for the published test vector (secret, time, nonce and user in [staff-api.md](../api-contracts/staff-api.md)) and compare it with `02b0be8f…f798`. Check the empty-body hash too (`e3b0c442…b855`). If they differ, the usual causes are an upper case or base64 output (it must be lower case hex), a trailing newline, or `\n` not becoming a real newline.
3. **Where can the secret live?** Find where a CRM function can read a secret that only admins can see (for example a CRM variable or a connection parameter), and who can read it.
4. **Can the Catalyst function read CRM users?** Its CRM connection needs the permission to read users. Call `/staff/me` once the function is deployed with the switch on. A `503 STAFF_LOOKUP_UNAVAILABLE` usually means the scope is missing.

You can test the Catalyst side **without the CRM at all** using the script in section 5.

## 3. CRM setup

- **Secret:** generate 32 random bytes (`openssl rand -hex 32`). Store it in the CRM where only admins can read it (spike item 3). Use a **different** secret for Development and Production.
- **Allowed roles:** agree which CRM profiles or roles may use the staff routes. They go in `PORTAL_STAFF_API_ROLES`, for example `Guild Staff, Administrator`. Empty means nobody.
- **Field permissions:** the workflow-field editor in the widget (see `WORKFLOW-FIELD-EDITING.md`) can only be as safe as the CRM's own field-level edit permissions. Set them for the fields that fire workflows.
- **The signing function:** takes a route, method and body from the widget, signs, calls the Catalyst function, and returns the response.

## 4. An unverified sketch of the CRM function

> **UNVERIFIED.** This was written without access to your CRM. Every Deluge function name and behaviour below must be checked in CRM Development (spike items 1 to 3). Treat it as a description of the steps, not as working code. The check that matters is that it reproduces the test vector exactly.

```deluge
// UNVERIFIED SKETCH: check each marked line in CRM Development before relying on it.
map staff_api_call(string route, string method, string body)
{
	// route: the path exactly as the Catalyst function receives it, e.g. "/staff/me". No "/server/beauty_guild_api".
	base_url = "https://beautyguildportal-20117268527.development.catalystserverless.eu/server/beauty_guild_api";

	secret = zoho.crm.getOrgVariable("staff_api_secret");        // VERIFY: how a function reads a CRM variable or secret
	user_id = zoho.loginuserid.toString();                       // VERIFY: which user the function runs as (spike item 1)

	time = (zoho.currenttime.toLong() / 1000).toString();        // VERIFY: must be seconds, 10 digits (not milliseconds)
	nonce = zoho.encryption.sha256(zoho.currenttime.toString() + user_id + zoho.currenttime.toLong().toString()).subString(0,32);
	                                                             // VERIFY: any fresh, unique 32+ hex characters will do

	body_hash = zoho.encryption.sha256(body);                    // VERIFY: lower case hex? Empty body must give e3b0c442...b855
	to_sign = method.toUpperCase() + "\n" + route + "\n" + body_hash + "\n" + time + "\n" + nonce + "\n" + user_id;
	                                                             // VERIFY: "\n" is a real newline; no newline at the end
	signature = zoho.encryption.hmacsha256(secret, to_sign);     // VERIFY: lower case hex output, not base64 (spike item 2)

	headers = Map();
	headers.put("X-Staff-User", user_id);
	headers.put("X-Staff-Time", time);
	headers.put("X-Staff-Nonce", nonce);
	headers.put("X-Staff-Signature", signature);

	response = invokeurl
	[
		url :base_url + route
		type :GET                                                // VERIFY: POST with a raw body when the write routes exist
		headers :headers
	];
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

## 6. Turning it on in Development (someone with deploy access)

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

## 8. Open questions (from the design, not settled here)

1. Replay protection: a durable store, or a short window plus repeat-safe routes.
2. Whether staff are limited to Contacts they can see in CRM, or approved roles may act for any Contact.
3. The approved staff roles for view, screening detail, saving, waiving and payment links.
4. Whether and when API Gateway is enabled. It is not needed for any of this.
5. The staff-identity field on Policy_Revisions for the audit trail.
