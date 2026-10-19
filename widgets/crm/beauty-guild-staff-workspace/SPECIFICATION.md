# Beauty Guild Staff Workspace | Functional and UX Specification

**Document version:** 2.0 (review baseline, 19 October 2026)  
**Product:** Zoho CRM Staff Workspace widget  
**Location:** BeautyGuild_Portal / widgets / crm / beauty-guild-staff-workspace  
**Audience:** Solution architecture, CRM and Catalyst developers, design, QA, delivery and customer reviewers  
**Document status:** Requirements and proposed UX baseline; **not** a statement that the features are deployed or signed off.

## 1. Purpose and design intent

Provide Beauty Guild staff with one compact, portal-aligned workspace **inside Zoho CRM** for finding, understanding and processing Membership, Insurance and Accreditation applications, including applications originated from the Catalyst customer portal. Staff can navigate real CRM records and related records, use the existing CRM processing controls, and initiate applications for a customer.

The widget must **not** become a second source of truth or a replacement for Zoho CRM workflows, Creator processing or the Catalyst payment services.

### Terminology and status

- **Agreed capability:** established in Staff Workspace design discussions; implementation may still be incomplete.
- **Proposed UX detail:** recommended in the Portal V2 alignment review; subject to visual/design sign-off.
- **Existing candidate:** functionality described or previously tested in the separately supplied widget source kit; its presence in that kit does not prove installation in a CRM organisation.
- **Portal V2 reference:** actual source/configuration in this repository; feature flags, credentials and deployment determine whether it works in a given environment.
- **Technical dependency:** needs verification or additional development before production.
- **Deferred:** not required for the initial live CRM processing release; documented to protect the architecture.

**Repo fact:** At the time of this specification the CRM widget directory contains documentation only. The widget source from the previous standalone kit has **not** been committed here, built by official ZET tooling here, installed or validated in live Beauty Guild CRM. Do not mistake this spec for an implementation claim.

## 2. Functional scope and priorities

| ID | Feature | Required behaviour | Status / priority |
| --- | --- | --- | --- |
| SW-01 | CRM-hosted workspace | Run in Zoho CRM Web Tab, support optional contextual launch from a record; identify the logged-in staff member, use appropriate permissions and display live data only in connected mode | Agreed / P0 |
| SW-02 | Compact navigation | Overview, Applications, Customers and New Application; Membership, Insurance and Accreditation accessible by application filters and direct record context | Proposed UX / P0 |
| SW-03 | Work overview | Compact counts and recent/attention-required applications from permitted CRM records; labels based on actual record statuses, no guessed totals | Agreed / P0 |
| SW-04 | Search | Search application references, permitted customers, Accounts and related records; show clear search scope, filters and empty states | Agreed / P0 |
| SW-05 | Processing queues | Filter by application type, status, owner and date as supported; sort deterministically and open a record from each row | Agreed / P0 |
| SW-06 | Pagination | Reliable API-backed pagination across all supported lists, with page size, navigation and retained filter/sort state | Agreed; revised defaults proposed / P0 |
| SW-07 | Universal record view | View relevant fields and independent statuses for customer, membership, insurance, accreditation and other permitted CRM records | Agreed / P0 |
| SW-08 | Related-record drill-in | Show linked CRM records with meaningful summary/status and direct in-widget drill-down; preserve back navigation | Agreed / P0 |
| SW-09 | Activity and documents | Notes, tasks, emails, attachments/WorkDrive references and history where the corresponding authorised source supports them; do not fabricate unavailable links | Agreed / P1 |
| SW-10 | Safe staff actions | Open in CRM, add Note and create Task when validated; execute approvals, Blueprint transitions, status edits and custom buttons natively in CRM | Agreed / P0 |
| SW-11 | Assisted creation | Search/select/create customer, complete relevant conditional application details and review/save CRM draft; three macro phases, not only three questions | Agreed / P1 |
| SW-12 | Draft lifecycle | Save, find, resume and safely discard eligible staff-created drafts; protect against duplicates, partial writes and accidental submission | Agreed / P1, integration dependent |
| SW-13 | Declarations and evidence | Store staff-captured responses with source and audit; customer confirmation required for sensitive/legal declarations where the business process requires it | Agreed / P1, detailed mapping required |
| SW-14 | Authoritative prices and payments | Display verified quote and generate secure Stripe checkout URL through authorised server-side Catalyst/Creator integration; no card capture by generic widget | Deferred / next integration phase |
| SW-15 | Risk and processing flags | Surface genuine underwriting/referral, missing evidence, exceptions and failures as permitted; use actual CRM risk fields, not derived assumptions | Agreed / P1 |
| SW-16 | Permissions and audit | Apply staff role/CRM permissions and service-side authorisation; log meaningful staff draft actions, declaration capture and integrations | Agreed / P0 |
| SW-17 | Resilience | Loading, partial data, empty, permissions, API failures, stale revisions, rate limits and connection issues must be visible and actionable | Agreed / P0 |
| SW-18 | Portal V2 design parity | One coherent design system with matching brand colours, fonts, Lucide icon mapping, status styling and responsive layouts | Proposed UX / P0 |
| SW-19 | Deep-link/navigation context | Support CRM record context and preserve in-widget location, active tab, queue page, search/filter/sort, scroll and unfinished creation state where safe | Agreed / P0 |

P0 is necessary for a credible processing workspace. P1 is part of the wider agreed V1 functional scope, but any unverified write operation must remain disabled until technical acceptance. Deferred payment work must not block read-only processing.

## 3. Navigation and information architecture

### 3.1 Proposed main navigation

1. **Overview**: recent applications, genuine attention-required items and quick navigation.
2. **Applications**: a unified paginated list with All / Membership / Insurance / Accreditation service filters, plus status, date and ownership filters where supported.
3. **Customers**: Contacts and Accounts, with search, pagination and drill-down.
4. **New Application**: staff-assisted Membership, Insurance or Accreditation creation, conditional on role/capability.

All relevant record types remain directly reachable by link and search; removing a sidebar item must **not** make the underlying record type inaccessible. The former seven-choice widget navigation and the final four-item proposal should be reconciled at visual sign-off, not treated as an approved build solely because it appears in this document.

### 3.2 Shared behaviour

- Collapsible, unobtrusive sidebar; enough width for dense CRM records.
- Top breadcrumb communicates current page, parent record and related-record depth.
- In-widget navigation is the default. Native CRM opens explicitly using **Open in CRM**, preferably without replacing the widget tab if the host supports this.
- Back returns to the exact list context where practicable; do not reset the previous queue or lose a draft when opening a related record.
- Avoid duplicate top headings, promotional blocks, explanatory developer text or decorative icon rows.

## 4. List, search and pagination standard

Apply consistently to processing queues, Customers/Accounts, general search, related records, specialist related lists, notes/activity, documents and customer matching.

| Surface | Proposed initial page size | Notes |
| --- | ---: | --- |
| Application/processing queue | 15 | Stable sort, CRM/server-backed paging |
| Contacts and Accounts | 15 | Search and role-appropriate filters |
| Global search | 15 | If multiple module searches are combined, report per-source limits clearly |
| Related-record summary | 5 | Show first five and **View all** for the complete related list |
| Expanded specialist lists (Qualifications, Tutors, Courses, Centres) | 10 | Paginate inside the current record context |
| Notes, Tasks, Activities and Documents | 10 | Paginate where the source API supports it |
| Customer selection within creation | 8 | Match by name/email and show potential duplicates |

**These page sizes are proposed defaults.** The earlier candidate source used 12 for queues/search, 6 for related lists and 8 for customer results. That earlier implementation used bounded retrieval (reported as a maximum of four CRM API pages per query). It must not be represented as unrestricted full-dataset pagination.

### Required behaviour

- Fetch the requested page from the authoritative source when the API allows it, rather than slicing only an arbitrary previously fetched subset.
- Show loading state when moving between pages, prevent repeated clicks, and disable Previous/Next at verified boundaries.
- Show **Page x** and **Showing x–y** when the numbers are known; show an exact total only when the backend returns or verifies it.
- If pagination is incomplete or bounded, clearly indicate **More records may exist**; never display a fabricated page count.
- Stable primary sort with a deterministic secondary key (record ID) so records do not jump or duplicate between pages.
- A filter/search/sort change resets that list to its first page. Opening a record and coming back restores that list's prior page, filters, search and scroll.
- An empty page after data mutation recovers to the nearest available page. Failed loads retain current context and allow retry.
- CRM API search, related-list and document endpoints may have different pagination contracts; adapters must honour each source instead of assuming one response shape.
- Avoid loading a full CRM module solely to render a paginated screen; respect CRM API/SDK rate limits.

## 5. Universal CRM record view

### 5.1 Layout

- **Record header:** name/reference, record type, customer/organisation, responsible staff member if available, key dates and compact independent status badges.
- **Action toolbar:** Open in CRM, Add Note, Create Task, Refresh; optional Send Email only once linked to a supported authorised action.
- **Details:** relevant configured fields in grouped compact two-column layouts. Reveal large field sets progressively instead of exposing 100+ empty fields.
- **Related records:** real linked records shown as structured rows with reference, relation, status and action to open in the widget; related summaries are **not** just a count.
- **Activity/Documents:** recent entries visible, with drill-in and pagination; only show a document download if an authorised URL or API exists.
- **Source/technical information:** available for internal diagnostics if genuinely necessary but not shown by default to Guild staff.
- **Navigation:** breadcrumbs and back stack preserve queue filters, list page, active record section and scroll.

### 5.2 Module-to-display mapping

| CRM API module | Staff-facing label | Primary role |
| --- | --- | --- |
| Contacts | Contact / Customer | Person, identity and correspondence |
| Accounts | Account / Organisation | Business or training centre organisation |
| Deals | Membership Application / Transaction | Join/renew/upgrade and payment/transaction stage |
| Membership | Member Profile | Current membership-related state |
| Insurance_Policy | Insurance Policy | Insurance application, underwriting, cover and payment |
| Insurance_Extension, Insured_People, Insured_Premises, Declarations, Policy_Revisions | Policy-related records | Cover, named people/premises, declarations and revisions |
| Membership_Extension | Membership Add-ons | Purchased or linked extensions |
| Training_Centre_Accred | Accreditation Application | Application processing stage and accreditation outcome |
| Training_Centres, Accreditation_Centre_Link, Accreditation_Extensions | Training centres and linked centres | Centre and accreditation relationships |
| Qualifications, Tutor_Relationships, TC_Course_Offering | Qualifications / Tutors / Courses | Evidence, verification and offering status |

Use these as intended logical mappings, **not** proof that every API name, relationship, lookup and native related list is available to the installed widget. Validate against actual CRM metadata and layouts.

### 5.3 Do not conflate independent statuses

- **Membership:** distinguish Deals Stage, Member Profile state, payment/subscription state and expiry. Certain Deals Stage underlying picklist values are not the labels staff see; determine the displayed value using actual CRM metadata.
- **Accreditation:** show Application_Stage, Accreditation_Status and Payment_Status separately. Approvals and acceptance-letter workflows remain native CRM processes.
- **Insurance:** show Application_Status, Underwriting_Status, Policy_Status and Payment_Status separately. An application marked paid or quoted is **not** automatically an active policy.
- **Qualifications/Course Offerings:** show Verification_Status or Offering_Status from their own records where available.
- Never infer a successful status from substrings such as 'Verified' within 'Not Verified'. Use explicit state mappings and neutral fallback for unknown statuses.

### 5.4 Processing and workflow integration

The widget **reads**, provides context and facilitates safe low-risk actions. Existing Zoho CRM Blueprints, workflows, custom buttons, approval/rejection logic, notifications and permissions remain authoritative. Use native **Open in CRM** for complex edits/decisions rather than reproducing hidden Deluge/business logic. If an in-widget action is later proposed, require its exact supported API contract, side effects, permission and idempotency handling to be verified first.

## 6. Assisted creation (staff acting on behalf of a customer)

The primary UX has three **macro stages**:

1. **Customer**: search Contacts and Accounts, show potential matches, select existing customer or create a Contact only when duplicate and permission checks pass. Prefill the customer when launched from their CRM record. Staff operate as themselves, never impersonate a customer's Catalyst session.
2. **Application**: Membership, Insurance or Accreditation-specific conditional fields. Reuse or map the current Portal V2 question definitions, visibility rules, eligibility, documents and guidance where proven compatible. Break this phase into compact internal sections when needed.
3. **Review**: full summary and errors, declaration/evidence status, saving as Draft or proceeding only to an allowed, separately authorised next step.

### 6.1 Per-service coverage

**Membership:** joining/renewal/upgrade where supported, membership level, professional branches, add-ons, billing preference, optional insurance and applicant declarations. Preserve the distinction between the Member Profile and Membership transaction. Exact product/Books/Stripe pricing is authoritative on the backend.

**Insurance:** applicant details, working methods, specialist treatments, optional people/premises/property cover, conditional questions, underwriting disclosures, evidence and selected start date. Support PASS/REFER/STOP outcomes from the validated backend and fail closed on screening errors. **Referred, declined and incomplete applications are not payable or issued**.

**Accreditation:** applicant and correspondence, Account/Training Centre, main/additional venues, qualified tutors, GTi courses/offerings, qualification evidence, declaration confirmation and UK/international route from the centre's country. Preserve the multi-record CRM structure instead of writing only a simplified parent record.

**Combined journey:** where Membership and Insurance are selected together, maintain linked application records and consistent pricing/declarations; do not assume the staff widget may call the portal's customer-owned draft or checkout endpoints unchanged.

### 6.2 Draft semantics

- CRM is the permanent draft store; do not silently persist real applications only in browser local storage or Catalyst DataStore.
- Save should create or update the correct CRM records according to the actual service-specific adapter, using stable identifiers and verified relationships.
- Do not create duplicate Contacts or active Membership/Policy records when staff click Save repeatedly.
- Allow resume and eligible discard with conflict/partial-failure handling. Saving a Draft must not issue a policy, mark Paid, send an acceptance letter, or complete payment.
- Verify live CRM mandatory fields/layouts, triggers, server-side permissions and search-index lag before enabling writes.
- The Portal V2 CRM draft implementation is **not one generic schema across all services**: current Accreditation draft logic uses V1-style linked real records, while other draft services have additional Journey ID / note state design. Integration must respect their actual implementations.
- The earlier widget's three-step creation source is only a **draft starter**, not yet parity with Portal V2's full questionnaire or mappings.

### 6.3 Staff declarations

- The staff member may record verbal responses with a clear **staff-entered** marker, author, timestamp, question/declaration version and audit trail.
- Where a customer must personally confirm a declaration or consent, issue a secure customer confirmation step; do not auto-consent or claim staff-entered answers are customer confirmation.
- Block downstream payment/fulfilment where the required confirmation is missing.
- Sensitive screening details are restricted to authorised staff and must not be leaked into customer-facing summaries or generic error messages.

## 7. Payments and post-payment processing (deferred integration)

Initial processing and draft release must function without payments. The later integration should:

1. Use an **authorised staff-specific service interface** to the shared Catalyst checkout/payment logic; do **not** call the customer-owned V2 endpoints using an arbitrary Contact ID or a simulated customer session.
2. Verify the selected CRM application, user/staff permission, eligible underwriting state, declarations and price on the server. Never accept payable totals from widget fields.
3. Reuse approved Books-to-Stripe catalogue/price data and the V2 Catalyst session creation rules, including idempotency/reuse of valid sessions.
4. Return a secure Stripe Checkout URL to copy or send, with an approved communication path and audit trail; generic widget card entry is out of scope.
5. Keep Creator responsible for post-payment webhook processing, CRM status changes, policy activation and invoicing where those are already defined and validated.
6. Treat Stripe's verified completion and backend state as authoritative, not browser return URLs or manually edited CRM Payment_Status.
7. Support Membership, Accreditation and Insurance only as each current V2 service contract, ownership check, Creator webhook branch and live deployment are individually verified.

Current Portal V2 source now includes insurance checkout and referral/risk-check logic. Some services are gated by feature flags; presence of source code alone does not establish live availability or production readiness.

## 8. Portal V2-aligned visual specification

### Adopt from existing Portal V2 source

- Primary pink **#EE3E96**; sidebar/pale pink **#FAEAF2**; page background **#FAF9FA**; dark text **#25212A**; white panels.
- Brand wordmark in **Belleza**; page and section headings in **Alegreya Sans**; body and labels in **Open Sans**.
- A single consistent **Lucide** outline icon map for each module/action, matched to V2 (resolve existing Portal V2 differences between sidebar icons and service-card icons rather than copying inconsistency).
- Collapsible sidebar, restrained breadcrumb/header, compact white surfaces, clear selected state (pink background/white text where appropriate), consistent button/radius/spacing patterns, accessible focus states.
- Context-aware empty/loading/error states and UK spelling in every staff-facing label.

### Deliberately different for staff

- Prefer dense lists, quick scanning, record actions and related records over customer-facing hero imagery, promotional service cards and repeated progress panels.
- One principal content region for assisted creation; use inline sections instead of an always-open secondary help sidebar.
- For the record view, show useful facts and linked records directly. Tabs/sections are allowed where necessary but must not conceal key processing information.
- No internal labels such as 'CRM module: Training_Centre_Accred', SDK notes, test instructions, 'no API connector' commentary or architectural explanations in staff-facing screens.
- Do not layer a second pink override stylesheet on top of the previous navy design. Refactor towards one consistent tokenised style foundation while preserving independent CRM packaging.
- Reuse shared design components only when security and build boundaries are preserved; do not import the entire Portal CSS wholesale.

### Responsive and accessibility

- Desktop CRM Web Tab is the primary target; support narrower widths and keyboard navigation.
- Icons need labels/tooltips; do not rely on colour alone for status; input fields have readable labels, validation messages and clear focus states.
- Avoid overlapping controls, horizontal scrolling for essential actions, and status semantics that change solely with visual colour.

## 9. Integration, data and security boundaries

**CRM widget:** hosted independently inside Zoho CRM; Zoho Embedded App SDK for staff-scoped CRM records and context where supported.

**Portal V2:** customer-facing React app with Catalyst authentication, CRM-backed drafts/records, documents, checkout and school functionality; customer API paths enforce the authenticated member's record ownership.

**Catalyst services:** authoritative server-side journey, catalogue, quotation, underwriting and Stripe session logic when enabled and validated.

**Zoho Creator:** post-payment/webhook and related business processing as defined by existing integrations.

**CRM:** system of record for Contacts, Accounts, applications, statuses, layouts, related records, workflow/Blueprint/custom actions, permissions and audit.

The portal currently resolves customer-owned records from the authenticated Catalyst user (including a transitional verified-email-to-Contact mapping). A staff user choosing a Contact inside CRM is a **different identity and authorisation context**. Server-side authorisation must verify the staff user, selected record, action and permissible side effects. No browser-supplied Contact ID alone is authority to read/write personal data or start checkout.

Do not store API keys, tokens, Stripe secrets or unrestricted service credentials in the widget. Avoid any production write if host context, permission, schema or workflow effects are not verified.

## 10. Delivery approach and non-goals

### Build sequence

**Phase A: Core processing workspace** — one V2-aligned UI; live CRM Web Tab; queues/search with proper pagination; universal record views; linked records/back state; native CRM actions; errors, permissions, tests.

**Phase B: Staff-assisted applications** — full conditional form parity and service-specific CRM draft adapters for Membership, Insurance and Accreditation; documents/declarations, duplicate checks, save/resume/discard; authorised staff identity and audit.

**Phase C: Payments and completion** — verified shared Catalyst checkout service behind staff authorisation, safe payment links, customer consent/confirmation and webhook-based state.

**Phase D: Hardening** — full permission matrix, deployment packaging, CRM/UAT scenarios, performance and regression coverage.

### Out of scope unless separately approved

- A new competing CRM workflow/approval engine.
- Direct raw card capture in the widget.
- Recreating Stripe, Creator webhooks, sanctions algorithms or rating tables in widget JavaScript.
- Insurance MTA/endorsement servicing, renewals and policy issuance beyond existing verified CRM processes.
- Replacing Portal V2 or changing its customer authentication architecture as a side effect.
- Assumed deployment to Catalyst merely because widget files live in the same repository.

## 11. Acceptance and UAT criteria

| Test ID | Scenario | Acceptance evidence |
| --- | --- | --- |
| A01 | Launch in CRM as authorised staff | Real permitted CRM data, correct user context, no demo fixtures |
| A02 | Open Membership, Insurance and Accreditation queues | Correct source records and independent statuses; real filters |
| A03 | Search for customer/application | Matching results, no fabricated or unauthorised rows |
| A04 | Paginate a long list | Correct page boundaries, stable sort, no silent truncation |
| A05 | Open record and return to list | Same search, filter, sort, page and scroll where applicable |
| A06 | Open and back out of linked Qualification/Centre/Tutor | Correct record, correct parent context |
| A07 | Review insurance policy | Application, underwriting, policy and payment state correctly differentiated |
| A08 | Review Accreditation | Application stage, accreditation status, qualifications and course offerings correct |
| A09 | Open in CRM for processing | Correct native CRM record opens and existing button/Blueprint flow works |
| A10 | Add note/create task | One authorised record created and visible, no duplicate submit |
| A11 | Permission-denied account | No forbidden personal information or privileged actions exposed |
| A12 | Save and resume each service draft | Correct CRM records/relationships, no accidental payment/activation |
| A13 | Accreditation multiple linked records | Centre, Account, tutors, course offerings and parent remain consistent |
| A14 | Declaration audit/customer confirmation | Staff-entered vs customer-confirmed clearly distinguished; blocked where required |
| A15 | Offline/API errors and page limits | Honest error or partial-data warning and functional retry |
| A16 | Browser narrow width and keyboard | Usable navigation, actions, focus and forms |
| A17 | Official Zoho widget upload | ZET validate/pack, successful installation and live test |
| A18 | Later Stripe link flow | Authorised price, idempotent session, verified webhook result; no card capture in widget |

For unsupported/unfinished features, UAT must record **not ready**, rather than treating a browser preview, mock SDK test or source-code presence as a pass.

## 12. Verification backlog and decisions to close

- Confirm whether the proposed **four-item navigation** supersedes the previous seven-item sidebar.
- Approve exact per-list page sizes, server-side paging/search contracts and page-state restoration behaviour.
- Confirm the final universal record header, field groupings, related-list priority and conditional columns by module.
- Validate every required CRM module, field API name, relationship, native button, role and layout in the Beauty Guild CRM organisation.
- Confirm whether staff can create Contacts/Accounts from the widget and which deduplication rules apply.
- Decide exact service-specific staff draft API, status, audit and resumption semantics; review current Portal V2 Accreditation, Membership and Insurance adapters, not just the older candidate widget.
- Agree the staff declaration attestation vs customer-confirmed evidence requirements with Guild/insurance stakeholders.
- Define staff-specific backend authentication/authorisation for Catalyst pricing, quotes and Checkout, plus Creator webhook compatibility.
- Confirm WorkDrive/CRM email/document access, record visibility and paging.
- Import and refactor actual widget source into this repository only after the reviewed spec is approved; official package, live CRM deployment and end-to-end tests remain separate tasks.

## 13. Source of truth and references

**Portal V2 source in this repo:**

- [Portal layout and navigation](../../../apps/portal/src/PortalView.jsx)
- [Portal CSS/design tokens](../../../apps/portal/src/styles.css)
- [Shared UI components](../../../apps/portal/src/UiParts.jsx)
- [Journey configuration](../../../apps/portal/src/JourneyConfig.js), [Accreditation fields](../../../apps/portal/src/accreditationInputs.js), [Insurance fields](../../../apps/portal/src/insuranceInputs.js)
- [School workspace](../../../apps/portal/src/SchoolWorkspace.jsx), [Record pages](../../../apps/portal/src/LiveRecords.jsx), [Saved drafts](../../../apps/portal/src/SavedDrafts.jsx)
- [Draft API contract](../../../docs/api-contracts/crm-drafts.md)
- [Records API contract](../../../docs/api-contracts/records.md)
- [Payments and Checkout](../../../docs/api-contracts/pricing-payments.md)
- [Insurance risk-check contract](../../../docs/api-contracts/insurance-risk-checks.md)
- [Architecture and deployment boundaries](../../../docs/architecture/workspace.md)

**Prior widget source:** separately supplied Staff Workspace candidate kit and the existing [widget README](README.md). The above links describe the source being used for UX and integration alignment. They do not prove the CRM widget is already built or deployed.

**Change control:** update this specification when any workflow, technical boundary, pagination rule, draft mapping or status vocabulary changes. Obtain approval before implementation of new privileged actions or integrations.
