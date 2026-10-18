# Milestone 2 integration contract register

**Repository:** \`A2Z-Cloud/BeautyGuild_Portal\`. **Source checked:** V1 \`A2Z-Cloud/beauty-guild-catalyst\`, \`functions/beauty_guild_api/index.js\` and \`beautyguildclient/src/accreditation/api.js\`. The V1 source proves these routes exist in code; it does **not** verify a reachable, deployed V2 backend.

## Verified in V1 source, safely gated in V2 frontend

| Feature | V1 route | Response shape | V2 status |
| --- | --- | --- | --- |
| Active GTi courses | \`GET /server/beauty_guild_api/courses\` | \`{courses:[{id,name,category,...}]}\` | Read adapter; opt-in via \`VITE_ENABLED_LEGACY_APIS=courses\` |
| Loqate search | \`GET /server/beauty_guild_api/address/find?text=...\` | \`{items:[{Id,Type,Text,Description}]}\` | Read adapter; opt-in \`address\` |
| Loqate retrieval | \`GET /server/beauty_guild_api/address/retrieve?id=...\` | \`{address:{addressLine1,addressLine2,town,county,postcode,...}}\` | Read adapter; opt-in \`address\` |
| Catalyst identity | Catalyst Web SDK \`isUserAuthenticated\` | \`result.content.user_id/email_id/first_name/last_name\` | Separate opt-in SDK adapter, no CRM identity assumed |
| Catalyst registration | Catalyst Web SDK \`signUp\` | SDK invitation flow | Opt-in, no direct frontend password handling |
| Catalyst sign-in | Catalyst Web SDK \`signIn(containerId,{redirect_url})\` | Hosted embedded widget | Opt-in, requires SDK and Catalyst hosting |

Routes above require backend-owner deployment/confirmation; enabling the UI flag never proves access control or successful connection.

## Known V1 routes deliberately NOT wired

| V1 route | Why not enabled in V2 |
| --- | --- |
| \`GET /contacts/lookup?email=...\`, \`POST /contacts\` | Email lookup and Contact creation cannot substitute for server-verified Catalyst user to CRM Contact mapping |
| \`POST /accreditations/draft\`, \`GET/DELETE /accreditations/:id?contactId=...\` | Existing V1 payload/ContactID-based contract and authorisation require review for V2; no generic drafts for Membership/Insurance |
| \`GET /accreditations?contactId=...\`, \`GET /memberships/history?contactId=...\` | Browser Contact ID must not be treated as authorisation; V2 verified identity missing |
| \`POST /accreditations/submit\` | Creates real CRM records; V2 mapping, idempotency and permission rules must be approved |
| \`POST /payments/membership-checkout\`, \`POST /payments/checkout\` | Real money, server-computed amount, Stripe session/webhook controls and identity not yet established |
| WorkDrive and invoice endpoints | Confidential Contact/Accreditation-scoped access needs verified ownership |

## Backend owner: required V2 contracts

1. **Identity**: server-authenticated \`currentUser\` (Catalyst user ID), securely resolved CRM Contact ID, no reliance on caller-selected \`contactId\`. Error semantics for absent contact, provisioning, duplicates and session expiry.
2. **Drafts**: for \`membership\`, \`accreditation\`, \`insurance\`, create/list/get/update/discard, stable IDs, \`service\`, \`revision\`, \`status\`, \`updatedAt\`, \`answers\` and \`step\`. Define upsert/version behaviour, ownership, uniqueness and discard eligibility.
3. **Record reads**: owned Membership/Insurance/Accreditation records; action and status capabilities from CRM/Creator; pagination and back navigation.
4. **Pricing and submission**: backend decisions and totals, server validation, safe idempotency, no client-calculated payable amount; payment success via Stripe webhook state, never browser return alone.
5. **Insurance**: quote and sanctions risk checks, PASS/REFER/STOP and referral state, no policy activation for REFER.
6. **Profile**: authenticated field visibility and update permissions; email or identity changes require an agreed Catalyst + CRM process.
7. **Documents**: server-authorised WorkDrive references, temporary URLs, audit and missing-document behaviour.
8. **Error shape**: stable \`code\`, \`message\`, \`fieldErrors\`, \`requestId\` where practical. Explicit 401/403/409/422/429/5xx handling.

Do not enable CRM or Stripe adapters simply because routes exist in V1. Confirm backend rules, schemas, error responses and Development security before wiring UI actions. No backend changes are part of this PR.

## Hosting caveat

- For **legacy same-origin Catalyst client**: \`/server/beauty_guild_api\` can be a relative gateway if the function is deployed in that environment.
- For **Slate frontend** on a separate \`*.onslate.com\` origin, that relative URL does **not** target the Catalyst function automatically; provide a verified full HTTPS function origin and an approved authentication/CORS/token approach. Do not assume cookies are shared across origins.
- No API secrets, Zoho OAuth credentials, Stripe secrets or private keys belong in \`VITE_*\` environment variables.
