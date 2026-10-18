# School Accreditation Verification V1: implementation handover

## Purpose
Public school accreditation verification using the permanent School Registration Number, without any QR dependency. Catalyst reads Zoho CRM server-side and returns only the public school name, registration number, current accreditation status, expiry and check timestamp.

## URLs and routing
- Catalyst web client search: /app/#/verify
- Catalyst web client direct: /app/#/verify/12345
- Function: GET /server/beauty_guild_api/public/verify/12345
- Desired website URL: https://beautyguild.com/verify/12345

**The WordPress public path is NOT implemented in this PR.** Beauty Guild WordPress needs a rewrite, redirect or reverse proxy so this permanent URL reaches the verification screen. Do not issue certificate QR codes until that public path is tested.

## CRM mapping to confirm
The current repository confirms these accreditation fields under Training_Centre_Accred: Accreditation_Status, Application_Stage, Valid_From, Valid_To and Account.

The School Registration Number API name **has not been verified**. Identify the exact API field and whether it is stored in Accounts or Training_Centres. The server supports both sources. For Accounts it uses Account_Name; for Training_Centres it uses Name and the related Account lookup. Search returns must contain an exact unique registration number; duplicate numbers or a missing Account relation fail closed.

Default current accreditation status is Verified. A positive result also requires a complete, currently valid date range and a non-Draft, non-Awaiting Payment stage. Suspended/revoked statuses prevent older Verified records from overriding a hold. **Confirm status vocabulary and how reinstatement clears historic holds before go-live.**

Further decisions: whether a School Registration Number is always immutable; whether verification covers the Account or an individual Training Centre; how historical accreditation rows are retired; whether school names and expiry dates are approved for public display.

## Catalyst Development configuration
Existing function environment values:
- PUBLIC_SCHOOL_VERIFICATION_ENABLED = true (default false, keep off until verified)
- PUBLIC_SCHOOL_REGISTRATION_MODULE = Accounts or Training_Centres (default Accounts)
- PUBLIC_SCHOOL_REGISTRATION_FIELD = exact confirmed CRM API field (mandatory; no default)
- PUBLIC_SCHOOL_ACTIVE_STATUS = Verified (confirm with CRM owner)
- CRM_CONNECTION_NAME and CRM_API_DOMAIN use the existing function connection/origin.

Frontend build values:
- VITE_DATA_MODE = api
- VITE_API_BASE_URL = /server/beauty_guild_api (same-origin Catalyst client)
- VITE_PUBLIC_SCHOOL_VERIFICATION = true

No user login is required for this public endpoint. Verify that the deployed Catalyst function allows anonymous requests while authenticated member record endpoints remain protected by their existing route-level controls. Verify the CRM Connection can read the required modules in this context. No keys belong in the browser.

## Behaviour
- Accredited: explicit approved status, Valid_From <= current date <= Valid_To.
- Expired: previously approved record beyond Valid_To, or a CRM Expired status.
- Suspended/revoked: conservative overrides, never incorrectly display accredited.
- Not accredited: school exists but no confirmed current accreditation.
- Not found: exact school number does not exist.
- Unavailable: missing mapping, duplicate number, broken relationship, CRM failure or pagination uncertainty.

All errors fail closed. Public output excludes CRM record IDs, emails, contacts, secrets and internal CRM errors. Best-effort per-instance rate limit 30/minute is not a substitute for a production edge/WAF rate limit. Successful status must not be cached across revocation or expiry.

## Tests
Automated backend coverage: current, expired, future, unverified, suspended, revoked, multiple and incomplete matches, wrong account linkage, empty results, CRM failure, rate limit, invalid characters and leading-zero school numbers.

Manual Development smoke test:
1. Visit /app/#/verify as a logged-out browser user.
2. Search one known current school and compare exact CRM fields.
3. Open its direct hash URL and refresh.
4. Test expired, suspended, revoked, pending and nonexistent cases.
5. Disable CRM/feature flag and confirm no positive accreditation result.
6. Verify WordPress /verify/12345 independently once routing is in place.
7. Verify the public endpoint exposes only approved fields and does not weaken member record permissions.

## Out of scope
QR image generation, Writer certificate merges, referral tracking, WordPress changes, Catalyst deployment, CRM schema changes, historic reinstatement policy design, policy and payment workflows.

**PR is for code review only; no merge or deployment.**
