# Portal member record APIs

Routes: `GET /portal/records[?kind=membership|accreditation|insurance]`, `GET /portal/records/summary`, `GET /portal/records/:kind/:id`.

CRM modules and owner fields verified against **V1 repository source**: membership = `Deals.Contact_Name`, accreditation = `Training_Centre_Accred.Applicant_Contact`, insurance = `Insurance_Policy.Contact`. The function maps only whitelisted fields.

Before enabling, confirm the authenticated Catalyst account has `is_confirmed=true`, its verified email resolves to exactly one CRM Contact, and the CRM connection has appropriate read scopes. Missing or duplicate matches fail closed (404/409). No browser-provided contact ID is accepted. Enable function env `PORTAL_RECORDS_ENABLED=true`, web build `VITE_PORTAL_RECORDS=true` with API mode and Catalyst auth. Test in Development using two distinct Contacts to verify cross-account 404.

**Limitations:** the CRM `Contacts/search?email=...` resolver is transitional. For production, establish an immutable, verified Catalyst-user-to-CRM-Contact link in the backend; never depend indefinitely on mutable email equality. Search results are bounded to ten pages; high-volume handling and pagination need completing. All records are read-only.

**No CRM draft handling is included in this PR.** Insurance fields, authenticated user mapping and production CRM permissions require Development verification before enablement. A draft PR remains open separately.

## Membership cover (read only, MTA R1)

`GET /portal/records/membership/:id/cover` returns the signed-in member's current cover for one of their own memberships. It is the starting point for mid-term changes (see `requirements/mta/customer-portal-functional-spec.md` and `docs/delivery/mta-build-scope.md`). Nothing here writes to the CRM or prices anything. Code: `src/cover.js`.

- **Ownership:** the Deal's `Contact_Name` must be the signed-in Contact and the Deal must not be a saved draft, otherwise 404. The id is never trusted as proof of ownership.
- **Membership:** type, stage, term, branches (`Membership_Branch`) and extras (`Membership_Extension`, as the school management route reads them).
- **Insurance:** the member's `Insurance_Policy` on this Deal (same Contact, `Membership` = this Deal) whose `Application_Status` is not `Draft`, `Ready for Payment`, `Referred` or `Expired`, newest start first. Its `Insurance_Extension` rows (cover, yearly net, IPT and gross in pence), `Insured_People` (name and employee or subcontractor) and `Insured_Premises` (address). Rows with Status `Draft`, `Cancelled`, `Superseded`, `Replaced`, `Expired` or `Removed` are not current. `insurance` is `null` and `includesInsurance` false for an Associate membership.
- **Revisions:** `Policy_Revisions` linked to this Deal (`Change_Type`, `Change_Scope`, `Requested_Effective_Date`, created time), newest first. A CRM without the module returns `revisions: { available: false, items: [] }` rather than an error.
- `canChange` is `false` until the change journeys are built and approved.

**To verify against the live CRM before relying on it:** the `Application_Status` value of a policy that is in force (the code treats anything not in the list above as in force), the `Status` values on cover rows and people once Creator has activated them, and the `Policy_Revisions` field API names (only the five observed in the CRM Cartographer snapshot are read).

Client: `portalApi.getMembershipCover(id)`; the membership management page has Your cover and Change history tabs (`src/MembershipCover.jsx`).
