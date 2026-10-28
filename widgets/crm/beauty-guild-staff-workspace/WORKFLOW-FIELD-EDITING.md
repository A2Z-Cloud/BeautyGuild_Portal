# Workflow-trigger fields in the widget: governance

**Status:** proposed rules for approval, written 27 October 2026. The editor itself is **built** (commit `cb46d9a`, 27 October 2026, on this branch). The rules below are not yet approved or implemented. Until they are, treat the editor as **Development only**.
**Related:** [SPECIFICATION.md](SPECIFICATION.md) sections 5.4, 5.9 and 7, [STAFF-API-AND-IDENTITY.md](STAFF-API-AND-IDENTITY.md).

## 1. Why this needs rules

The Staff Workspace spec says native CRM keeps the business-process actions, and that any in-widget action must have its API contract, side effects, permission and idempotency verified first (section 5.4). The editor was built without that step. It lets staff change fields whose change **fires a CRM workflow**: for example, setting a payment status to Paid activates a membership or policy and sends the customer a letter.

Two things make this worth settling now:

1. **Creator V2 is about to own payment.** Once Creator sets payment statuses from verified Stripe events, a staff member setting "Paid" in the widget would activate cover that nobody paid for.
2. **The widget cannot enforce who may do what.** It runs in a browser. The only real control is the CRM's own field permissions for the staff member's profile.

## 2. What the editor does today

From `app/widget.js` (`WF_FIELDS`, `askWorkflowEdit`, `saveWorkflowEdit`):

- Wherever a listed field is shown in a record view, it appears as a dropdown whose options mirror the CRM picklist.
- Choosing a different value shows a **confirmation bar**: "Change X from A to B? This runs the CRM workflow", followed by a sentence describing the workflow. The sentence is typed into the widget.
- On confirm it calls `updateRecord` for that one field with `Trigger: ['workflow']`, then adds a CRM note ("X changed to B", who changed it, from what, and when).
- The note is **best effort**. The code comments it as such: if writing the note fails, the error is swallowed, the change stays saved, and the user is told the update succeeded with no sign that the audit note is missing. The note has no reason, and it is an ordinary CRM note that staff can edit or delete.
- It checks only that the record id looks valid and the value is in the option list. It does not re-read the record before saving, and it does not check the user's role.

## 3. The fields, and a proposed owner for each

"Staff decision" means the Guild's people own the outcome and the editor is appropriate. "Creator-owned" means Creator V2 sets it from verified payment, and the widget must not. "Decide" needs a Guild answer.

| Module | Field | What the CRM workflow does (as the widget describes it) | Proposed owner |
| --- | --- | --- | --- |
| Deals | Payment_Status | Paid: activates the membership, marks linked membership extensions paid, emails the acceptance letter (New) or renewal receipt (Renewal) | **Creator-owned** for Paid, Failed, Part Refunded, Refunded. Decide for Pending and Not Paid |
| Deals | Purchase_Type | Renewal: copies the previous membership details onto this transaction when none is linked | Staff decision, with a reason (a data correction) |
| Insurance_Policy | Application_Status | Re-runs the insurance member gate while the application is open | **Decide.** Some values are set by the portal or Creator (Awaiting Payment, Completed); Referred and Withdrawn are staff decisions |
| Insurance_Policy | Payment_Status | Paid: runs policy activation (checks the gates, sets the policy Active, activates the covers) | **Creator-owned** for Paid, Failed. Decide for Not Paid, Pending, Expired |
| Insurance_Policy | Policy_Status | Active: generates the policy documents in WorkDrive | **Decide.** Active should follow verified payment and the gates, so is not a free staff choice. Cancelled and Expired are staff decisions (cancellations workstream) |
| Insurance_Policy | Manual_Review_Outcome | Completes the manual review: Approved releases the referral, Declined stops and withdraws the application | Staff decision, underwriting role only |
| Insurance_Policy | Document_Status | Regenerate: rebuilds the policy documents in WorkDrive | Staff decision |
| Risk_Screenings | Result | Rolls the result up to the policy sanctions status and creates a staff task if review is needed | Staff decision, restricted role, reason always required |
| Risk_Screenings | Investigation_Status | Same roll-up | Staff decision, restricted role, reason always required |
| Training_Centre_Accred | Application_Stage | Approved: emails the approval and acceptance letter. Paid and Payment Failed: emails payment notices. Payment Processing: updates the Stripe payment log | Staff decision for Approved, Rejected, Needs Information, Under Review and similar. **Creator-owned** for Paid, Payment Failed, Payment Processing |
| Training_Centre_Accred | Accreditation_Status | Verified: publishes the accreditation to the website | Staff decision, senior role (it publishes to the public website) |
| TC_Course_Offering | Offering_Status | Approved: creates the course as a product | Staff decision |
| Tutor_Relationships | Membership_Exists | Emails the tutor (with or without membership version) | **Decide.** This looks like a fact that should be computed from membership data, not typed |

## 4. Proposed rules

1. **Creator-owned fields are read only in the widget.** From the day Creator V2 is live, the editor offers no value that sets a payment outcome. Until then it stays Development only. A manual override of a payment status is a separate, approved, reasoned process (open decision 1).
2. **Allow-list by field and by role.** The widget shows an editor only for a field the staff member's CRM profile may edit. CRM field-level permissions are the real control; the widget must not offer more than they allow, and must handle a refusal clearly.
3. **A reason is required** for every change, chosen from a short list with a free-text note for Other, and stored with the change.
4. **The audit record is part of the change, not best effort.** Who, when, old value, new value and reason, in a record staff cannot edit or delete (not an ordinary note). Write the audit first, and refuse the change if the audit cannot be recorded. At the very least tell the user when the audit is missing and raise a task.
5. **Check before saving.** Re-read the record and refuse if the field has changed since the user loaded it, so a stale screen cannot overwrite a newer decision (for example one made by Creator).
6. **The confirmation text must be true.** The workflow sentences are typed by hand. Check each against the CRM workflow source, record the workflow name beside it, and re-check when a workflow changes. A wrong sentence is worse than none.
7. **One field at a time.** No bulk edits, and no editing from list views.
8. **A switch.** A configuration flag turns the editor off for everyone without a release. Default off in Production until approved.
9. **Show history.** On a record, show who last changed each of these fields, from the audit notes.
10. **Creator treats a manual change as an exception.** If Creator finds a payment status changed by a person, it records the difference and flags it for review. It does not silently overwrite or silently accept it.

## 5. Acceptance tests (to add when built)

| ID | Scenario | Expected |
| --- | --- | --- |
| WF-01 | Staff open a Creator-owned value (for example policy Payment_Status Paid) | Not offered, or refused with an explanation |
| WF-02 | Staff change Manual_Review_Outcome with a reason | Saved with the workflow triggered, audit note includes the reason |
| WF-03 | A staff profile without edit permission on the field | No editor, or a clear refusal |
| WF-04 | Another user or Creator changes the field while the screen is open | The save is refused and the new value shown |
| WF-05 | The audit write fails | The change is refused, or the user is told clearly and a task is raised, as rule 4 says. It is never silent |
| WF-06 | The kill switch is off | No editors anywhere |
| WF-07 | A confirmation sentence differs from the CRM workflow | Caught by the re-check in rule 6 |
| WF-08 | A manual Paid reaches Creator | Creator flags the exception |

## 6. Open decisions

1. Is a manual override of a payment status ever allowed, who may do it, and what record does it leave? (Finance and the Guild.)
2. The values marked Decide in section 3.
3. The approved roles for each field, in particular who may set Accreditation_Status to Verified and who may change screening results.
4. The reason list.
5. Whether `Membership_Exists` should be computed, not edited.
