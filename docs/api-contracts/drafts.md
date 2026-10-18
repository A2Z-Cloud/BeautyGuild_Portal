# Portal V2 durable drafts

GitHub source only; no Catalyst environment changed. Draft storage uses **Catalyst DataStore**, not direct CRM draft creation. Synchronisation to CRM on completion must be implemented separately. Enable explicitly with function environment `PORTAL_DRAFTS_ENABLED=true`, `PORTAL_DRAFT_TABLE=Portal_Drafts`; frontend `VITE_DATA_MODE=api`, `VITE_CATALYST_AUTH=true`, `VITE_PORTAL_DRAFTS=true`, `VITE_API_BASE_URL=/server/beauty_guild_api`.

## Manual DataStore table setup (Development first)
Table: `Portal_Drafts`. Columns: `Owner_User_ID` (string, 30), `Service` (string, 30), `Step` (integer), `Payload` (long-text/large string >= 45,000 characters), `Status` (string, 30), `Revision` (integer), `Updated_At` (string, 40). Catalyst supplies `ROWID`. Configure admin-only table access and no direct App User table reads. Do not expose other users' data.

## Routes
`GET /portal/drafts`, `POST /portal/drafts`, `GET/PUT/DELETE /portal/drafts/:id`. Signed-in **confirmed** Catalyst user required; server derives `user_id`, never trusts browser Contact ID. Conflicts return 409 on revision mismatch; updates currently use read-then-update and are **not atomically compare-and-swap**. Before high-concurrency Production deployment implement atomic revision control, indexed owner lookup and retention/deletion policy. Large table scans are bounded and fail closed.

Draft save is explicitly opt-in. Unauthenticated users should sign in, then return to the journey. Drafts are **not** application submission, CRM records or insurance cover.
