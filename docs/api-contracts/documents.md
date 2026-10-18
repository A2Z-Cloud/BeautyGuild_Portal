# Member-owned WorkDrive documents (PR 4 of 4)

Authenticated reads and downloads are scoped to a **CRM record owned by the signed-in Catalyst user**. Supported kinds are membership, accreditation and insurance, subject to actual CRM `Workdrive_Link` availability. The root folder is resolved by the backend from the authorised CRM record. Every nested folder is checked by listing parent contents. Downloads are allowed only for a file found as a child of that verified folder. Arbitrary WorkDrive IDs and folder URLs are never accepted from the browser as authority.

Routes: `GET /portal/documents/:kind/:id?path=folder1.folder2` and `GET /portal/documents/:kind/:id/file/:fileId?path=...`. The backend proxies WorkDrive bytes via a Zoho Connection and limits downloads to 20MB with attachment disposition. **No public WorkDrive sharing links.**

Function environment: `PORTAL_DOCUMENTS_ENABLED=true`, `WORKDRIVE_CONNECTION_NAME=zohoworkdrive`, `WORKDRIVE_API_DOMAIN=https://www.zohoapis.eu`; frontend: `VITE_PORTAL_DOCUMENTS=true` with API mode, verified records and Catalyst auth. Verify read scopes and cross-contact denial using two user accounts. Hardening before Production: use immutable Contact binding; test all WorkDrive folder URL shapes; pagination beyond WorkDrive's default listing; file size/mimetype restrictions and audit logging.

**Independent of drafts:** this branch sits on records and payment foundations only. WorkDrive `Workdrive_Link` field availability and nested folder API shapes require verification against live CRM metadata before enabling the feature.
