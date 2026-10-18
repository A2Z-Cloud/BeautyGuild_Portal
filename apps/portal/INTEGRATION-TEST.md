# Milestone 2 frontend integration smoke test

**Owner:** Frontend integration PR. **Target:** Catalyst Development only. **Never test with actual customers/payment cards.** No backend changes or deployment are made by this PR.

## Default: no integration activated

1. From \`apps/portal\`, use Node 22+, \`npm install\`, \`npm run check\`.
2. Leave \`VITE_DATA_MODE=demo\` for the initial run.
3. Dashboard continues to show sample records and the "Connection status" card says Demo mode.
4. Login/signup, checkout, CRM drafts and Account Management do not claim a real backend success.
5. Verify manual address entry continues to work in all three journeys.

## Optional verified read-side checks

**Prerequisite:** The developer has deployed **and independently verified** a suitable instance of the V1 \`beauty_guild_api\` function on the SAME origin as this portal, with working CRM/Loqate credentials and appropriate access protection. The old V1 repo merely demonstrates code, not a currently available V2 endpoint.

1. Set \`VITE_DATA_MODE=api\`, \`VITE_API_BASE_URL=/server/beauty_guild_api\`, \`VITE_ENABLED_LEGACY_APIS=courses,address\`.
2. Rebuild/redeploy after changing Vite variables.
3. On Accreditation home, GTi course catalogue fetches GET \`/courses\` and displays course names/categories. When unavailable, show an actionable error, not sample courses as live.
4. On Membership/Accreditation/premises postcode fields, enter a sample query and use Find Address. Use verified Loqate find/retrieve; on selection, the returned address is applied to visible form fields.
5. Disable one service via \`VITE_ENABLED_LEGACY_APIS\`, rebuild and confirm its UI disappears without affecting manual forms.
6. Test 401, 403, 429, API 5xx and network errors. UI should not falsely report CRM/Stripe success.
7. Do not enable these endpoints publicly unless the backend owner confirms required access controls and rate limits, especially Loqate usage.

## Catalyst Authentication (separately gated)

1. After Catalyst app auth has been configured, enable **Allow Public Signup** where applicable and verify the Development ZAID.
2. Serve via Catalyst hosting/\`catalyst serve\` (not the stand-alone Vite server).
3. Set \`VITE_DATA_MODE=api\` and \`VITE_CATALYST_AUTH=true\`, then rebuild/redeploy.
4. On Login, the official Catalyst Web SDK's embedded login should load. On Signup, submit an invite request and verify the account email flow. The frontend does not transmit a password.
5. My Account should show only the authenticated Catalyst user identity. It must **not** show any claimed CRM Contact data without an approved server-side contact resolver.
6. If the SDK cannot be initialised, the page should show an integration error and keep the manual sign-in/development troubleshooting path.
7. On Slate hosting, signout may not invalidate the backend session across different origins; verify separately before Production.

## Still blocked pending backend

- **CRM identity:** verified Catalyst user → CRM Contact mapping, ownership permissions and contact-not-found handling.
- **Drafts:** create/list/get/update/discard for all three journeys, revision, status and conflict handling.
- **Records:** member/insurance/accreditation reads using backend-authorised IDs, not query-provided Contact ID.
- **Payments:** authoritative totals, Stripe Session initiation, webhook-confirmed status, return handling.
- **Insurance:** backend PASS/REFER/STOP, sanctions referral and policy issuance.
- **Documents:** WorkDrive restricted document list/download endpoints and expiry.
- **UI parity:** full exact V1-to-V2 field mapping and complex business rules.

See \`docs/api-contracts/milestone-2.md\` for contract dependencies.
