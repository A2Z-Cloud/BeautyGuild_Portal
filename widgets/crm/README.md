# Zoho CRM widgets

CRM widgets are independently packaged and deployed to Zoho CRM. They do **not** deploy automatically with the Catalyst member portal. Each widget owns its installation, SDK/permissions assumptions, API contracts, tests and release checklist.

## Beauty Guild Staff Workspace

- [Widget overview and status](beauty-guild-staff-workspace/README.md)
- [**Current functional and UX specification (V2)**](beauty-guild-staff-workspace/SPECIFICATION.md)

The current design covers a live CRM work overview, paginated application queues, Contacts and Accounts, universal record views and in-widget related-record navigation. Native CRM retains business-process actions. Future staff-assisted applications and shared Catalyst checkout are specified with explicit security and validation gates.

**Implementation status:** documentation exists here; the earlier widget candidate source is not yet in this repository. Its implementation, ZET package, live installation and UAT are separate deliverables. Do not treat documentation as a deployed CRM widget.

Create a separate directory for each future CRM widget. Do not copy customer portal authentication or API credentials into CRM-hosted clients.
