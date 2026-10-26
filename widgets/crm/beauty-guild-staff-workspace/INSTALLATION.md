# Beauty Guild CRM Staff Workspace V1.1 | Test installation and UAT

**Build:** 21 October 2026. **Test candidate**, not a signed-off CRM production release.

## Improvements since V1

- **Browse first:** Membership (`Deals`), Insurance (`Insurance_Policy`), Accreditation (`Training_Centre_Accred`) and Customers (`Contacts`) show the CRM records available to the logged-in staff member without requiring a search first. Lists load 100 CRM records at a time and let staff explicitly load the next batch, instead of claiming a limited batch represents the entire organisation. The "Requires attention" filter applies only to loaded records.
- **Actionable list rows:** reference, CRM Contact name where returned or resolvable, business/details, all relevant independent statuses, View Details and Open in CRM. A field absent from CRM is labelled **Not recorded**, not silently omitted.
- **CRM error handling:** no brittle multi-status criteria searches in queue mode; navigation, related-list failures and missing values are surfaced clearly.
- **Record detail:** explicit customer/application context, independent status summary, CRM details, native related lists, related record cards, Notes, Tasks, native CRM Send Email/buttons hand-off.
- **Portal styling:** responsive sidebar and denser layouts, repaired New Application label, clearer processing hierarchy.
- **New Application walkthrough:** interactive *demonstration* for Membership, Insurance and Accreditation, including customer lookup / optional **real CRM Contact creation**, service questions, review, and a disabled **Generate payment link** stopping point.

## Important limitations / safety

- The **application journey is a UI preview**. It uses a subset of the existing Portal V2 question groups but is **not** yet integrated with the authoritative saved-draft adapters, Catalyst pricing, sanctions, Stripe Checkout or Creator. No application draft is saved and no cross-channel customer resumption is offered. No premium, policy activation or paid state is fabricated. This preview is not appropriate for a real customer submission.
- **Creating a CRM Contact is real** if a staff user fills out and explicitly clicks **Create CRM Contact**. It is guarded by a same-email lookup but still writes into the current CRM organisation. Use **test customer details in a sandbox** and ensure the staff member is authorised. Do not use this for live customer onboarding until the shared journey backend is complete.
- Existing Notes and Tasks are real CRM writes. Email and CRM custom buttons open the native record; they are not sent or executed by the widget.
- The browse mode uses CRM API paged reads. "Requires attention" filtering is based on records **already fetched**; use **Load next CRM records** to expand coverage. It does not claim an organisation-wide count.
- Related list APIs may be unavailable to some profiles or may need additional mapping. Staff must use **Open in CRM** for actions requiring native layout context.

## Build the official Zoho upload ZIP

The provided candidate archive is **not a ZET-validated package**. On a workstation with Node.js and Zoho Extension Toolkit:

```sh
npm install -g zoho-extension-toolkit
cd BeautyGuild_Staff_Workspace_Usability_V1_1_Source
node --test tests/*.test.js
sh build-on-mac.sh
```

If prompted by `zet init`, choose Zoho CRM and use the project name `beauty_guild_processing`. The script copies `widget.html`, `widget.js`, `styles.css`, `brand-processing.css` **and `usability.css`** into the official ZET scaffold, then runs `zet validate` and `zet pack`.

## Install and test

1. In **Beauty Guild CRM sandbox/development**, create or update a **test** widget, hosted internally. Set `/widget.html` as the index page. Do not replace production blindly.
2. Confirm **Connected** and a permitted staff user.
3. Click **Insurance**, **Accreditation**, **Membership** and **Customers** without searching. Confirm full loaded lists, real customer details, each module's relevant statuses and a working Load next records button where needed.
4. In **Applications**, switch module tabs and filters; there should be **no Invalid query formed** message. Check that attention filters are labelled as applying to loaded rows only.
5. Select existing records, inspect related lists, return to the full list, add a Note/Task to **disposable test records** and test Send Email / CRM buttons navigation.
6. Open **New application**. Select Membership, Insurance and Accreditation in turn; follow the step validation to the disabled payment button. Do **not** test this as a real submission.
7. For customer creation, use a sandbox email and confirm it creates exactly one CRM Contact. Try the same email again to verify duplicate warning.

### UAT checkpoints

| ID | Check | Expected |
| --- | --- | --- |
| U01 | Insurance list without search | All accessible rows in first CRM page displayed with reference/customer/status indicators |
| U02 | Load more | Next CRM page fetched, existing rows retained, no fabricated total |
| U03 | Queue filters | No malformed CRM criteria; attention filter applies to loaded rows |
| U04 | Accreditation / Membership list | Independent payment/application/policy statuses clearly displayed |
| U05 | Contact name resolution | Contact lookup label or CRM Contact record resolves name where permitted |
| U06 | Record review | Detail summary and related lists load or provide explicit error/fallback |
| U07 | CRM actions | Native Send Email / CRM custom buttons open the existing record |
| U08 | Notes / Tasks | One record inserted with correct parent link in approved test CRM |
| U09 | Assisted journey | Contact selection, conditional steps, review and disabled payment CTA accessible |
| U10 | Safety | No application draft, Stripe charge, policy activation or fake successful payment |

**Verification completed locally:** JavaScript syntax and three Node-based tests with an SDK stub. **Not completed:** official ZET packaging or live Zoho CRM UAT.