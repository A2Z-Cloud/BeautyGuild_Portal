# Beauty Guild | Development Workspace

This repository is the Beauty Guild source-control workspace for the **Portal V2**, Zoho CRM/Creator widgets, independent integrations, supporting applications, shared packages, requirements and delivery documentation.

**Repository-wide is not the same as deployable.** Each deliverable has its own runtime and deployment process. No root Catalyst deployment configuration, automatic deployment or shared backend is assumed.

## Workspace map

| Path | Purpose | Deployment |
| --- | --- | --- |
| `apps/portal/` | Portal V2 frontend (membership, insurance, accreditation) | Separately configured when approved |
| `widgets/crm/` | Zoho CRM widgets, each in its own project | Zoho CRM widget packaging, not Catalyst |
| `widgets/creator/` | Zoho Creator widgets | Zoho Creator-specific delivery |
| `packages/` | Reusable libraries, where actual cross-project reuse exists | Not directly deployable |
| `integrations/` | Independent integration projects and code | Integration-specific |
| `requirements/` | Approved requirements and open decisions | Not deployable |
| `docs/` | Architecture, API contracts and delivery references | Not deployable |
| `tools/` | Optional repository tooling | Not deployable |

The existing V1 implementation stays in the separate [beauty-guild-catalyst](https://github.com/A2Z-Cloud/beauty-guild-catalyst) repository. This workspace does **not** deploy, modify or replace V1 by default.

## Portal V2 principles

- Preserve the Beauty Guild's established visual identity and working journeys.
- Build the frontend here; Catalyst auth configuration, CRM/Creator records, pricing, Stripe and backend integrations are separately owned.
- CRM is the permanent source for Membership, Insurance and Accreditation drafts.
- New public users may complete a journey before creating an account; saving a persistent CRM draft requires login.
- API contracts must be agreed before connecting the frontend to backend services.
- Keep code for independently deployed widgets and integrations separated.
- Never commit credentials, customer exports or generated deployment artefacts.

## Next documents

- [Workspace conventions](docs/architecture/workspace.md)
- [Portal V2 requirements](requirements/portal-v2/README.md)
- [Portal V2 build sequence](docs/delivery/portal-v2-plan.md)
- [Frontend/backend contract guide](docs/api-contracts/README.md)

## Working practices

Use feature branches and pull requests for changes. Keep each deployable project's build commands, environment assumptions and deployment target in its own README. Nothing under `apps/` or `widgets/` is automatically published simply because it is in this repository.

**Initialisation:** October 2026. This initial repository scaffold does not implement the portal or create Catalyst infrastructure.
