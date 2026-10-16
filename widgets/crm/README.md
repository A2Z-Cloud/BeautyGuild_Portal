# CRM widgets

Create one directory per widget, such as `widgets/crm/accreditation-review/` once its workflow, UX and module placement are approved. Each widget is independently built and uploaded to CRM; it does not deploy through Catalyst.

Record views, approval actions, insurance servicing, and other workstreams require individual specifications before code is added.

## Staff Workspace

The [Beauty Guild Staff Workspace](beauty-guild-staff-workspace/README.md) is the current CRM widget workstream. Its documentation covers live CRM record viewing, related-record navigation, queue and list pagination, Guild-aligned visual design, native CRM processing actions, assisted draft creation, safety boundaries and outstanding deployment tests.

**Status:** widget source and tests are supplied separately in the widget kit; only the README has been added to this repository so far. No Zoho CRM or Catalyst deployment is implied.

## MTA Management

[MTA Management](mta-management/README.md) has its own standalone CRM widget project scaffold, proposed customer/staff journey, CRM mappings, UAT scenarios and API contract. It is distinct from the Staff Workspace: the latter can open the MTA experience with preserved membership/policy context, while MTA Management owns the amendment interface.

**Status:** scaffold and review specifications only; no live CRM connection, amendment processing, underwriting decision, payment operation or production deployment.
