# Beauty Guild CRM Staff Workspace | V1 test installation

**Release:** 1.0.0 test candidate, 21 October 2026. **Live CRM SDK data only; no sample records.**

## What this build supports

- Overview, Membership, Insurance and Accreditation processing queues, customer search and permitted Contact directory.
- CRM Contact 360 and existing application record detail views, linked record tables and direct opening of native CRM records.
- Notes, Tasks and supported CRM related lists using the logged-in staff member's CRM permissions.
- Send email and CRM button/action entry points **open the existing CRM record**; they do not silently send email or execute workflow functions within the widget.
- New Contact, new application, staff/customer shared draft and payment-link functionality all show **Coming soon**. No application or Contact creation is possible in this release.

## Verification status

- Node static check and mocked Zoho CRM SDK unit/integration tests: passed, using synthetic test fixtures **only in the tests**.
- **Not yet validated in a live Beauty Guild CRM organisation**. Real permissions, related-list API names, emails, record navigation, Notes and Tasks need a test installation.
- A `plugin-manifest.json` candidate ZIP may be included for convenience, but **the official Zoho ZET validation and pack have not run in this environment**. Use ZET to produce an officially validated upload ZIP.

## Build the validated Zoho upload ZIP

Run on a workstation with Node.js, npm, internet access and Zoho Extension Toolkit:

```sh
npm install -g zoho-extension-toolkit
cd BeautyGuild_Staff_Workspace_V1_Source
node --test tests/*.test.js
sh build-on-mac.sh
```

During `zet init`, select **Zoho CRM** and use the requested project name `beauty_guild_processing`. The build script then copies the current app into the generated scaffold, runs `zet validate` and `zet pack`, and prints the output directory. Upload **that ZIP** to CRM. Do not assume that a hand-assembled candidate ZIP passes ZET validation.

## Install without disturbing the existing widget

1. Log in to Beauty Guild **CRM development/sandbox** as an authorised administrator.
2. Setup > Developer Hub > Widgets > Create Widget. Name it `Beauty Guild Staff Workspace - V1 Test`, service Zoho CRM, hosting Zoho/Internal.
3. Upload the ZET-generated ZIP and set the index page to `/widget.html`.
4. Create or link a **test Web Tab** to this widget. Restrict to your test-staff profile initially.
5. Open the tab in CRM. Confirm it shows `Connected`, the staff identity, and real CRM records.
6. No Catalyst, Stripe, Creator, Deluge deployment or CRM field creation is required to test this read/processing release.

## Safe test plan

Use existing *approved test records* only, and reserve Notes/Tasks creation for disposable records:

| Test | Steps | Expected |
| --- | --- | --- |
| Connect | Open CRM test Web Tab | Connected state and logged-in staff; no demo fixtures |
| Search | Search a known Contact email | Actual Contact returned, view its membership/insurance/accreditation relationships |
| Customer directory | Customers > Refresh | Permitted Contacts from CRM, with limited counts labelled honestly |
| Insurance queue | Applications > Insurance | Referral/underwriting records and status badges, real CRM data |
| Accreditation queue | Applications > Accreditation | Applications requiring processing, record drill-in and related Centres/Tutors/Courses where accessible |
| Membership queue | Applications > Membership | Existing memberships and exceptions |
| Related lists | Open a policy/accreditation/Contact | Notes, Tasks, attachments and supported custom related lists; permission errors shown instead of blank fabricated counts |
| Email | Click Send email in CRM | Native CRM record opens for the usual email action; no email is sent automatically |
| Buttons | Click CRM buttons / actions | Native CRM record opens with its existing custom actions and automation permissions |
| Notes | Add a note on a disposable test record | Exactly one CRM Note inserted |
| Task | Create a follow-up task on disposable test record | One real CRM Task linked to that record |
| New application | Open New application | Coming soon only; no Contact/application record is inserted |
| Payment | Explore record view | No Stripe link, payment change, policy issue or Catalyst call |

**Known source limitations:** application queues use CRM status searches with paginated bounded scanning and optional Load more, not an absolute CRM count. Related-list APIs and some custom list API names depend on CRM access; when unavailable, Open in CRM is provided. Email and CRM buttons are not executed within the widget. No live CRM UAT has been performed.

## Troubleshooting

- SDK does not initialise: verify upload index page, widget context and that `https://live.zwidgets.com/js-sdk/1.2/ZohoEmbededAppSDK.min.js` loads.
- Related list fails: verify CRM module, related-list API name and current staff role; use Open in CRM fallback.
- No queue records: test a known Contact or open from CRM record context; queue filters intentionally show matching processing candidates only.
- Notes/Tasks rejected: check record access, module permissions and CRM field requirements; do not grant blanket elevated scopes.