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
| Refresh a direct record URL | Same page opens if host supports SPA fallback; document hosting requirement if 404 |
| Desktop sidebar collapse/expand | Changes layout, preserves state locally |
| Mobile screen | Navigation opens and closes without covering form content permanently |
| Access /gti-courses or /my-profile | Honest placeholder without fake functionality |
| No connected backend | No real CRM, Stripe, WorkDrive or authenticated account operations performed |
| npm run check | Tests and static build pass in a configured Node environment |
