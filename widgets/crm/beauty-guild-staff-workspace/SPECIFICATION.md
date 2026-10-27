# Beauty Guild Staff Workspace | Functional and UX Specification

**Document version:** 2.3 (adds portal mid-term adjustments, staff visibility only, 28 October 2026)  
**Product:** Zoho CRM Staff Workspace widget  
**Location:** BeautyGuild_Portal / widgets / crm / beauty-guild-staff-workspace  
**Audience:** Solution architecture, CRM and Catalyst developers, design, QA, delivery and customer reviewers  
**Document status:** Requirements and proposed UX baseline, updated with the 19 October 2026 18:44 CRM metadata. **Not** a statement that the features, automations or insurance issuance have passed UAT or are deployed.

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
| SW-11 | Assisted creation | Search for an existing CRM Contact or create one before starting; complete the **same Portal V2 journey** for that Contact, with conditional forms, existing quote rules and CRM record mappings | Agreed / P1 |
| SW-12 | Cross-channel draft lifecycle | Persist one CRM-backed application under the selected Contact; staff can save/resume in the CRM widget and the same customer can register/sign in to Portal V2 and resume the **same draft** at the correct step. Support the reverse hand-off, revision checks and no duplicate applications | Agreed / P1; cross-channel integration and testing required |
| SW-13 | Declarations and evidence | Store staff-captured responses with source and audit; customer confirmation required for sensitive/legal declarations where the business process requires it | Agreed / P1, detailed mapping required |
| SW-14 | Payment-link generation | Use existing Portal V2 server-side quote and Stripe Checkout session logic to generate/reuse a **customer-specific payment link**; staff can copy, send or open the link during a call. After payment, the existing Creator-to-CRM process continues. Do not build a separate payment or rating engine | Agreed / P1; same-system integration, Creator webhook verification |
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
| Insurance_Extension, Insured_People, Insured_Premises, Declarations, Policy_Revisions | Policy-related records | Cover, named people/premises, declarations and revisions (portal changes: see 5.8) |
| Membership_Extension | Membership Add-ons | Purchased or linked extensions |
| Training_Centre_Accred | Accreditation Application | Application processing stage and accreditation outcome |
| Training_Centres, Accreditation_Centre_Link, Accreditation_Extensions | Training centres and linked centres | Centre and accreditation relationships |
| Qualifications, Tutor_Relationships, TC_Course_Offering | Qualifications / Tutors / Courses | Evidence, verification and offering status |

Use these as intended logical mappings, **not** proof that every API name, relationship, lookup and native related list is available to the installed widget. Validate against actual CRM metadata and layouts.

### 5.3 Do not conflate independent statuses

- **Membership:** distinguish Deals Stage, Member Profile state, payment/subscription state and expiry. Certain Deals Stage underlying picklist values are not the labels staff see; determine the displayed value using actual CRM metadata.
- **Accreditation:** show Application_Stage, Accreditation_Status and Payment_Status separately. Approvals and acceptance-letter workflows remain native CRM processes.
- **Insurance:** show Application_Status, Underwriting_Status, Risk_Status, Policy_Status and Payment_Status separately, plus Member_Gate_Result, Sanctions_Status, Manual_Review_Outcome and Document_Status when available. An application marked paid or quoted is **not** automatically an active or validly issued policy. Use actual picklist values, including the newly added Underwriting_Status = Stop and Payment_Status = Pending / Failed / Expired.
- **Qualifications/Course Offerings:** show Verification_Status or Offering_Status from their own records where available.
- Never infer a successful status from substrings such as 'Verified' within 'Not Verified'. Use explicit state mappings and neutral fallback for unknown statuses.

### 5.4 Processing and workflow integration

The widget **reads**, provides context and facilitates safe low-risk actions. Existing Zoho CRM Blueprints, workflows, custom buttons, approval/rejection logic, notifications and permissions remain authoritative. Use native **Open in CRM** for complex edits/decisions rather than reproducing hidden Deluge/business logic. If an in-widget action is later proposed, require its exact supported API contract, side effects, permission and idempotency handling to be verified first.

### 5.5 CRM metadata baseline: 19 October 2026, 18:44

**Source:** Beauty Guild Cartographer snapshot `snap-792ffa56-26dd-4d6d-95ec-6af3cc1114d0`, captured `2026-10-19T18:44:29.877Z` for Zoho CRM organisation `1011174000000549177`. Compared with the earlier 14:59 snapshot `snap-b9df05b9-5f66-445a-8946-679062ebfa12`. This is a **metadata and Deluge-source inspection**, not runtime evidence.

| Discovery area | Previous | Latest | Delta / interpretation |
| --- | ---: | ---: | --- |
| Modules | 80 | 80 | No newly discovered modules |
| Field nodes | 1,237 | 1,258 | **21 new**; metadata coverage counter reports 1,260, a separate extractor count |
| Layouts | 40 | 40 | Three existing layouts changed: Insurance Policy, Member Profile and Accounts |
| Related-list catalogue | 413 | 413 | Stable; related-list detail extraction remains unavailable |
| Workflow definitions | 39 | 45 | Six **new active** Insurance workflows |
| Function definitions and full source | 65 | 71 | Six new active function definitions (one is a Schedule function) |
| Blueprints | 1 | 1 | Still **Task Process Management** in `Tasks`; no Insurance/Accreditation Blueprint identified |

**New fields (21):**

| Module | Exact CRM field API names | Purpose for staff view |
| --- | --- | --- |
| `Membership` (2) | `Banned_From_Insurance`, `Has_Insurance_Issue` | Eligibility and referral inputs; restricted to authorised roles |
| `Accounts` (1) | `Insurance_Workdrive_Link` | Link to the Account's insurance document folder |
| `Insurance_Policy` (18) | `Member_Gate_Result`, `Sanctions_Status`, `Sanctions_Reference`, `Sanctions_Checked_At`, `Manual_Review_Outcome`, `Reviewed_At`, `Underwriting_Notes`, `Quote_Version`, `Reprice_Required`, `Next_Action`, `Next_Action_Date`, `Last_Activity_At`, `Document_Status`, `Documents_Generated_At`, `Workdrive_Link`, `Insurance_Schedule_Link`, `Statement_of_Fact_Link`, `Policy_Wording_Links` | Underwriting and gate outcomes, staff follow-up, quote versioning and policy document links |

The **Insurance Policy** layout now includes dedicated sections `Underwriting and Gates`, `Sanctions`, `Operations` and `Policy Documents`. The widget should use these as a starting point for its compact field groupings, rather than simply rendering all 62 fields in layout order. Existing `Accounts` and `Membership` layouts gained the fields shown above.

**Picklist changes confirmed in the same snapshot:**

| Module.field | New allowed values | Existing values remain |
| --- | --- | --- |
| `Insurance_Policy.Underwriting_Status` | `Stop` | `Not Assessed`, `Pending`, `Clear`, `Refer`, `Declined`, `Manual Review (REC)` |
| `Insurance_Policy.Payment_Status` | `Pending`, `Failed`, `Expired` | `Paid`, `Not Paid` |

New operational picklists include `Member_Gate_Result` = Clear / Review / Blocked; `Sanctions_Status` = Not Checked / Clear / Review / Block / Error; `Manual_Review_Outcome` = Approved / Declined / Approved with Endorsement; and `Document_Status` = Not Generated / Draft / Issued / Regenerate / Failed. Also handle blank or null values as **unknown**, not successful clearance.

### 5.6 Insurance workflows and server-side ownership

The newly discovered workflows are **active in metadata**, but execution history, function-to-workflow parameter configuration, role permissions and integrated UAT were not provided.

| CRM workflow | Trigger and condition from snapshot | Linked Deluge function | Intended staff-visible effect |
| --- | --- | --- | --- |
| `A2Z - INS Member Gate` | Insurance Policy create/edit for an open application and non-active policy | `a2z_ins_member_gate` | Evaluates Member Profile ban/issue flags, writes Member_Gate_Result and may set underwriting Stop/manual review plus Next Action/task |
| `A2Z - INS Sanctions Roll-up` | Risk Screening create/edit where Check = Sanctions | `a2z_ins_sanctions_rollup` | Maps screening/investigation to policy Sanctions_Status and may create a high-priority review task |
| `A2Z - INS Review Completion` | Manual_Review_Outcome field updated to a non-empty value | `a2z_ins_review_completion` | Approved clears underwriting; Declined sets Stop/Withdrawn; Approved with Endorsement increments Quote_Version and sets Reprice_Required |
| `A2Z - INS Policy Activation` | Payment_Status field updated to Paid | `a2z_ins_policy_activation` | Evaluates its current gates and, if passed, sets Policy_Status Active, Application_Status Completed and dates; also activates eligible extensions |
| `A2Z - INS Documents on Activation` | Policy_Status updated to Active | `a2z_ins_policy_documents` | Creates **draft placeholder** documents in WorkDrive; not production-approved issuance |
| `A2Z - INS Documents Regenerate` | Document_Status updated to Regenerate | `a2z_ins_policy_documents` | Regenerates draft documents using the same function |

**Additional function, not one of the six workflow actions:** `a2z_ins_incomplete_followup` is categorised as a **Schedule** function, scans up to five pages of 200 draft/in-progress/saved quote records, checks the `ins_incomplete_followup_days` organisation variable (fallback three days), and creates a follow-up task/Next Action if not previously followed up after the last activity. The export does **not** prove the function has a running schedule. The scan is bounded at 1,000 records; staff queues should not rely on it as an exhaustive or continuously updated index.

**Widget responsibility:** read and present statuses, next action and authorised linked information; deep-link into the appropriate native CRM record for manual outcomes and established processing. Do **not** replicate this Deluge logic in browser JavaScript, bypass its workflow triggers by direct status updates, or claim that a UI payment badge is a verified Stripe receipt.

### 5.7 Insurance activation and document safeguards: evidence versus required behaviour

The source-code review identifies the following **implementation risks**. They are not confirmed production incidents, and the widget must not assume the described checks already operate fail-closed.

| Risk ID | What current Deluge actually does | Required safeguard / validation before enabling staff-triggered completion |
| --- | --- | --- |
| INS-G01 | If Underwriting_Status is blank or Not Assessed, the activation function rejects only Risk_Status = Referred or Stopped; other Risk_Status values can fall through | Agree a positive, explicit underwriting clearance requirement and test all blank, pending, referral, Stop, declined and error combinations |
| INS-G02 | Activation blocks Sanctions_Status = Review, Block or Error; **Not Checked / blank are not rejected** | Confirm applicable sanctions clearance is completed, current and auditable before issue; missing/error outcomes fail closed |
| INS-G03 | Activation blocks Member_Gate_Result = Blocked, but **Review / blank are not rejected** | Require a verified Clear result or an approved, auditable manual disposition according to Guild rules |
| INS-G04 | Member Gate defaults to Clear when `Membership_Profile` lookup is absent | Agree whether an unlinked profile is eligible; do not silently treat missing eligibility evidence as clearance |
| INS-G05 | Member Gate runs on open Insurance Policy create/edit; changing a Member Profile's ban/issue fields alone does not match this workflow trigger | Confirm propagation/re-evaluation for changed Member Profile flags and existing applications |
| INS-G06 | Sanctions Roll-up updates from an individual screening record without an apparent latest-result/review-state precedence check | Validate multiple screenings, chronology, confirmed investigations, re-screening and contradictory results; preserve audit and avoid stale clears |
| INS-G07 | A Paid CRM field update triggers activation; this function does not itself verify Stripe webhook signature, provenance or captured amount | Enforce trusted server-side payment verification and idempotent fulfilment; never allow generic staff entry of Paid to stand in for receipt |
| INS-G08 | Activation does not check `Reprice_Required` / current `Quote_Version` as a gate | Block use of superseded quotes and require the approved final price/endorsement before checkout and issue |
| INS-G09 | `a2z_ins_policy_documents` creates WorkDrive text files marked **DRAFT - TEMPLATE AWAITING APPROVAL**, then sets `Document_Status` to Draft even if Policy_Status is Active | Do not present draft schedule/Statement of Fact as issued cover documents. Approve templates, wordings, versioning, document status transitions, links and failure handling before customer issuance |
| INS-G10 | The document generator requires an Account; missing Account sets Document_Status Failed and a Next Action. Some wording references may default to 'link to be added' | Validate prerequisite Accounts, WorkDrive folders, final URLs, document retrieval permissions and regeneration/recovery behaviour |
| INS-G11 | Incomplete follow-up is bounded and deduplication is based on Next_Action/Next_Action_Date | Verify schedule, task deduplication across retries/record edits, null date handling, timezone and volume >1,000 records |
| INS-G12 | Manual review completion sets Reviewed_At and may set Review_Owner from Modified_By, then updates policy without further workflow triggers | Validate authorised reviewer identity, audit trail, endorsements, downstream notification and state transitions; never infer that entering a selection alone completes governance |

**Proposed production acceptance rule (pending Guild/insurance sign-off):** a policy must not be offered for payment or treated as issued unless its membership eligibility, underwriting and required sanctions checks have explicit acceptable outcomes, required declarations/customer evidence are confirmed, any repricing is resolved, and payment is independently verified. Document issuance requires separately approved templates and an auditable successful generation outcome. These are **recommendations**, not assertions that the present Deluge enforces each condition.

**Operational UI behaviour:**
- Insurance list rows should offer concise **Application**, **Underwriting**, **Payment**, **Policy**, **Next Action** and due-date indicators, plus a visible referral/blocked attention state. These are independent state machines.
- Insurance detail should group **Application**, **Underwriting**, **Eligibility and Screening**, **Payment and Cover**, **Documents and Follow-up**. Display recorded sanctions status, reference and screening timestamp only to authorised staff; provide drill-in to permitted `Risk_Screenings`.
- Show `Document_Status = Draft` and any draft schedule links as **Draft documents, not evidence of cover**. Missing links, error states or placeholder policy wordings must not render as completed/issued.
- Restrict Manual Review Outcome, Policy Status, Payment Status, member insurance restrictions and screening dispositions to native verified CRM actions/authorised workflows until write contracts are approved.
- For queues, use `Next_Action` and `Next_Action_Date` where populated, but distinguish blank values from 'no action required'. Do not invent workflow SLA counters or totals.

### 5.8 Portal mid-term adjustments (Policy_Revisions): what staff see

Customers can request mid-term changes to a policy in Portal V2 (see `requirements/mta/customer-portal-functional-spec.md` and `docs/delivery/mta-r3-plan.md`). The portal writes **new** records only and never edits live cover. The widget presents them read only and deep-links into the native CRM record. It does not create, price, approve, pay or apply a revision, and it does not change any revision status.

**What the portal writes (all behind off-by-default switches until verified):**
- A `Policy_Revisions` header named `MTA <quote id>` (or `MTA REQ-<random>` for a request with nothing to quote), with Requested_Effective_Date, After_Quote_ID, deltas and `Request_Details` (JSON: what was asked, the declarations, the quote items, and the live rows and people the change ends).
- For a payable change, draft `Insurance_Extension` and `Insured_People` rows: Status Draft, linked by `Policy_Revision`, dated Effective_From to the policy end, with `Supersedes_Extension` where one replaces another.
- `Stripe_Checkout_Session_ID` once a checkout exists.

**Status vocabulary, and who sets it:**

| Revision_Status | Meaning for staff | Set by |
| --- | --- | --- |
| Quoted | Member has a payable quote saved, not yet in checkout | Portal |
| Under Review | Referred to the office (for example Employers' Liability, a monthly payer, a rule the portal will not quote). **Needs staff action** | Portal |
| Awaiting Payment | A Stripe checkout is open for this revision | Portal |
| Approved, Scheduled, Applied | Paid and verified, then queued or applied | Creator only |
| Withdrawn | Abandoned or failed part way. Draft rows stay linked and are not cover | Portal |
| Draft | Not used by the portal for revisions today | n/a |

**Required display behaviour:**
- Insurance detail adds a **Changes** group listing each revision with name, requested effective date, status badge, net premium delta, IPT, VAT and MTA fee where present, and a link to open the revision in CRM. Use explicit state mappings, a neutral fallback for unknown values, and never imply a revision is applied unless the status is Applied.
- **Under Review** revisions appear as an attention state in the Insurance list and in the Changes group, with the reasons from `Request_Details` shown in plain words.
- Draft `Insurance_Extension` and `Insured_People` rows with a Policy_Revision are labelled **Pending change, not current cover** and are kept out of the policy's current cover totals and counts. The same applies to Withdrawn revisions.
- A policy with a revision in Awaiting Payment, Approved or Scheduled shows a **Change in progress** badge (the portal blocks a second change while one is in flight).
- The Request_Details declarations and confirmations are shown as **customer-confirmed in the portal**, with the quote id and rules version, so staff can pick up a referral without asking again.
- Documents, emails and the bordereau for a change remain CRM and Creator processes. The widget does not generate or send them and does not present draft documents as evidence of cover (INS-G09).

**Guardrails:**
- Draft rows and revision records must not trigger policy activation or alter the existing active cover. Activation (`a2z_ins_policy_activation`) and the other INS workflows must be checked against draft rows on a live policy before the portal writes are switched on (a gate in `docs/delivery/mta-r3-plan.md`).
- Do not offer staff a Paid, Approved or Applied edit on a revision. Payment provenance is the verified Stripe webhook handled by Creator (INS-G07 applies to revisions too).
- Employers' Liability and monthly-payer changes are handled on the office route: staff action in native CRM, not in the widget.

## 6. Assisted creation (staff acting on behalf of a customer)

The primary UX has three **macro stages**:

1. **Customer**: search CRM Contacts first, identify potential duplicates and select the existing Contact. If none exists, create a **real CRM Contact immediately**, using the customer's verified identifying details including a valid email address for future Portal V2 access. An existing Contact does **not** need a current Membership Deal to start an application. Staff should not have to ask whether the customer already has a portal account or create a separate Catalyst account while they are completing the journey. Prefill from record context where available. Staff operate as themselves, never impersonate a customer's Catalyst session.
2. **Application**: Membership, Insurance or Accreditation-specific conditional fields. Reuse or map the current Portal V2 question definitions, visibility rules, eligibility, documents and guidance where proven compatible. Break this phase into compact internal sections when needed.
3. **Review**: full summary and errors, declaration/evidence status, save/resume as Draft, or use the existing Portal V2 quotation and payment-link generation where the application is payable. Staff can copy or share the Stripe link with the customer. Payment fulfilment remains with Creator and CRM.

### 6.1 Per-service coverage

**Membership:** joining/renewal/upgrade where supported, membership level, professional branches, add-ons, billing preference, optional insurance and applicant declarations. Preserve the distinction between the Member Profile and Membership transaction. Exact product/Books/Stripe pricing is authoritative on the backend.

**Insurance:** applicant details, working methods, specialist treatments, optional people/premises/property cover, conditional questions, underwriting disclosures, evidence and selected start date. Display separate member-eligibility, underwriting, sanctions and document gates, with the current CRM fields and the verified backend risk outcome. Support PASS/REFER/STOP outcomes from the validated backend and fail closed on screening errors. **Referred, declined, uncleared and incomplete applications must not become payable or be issued**. See the CRM snapshot review in section 5.5 for gaps in the current activation function.

**Accreditation:** applicant and correspondence, Account/Training Centre, main/additional venues, qualified tutors, GTi courses/offerings, qualification evidence, declaration confirmation and UK/international route from the centre's country. Preserve the multi-record CRM structure instead of writing only a simplified parent record.

**Combined journey:** where Membership and Insurance are selected together, maintain linked application records and consistent pricing/declarations; do not assume the staff widget may call the portal's customer-owned draft or checkout endpoints unchanged.

### 6.2 Draft semantics

- CRM is the **single shared draft store for staff and customer journeys**. Create/associate a CRM Contact before saving an application; do not silently persist real applications only in browser local storage or Catalyst DataStore.
- Save should create or update the correct CRM records according to the actual service-specific adapter, using stable identifiers and verified relationships.
- Do not create duplicate Contacts or active Membership/Policy records when staff click Save repeatedly.
- Support **Save and finish later at any stage**, including partially completed forms. The widget must allow staff to resume the same journey; after the customer registers or signs into Portal V2 they must be able to resume **that same CRM application at the saved step**, with answers restored. The reverse flow also applies. Use conflict/partial-failure handling, one shared journey identifier/record set and no cross-channel duplicate. Saving a Draft must not issue a policy, mark Paid, send an acceptance letter, or complete payment.
- Verify live CRM mandatory fields/layouts, triggers, server-side permissions and search-index lag before enabling writes.
- The Portal V2 CRM draft implementation is **not one generic schema across all services**: current Accreditation draft logic uses V1-style linked real records, while other draft services have additional Journey ID / note state design. Integration must respect their actual implementations.
- The earlier widget's three-step creation source is only a **draft starter**, not yet parity with Portal V2's full questionnaire or mappings.

### 6.3 Staff declarations

- The staff member may record verbal responses with a clear **staff-entered** marker, author, timestamp, question/declaration version and audit trail.
- Where a customer must personally confirm a declaration or consent, issue a secure customer confirmation step; do not auto-consent or claim staff-entered answers are customer confirmation.
- Block downstream payment/fulfilment where the required confirmation is missing.
- Sensitive screening details are restricted to authorised staff and must not be leaked into customer-facing summaries or generic error messages.

### 6.4 Seamless hand-off between CRM staff and the customer portal

**Confirmed functional requirement:** Staff and the customer share **one application**, not separate staff and portal drafts.

1. **Initial identity:** find existing `Contacts` record; if none, create one **before** the first draft save. An applicant may be a non-member; do not require an existing `Membership` profile or active `Deals` record simply to start. Capture and validate their email because Portal V2 currently maps a verified Catalyst email to exactly one CRM Contact.
2. **Staff starts:** use the same Portal V2 question set, conditional steps, field mapping and CRM parent/related-record persistence. Save the incomplete journey to the existing CRM draft architecture with the selected Contact as owner.
3. **Staff pauses:** keep the journey reference, last completed step, answers, linked child-record IDs and version/revision state. Display the unfinished application in the widget and in the Contact's application history.
4. **Customer takes over:** customer registers or signs into Portal V2 using their own account and verifies the same email. The portal's existing Contact resolution must match **exactly one** CRM Contact; it then lists/opens the same draft and resumes from the saved stage without replaying onboarding or losing answers. An email mismatch/duplicate Contact must be resolved before data is exposed, not bypassed.
5. **Either party may continue:** when a staff member returns to an application previously edited by the customer, the widget loads its latest CRM state. Respect revision/staleness checks; show a recoverable conflict rather than silently overwriting more recent answers.
6. **Complete and pay:** use the existing Portal V2 quote/eligibility logic and create or reuse one Stripe Checkout session linked to this application and the customer's Contact. Staff may copy/send the resulting payment link; the customer may also pay from Portal V2. Creator processes the payment event and updates CRM as normal.

**Implementation detail needing development, not a new business requirement:** Current portal endpoints resolve the signed-in customer's CRM Contact from their verified email and reject another Contact's records. The CRM widget will authenticate the staff member separately and resolve their **selected Contact** through an authorised staff adapter before using the same draft and checkout services. Reuse the actual `crmDrafts.js`, `accreditationDrafts.js`, `catalogue.js` and `checkout.js` logic rather than introducing a new form, draft schema, pricing service or competing payment process.

**Important implementation nuance:** The Portal V2 Accreditation draft currently persists its linked CRM record set, while Membership/Insurance drafts use the Journey ID plus CRM Note state. Both must round-trip through the **same existing service-specific representation** when the actor changes. Do not claim seamless cross-channel hand-off is already live until tested end-to-end.

## 7. Payments and post-payment processing (payment link integration)

**Confirmed requirement:** The Staff Workspace **generates a Stripe payment link**, using the exact quotation and checkout process already implemented for Portal V2. Staff can copy, share or open the link while assisting the customer on a call. **No separate MOTO product, new card-entry form, separate pricing engine or second payment workflow is requested.**

1. Staff completes or resumes the customer's **single CRM-backed application**. The server verifies the staff member may act for the selected Contact and checks the same eligibility/quote/declaration rules as Portal V2. Prices are never trusted from the widget.
2. Reuse the current Portal V2 server-side `catalogue.js`, `insurance.js`, `riskChecks.js` and `checkout.js` preparation, prices, Stripe metadata and Checkout session creation. Present the payable total and a **Generate payment link** action only when the quote is eligible.
3. Return and display the **Stripe Checkout URL** associated with the customer's application. Allow **Copy link**, optional approved customer email, and **Open link**; reuse an existing open session where appropriate and show expired/already-paid states. When staff use the link with a customer during a call, the card entry takes place on the existing Stripe payment screen, **not** in widget fields or CRM notes. Existing business card-handling policy still applies.
4. Ensure Stripe's `customer_email`, `client_reference_id` and Creator-facing metadata identify the **customer**, not the CRM staff member. Keep staff identity separately for audit. Do not impersonate the customer in Catalyst to bypass Contact ownership checks.
5. Once Stripe reports successful payment, **the existing Creator webhook and CRM automations** handle status updates, Membership/Accreditation/Insurance fulfilment and documentation according to the service's established flow. The widget refreshes and displays the resulting CRM state; it must not manually mark Paid or Active.
6. Verify the actual Creator webhook branches for Membership, Accreditation, standalone Insurance and combined Membership + Insurance, and validate Stripe session reuse/expiry and payment reconciliation before live payments.
7. Do not introduce a new payment mechanism as part of this widget. If current Stripe/Catalyst configuration has restrictions (such as test-only checkout), validate/configure the **existing** system rather than duplicating it.

**Architecture:** Staff-assisted and customer-self-service applications use **one set of Portal V2 journey rules, one CRM draft, one server-side quote, one Stripe Checkout session and the existing Creator-to-CRM post-payment process**. The only new surface is the Staff Workspace entry point and authorised staff/customer context hand-off.

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
- Staff-created or staff-edited insurance MTAs, applying a revision, ending cover rows, renewals and policy issuance beyond existing verified CRM processes. The widget only **shows** portal-originated revisions and deep-links to the native record (section 5.8); applying them belongs to the Creator payments app.
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
| A18 | Staff generates Stripe payment link | Existing Portal V2 quote and Checkout session reused; correct selected customer metadata, copy/open link, no new payment integration, Creator webhook updates CRM |
| A19 | Open Insurance record with new fields | Exact API mapping and display of Member Gate, Sanctions, Manual Review, Next Action and Document Status |
| A20 | Gate matrix across incomplete screening and underwriting | Missing/Not Checked/Review/Error/Stop/Not Assessed outcomes cannot silently activate or issue cover |
| A21 | Payment marked Paid without verified settlement | Does not imply authoritative payment or issue; fulfilment relies on verified backend outcome |
| A22 | Member Profile ban or issue changed | Associated open applications are re-evaluated per approved business rule; no stale Clear outcome |
| A23 | Sanctions screening chronology | Multiple screenings and cleared/confirmed investigations cannot be incorrectly overwritten by older outcomes |
| A24 | Manual review with endorsement | Quote version and Reprice Required are respected before payment/issue, with authorised reviewer audit |
| A25 | Policy activation and documents | Draft placeholder schedule and Statement of Fact do not appear as issued evidence of cover; regeneration/failure is visible |
| A26 | Incomplete quote follow-up | Configured schedule verified; bounded scanning, duplicates and missing activity timestamps handled safely |
| A27 | Create non-member Contact and begin application | CRM Contact created once before first draft; does not require active Membership or existing Catalyst account |
| A28 | Staff saves mid-way and customer registers | Portal V2 verified email resolves same CRM Contact and loads same application with saved answers and step |
| A29 | Customer starts then staff resumes | Staff widget opens existing draft and linked records; no duplicate parent or loss of progress |
| A30 | Alternate staff/customer edits | Latest saved answers and revision controls prevent silent overwrite and reconcile incomplete linked records |
| A31 | Staff generates/copies checkout URL | Contact-specific session and Creator metadata; correct amount, idempotent reuse and expired/already-paid handling |
| A32 | Open an Insurance policy with a Quoted revision | Changes group shows the revision with correct status, date and deltas; current cover totals exclude its draft rows |
| A33 | Open a policy with an Under Review (referred) revision | Attention state in list and detail, plain-language reasons, link to the native record; no write action in the widget |
| A34 | Policy with Awaiting Payment, Approved or Scheduled revision | Change in progress badge shown; nothing shown as applied until status is Applied |
| A35 | Withdrawn revision | Shown as withdrawn; its draft rows are not counted as cover |
| A36 | Basket of several dated revisions paid in one checkout | Each revision listed separately with the same session id; one MTA fee per effective date |
| A37 | Draft revision rows on a live policy | No activation, status change, document generation or email fires from the draft rows |
| A38 | Customer-confirmed declarations on a revision | Displayed as portal-confirmed with quote id and rules version; not editable in the widget |

For unsupported/unfinished features, UAT must record **not ready**, rather than treating a browser preview, mock SDK test or source-code presence as a pass.

## 12. Verification backlog and decisions to close

- Confirm whether the proposed **four-item navigation** supersedes the previous seven-item sidebar.
- Approve exact per-list page sizes, server-side paging/search contracts and page-state restoration behaviour.
- Confirm the final universal record header, field groupings, related-list priority and conditional columns by module.
- Validate every required CRM module, field API name, relationship, native button, role and layout in the Beauty Guild CRM organisation.
- Confirm whether staff can create Contacts/Accounts from the widget and which deduplication rules apply.
- Implement the **confirmed shared staff/customer application hand-off** using current Portal V2 draft adapters (Accreditation linked records versus Membership/Insurance Journey ID + Note state). Test staff-start/customer-resume and customer-start/staff-resume, new Contact registration, account email matching, revision conflicts and deduplication. These are integration tests, not new business-process design decisions.
- Agree the staff declaration attestation vs customer-confirmed evidence requirements with Guild/insurance stakeholders.
- Implement a narrowly authorised CRM staff context for the **same existing** Catalyst pricing/quote/Checkout code, resolving the staff-selected customer Contact and keeping customer identifiers in Stripe/Creator metadata. Confirm existing Creator webhook compatibility and the existing Stripe payment-link configuration; **no separate MOTO integration**.
- Confirm the Policy_Revisions fields the Changes group reads (Revision_Status, Requested_Effective_Date, Premium_Delta_Net, IPT_Delta, VAT_Delta, MTA_Fee, Request_Details, Stripe_Checkout_Session_ID) and the new Insured_People fields (Policy_Revision, Effective_From, Effective_To), including layout and role visibility.
- Agree with the Guild how Under Review revisions are queued, owned and closed in native CRM (an owner, a Next_Action and a task), since the portal only creates them.
- Confirm WorkDrive/CRM email/document access, record visibility and paging.
- Resolve **INS-G01–INS-G12** against the new Insurance Deluge functions: explicit underwriting/sanctions/member eligibility clearance, verified payment provenance, quote version/reprice gate, reliable screening precedence, reviewer audit, document approval, and incomplete-quote schedule.
- Agree whether a paid-but-not-activated policy may have a Payment_Status of Paid while blocked; show this as a processing exception without automatically reversing financial state.
- Validate WorkDrive document templates and issuance terminology; current generated schedule and Statement of Fact are draft placeholders despite an Active policy status.
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

**CRM metadata snapshot baseline:** Beauty Guild Cartographer export `snap-792ffa56-26dd-4d6d-95ec-6af3cc1114d0` (19 Oct 2026, 18:44), compared against `snap-b9df05b9-5f66-445a-8946-679062ebfa12` (19 Oct 2026, 14:59). It includes source for all 71 discovered functions, but field-detail/layout-detail REST endpoints and selected workflow action details reported OAuth scope restrictions; related-list detailed extraction is unavailable. Treat source-level concerns as **validation requirements**, not runtime proof. The snapshot file was supplied for review and is **not** committed to the repository or bundled into the CRM widget.

**Prior widget source:** separately supplied Staff Workspace candidate kit and the existing [widget README](README.md). The above links describe the source being used for UX and integration alignment. They do not prove the CRM widget is already built or deployed.

**Change control:** update this specification when any workflow, technical boundary, pagination rule, draft mapping or status vocabulary changes. Obtain approval before implementation of new privileged actions or integrations.
