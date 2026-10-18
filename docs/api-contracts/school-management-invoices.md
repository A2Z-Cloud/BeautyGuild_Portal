# V1 School Management and Creator Invoices Migration

Independent GitHub PR based on main; no dependency on CRM draft PR #20.

## Implemented

Authenticated, CRM Contact-owned read access to Training_Centre_Accred schools and eight tabs: Profile, Courses, Venues, Tutors, Qualifications, Course dates, Documents, Invoices. Member record detail can show CRM membership extensions and Creator membership invoices. Account-wide Creator invoice view is included. Session booking lists are read from Creator.

Endpoints:
- GET /portal/management/schools
- GET /portal/management/schools/:id/:section
- GET /portal/management/schools/:id/sessions/:sessionId/bookings
- GET /portal/management/invoices
- GET /portal/management/memberships/:id/invoices
- GET /portal/management/memberships/:id/extensions

The function derives CRM Contact from signed-in Catalyst user ID using Contacts.Catalyst_User_ID and verifies each requested school or Deal is owned by this Contact. Browser-supplied Contact IDs are never used for authorisation.

## Required Development configuration

Function: PORTAL_SCHOOL_SERVICES_ENABLED=true, CRM_CONNECTION_NAME, CREATOR_CONNECTION_NAME=zohocreator, CREATOR_API_DOMAIN=https://www.zohoapis.eu, CREATOR_ACCOUNT_OWNER=beautyguild, CREATOR_APP_LINK_NAME=beautyguild, CREATOR_INVOICES_REPORT=All_Invoice_Records.

Frontend: VITE_DATA_MODE=api, VITE_CATALYST_AUTH=true, VITE_API_BASE_URL=/server/beauty_guild_api, VITE_PORTAL_SCHOOL_SERVICES=true.

Do not activate until Catalyst User to CRM Contact mapping and both connection permissions are verified. Read from real CRM/Creator via the new backend. No fake records are displayed in live mode.

## Critical V1 parity still outstanding

- Add Venue wizard, Add/Link Tutor, Create Qualification, Creator session creation and student bookings are WRITE operations that exist in V1 but are not migrated in this PR. They must be ported with the same account/CRM ownership checks, validation, pricing and idempotency, and tested before exposing action buttons.
- Tutor lists currently show linked/pending status; current-vs-expired membership status needs full Deals.Member_Profile -> Membership resolution as V1.
- Account-wide Documents navigation is not migrated; the existing record-scoped WorkDrive panel is reused for the school.
- The school invoice tab intentionally mirrors V1's Contact-wide Creator invoice query, not only the selected Accreditation. A stricter school-specific Creator link must be confirmed before changing this behaviour.
- Only the first CRM search page and up to 200 Creator rows are loaded. Production pagination and response-size handling are needed.
- Course and venue field mapping, school referral link and member extensions require live field verification.
- No invoicing records are created, no PDF generation or writeback to Creator is performed. Existing invoice records are read-only.

These restrictions are documented to avoid inventing new V1 behaviour. Any permissions, authentication, credentials, and field types must be manually configured and tested after review; no deployment or merge has been performed.
