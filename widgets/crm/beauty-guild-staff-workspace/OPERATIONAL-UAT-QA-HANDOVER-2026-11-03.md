# Staff Workspace: Operational UAT QA handover

Date: 3 November 2026
Branch: `feature/beauty-guild-staff-workspace-slate`
Status: implementation pass completed on the feature branch; **NOT approved for customer UAT**.
No merge or Slate deployment was performed as part of this change.

## Purpose and scope

Operational review and updating of EXISTING CRM records: Contacts, Membership profiles and transactions, Insurance policies, Accreditation applications, and their related records.

**Outside this UAT:** new applications, policy MTAs/adjustments, cancellations and downgrades, vouchers/waivers, member renewals/upgrades/checkout, payment execution and Staff API diagnostics. The source implementation of these journeys is retained for subsequent release.

**Important:** Current isolation is a widget-facing UI and delegated-action guard, not a security boundary on Catalyst routes or CRM APIs. Internal QA must verify access controls and deployment switches for any independently accessible backend endpoints. Do not give UAT users broader permissions solely to exercise the widget.

## Changes in this development pass

1. Operational UAT mode (`OPERATIONAL_UAT`) hides excluded navigation and transaction controls, removes the MTA/voucher record action area, and blocks excluded widget click actions. The development Staff API launcher is hidden.
2. CRM custom views: `ZOHO.CRM.META.getCustomViews` loads authorised view metadata. View lists are retrieved using `ZOHO.CRM.API.coql` with an explicit `Module#CVID` filter. If metadata or COQL is unavailable, the widget shows an error and **never silently falls back to an unfiltered list as that view**.
3. CRM view columns are provided to the existing metadata-aware table renderer. The displayed columns may be limited if CRM metadata denies a field or COQL does not support its type.
4. Paginated view records use 100-row server batches and an explicit 2,000-record COQL paging cap. The existing All accessible records browsing and word search remain available separately.
5. The global record listings now preserve module-specific local search on navigation, with an explicit previous-record/list action.
6. The generic CRM record renderer now exposes the EXISTING workflow-based inline field editor without replacing its confirmation, workflow trigger and audit-note logic.
7. During operational UAT, available inline edits are limited to a subset of Insurance Application Status and Accreditation Application Stage values. Financial, policy issue, public publishing, underwriting and other side-effecting workflow field changes remain available in authorised native CRM rather than the UAT widget.
8. Added an Edit in CRM action through the native CRM SDK for full edit forms, while retaining existing Notes, Tasks, record navigation and related lists.
9. Cleaned the operation-specific asset references and added compact styling for view selectors and field editors.

## Internal QA scenarios (mandatory before customer UAT)

| ID | Scenario | Expected result |
| --- | --- | --- |
| O-01 | Load CRM widget in staff profile | Connection, identity and current module load without errors |
| O-02 | Try New Application and Staff API launcher | Not visible or usable through operational UAT widget |
| O-03 | Open existing policy and membership records | MTA, cancellation, voucher, renewal and upgrade actions absent |
| O-04 | Browse Customers, Membership, Insurance and Accreditation | Correct module records with paging and normal permissions |
| O-05 | Select a CRM custom view | List contains **only** records in the selected native view; verify against CRM |
| O-06 | Select an inaccessible/unsupported custom view | Explicit error; never show unfiltered records under that view |
| O-07 | Change view while page request is loading | New selection loads after the old request; no stale results presented |
| O-08 | Browse 100+ records | Load-more and local page navigation show accurate loaded counts |
| O-09 | Search all CRM | Does not silently combine an unfiltered word search with a selected custom view |
| O-10 | Open a record from a filtered list, go to related record and return | Original record and selected list context remain available |
| O-11 | Insurance Application Status safe edit | Appropriate options shown; confirmation required, CRM update and workflow response checked |
| O-12 | Accreditation Application Stage safe edit | Appropriate options shown; confirmation required; check CRM and any triggered automations |
| O-13 | Try disallowed workflow field change | Payment, policy issuance, publication and similar values not editable through operational UAT controls |
| O-14 | Create Note and Task | Saved against the intended CRM record, with correct permissions |
| O-15 | Open Edit in CRM | CRM opens native record edit using current module and record ID |
| O-16 | Open record Details, Related Lists and Activity Timeline | Original features continue working, with no regression |
| O-17 | Restricted staff user | No access to prohibited data, fields or writes; permission failures explained |
| O-18 | CRM API timeout or permission error | Error and retry support; no false “no records” conclusion |
| O-19 | Browser at narrow CRM widget width / keyboard navigation | View selector, editor and action controls are usable |
| O-20 | Verify all excluded Catalyst APIs and CRM functions | Appropriate independent server-side access restrictions apply |

## Known limitations and checks

- GitHub source syntax checks are not an end-to-end CRM test. The new view metadata and COQL query shapes must be validated in Beauty Guild Development against real custom view types and permissions.
- Some CRM view filters are not supported through COQL (Zoho documents exceptions for certain shared/co-owned view categories). The widget will display an error for these; native CRM is the fallback.
- COQL has field-type and pagination restrictions. The operational view uses up to 2,000 rows via the simple offset path. Large views need a separately designed cursor/pagination strategy.
- The widget's local "Requires attention" filter evaluates loaded records only; it must not be presented as an exhaustive operational queue.
- The Activity Timeline is assembled from CRM-related activities and timestamps; it is **not** the full native CRM field-change timeline.
- Existing field-editing options are hardcoded in the original widget. QA must compare permitted values against live CRM picklists, layout rules, validation and workflows.
- The display of native CRM edits does not imply a successful update; refresh the record after returning.
- Feature isolation is not equivalent to disabling backend transactions. Validate CRM profile permissions, Catalyst deployment switches and separate endpoints before inviting customers.
- The Slate deployment pipeline had previously failed; no successful deployment was established in this implementation pass.

## Release gate

Do not distribute a customer UAT URL until:
1. Development deployment and smoke test succeed.
2. Internal QA scenarios O-01 to O-20 are recorded and blocking defects resolved.
3. Excluded business journeys and backend routes are independently verified as inaccessible or explicitly outside the released environment.
4. The responsible QA owner signs off the build, known limitations and UAT test guide.

Recommended customer-facing release label: **Beauty Guild Staff Workspace, Operational UAT Phase 1**.
