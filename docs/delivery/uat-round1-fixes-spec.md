# UAT round 1: fixes from the Guild's comments

Source: `Beauty-Guild Portal UAT v1.1 - Guild Comments.xlsx`, tabs S01, S02, S10, S12 and S17, tested 28 October to 3 November 2026 by Helen Delaney and Qudsiya Talib (with PJA). Insurance tabs and accreditation monthly (S11) follow.

This spec covers what we fix now. Three groups are **not** in it:

- Items that wait on Creator. They are written up for QA in [creator-payments-app.md](creator-payments-app.md), section 7.
- The Associate journey redesign (interests, branch defaults, removing the Membership details step, password on page one, GDPR preferences, a fuller review page). Under review with the Guild.
- Course data (minimum practical hours, prerequisites, Korean Eyelash Extensions). We need the Guild's list first.

## 1. What went well

Associate yearly and monthly, accreditation yearly and member accreditation all reached Stripe and paid. The Stripe amounts matched the portal.

One correction in our own UAT workbook: S02 steps 2 to 4 say £6.92. The correct figures are £6.09 a month and £16.09 first payment (the £10 joining fee plus the first month). Fixed in the workbook, not in code.

## 2. Changes

Each row says where it comes from, what changes and how we know it is done.

### A. Accreditation wording (S10 step 1, 12, 14; S17)

| # | Change | Done when |
|---|---|---|
| A1 | Intro page uses the Guild's captions: "Let's get your training centre accredited", the three "What you'll need to do" steps (Your training centre, Courses and tutors, Review your application). | The Accreditation page and the journey side show the Guild's words. |
| A2 | Tutor and venue questions: "Do you have any additional tutors?", "How many additional tutors do you have?", "Do you offer training at additional venues?", the tutor declaration "Do your tutors hold a teaching qualification and the relevant qualifications in the subjects they wish to teach for at least 6 months?", and the venue hint "Additional venue details can be added once your application has been verified". | The tutors step shows the new wording. Answers still save under the same names. |
| A3 | Payment confirmation says "We have received your payment and will be in touch in relation to your application shortly." | The payment return page uses this for accreditation. |
| A4 | "Sign in to start" and "Sign in to save" removed for signed-in people. | Already done (PRs 133 and 134). |

### B. Accreditation layout (S10 step 12, 17)

| # | Change | Done when |
|---|---|---|
| B1 | Remove the "Training centre accreditation / Training centre, tutor, course and evidence declarations" heading lines and the "Save your application" notice at the top of each step. The side panel keeps Save. | No repeated heading or notice above the steps. |
| B2 | Remove the pink "Your centre's country decides which accreditation route applies" box on the review step. | Not shown. |
| B3 | Remove the start date question and the "and start date" in the declarations title. | Not asked. The server already uses today when none is sent. Valid from and to are set when the Guild verifies (see Creator QA). |
| B4 | Country lists show United Kingdom only, with no England, Scotland, Wales or Northern Ireland. | The drop-downs show United Kingdom once. A saved England, Scotland, Wales or Northern Ireland still counts as UK. |
| B5 | "All declarations need to be completed": add "Please call our office to discuss on 01332 224830 between 9am and 5pm on weekdays." | The warning shows the phone number and hours. |
| B6 | Declaration 1 answered No refers to the GTi course list. Declaration 2 answered No refers to the GTi Teaching Certificate. | Each No message links to the right place. |

### C. Review and payment (S10 step 3, 17)

| # | Change | Done when |
|---|---|---|
| C1 | Each section on the review step has an Edit button that returns to that step. | Edit goes to the step and Back to review is possible without losing answers. |
| C2 | The review step's button is "Continue to payment". There is no separate "Application submitted" page: after saving, the person goes straight to the payment page. | Pressing it saves and opens `/pay/accreditation/:id`. If saving fails the person stays on the review with the message. |
| C3 | After "Continue to payment", pressing Back and opening the record offers "Continue to payment" and "Edit application". | The record in My records and in the school page shows both actions while payment is outstanding. |

### D. Address (S10 step 13)

| # | Change | Done when |
|---|---|---|
| D1 | After choosing an address from the list, all address lines show on the page (applicant and training centre), not only country and postcode. | Address 1, 2, 3, town, county, postcode and country are all visible and editable. |
| D2 | The "Find address" button no longer overlaps the postcode box. | No overlap at desktop and phone widths. |
| D3 | The "Enter your address manually" button is not needed in the lookup. | The postcode lookup shows the list of addresses found. Manual entry stays available as a small link under the list so people outside the UK, or with no match, can still type. |

### E. Courses (S10 step 15)

| # | Change | Done when |
|---|---|---|
| E1 | "Can't find the course you want to teach?" is always visible, with no arrow to open it. | Always shown. |
| E2 | An "Other" box for a course not on the list, with the caption "Please enter the course title you wish to be accredited." in place of the phone line. | Shown when the switch is on. Stored on the application (needs a CRM field, see section 4). |
| E3 | An application can continue with no GTi course ticked when an Other course is entered. With the switch off, one course is still needed. | Server and form agree. |

### F. Dashboard and saved applications (S10 step 12)

| # | Change | Done when |
|---|---|---|
| F1 | The Accreditation card shows a loading state until the school and draft data arrive, not "Apply for accreditation". | No flash of the wrong state. |
| F2 | Saved applications appear sooner after payment. | The list refreshes when the person returns from payment and retries once if the CRM has not caught up. Some delay can stay: CRM search lags. |

### G. Associate journey (S01, S02)

| # | Change | Done when |
|---|---|---|
| G1 | Validation: the "Still to complete" list starts each item with a capital letter, and the incomplete box has a dark pink border. | Both visible on an empty Next. |
| G2 | Reproduce the return after creating an account (S01 step 5): the person should land on payment with their answers. | A written finding. Fix only if the cause is ours. The sign-up email link needs a real email, so this is checked in QA. |

### H. Additional venue (S12)

| # | Change | Done when |
|---|---|---|
| H1 | A verified school's Venues tab shows "Add a venue (£60)". It opens the existing `additional_venue` checkout, with the centre chosen. | The price page shows £60 and goes to Stripe. The button is hidden unless the school is verified and the switch is on. |
| H2 | Whether the payment updates the CRM is Creator's (see Creator QA). | Not part of this PR. |

## 3. Not in this PR

- Stripe line wording for monthly plans (one line at £6.09) and the yearly "per month" text: Creator needs to agree the admin fee line first, and the yearly text may be Stripe's own display.
- Accreditation showing Verified straight after payment: the portal only reads the CRM status.
- International accreditation payment sticking: reproduce with Creator.

## 4. Switches and dependencies

- Venue button: `VITE_PORTAL_ADD_VENUE` (default on in the deploy script once Creator has tested the venue payment; off until then).
- Other course: `VITE_PORTAL_OTHER_COURSE` and the server's `ACC_OTHER_COURSE_FIELD`, the CRM field on Training_Centre_Accred that holds the text. Off until the Guild creates the field. If the field is not configured the server ignores the text and the form hides the box.

## 5. Tests

- Pure rules: country list, review edit targets, course rule, address merge.
- Function: course rule with and without an Other course, no start date, other-course field written only when configured.
- Build, lint, format and the portal and function test suites, as for every PR.
- Manual on Development after deploy: the S10 and S17 steps with nothing submitted beyond a draft.
