# Beauty Guild Staff Workspace (Zoho CRM widget)

**Status:** CRM-connected widget V1 candidate; **not deployed or confirmed against live Beauty Guild CRM**. The existing runnable source is in the separately supplied Staff Workspace widget build kit. This directory records the component specification and deployment boundary. The source has **not yet been committed here**.

## Purpose

One minimal staff interface within Zoho CRM for working with Membership, Insurance and Accreditation applications originally submitted through the Catalyst customer portal, and for starting customer applications on behalf of a member.

The widget is a **CRM widget**, not the customer-facing portal. It is independently packaged and installed in Zoho CRM.

## Current functionality in the candidate source

| Area | What the widget supports |
| --- | --- |
| Workspace | Overview, application queues, Customers, Membership, Insurance, Accreditation, New application |
| CRM data | Reads real CRM records through the logged-in user's Zoho Embedded App SDK context; sample data disabled in the CRM release |
| Navigation | Open linked records in the same widget; go back to previous widget context; explicit Open in CRM for native record editing |
| Records | Summary views for Contacts, Accounts, Member Profile (`Membership`), membership transactions (`Deals`), policies, accreditation and related entities |
| Relationships | Related-record panels for memberships, extensions, policies, declarations, insured people/premises, revisions, qualifications, centres, course offerings and tutors, subject to permitted CRM API relationships |
| Lists | UI pagination on application queues, related records, search results and creation-time customer matches |
| CRM retrieval | Uses multiple search/getAllRecords pages where the Zoho SDK provides them; currently safety capped at four CRM API pages per query and marked as potentially incomplete if truncated |
| Review | Read application, underwriting, payment and verification statuses, plus relevant attention indicators |
| Processing | **Native CRM owns status changes, workflows, approvals and existing custom buttons**; widget offers Open in CRM, add Note and create Task |
| Assisted creation | Three-step starter flow: select/create Contact, enter initial Membership/Insurance/Accreditation details, save a **Draft** in CRM (when allowed by CRM schema and permissions) |
| Branding | Guild palette #EE3E96, #FAEAF2, white panels, Alegreya Sans headings, Open Sans text and Belleza wordmark, consistent SVG line icons |
| Payment | **Not in this release**; reusable Catalyst/Stripe service intended in a later iteration |

**Important:** The assisted-creation implementation is a draft **starter**, not the complete portal application questionnaire or an alternative underwriting/payment engine.

## CRM modules

- `Contacts`, `Accounts`
- `Membership` (member profile) and `Deals` (membership transaction)
- `Membership_Extension`, `Insurance_Policy`, `Insurance_Extension`, `Insured_People`, `Insured_Premises`, `Declarations`, `Policy_Revisions`
- `Training_Centre_Accred`, `Qualifications`, `Training_Centres`, `Accreditation_Centre_Link`, `Accreditation_Extensions`, `TC_Course_Offering`, `Tutor_Relationships`

Lookup names and relationships must be verified against the destination CRM organisation. Some related-list features exposed by native CRM do not correspond to generic Search Records queries.

## Interaction and integration principles

1. Keep staff in the widget while browsing records and related lists; opening native CRM must be explicit.
2. Zoho CRM is the system of record; do not duplicate Blueprint, custom-button or workflow business logic.
3. Catalyst owns shared customer journey and Stripe payment services where validated; there is no implicit shared deployment with this widget.
4. Use the logged-in user's CRM permissions; do not hardcode tokens, portal credentials or live customer data.
5. Do not treat `Payment_Status` updates or payment-link generation as authoritative payment confirmation.
6. Preserve the customer/record context when navigating back; test this in a real CRM Web Tab.
7. Keep the UI compact, neutral and aligned to the existing `A2Z-Cloud/beauty-guild-catalyst` V1 portal visual style.

## Pagination: implemented design

- **Related lists:** 6 records per on-screen page.
- **Application queues:** 12 records per page.
- **Global search:** 12 per page.
- **Customer matches:** 8 per page.
- Previous/Next buttons are disabled at boundaries; page and loaded-record ranges appear in the footer.
- Where API retrieval is capped, the screen indicates that further CRM records **may** exist. This must not be mistaken for unrestricted full-dataset pagination. For high-volume production queues, add server-driven filtering or a next-page cursor.

## Deployment and test status

**Not auto-deployed from this repository.** The separately supplied source kit contains `app/widget.html`, `app/widget.js`, `app/styles.css`, `app/brand-processing.css` and ZET packaging instructions. The Zoho-supported packaging route is a local ZET project: `zet init`, copy source into its `app` folder, `zet validate`, then `zet pack`. Configure the hosted widget with the correct index page (`/widget.html`), CRM permissions and Web Tab/record context.

Locally passed: JavaScript syntax, core logic, mocked CRM SDK (record retrieval, notes, tasks and draft UI) and pagination boundary tests. **Not yet passed:** official ZET validation, upload, live CRM permission/data check, real draft creation and end-to-end UAT. The isolated browser runtime could not open local or loopback pages, so no new browser screenshot test was claimed.

## Outstanding before production

- Verify actual CRM API names, layouts, required fields and lookup mappings.
- Confirm list search criteria and CRM API page limits on live data; adopt server-side paging for very large datasets.
- Validate custom button / workflow access via native CRM and permissions for each role.
- Confirm draft record creation does not trigger unintended processing automations or duplicate records.
- Verify native CRM navigation retains widget context.
- Complete the shared Catalyst-assisted application flow, consent evidence, documents and payments in later delivery packages.

## Ownership and upstream references

- Client portal V1: [A2Z-Cloud/beauty-guild-catalyst](https://github.com/A2Z-Cloud/beauty-guild-catalyst)
- Multi-deliverable workspace: `A2Z-Cloud/BeautyGuild_Portal`
- CRM widget owner: CRM delivery team; deploy separately from `apps/portal/`.

_Last updated: 16 October 2026._
