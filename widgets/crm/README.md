# Zoho CRM widgets

CRM widgets are independently packaged and deployed to Zoho CRM. They do **not** deploy automatically with the Catalyst member portal. Each widget owns its installation, SDK/permissions assumptions, API contracts, tests and release checklist.

## Beauty Guild Staff Workspace

- [Widget overview and status](beauty-guild-staff-workspace/README.md)
- [**Current functional and UX specification (V2)**](beauty-guild-staff-workspace/SPECIFICATION.md)

The current design covers a live CRM work overview, paginated application queues, Contacts and Accounts, universal record views and in-widget related-record navigation. Native CRM retains business-process actions. Future staff-assisted applications and shared Catalyst checkout are specified with explicit security and validation gates.

**Implementation status (10 November 2026):** the V1.1 widget source is in this repository under `beauty-guild-staff-workspace/app/` and is the **test candidate**. The V1.2 build in the specification is the target and is not built. The ZET package, installation in CRM and UAT are separate deliverables, so do not treat the source here as a deployed widget. The Staff API it will call is live in Development (see [staff-api.md](../../docs/api-contracts/staff-api.md)).

Create a separate directory for each future CRM widget. Do not copy customer portal authentication or API credentials into CRM-hosted clients.
