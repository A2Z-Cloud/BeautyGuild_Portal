# Workspace architecture and deployment boundaries

## Principle

This repository is a **multi-deliverable development workspace**, not one Catalyst project. Paths represent ownership and logical boundaries; not every folder is a deployable package.

```text
BeautyGuild_Portal/
  apps/
    portal/               # Portal V2 frontend
  widgets/
    crm/                  # Independent Zoho CRM widgets
    creator/              # Independent Zoho Creator widgets
  packages/               # Reusable code where justified
  integrations/           # Separately operated integrations
  requirements/
    portal-v2/            # Approved baseline and decisions
  docs/
    architecture/
    api-contracts/
    delivery/
  tools/                  # Cross-project local tooling
  .github/                # Collaboration templates
```

## Deployment rules

1. No root `catalyst.json`, `.catalystrc`, CI auto-deploy, or assumptions that every project ships to Catalyst.
2. The Portal V2's hosting, function routes and runtime configuration are approved and configured separately by the backend owner.
3. Each widget/application maintains its own build and deployment documentation.
4. Frontend changes do not modify backend services, CRM fields, automations, webhooks or payment logic.
5. New CRM-related frontend API calls require a documented contract and server-side identity/record-ownership enforcement.
6. Preserve existing V1 source in `A2Z-Cloud/beauty-guild-catalyst`; do not migrate it by implicit copy.
7. Never commit environment secrets, customer exports, generated build outputs or private credentials.

## Working practices

- `main` is the approved baseline; branches and PRs are used for implementation and review.
- Keep deployment targets and code responsibilities local to each project.
- Reuse shared packages only after a real second consumer emerges.
- Document decisions and API dependencies as phases progress.
