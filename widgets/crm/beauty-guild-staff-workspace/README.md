# Beauty Guild Staff Workspace V1.1 | Usability and journey-preview iteration

This source kit improves the existing Zoho CRM Staff Workspace V1. It includes live CRM SDK browsing, display of customer and application statuses, record detail, related lists, Notes/Tasks, and links to native CRM processing buttons and email.

**New:** the application wizard preview for Membership, Insurance and Accreditation runs to a disabled payment button. The preview does not save the application to CRM/Portal V2 or call Catalyst/Stripe; this must be integrated in a separate, verified release. Clicking *Create CRM Contact* does write a real CRM Contact; test in sandbox only.

Refer to [INSTALLATION.md](INSTALLATION.md) for the test plan, limitations and ZET package instructions.

## V1.2 agreed build baseline (24 October 2026)

**[Read the V1.2 Build Brief](V1.2-BUILD-BRIEF.md)** before extending this widget. It replaces the simplified V1.1 application preview as the **target implementation direction**, without claiming the target has already been built. The brief specifies:

- Information-dense CRM-style paginated tables and detailed record pages with **related-list navigation on the right** (not stacked related-list cards).
- Full current Portal V2 Membership, Insurance and Accreditation forms, CRM Contact prefill, related data and genuine shared CRM draft save/resume.
- Secure CRM staff-to-Catalyst access, internal underwriting/sanctions/flood/subsidence outcomes with clear reasons and CRM audit evidence.
- Live server-calculated quotations using Stripe lookup keys/Books SKUs, and a **payment stopping point** until Creator V2 payment handling is ready.

V1.1's current source remains the **test candidate**, not the V1.2 implementation. Do not confuse the two or deploy as though V1.2 is complete.


## Catalyst Slate Git deployment (24 October 2026)

[View Slate deployment settings](SLATE-DEPLOYMENT.md). The prepared branch is `feature/beauty-guild-staff-workspace-slate`, framework `Static`, and root path `widgets/crm/beauty-guild-staff-workspace/app`. Use external hosting in a **separate CRM Development test Web Tab**. The latest committed implementation is still V1.1; V1.2 is only the build brief.
