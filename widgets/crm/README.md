# Zoho CRM widgets

CRM widgets are independently packaged and deployed to Zoho CRM. They do **not** deploy automatically with the Catalyst member portal. Each widget owns its installation, SDK/permissions assumptions, API contracts, tests and release checklist.

## Beauty Guild Staff Workspace

- [Widget README and current status](beauty-guild-staff-workspace/README.md)
- [**Functional and UX specification (V2.4)**](beauty-guild-staff-workspace/SPECIFICATION.md)
- [Staff API and identity design, including the API Gateway decision](beauty-guild-staff-workspace/STAFF-API-AND-IDENTITY.md)

**Implementation status (27 October 2026):** the widget source is in `beauty-guild-staff-workspace/app/` on the branch `feature/beauty-guild-staff-workspace-slate`, which is the source of truth for the widget. It is hosted on Catalyst Slate and embedded in CRM as an externally hosted Web Tab. It browses live CRM records and runs the Portal V2 Membership, Insurance and Accreditation question steps. The staff API, shared CRM drafts, live quotes and the payment link are **not** built. It has not been signed off in a live Beauty Guild CRM. Do not treat documentation as a deployed capability.

Create a separate directory for each future CRM widget. Do not copy customer portal authentication or API credentials into CRM-hosted clients.
