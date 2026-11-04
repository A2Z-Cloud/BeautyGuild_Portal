# Staff Workspace: Operational UAT smoke test record

Date: 4 November 2026
Build tested: Slate branch `feature/beauty-guild-staff-workspace-slate`, assets `uatfix2` (commit `2ca0ddd`), in the A2Z Cloud CRM org `20117174932`, signed in as "A2Z Cloud Admin"
Method: read-only clicking through the live widget in a browser. Nothing was saved to CRM. The scenarios that write (O-11, O-12, O-14) were not run yet.
Scenarios are from `OPERATIONAL-UAT-QA-HANDOVER-2026-11-03.md`.

## Result summary

| Result | Count | Scenarios |
| --- | ---: | --- |
| Pass | 8 | O-01, O-02, O-04, O-08, O-10, O-13, O-15, O-16 |
| Pass, with a finding | 3 | O-03, O-09, O-14 |
| Partial | 1 | O-19 |
| Not completed (needs a person) | 2 | O-11, O-12 |
| Not run | 6 | O-05, O-06, O-07, O-17, O-18, O-20 |

Fixes pushed after this run (assets `uatfix4`): F1 (the out-of-scope wording and sidebar lists) and F6 (note and task columns). Recheck O-03 and O-14 once deployed and the widget URL `v=` value is bumped.

Update, later on 4 November: O-14 was run on the disposable draft policy BG000100 with the owner's approval. One Note ("UAT smoke test note O-14") and one Task ("UAT smoke test task O-14", due 5 Nov 2026) now exist on that record and can be deleted in CRM.

## Scenario log

| ID | Result | What was seen |
| --- | --- | --- |
| O-01 | Pass | Widget loads in the CRM web tab. Sidebar shows "Connected" and the signed-in user "A2Z Cloud Admin". No errors. |
| O-02 | Pass | "New application" is not in the navigation. There is no "Test Staff API" button in the top bar. The Overview says new applications are not available. Checked visually only. |
| O-03 | Pass, with finding | Policy and membership records have no MTA, cancellation, voucher, renewal or upgrade buttons. But out-of-scope wording remains (see Findings F1). |
| O-04 | Pass | Customers, Membership, Insurance and Accreditation lists all load real UAT records with the right columns and statuses. Page size 15. |
| O-05 | Not run | The CRM view selector lists only "All accessible records", so no custom view could be chosen. Unknown whether the account has no custom views or the view list failed to load (Finding F4). |
| O-06 | Not run | Needs an unsupported or inaccessible custom view. None available. |
| O-07 | Not run | Needs a second custom view to switch to. |
| O-08 | Pass | Insurance showed "16 to 30 of 100 loaded", then "Load next CRM records" gave 118 loaded across 8 pages. Counts matched. |
| O-09 | Pass, with finding | "Search all CRM" for BG000093 returned "1 CRM search matches for BG000093" with a "Clear CRM search" button. Not tested with a custom view selected, because none could be selected. |
| O-10 | Pass | Opened BG000135, followed its Membership Profile link (MP-0102), then "Previous record or list" returned to BG000135. Whether the list page and filter are kept after "All insurance records" was not checked. |
| O-11 | Not completed | Attempted on BG000100 (Draft). The Application Status dropdown is present, but the browser tool cannot operate a native dropdown (arrow keys, Enter and typing changed nothing), so no confirmation prompt appeared and nothing was saved. The record's Modified Time was unchanged. A person needs to do this by hand: choose In Progress, check the confirmation text, save, check the workflow and the audit note, then set it back to Draft. |
| O-12 | Not completed | Same limitation. Needs an accreditation in an early stage and a person to operate the dropdown. |
| O-13 | Pass | Payment Status, Policy Status, Manual Review Outcome and Document Status are plain text. Application Status is plain text when the policy is Awaiting Payment or Completed, and a dropdown only when Draft. Unit tests cover the allowed values. Choosing a disallowed value was not tried in the browser. |
| O-14 | Pass, with a finding | On BG000100: "Add note" showed "Note saved." and "Create task" showed "Task created.". The Notes related list then showed 1 record (owner A2Z Cloud Admin, modified 04 Nov 2026) and Open Activities showed 1 record (status Not Started). Both are on the intended record. The note dialog has no Due date and names the record. Finding F6: those lists do not show the note title or the task subject. Also, the note text I typed was duplicated because the browser tool queued the typing, which is a tool effect, not a widget fault. |
| O-15 | Pass | "Edit in CRM" opened the native edit form for the right policy (BG000093). Cancel returned to the widget without saving. The widget came back at the Overview, so list context was lost. |
| O-16 | Pass | All CRM fields, Activity timeline and the related lists (Notes, Attachments and others) open with no errors. The timeline says it is not the full native audit history. |
| O-17 | Not run | Signed in as an administrator. Needs a limited-permission staff profile. |
| O-18 | Not run | An API timeout or permission error could not be caused from the browser. |
| O-19 | Partial | At 640 px wide the CRM frame itself did not reflow (the page was cut off at the right even with the CRM menu collapsed), so the widget's narrow layout could not be judged. With the keyboard, focus moved between buttons and showed a visible pink focus ring. A full keyboard run was not done. |
| O-20 | Not run | Needs checks on the Catalyst routes and CRM functions from the server side. |

## Findings

| ID | Severity | Finding |
| --- | --- | --- |
| F1 | Medium | Out-of-scope wording is still visible on membership and policy records: a "View policy / MTA" button, "Open a policy to review current cover, request an MTA, quote and save the revision", "Renewals and upgrades follow the existing application and checkout logic", an empty "Membership services" heading, and a "Cancellations" related list in the sidebar. The buttons are blocked, but the wording tells testers about features they cannot use. |
| F2 | Low | In the Insurance table at this width the "UNDERWRITING STATUS" column heading is cut off. |
| F3 | Low | After "Edit in CRM" and Cancel, the widget returns to the Overview rather than the record or list the user was on. |
| F4 | Medium | The CRM view selector shows only "All accessible records". Check whether the CRM account has custom views for these modules, and whether view metadata is loading. If not, O-05 to O-07 and O-09 with a view cannot be tested. |
| F5 | Low | The Accreditation list shows "80 loaded" with no "more may exist" note. Confirm 80 is the full count. |
| F6 | Medium | The Notes and Open Activities related lists show only Owner, Modified Time (and Status for activities). They do not show the note title or content, or the task subject and due date. Staff cannot tell what a note or task says without leaving the widget. |

## Still needed before customers use it

1. A person completes O-11 and O-12 by hand on disposable records (BG000100 for O-11, and an early-stage accreditation for O-12).
2. Run O-17 with a limited-permission staff profile, and O-20 on the Catalyst routes and CRM functions.
3. Find out why no custom views appear (F4), then run O-05 to O-07.
4. Fix F1, then rerun O-03.
5. Sign-off by the QA owner, as the handover's release gate requires.
