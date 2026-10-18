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

The function derives the CRM Contact from the signed-in, confirmed Catalyst user's verified email, which must match exactly one Contact (the same rule as member records and documents), and verifies each requested school or Deal is owned by this Contact. Browser-supplied Contact IDs are never used for authorisation.

## Required Development configuration

Function: PORTAL_SCHOOL_SERVICES_ENABLED=true for reads. For the V1-mapped Qualification and Creator Session creation endpoints, separately set PORTAL_SCHOOL_WRITES_ENABLED=true only after Development testing and permission verification., CRM_CONNECTION_NAME, CREATOR_CONNECTION_NAME=zohocreator, CREATOR_API_DOMAIN=https://www.zohoapis.eu, CREATOR_ACCOUNT_OWNER=beautyguild, CREATOR_APP_LINK_NAME=beautyguild, CREATOR_INVOICES_REPORT=All_Invoice_Records.

Frontend: VITE_DATA_MODE=api, VITE_CATALYST_AUTH=true, VITE_API_BASE_URL=/server/beauty_guild_api, VITE_PORTAL_SCHOOL_SERVICES=true. Separately VITE_PORTAL_SCHOOL_WRITES=true enables the supported create forms only when the backend flag is also on.

Do not activate until the verified-email Contact match, the CRM field names and both connection permissions are verified. Course date and qualification creation also reject invalid dates, prices and text and refuse identical repeats. Read from real CRM/Creator via the new backend. No fake records are displayed in live mode.

## Critical V1 parity still outstanding

- **Added, behind separate write flags:** CRM qualification creation using the V1 field mapping, and Creator Course_Sessions creation with server-verified Accreditation, offering and tutor. These are unverified in live Development and should remain disabled until CRM/Creator data types, connections, validations and idempotency are tested.
- **Still missing:** Add Venue wizard/payment, Add/Link Tutor CRM Contact relationship workflow, and student booking creation. Do not show these as working. The existing V1 source must be followed and checked for cross-account authorisation, idempotency and invoice/payment side effects before porting.
- Tutor listing now resolves Deals.Member_Profile -> Membership for current, expired and pending status, as in V1. Its API fields and rate limits still require Development verification.
- Account-wide Documents navigation is not migrated; the existing record-scoped WorkDrive panel is reused for the school.
- The school invoice tab intentionally mirrors V1's Contact-wide Creator invoice query, not only the selected Accreditation. A stricter school-specific Creator link must be confirmed before changing this behaviour.
- Only the first CRM search page and up to 200 Creator rows are loaded. Production pagination and response-size handling are needed.
- Course and venue field mapping, school referral link and member extensions require live field verification.
- No invoicing records are created, no PDF generation or writeback to Creator is performed. Existing invoice records are read-only.

These restrictions are documented to avoid inventing new V1 behaviour. Any permissions, authentication, credentials, and field types must be manually configured and tested after review; no deployment or merge has been performed.
