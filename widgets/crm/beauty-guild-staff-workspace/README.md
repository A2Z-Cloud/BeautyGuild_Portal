# Beauty Guild Staff Workspace

Zoho CRM-hosted staff workspace for Membership, Insurance and Accreditation processing and customer-assisted application creation.

**Specification:** [Functional and UX Specification V2.2](SPECIFICATION.md) is the **current design and capability reference**, based on the Beauty Guild Portal V2 source in this repository and our recent Staff Workspace reviews. It separates agreed capabilities, proposed UX decisions, code that already exists elsewhere, deferred integrations and outstanding technical validation.

## Purpose

Staff can find and inspect real CRM applications, Contacts, Accounts and related records; understand their independent statuses; navigate between linked records without losing their place; and use existing Zoho CRM actions for approvals, edits and workflow execution. A guided creation journey for Membership, Insurance and Accreditation must allow staff to **find or create a CRM Contact**, save the application at any step, and allow that same customer to sign into Portal V2 and **resume the same CRM-backed draft**. The reverse hand-off must work too. This is agreed functionality requiring cross-channel implementation and testing.

The widget is **not** the customer portal and does not replace CRM Blueprints, Creator payment processing or Catalyst services.

## Functional areas

| Area | Target capability |
| --- | --- |
| Staff workspace | Compact overview, application queues and customer directory |
| Navigation | CRM Web Tab and optional record context; breadcrumb and back-state retention |
| Lists | Filtering, sorting, search and **API-backed pagination** across supported lists |
| Record view | Compact fields, independent status badges, notes, tasks, documents and real related records |
| Processing | Open native CRM record for existing buttons, approval actions and Blueprint transitions |
| Assisted creation | Find/create Contact first, reuse Portal V2 conditional application forms, save and resume at any step |
| Declarations | Staff entry, audit trail and customer confirmation where required |
| Design | Portal V2 visual language, consistent Lucide icons, accessible typography and compact layouts |
| Payment link | Use the existing Portal V2 quote and Stripe Checkout to generate/copy/share a customer-specific link; existing Creator/CRM automation processes payment |

**Proposed navigation:** Overview, Applications, Customers and New Application; Membership / Insurance / Accreditation are service filters. This change and the exact list page sizes require final UX approval.

## Source and deployment status

- **This repository:** this directory presently contains **documentation only**. It does not yet contain the earlier widget implementation or a deployable CRM package.
- **Earlier candidate widget:** separate downloadable source/build kit outside this repo, with CRM SDK integrations and mock-tested lists, note/task actions, and draft starter. Previous client-facing HTML demo used simulated data.
- **Portal V2:** actively developed separately in [apps/portal](../../../apps/portal/), including journey source, CRM draft adapters, records, checkout and insurance risk rules. Those features may require configuration/feature flags and do **not** automatically become widget capabilities.
- **Deployment:** independent Zoho CRM widget project, prepared with Zoho ZET validate/pack and installed into a test CRM organisation. No Catalyst portal deploy is implied.
- **Verification outstanding:** actual CRM layouts/fields/permissions, server-side pagination, full draft parity, staff authorisation to use Catalyst services, official package validation, UAT and any live CRM install.

## Reference documents

- [Functional / UX specification and acceptance criteria](SPECIFICATION.md)
- [Portal layout](../../../apps/portal/src/PortalView.jsx) and [Portal styles](../../../apps/portal/src/styles.css)
- [CRM drafts API](../../../docs/api-contracts/crm-drafts.md)
- [Portal payment architecture](../../../docs/api-contracts/pricing-payments.md)
- [CRM widget guidance](../README.md)
- [Workspace deployment boundaries](../../../docs/architecture/workspace.md)

**Document updated:** 20 October 2026. Source and design specifications are not evidence of deployment.
