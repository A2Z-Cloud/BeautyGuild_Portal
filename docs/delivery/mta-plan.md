# MTA Management | delivery plan

**Status:** proposed sequencing, not a committed timeline or approved scope.

| Stage | Deliverable | Gate |
| --- | --- | --- |
| 0. Preparation | Widget project, source register, CRM mapping, API contracts and UAT framework | Project scaffold PR approved |
| 1. Controls | Server-verified membership/policy context, user roles, stable snapshots, revision schema | Live CRM fields/Blueprints and permissions checked |
| 2. Quote service | Approved proration/tax/fee engine with stop/refer and versioned quotes | Guild/Finance/Insurer sign off rules with example calculations |
| 3. CRM widget | Staff draft/edit/review UI, before/after comparison, declarations, approval routing | ZET packaged, sandbox integration tests |
| 4. Settlement and application | Approved Stripe/Books/Creator reconciliation, idempotent application, effective dating | Payment, refund and failure recovery UAT |
| 5. Documents | Revision schedule, adjustment letter, statement, wording/version controls and email audit | Approved insurer templates and end-to-end validation |
| 6. Customer portal | Narrowed self-service MTAs on Portal V2 using same backend; refer cases route to staff | Explicit Portal V2 scope approval and customer UAT |

## Controls

- Staff Workspace is a separate widget; do not copy it into MTA Management or couple their deployments.
- No root Catalyst deploy, automatic CRM installation or implicit production rollout.
- Each stage needs an implementation PR, code review, build/test evidence, outstanding decisions and rollback steps.
- Changes to CRM automation, Creator webhook, Books, Stripe or insurer wording require backend/business owner approval.
- Before release, test stale quotes, effective-date changes, approval permissions, duplicate payment webhooks, refund/credit handling and document failure recovery.

## Out of scope of the initial scaffold

Functional MTA API, CRUD against CRM, policy endorsement, user payments, refund initiation, document generation, production migrations, CRM widget deployment. Those require separately approved changes.
