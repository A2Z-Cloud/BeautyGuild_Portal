# Milestone 1 smoke tests

For the frontend development preview only. Do not enter real customer data or payments.

| Step | Expected result |
| --- | --- |
| Open / | Dashboard, Beauty Guild branding, visible preview mode, sample services and sample records |
| Click Membership/Insurance/Accreditation | Dedicated service overview loads |
| Start each sample journey | Form steps render, Previous/Continue works |
| Click Continue with required values missing | Errors shown, next step blocked |
| Enter invalid email or negative number | Validation error shown |
| Complete all fields and Finish preview | Notice that no account/payment/CRM submission occurred |
| Use Save & Finish Later explanation | Clear explanation that CRM persistence is unavailable |
| Open /records | Sample list and filter work |
| Open /records/accreditation/ACC-DEMO-101?tab=documents | Documents tab directly selected, no file download |
| Switch between Overview/Activity/Documents | URL tab parameter updates |
| Back to records after filtered list | Filter restored when opening from list |
| Refresh a direct record URL (hash routing, e.g. /app/#/records/accreditation/ACC-DEMO-101?tab=documents) | Same page opens; no host SPA fallback needed |
| Desktop sidebar collapse/expand | Changes layout, preserves state locally |
| Mobile screen | Navigation opens and closes without covering form content permanently |
| Access /gti-courses or /my-profile | Honest placeholder without fake functionality |
| No connected backend | No real CRM, Stripe, WorkDrive or authenticated account operations performed |
| npm run check | Tests and static build pass in a configured Node environment |

## Expanded frontend and account review

| Step | Expected result |
| --- | --- |
| Membership selects insurance Yes | Insurance options stage appears; No skips it |
| Accreditation selects other tutors Yes | Tutor qualification, count and details are required; No hides them |
| Insurance selects salon or contents cover | Property questions appear; mobile-only without property skips them |
| Insurance How You Work checkboxes | Multiple selections toggle independently |
| Save and Finish Later | Account checkpoint opens, no draft is saved to CRM |
| Finish journey review | Account checkpoint offers sign-in or sign-up, no Stripe/CRM request |
| Login page | Fields validate; submit reports Catalyst Authentication unavailable |
| Sign-up page | Fields/terms validate; submit reports no account/Contact was created |
| Forgot password | Submit reports no email was sent |
| My Account | Profile, preferences, security and membership sections display; saves report no CRM update |
| Journey to account and back | Entered example answers and current step remain in current in-memory app session |
| Full browser refresh | Unsaved preview answers clear; this is not a CRM draft |
| Insurance review | No fabricated premium, underwriting PASS, insurance issuance or checkout |

| From account checkpoint open payment preview | Shows backend-authoritative pricing placeholders only; button reports no Stripe session or charge |
