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
| REV-1 | GDPR preferences page | S01 step 13 (screenshot 2) | Built on the Account page (5 November): E-Mail, SMS, By Post, Guild Gazette, News and Special Offers, saved to the Contact with the date. Training Course Alerts is left out. Still to do: ask the same questions on Join, and load the V1 preferences into the new Contact fields before go-live so nobody looks opted out. Needs a real test with a linked Contact. |
| REV-2 | Create the account with a password on page one | S01 step 10 | The sign-up system probably emails a link to choose a password, so it may not accept one from our form. Needs checking. A close alternative: name, email and phone, then a setup link, and carry on. |
| REV-3 | Edit an application after "Continue to payment" | S10 step 3 | The server only lets a Draft be edited. Choose between sending it back to Draft or editing in place. |
| REV-4 | Saved applications slow to appear | S10 step 12 | CRM search lags real writes by up to about 30 seconds. Idea: show the application just saved from this browser until the search catches up. |
| REV-5 | Previous card layout for the course list | S10 step 15 | Not planned yet. |
| REV-6 | Return to the application after creating an account | S01 step 5 | Needs a real sign-up email to reproduce. Likely the setup link losing the place. |
| REV-7 | Course details (practical hours, prerequisites, Korean Eyelash Extensions) | S10 step 15 | The data comes from the CRM Courses records. We review it and update it in the CRM; the portal then shows it. |
| REV-8 | Pay choice on the Full membership details step | S01 step 11 | Closed by R2-14: the step is gone and the choice is on the price panel. |

### Waiting on the Guild

| ID | Item | Notes |
|---|---|---|
| G-1 | Teaching Certificate page link | A "No" on the second declaration links to the GTi courses page for now. |
| G-2 | Mobile view testing | Now only a check that the new price panel pay switch works on a phone. |
| G-3 | Insurance tabs (S03 to S09 as tested) and accreditation monthly (S11) comments | Promised for the day after the first round. |

### Done in round 1 (live on Development)
Wording, layout, review Edit buttons, straight to payment, address picker, start date removed, United Kingdom listed once, declaration messages, dashboard loading state, Associate journey changes (interests, branch default with Training pointing to Beauty, no Membership details step for Associate, review summary with Edit and Remove, code heading, capital letters and dark pink), Add a venue form (saved as a draft, pay later), Other course box, and start dates only with insurance. See the PRs: 133, 134, 135, 136, 137, 138, 139, 140 and 141.

## Round 2: workbook v2 received, updated 4 November 2026

Source: `Beauty-Guild Portal UAT v1.1 - Guild Comments v2 041126.xlsx` and Helen's email. S05, S06, S11 and S16 (orange tabs) are still with the Guild. S08 is not needed (no standalone insurance). The Guild tested earlier builds, so S10, S12 and S17 still carry round 1 comments that are already fixed.

### Built in the round 2 pull request (retest on the next build)

| ID | Item | Where it came from | What changed |
|---|---|---|---|
| R2-1 | Example numbers in the phone boxes | S10, S13 | Removed (the mobile one was a dummy, the telephone one was the Guild's number). |
| R2-2 | Choose the phone country code before typing, keep it after an error, no "UK" in the message | S10 | The chosen code is kept, and the message reads "Enter a valid number with at least 9 digits after the country code." |
| R2-3 | Address finder shows the full list straight away | S04 | The "x addresses" group opens by itself. |
| R2-4 | Beauty ticked by default, missing interest highlighted | S14, S01 | Beauty is ticked on a new journey. |
| R2-5 | Duplicate "How you work" heading | S03 | One heading. |
| R2-6 | How you work as a multiple choice | S03 | Any mix is non-salon unless "I own/operate a salon" is ticked. Server and client agree (tested). Reverses spec 2.3. |
| R2-7 | Salon wage roll question: No on the left, Yes on the right | S07 | Done. |
| R2-8 | Terms box highlighted when not ticked | S03 | The Pay button now explains and highlights the box. |
| R2-9 | Price panel order | S03 | Renewing lines (/yr, /mo) first, one-off payments last. |
| R2-10 | Branches in four boxes across the full width | S03 | Done (check on a phone). |
| R2-11 | Policy link text "Click here to view the policy wording" | S03, S04 | Done. The links stay empty until the Guild's documents arrive (see G-4). |
| R2-12 | Treatment declarations always asked, above additional treatments | S07 | Qualified and patch test are asked of every application. The server now requires them too. |
| R2-13 | Declaration tick boxes look like the Yes/No boxes | S03 | Done. |
| R2-14 | No Membership details step for Full | S03 | Removed. Start date sits under "Do you require insurance" (insurance only). Annual or monthly is on the price panel. Closes REV-8. |
| R2-15 | Saved applications: "In progress" status and a holding message | S13 | Done. The slow list itself is still REV-4. |
| R2-16 | School verification page not found | S15 | The page is at `/#/verify`. A "Check a Guild accredited school" link is now on the sign-in page. Tell the Guild the address in the next email. |
| R2-17 | Paying twice from two tabs (S14, failed) | S14 | Starting a payment now expires the same person's other open payment for that service, so only one can be paid. Tested. |

### Checked, no change needed

| ID | Item | Finding |
|---|---|---|
| C-1 | Named employee should not pay the joining fee (S07) | The code charges the named employee the membership fee only. The joining fee is one line for the member. Ask Helen which line she saw. |
| C-2 | Correspondence country list has only a few countries (S10) | The full list (200 countries) went live on 3 November (PR 135), after the Guild tested. Retest. |

### Fix our own workbook (expected values)

| ID | Item |
|---|---|
| W-1 | S02: C8 to C10 should be £6.09 a month and £16.09 first payment. |
| W-2 | S03: totals in steps 4, 5 and 6 include the £32.50 premium and £3.90 IPT (£120.40, £128.40). Monthly steps 9 and 10: £24.37 first, £10.37 after. |
| W-3 | S04: steps 1 and 3 (£168 includes the £75 premium and £9 IPT). |
| W-4 | S09 step 3 still says "[TO CONFIRM: which declaration]". |
| W-5 | S15: add the verify page address. |

### New under QA or under review

| ID | Item | Where it came from | Current thinking |
|---|---|---|---|
| QA-12 | Proper VAT invoice with a breakdown (accreditation, membership, VAT), downloadable | S12 or S13 step 4 | Creator and Books. Add to Creator 7. |
| REV-9 | What "My documents" should show (it says "Open folder", then "no documents found") | S13 | Need the Guild's list of documents. |
| REV-10 | Edit account details (phone and others) | S13 | Built on the Account page (5 November): mobile, phone and postal address. Name and email stay with the Guild (email is the sign-in), as in V1. Needs a real test with a linked Contact. |
| REV-11 | Standalone insurance code | S08 | Not needed. Remove the standalone insurance code after UAT. The `/insurance` redirects are already in place. |
| REV-12 | Caption changes, price panel and Review and pay page changes, accreditation monthly pricing, phone view | Orange tabs | The Guild is sending separate documents. |
| REV-13 | Clean test accounts | Helen's email | New sign-ups with new email addresses work (aliases like name+uat1 are fine). Accounts that already have a Contact need the Contact created. Test data needs clearing afterwards. |

### Waiting on the Guild

| ID | Item | Notes |
|---|---|---|
| G-4 | Policy wording documents (links) | Needed from the Guild (Tega is providing): 1 Medmal policy wording (also linked from "insurance policy" under Treatments we cover); 2 Non-salon contents cover wording; 3 Non-salon EL cover wording; 4 Non-salon property definitions; 5 General terms and conditions; 6 Salon Employers Liability policy summary and wording; 7 Salon contents; 8 Salon money; 9 Salon buildings; 10 Salon business interruption; 11 Salon property away; 12 Salon property definitions. Links go in `POLICY_WORDING` in `apps/portal/src/insuranceInputs.js` (items 1 to 3 and 6 to 11); items 4, 5 and 12 are named in `apps/portal/src/legal.js` and are not linked yet. |

## Round 3: Helen's journey comments and the Dashboard comments, 5 November 2026

Source: `Beauty-Guild Portal UAT v1.1  - Membership journey and Dashboard Comments.xlsx` (General feedback rows 5 to 26). Helen's comments cover the Associate and Full journeys; PA, NS and QT sent the Dashboard comments.

### Built (retest on the next build)

| ID | Item | What changed |
|---|---|---|
| R3-1 | Pink links, bold red errors, no asterisks | Every link in the Join journey is pink. Errors are bold red. The asterisks are gone from the insurance questions. |
| R3-2 | Missing answers on About you | The missing country, insurance and interest answers are also listed at the bottom, beside the missing details. |
| R3-3 | Branches, bundle line, price panel | Branches sit two over two. The bundle line sits under its text. The price panel keeps its space while it updates, so it no longer jumps. |
| R3-4 | "Too many requests" when adding extras | Pricing allows 90 requests a minute, not 20 or 30. |
| R3-5 | Insurance caption | "You will be covered for up to £3 million for any one claim and £6 million in the aggregate." |
| R3-6 | Business information | The max-5 note shows only at four people. The subcontractor note shows only on Yes, with the Employees and Subcontractors wording. The Treatments we cover text is the new wording with pink links. The qualification and patch test questions sit under it and must be Yes. Advanced Treatments (renamed) each have an "i" with the Guild's wording, which also opens when ticked. Teaching and Student Cover has the new question and options. |
| R3-7 | Cover options, non-salon | Business Equipment is a list of levels with Not required last, with the description between the question and the levels. The construction questions and the Employers Liability wording are updated. |
| R3-8 | Cover options, salon | New question wording throughout. Limits stop the journey with a call-the-office message and no price: wage roll £125,000, contents £250,000 in total, buildings £500,000, business interruption £300,000 (income plus debts), property away £25,000, four or more salons. A No to the subsidence question stops. Outstanding debts is a Yes/No question first. |
| R3-9 | Policy document names | The Salon and Non-Salon prefixes are gone from the Review and Pay list. |
| R3-10 | Rate bug | A No to "more than 15% non-standard construction" now gets the normal business equipment rate (the higher rate applies only to Yes, which is referred). The MTA rating follows the same rule. |
| R3-11 | Dashboard basics | Signed-out visitors go to the sign-in page. The heading is "Hi, First name". The caption and the "Guild Services" labels are removed. |
| R3-21 | Course dates for a school with several venues | Publishing a course session asks for the venue first when the school has more than one, then lists only the courses offered at that venue. A school with one venue sees its courses as before. |

### Left for now (needs the Guild or more work)

| ID | Item | Why |
|---|---|---|
| R3-12 | Isle of Man, Jersey and Guernsey offered insurance; Gibraltar added; the "Other" country | Reverses the rule that outside the UK is International. Needs the Guild's answers (cover level, Gibraltar, drop Other). |
| R3-13 | Employers Liability as radio buttons with Not required | The tiers do not match: the Guild says 1, up to 2 and up to 5 employees, the rating has 1, up to 3 and up to 5. Needs an answer first. |
| R3-14 | Business address for contents, and moving the premises questions to Cover options | Needs a new question, a CRM field for the contents address, and where the flood check reads the postcode from. |
| R3-15 | Calendar for the start date | Styling of the date picker. Not started. |
| R3-16 | Document names when downloaded | These are the WorkDrive file names: the Guild or A2Z renames the files (the link stays the same). |
| R3-17 | Terms of Business 3 November version | Confirmed by A2Z (5 November): the linked file is the 3 November version. Nothing to do. |
| R3-18 | S01 step names | Helen renamed steps on S01 (About Your Work, Register your account, Your address). Ask whether this is a new Associate order. |
| R3-19 | Dashboard personalised panels, GTi and Registers panels, new icons | Needs the CRM records for GTi students and register and directory entries, and the icons from Awais. |
| R3-20 | Interest icons | The Guild offered to send them. |

## Website UAT (school profile), 5 November 2026

From the Guild's website UAT workbook (4 November), as the internal action log W01 to W12.

| ID | Item | State |
|---|---|---|
| W01 | A picture uploads as soon as it is chosen, with a preview, so only Save changes is left. | Built (PR for review) |
| W02 | Remove image, and the website falls back to the Guild placeholder. | Built. Clears the CRM fields; the placeholder is the website's. |
| W03 | The WordPress media library mention is gone, with size guidance (school image 1600 x 900, logo 600 x 600, JPG or PNG). | Built |
| W04 | Main contact is on Overview. A public email and mobile are on Contact and social. | Built behind two settings (`SCHOOL_PUBLIC_EMAIL_FIELD`, `SCHOOL_PUBLIC_MOBILE_FIELD`). Needs two new CRM fields on Training Centres, then switch on. |
| W05 | "Please try again" on the 8MB message. | Built |
| W06 to W09, W12 | Website sync items (UK numbers, latitude and longitude, course level, insurance eligible, code format). | Not the portal as far as we know: the CRM-to-WordPress sync. Latitude and Longitude exist on Training Centres but the portal does not fill them yet. Waiting on how V1 gets them. |
| W10, W11 | Maximum class size per course, and the public page link wording. | Not built. Need the Guild's decision (M13) and the agreed wording (B11). |

## Switches that are on in Development

| Switch | Where | State |
|---|---|---|
| Combined Membership and Insurance journey, Associate upgrade | client build and function | On |
| Add a venue (`VITE_PORTAL_ADD_VENUE`) | client build, plus the school writes switch in the function | On |
| Other course (`VITE_PORTAL_OTHER_COURSE`, `ACC_OTHER_COURSE_FIELD=Other_Course`) | client build and function | On |
| Contact preferences and details (`VITE_PORTAL_PROFILE`, `PORTAL_PROFILE_ENABLED`) | client build and function | On once the Contact fields exist: `Contact_by_Email`, `Contact_by_SMS`, `Contact_by_Post`, `Guild_Gazette`, `News_and_Special_Offers`, `Preferences_Updated_On`, `Preferences_Source` |
| Membership changes | client build and function | Off: Creator cannot process that payment type yet |
