# UAT tracker: open items between rounds

The one place to see what is still open from the Guild's UAT feedback, so nothing is lost between rounds. Update it in the same pull request as any change that closes, moves or adds an item.

**How to read it**
- **Under QA:** built or agreed on our side, but it needs the payments automation (Creator) or a real test before we can close it.
- **Under review:** we have not committed to it yet. It is being looked at, and may become a build, a decision or a "not planned".
- **Waiting on the Guild:** we need something from them.
- **Closed:** done and retested by the Guild. Move closed rows to the bottom with the date.

Sources: UAT workbook `Beauty-Guild Portal UAT v1.1 - Guild Comments.xlsx` (round 1, tabs S01, S02, S10, S12, S17). Specs: [uat-round1-fixes-spec.md](uat-round1-fixes-spec.md), [associate-journey-changes-spec.md](associate-journey-changes-spec.md). Creator detail: [creator-payments-app.md](creator-payments-app.md), section 7.

## Round 1: updated 4 November 2026

### Under QA (needs Creator, or a real test)

| ID | Item | Where it came from | What has to happen | Notes |
|---|---|---|---|---|
| QA-1 | Accreditation shows Verified straight after payment, should be Pending verification | S10 step 6 | Creator must not set `Accreditation_Status` to Verified on payment. The portal only reads it. | Creator 7.1 |
| QA-2 | International school payment sticks on "Opening payment securely" | S10 step 4 | Reproduce first time with and without International membership. | Creator 7.3 |
| QA-3 | Additional venue payment | S12 | Creator sets the venue's `Centre_Status` from Draft to Paid on `checkout.session.completed` (`type=additional_venue`), records the invoice, pushes to Books. | Creator 7.4. Portal side live (PR 139). Testers must not pay twice: until Paid, the tab says "confirming" for an hour. |
| QA-4 | Add a venue needs Draft and Paid on the Centre Status picklist | S12 | Check both options exist on the Training Centre Centre Status field. | A missing option makes Save venue fail. |
| QA-5 | Monthly Associate Stripe page shows £4.59 and a £1.50 admin line, the Guild wants one £6.09 line | S02 steps 2 to 4 | Agree with Creator that the admin fee can ride in the monthly plan details so the `MEM-ADMIN` Books item is still posted, then change the lines. | Creator 7.6. Not changed until agreed. |
| QA-6 | Yearly accreditation page shows "£29.50/month billed annually" | S17 step 4 | Check whether Stripe adds this itself for a yearly subscription. If so, choose between leaving it and taking accreditation as a one-off payment. | Creator 7.7 |
| QA-7 | Accreditation dates: start when the Guild verifies, not on application | S10 | Decide who sets the real valid-from and valid-to, and when. The portal sends today as a provisional date. | Creator 7.2 |
| QA-8 | One-off purchase types not yet verified with a real payment | Creator notes | Monthly accreditation and the one-off venue. | Creator 7.5 |
| QA-9 | Interests written back to the Contact | S01 | After a real test payment, check the Contact's Interests picklist updated. `Training` must be an option on the Contact `Interests` field. | PR 137. Best effort: a refused value never blocks payment. |
| QA-10 | Other course text saved | S10 step 15 | Type a course, save, reload: it should come back from the `Other_Course` field on the accreditation record. | PR 141. Switch on in Development. |
| QA-11 | Stripe test subscriptions auto-cancel after 90 days | S02 | Nothing to fix. Creator must not treat Stripe's test clean-up as a live cancellation. | Creator 7.8 |

### Under review (not committed)

| ID | Item | Where it came from | Current thinking |
|---|---|---|---|
| REV-1 | GDPR preferences page | S01 step 13 (screenshot 2) | Need the Guild's current journey wording and the CRM fields that hold the answers. |
| REV-2 | Create the account with a password on page one | S01 step 10 | The sign-up system probably emails a link to choose a password, so it may not accept one from our form. Needs checking. A close alternative: name, email and phone, then a setup link, and carry on. |
| REV-3 | Edit an application after "Continue to payment" | S10 step 3 | The server only lets a Draft be edited. Choose between sending it back to Draft or editing in place. |
| REV-4 | Saved applications slow to appear | S10 step 12 | CRM search lags real writes by up to about 30 seconds. Idea: show the application just saved from this browser until the search catches up. |
| REV-5 | Previous card layout for the course list | S10 step 15 | Not planned yet. |
| REV-6 | Return to the application after creating an account | S01 step 5 | Needs a real sign-up email to reproduce. Likely the setup link losing the place. |
| REV-7 | Course details (practical hours, prerequisites, Korean Eyelash Extensions) | S10 step 15 | The data comes from the CRM Courses records. We review it and update it in the CRM; the portal then shows it. |
| REV-8 | Pay choice on the Full membership details step | S01 step 11 | Held until the Guild has tested mobile view. |

### Waiting on the Guild

| ID | Item | Notes |
|---|---|---|
| G-1 | Teaching Certificate page link | A "No" on the second declaration links to the GTi courses page for now. |
| G-2 | Mobile view testing | Then revisit REV-8. |
| G-3 | Insurance tabs (S03 to S09 as tested) and accreditation monthly (S11) comments | Promised for the day after the first round. |

### Done in round 1 (live on Development)
Wording, layout, review Edit buttons, straight to payment, address picker, start date removed, United Kingdom listed once, declaration messages, dashboard loading state, Associate journey changes (interests, branch default with Training pointing to Beauty, no Membership details step for Associate, review summary with Edit and Remove, code heading, capital letters and dark pink), Add a venue form (saved as a draft, pay later), Other course box, and start dates only with insurance. See the PRs: 133, 134, 135, 136, 137, 138, 139, 140 and 141.

## Round 2

Not yet received. Add the new tabs and items here when the Guild sends them: copy the layout above, and give new items the next ID in each table.

## Switches that are on in Development

| Switch | Where | State |
|---|---|---|
| Combined Membership and Insurance journey, Associate upgrade | client build and function | On |
| Add a venue (`VITE_PORTAL_ADD_VENUE`) | client build, plus the school writes switch in the function | On |
| Other course (`VITE_PORTAL_OTHER_COURSE`, `ACC_OTHER_COURSE_FIELD=Other_Course`) | client build and function | On |
| Membership changes | client build and function | Off: Creator cannot process that payment type yet |
