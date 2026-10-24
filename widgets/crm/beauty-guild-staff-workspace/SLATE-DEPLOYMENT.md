# Beauty Guild Staff Workspace | Catalyst Slate Git Auto-Deploy Setup

**Prepared:** 24 October 2026  
**Status:** Git branch and static app entry prepared. **Not yet connected to Slate or deployed.**  
**Repo:** `A2Z-Cloud/BeautyGuild_Portal`

## Enter these values in Catalyst Slate

| Slate field | Value |
| --- | --- |
| Git provider | GitHub |
| Repository | `A2Z-Cloud/BeautyGuild_Portal` |
| **Branch** | `feature/beauty-guild-staff-workspace-slate` |
| **Framework** | `Static` / `Static HTML` (plain HTML/CSS/JavaScript) |
| **Root Path** | `widgets/crm/beauty-guild-staff-workspace/app` |
| Output Path, if requested | `.` (same as app root) |
| Install Command | None / leave blank (no package dependencies) |
| Build Command | None / leave blank (prebuilt static assets) |
| App / Deployment Name | `beauty-guild-staff-workspace` |
| Auto Deploy | **Enable** for this branch |
| Initial environment | Development / testing |

**Do not select** `apps/portal` as the root; that is the **customer-facing React Portal V2**. The CRM widget is the static app under `widgets/crm/beauty-guild-staff-workspace/app`.

## Contents served from Root Path

- `index.html`: new Slate root entry; currently mirrors `widget.html`.
- `widget.html`: existing internal-ZET entry, retained for rollback.
- `widget.js`: V1.1 CRM SDK implementation.
- `styles.css`, `brand-processing.css`, `usability.css`: active styling.
- `.catalyst/slate-config.toml`: static framework deployment declaration.

**Important source rule:** while both `index.html` and `widget.html` exist, keep their changes in sync or treat `index.html` as the Slate production entry. For future modular V1.2 work prefer a single generated HTML entry rather than maintaining duplicates.

## Console setup

1. Open the **existing Beauty Guild Catalyst project** → **Slate** → **Start Exploring** if Slate has not yet been enabled.
2. Connect GitHub through Catalyst Git Integration. Authorise access to `A2Z-Cloud/BeautyGuild_Portal`.
3. Create a deployment from the **private GitHub repository** using the exact branch and root path above; set framework to **Static HTML/Static**, no install/build needed, output `.` if requested.
4. Enable **Auto Deploy** on the branch. It runs when new commits are pushed to this branch (it is not linked to production releases unless explicitly configured).
5. Verify the resulting HTTPS URL and asset loading. In a normal browser the CRM SDK may report not connected, since there is no Zoho CRM iframe context.
6. In **Zoho CRM Development/sandbox** go to **Setup → Developer Hub → Widgets**; create a **separate** external-hosted Web Tab widget pointing to the **Slate HTTPS root URL**. Keep the current internally hosted widget unchanged for comparison.
7. Test CRM SDK initialisation (`ZOHO.embeddedApp.init`), record/page context, CRM reads, related-list permissions, Notes/Tasks, and iframe/CSP policies inside Zoho CRM.
8. Do not expose the planned staff Catalyst screening/assessment routes until authenticated staff authorisation is implemented and tested.

## Acceptance checks for initial hosting

- Slate serves `/` as the Staff Workspace HTML, loading three CSS files and `widget.js` without 404s.
- Page operates inside the external CRM Web Tab and receives correct CRM SDK context.
- Actual CRM record list and detail views work under a permitted sandbox staff profile.
- Updates pushed to this **branch** generate a successful new Slate deployment; refresh uses new asset versions subject to browser/CDN caching.
- No source or build step includes private Stripe, Catalyst, Creator or Analytics tokens.
- **V1.1 functionality is only a test candidate**, not the planned full V1.2 interface or a working screening/payment application.

## Architecture and future migration

Slate hosts the **frontend only**. CRM fields, records, actions and metadata continue through the Zoho CRM Embedded App SDK/authorised APIs. The existing Portal Catalyst function `beauty_guild_api` remains responsible for **server-side pricing and screening**, with new protected staff routes to be built. Portal V2's customer identity must not be reused as a staff authorisation shortcut.

The current source is **static HTML/CSS/JS**, so Static is the correct framework now. If the V1.2 rebuild later migrates to React/Vite, update the Slate framework/build/output settings and app root deliberately. Do not select React merely because Portal V2 uses React.

The branch was created from the then-latest `main` and its widget subtree was brought in from the Staff Workspace V1.1 feature. This keeps the Portal V2 source present for V1.2 integration without merging the widget into `main`.
