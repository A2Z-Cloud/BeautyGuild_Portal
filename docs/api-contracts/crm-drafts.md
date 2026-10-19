# CRM-backed Save & Finish Later

**Status:** Development-only, disabled by default. Zoho CRM is the only draft store, not Catalyst DataStore. This PR does not modify live CRM.

## Enable only after Development verification

Backend variables: PORTAL_CRM_DRAFTS_ENABLED=true, PORTAL_CRM_DRAFT_STATUS=Draft (verify actual Application_Status picklist), PORTAL_CRM_DRAFT_DEAL_STAGE=<existing configured Deals Stage>. Use the existing CRM Connection with read/write/Notes and fields metadata scopes.

Frontend build variables: VITE_DATA_MODE=api, VITE_CATALYST_AUTH=true, VITE_API_BASE_URL=/server/beauty_guild_api, VITE_PORTAL_CRM_DRAFTS=true.

CRM field metadata is validated server-side: Application_Status, Journey_ID (must be unique), Last_Completed_Journey_Step, Draft_State_Reference, Draft_Saved_At, and service-specific Contact/Stage lookups. The Contact is found from the signed-in, confirmed Catalyst user's verified email, which must match exactly one Contact (the same rule as member records, documents and school services). A browser-supplied Contact ID is never trusted.

**Safety rules added in review:** a first save is a plain create (never an upsert), so a repeated Journey_ID is rejected instead of updating an existing record; every update must send the current revision (missing gives 422, stale gives 409); and when CRM drafts are on, member record lists and details exclude records whose Application_Status is the draft status, so drafts are never shown as real memberships, policies or accreditations.

## CRM draft representation

The parent record is in Deals, Insurance_Policy or Training_Centre_Accred. Application_Status determines draft lifecycle, not Deals.Stage. A CRM Note stores a versioned Base64 JSON payload under Note_Content and is linked through Draft_State_Reference. This is encoding, not encryption. No persistent browser localStorage is used.

Shared endpoints: POST/GET /portal/drafts, GET/PUT/DELETE /portal/drafts/:service/:id. Saving never marks a policy issued or triggers Stripe.

### Unfinished integrations, leave disabled

- Accreditation must reuse its V1 multi-record draft mapping (Accounts, Training_Centres, TC_Course_Offering, tutor relationships). The API refuses to create a simplified, lossy Accreditation parent.
- The combined journey uses linked Deals and Insurance_Policy via Journey_ID and Membership lookup, but requires the full standalone Insurance questionnaire mapping and one logical list/retrieve/discard process.
- CRM Notes payload storage, relationship field types and unique Journey_ID constraints need confirmation with real Development metadata. CRM mandatory fields or layouts may prevent new parent creation.
- Revision checking is read-then-write, not atomic. Conflict prevention requires a verified CRM conditional-update strategy before Production.
- CRM search-index lag, partial writes, list pagination, orphan Notes cleanup, Catalyst account-to-Contact provisioning, Creator/Stripe completion against existing draft IDs all need end-to-end testing.
- No end-to-end Catalyst or CRM writes have been performed by this PR. Do not merge/deploy as a complete production implementation.

## Readiness check changes (Development)
- `PORTAL_CRM_DRAFT_REQUIRE_UNIQUE=false` lets drafts run while `Journey_ID` is not yet a unique CRM field. Default is `true`; use `false` on a test system only, because a repeated save could then create a duplicate.
- The Deal draft stage (`PORTAL_CRM_DRAFT_DEAL_STAGE`) is trusted rather than checked against the module-level Stage list, which omits stages that layouts or pipelines add (Active and Paid are also missing from it). CRM refuses an unknown stage, so a wrong value fails the save without writing.

## Prefill
`GET /portal/records/me` returns the signed-in member's own Contact details (Salutation, names, email, Phone, Mobile, correspondence address, country, Interests) for filling forms. The Contact is resolved from the verified email, never from a browser-supplied id.
