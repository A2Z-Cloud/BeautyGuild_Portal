# Beauty Guild Staff Workspace

A compact, portal-aligned workspace **inside Zoho CRM** for finding, understanding and processing Membership, Insurance and Accreditation applications. It is hosted on Catalyst Slate and embedded in CRM as an externally hosted Web Tab.

**Source of truth:** this branch, `feature/beauty-guild-staff-workspace-slate`. Auto Deploy on this branch updates the Slate app, so a push here can change what testers see (Slate serves assets with a one-year cache, so bump the `?v=` values in `app/index.html` when you change an asset).

## Status at 28 October 2026

| Area | State |
| --- | --- |
| CRM browsing: paged tables, record details, related-list navigation, CRM-wide search | Built (V1.2 milestone 1). Real CRM permissions and layouts still need live verification |
| Portal V2 Membership, Insurance and Accreditation question steps, CRM Contact prefill, active GTi Courses | Built (milestone 2), in the browser tab only. Insurance logic is a **copy that has already drifted** ([PORTAL-DEFS-SYNC.md](PORTAL-DEFS-SYNC.md)) |
| Inline editing of workflow-trigger fields (including payment status) | Built on 27 October, **ahead of the spec**. Development only until [WORKFLOW-FIELD-EDITING.md](WORKFLOW-FIELD-EDITING.md) is approved |
| Staff API, secure staff identity | **Backend built and tested on `main`, not deployed**: signed channel, `/staff/ping`, `/staff/me`, `POST /staff/quote`, `POST /staff/insurance-change/revision`. The CRM function, the connection scope and the Development deploy are still to do ([STAFF-API-AND-IDENTITY.md](STAFF-API-AND-IDENTITY.md) sections 3, 6 and 11) |
| Shared staff/customer draft save and resume | **Not built.** Insurance revision save is built; application drafts are not |
| Live quote, underwriting, sanctions, flood and subsidence results | **Backend built** (`POST /staff/quote`). Widget screens not built. Needs the deployed staff API |
| Vouchers, referral codes, waivers | Pricing engine is built in the portal (off by default). Staff waivers work on the quote; vouchers need a Creator reader. Widget panel **not built** |
| Payment link | **Not built, and not in V1.2.** Waits for Creator V2 |
| Staff-assisted mid-term adjustments | Future ([STAFF-ASSISTED-MTA.md](STAFF-ASSISTED-MTA.md)) |
| UAT and sign-off | None |

**Warnings.** *Create CRM Contact* writes a real CRM Contact. The workflow-field editor writes with workflows triggered. Test in a CRM sandbox or Development only.

## Documents

| Document | What it is |
| --- | --- |
| [SPECIFICATION.md](SPECIFICATION.md) | Functional and UX specification, version 2.4. Start here |
| [V1.2-BUILD-BRIEF.md](V1.2-BUILD-BRIEF.md) | The agreed V1.2 build target (24 October) |
| [V1.2-IMPLEMENTATION-NOTES.md](V1.2-IMPLEMENTATION-NOTES.md) | What milestones 1 and 2 delivered, and what changed after |
| [STAFF-API-AND-IDENTITY.md](STAFF-API-AND-IDENTITY.md) | Staff API, signed-request identity, vouchers and waivers route, API Gateway decision |
| [WORKFLOW-FIELD-EDITING.md](WORKFLOW-FIELD-EDITING.md) | Governance of the inline workflow-field editor and Creator status ownership |
| [PORTAL-DEFS-SYNC.md](PORTAL-DEFS-SYNC.md) | Keeping the widget's copy of Portal V2 journey logic in step |
| [STAFF-ASSISTED-MTA.md](STAFF-ASSISTED-MTA.md) | Future staff-assisted mid-term adjustments |
| [SLATE-DEPLOYMENT.md](SLATE-DEPLOYMENT.md), [INSTALLATION.md](INSTALLATION.md) | Hosting, installation and the test plan |

On `main` (not on this branch): `docs/api-contracts/staff-api.md` (the wire contract and test vectors) and `docs/delivery/staff-api-handoff.md` (what to build and how to test), `docs/delivery/vouchers-staff-route-spec.md`, `docs/delivery/vouchers-creator-spec.md`, `docs/delivery/mta-r3-plan.md`, `docs/delivery/creator-payments-app.md`, `docs/api-contracts/stripe-metadata.md`.

## Rules

- No secret, Stripe key or privileged token in widget code.
- The widget never prices, rates or decides eligibility. The server does.
- Do not copy customer portal authentication into the CRM-hosted client.
- Do not edit `app/portal-defs/` by hand.
- Do not merge this branch into `main`, replace the live CRM widget or deploy to Production without approval.
