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

## Accreditation application (V1 record set, no new CRM fields)

Accreditation does not use Journey_ID, Notes or Draft_State_Reference. Training_Centre_Accred does not have those fields and V1 does not use them. Instead a saved accreditation draft is the same set of real CRM records V1 writes, and resume re-reads them.

Switches: PORTAL_CRM_DRAFTS_ENABLED=true and PORTAL_CRM_ACCREDITATION_ENABLED=true on the function; VITE_PORTAL_CRM_DRAFTS=true and VITE_PORTAL_CRM_ACCREDITATION=true in the portal build. With the accreditation switch off the routes return 503 ACCREDITATION_DISABLED and the portal keeps the preview form. Submitting and paying also need the billing switches (PORTAL_BILLING_ENABLED, VITE_PORTAL_BILLING) so the Continue to payment step works.

| Record | Written | Notes |
| --- | --- | --- |
| Contacts | Phone, Mobile, Correspondence address lines 1 to 3, Town, County, Postcode, Country | Only non-empty answers, as V1. Name, title and email are never written. |
| Accounts | Account_Name | Created once. Named "Draft application - <contactId>" until the school name is known; that placeholder (and only that) is renamed to the school name on a later save. Never shown to the customer. |
| Training_Centres | Name, Account, Contact, Email, Phone_Number, Mobile_Phone_Number, Address_Line_1 to 3, Town, County, Country, Postcode, Centre_Status Unverified | UK nations are saved as United Kingdom. An emptied field is cleared on update. |
| Training_Centre_Accred | Applicant_Contact, Account, Accreditation_Level, Application_Stage, Accreditation_Status Unverified, Valid_From, Valid_To, three declarations, Other_Tutors_Used, Tutor_qualification_declaration_question, Number_of_Tutors, Additional_Centres_Used, Terms_Privacy_Accepted, Payment_Status Not Paid | Stage is Draft while saving. Tutors are a count only; no tutor names and no Tutor_Relationships records (tutors are invited later, AL-ACC-025). No fee, VAT or total is written: prices come from Stripe at checkout, never from the browser. |
| Accreditation_Centre_Link | Name "<school> - Main Centre", Accreditation, Training_Centre, Centre_Relationship_Type Main Centre, Start_Date, End_Date | One per application. |
| TC_Course_Offering | One per selected GTi course, Offering_Status Pending Review, Valid_From, Valid_To | Courses the applicant unselects are removed (Pending Review only). Each course id is checked against the active GTi list. |

Accreditation_Level is International Accreditation Annual when the centre country is not a UK nation (the centre, not the applicant's home address, decides), otherwise Standard Accreditation Annual. Valid_From is the chosen start date (today up to 30 days ahead, AL-ACC-046) and Valid_To is the day before its first anniversary.

### Routes (accreditation)

- POST /portal/drafts with service accreditation: create. PUT /portal/drafts/accreditation/:id: update. The body is the usual journeyId, step and answers (the journey form values), plus an optional related object ({centreId, linkId}) returned by the previous save. The browser's hints are fetched by id and verified (the link must belong to this accreditation, the centre to this Contact and Account) and are otherwise ignored; if absent, records are found by search with retry because CRM search lags writes by up to about 30 seconds. Response draft carries id, revision (always 1, there is no revision field to check) and related.
- GET /portal/drafts lists drafts: accreditations at Application_Stage Draft for the Contact. A just-saved draft can take up to about 30 seconds to appear in the list (CRM search lag).
- GET /portal/drafts/accreditation/:id: resume. Rebuilds the answers from the Contact, Training_Centres, the accreditation and its offerings. Draft stage only.
- DELETE /portal/drafts/accreditation/:id: discard, only while Application_Stage is Draft. Deletes the accreditation, its offerings and its link. The Account and Training Centre are left alone, as V1, because they may be shared records (a placeholder Account can remain).
- POST /portal/drafts/accreditation/submit: body as a save plus optional id. Applies the submit rules (school name, country, address, UK postcode, all three declarations Yes, terms accepted, at least one course, tutor and venue answers), writes everything, then sets Application_Stage to Awaiting Payment last, with Terms_Accepted_Date, Purchase_Type New Accreditation, Application_Source Portal. Repeating a submit for an application already at Awaiting Payment (and not paid) writes nothing and returns it again. A paid or otherwise advanced application returns 409 NOT_DRAFT. Response: accreditation with id, level, international, applicationStage, validFrom, validTo, schoolName. The portal then links to /pay/accreditation/:id (POST /portal/checkout, service accreditation).
- GET /portal/drafts/accreditation/prefill: the applicant's own Contact details (Salutation, First_Name, Last_Name, Email, Phone, Mobile, correspondence address) to start a new application.

Every route resolves the Contact from the verified Catalyst email (exactly one match), never accepts a Contact id, and checks Applicant_Contact on the accreditation (and Contact on the centre) before reading or writing. The function also checks the Application_Stage picklist holds Draft and Awaiting Payment and fails closed (503 STAGE_NOT_READY) otherwise. Customer-facing errors use fixed wording.

### Known limits

- A save that fails part way after the accreditation was created leaves a Draft the customer can resume or discard from Saved applications; a retry with no id creates another Draft. Orphan placeholder Accounts and Centres from discarded drafts are not deleted.
- No separate Account is reused: V1's "additional accreditation against an existing school Account" path is not part of this journey.
- International pricing: checkout currently uses the Accreditation price for every level. International applicants are accepted with no UK postcode and at the international level, but need their own Stripe price (see the hand-over note).

### Unfinished integrations, leave disabled

- The combined journey uses linked Deals and Insurance_Policy via Journey_ID and Membership lookup, but requires the full standalone Insurance questionnaire mapping and one logical list/retrieve/discard process.
- CRM Notes payload storage, relationship field types and unique Journey_ID constraints need confirmation with real Development metadata. CRM mandatory fields or layouts may prevent new parent creation.
- Revision checking is read-then-write, not atomic. Conflict prevention requires a verified CRM conditional-update strategy before Production.
- CRM search-index lag, partial writes, list pagination, orphan Notes cleanup, Catalyst account-to-Contact provisioning, Creator/Stripe completion against existing draft IDs all need end-to-end testing.
- No end-to-end Catalyst or CRM writes have been performed by this PR. Do not merge/deploy as a complete production implementation.
