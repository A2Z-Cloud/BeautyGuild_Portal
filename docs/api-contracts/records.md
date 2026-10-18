# Portal member record APIs

Routes: `GET /portal/records[?kind=membership|accreditation|insurance]`, `GET /portal/records/summary`, `GET /portal/records/:kind/:id`.

CRM modules and owner fields verified against **V1 repository source**: membership = `Deals.Contact_Name`, accreditation = `Training_Centre_Accred.Applicant_Contact`, insurance = `Insurance_Policy.Contact`. The function maps only whitelisted fields.

Before enabling, confirm the authenticated Catalyst account has `is_confirmed=true`, its verified email resolves to exactly one CRM Contact, and the CRM connection has appropriate read scopes. Missing or duplicate matches fail closed (404/409). No browser-provided contact ID is accepted. Enable function env `PORTAL_RECORDS_ENABLED=true`, web build `VITE_PORTAL_RECORDS=true` with API mode and Catalyst auth. Test in Development using two distinct Contacts to verify cross-account 404.

**Limitations:** the CRM `Contacts/search?email=...` resolver is transitional. For production, establish an immutable, verified Catalyst-user-to-CRM-Contact link in the backend; never depend indefinitely on mutable email equality. Search results are bounded to ten pages; high-volume handling and pagination need completing. All records are read-only.

**No CRM draft handling is included in this PR.** Insurance fields, authenticated user mapping and production CRM permissions require Development verification before enablement. A draft PR remains open separately.
