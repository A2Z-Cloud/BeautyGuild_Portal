# beauty_guild_api (Portal V2 backend, Advanced I/O)

Express function served at `/server/beauty_guild_api/*` on the BeautyGuildPortal Catalyst project.
It is a new, deliberately small function, not a copy of the V1 `beauty_guild_api`.

## Routes

Everything is served under `/server/beauty_guild_api`. Routes behind a switch return 503 (or 404 for diagnostics) while it is off.
"Signed in" means a confirmed Catalyst user whose verified email matches exactly one CRM Contact; every record is also checked to belong to that Contact.

| Method and path | Switch | Auth | Touches | Purpose |
| --- | --- | --- | --- | --- |
| `GET /health` | none | public | none | Liveness |
| `GET /courses` | none | public | CRM `Courses` | Active GTi courses (cached 5 minutes) |
| `GET /address/find`, `GET /address/retrieve` | none | public, rate limited | Loqate | Address suggestions and one address |
| `GET /public/verify/:number` | `PUBLIC_SCHOOL_VERIFICATION_ENABLED` | public, rate limited | CRM accreditation records | Public school status by registration number |
| `GET /portal/records`, `/portal/records/summary`, `/portal/records/:kind/:id` | `PORTAL_RECORDS_ENABLED` | signed in | CRM `Deals`, `Training_Centre_Accred`, `Insurance_Policy` | The member's memberships, accreditations and insurance (saved drafts hidden) |
| `GET /portal/documents/:kind/:id`, `.../file/:fileId` | `PORTAL_DOCUMENTS_ENABLED` | signed in | CRM, WorkDrive | Document folders and downloads for an owned record |
| `GET /portal/management/schools`, `/schools/:id/:section`, `/schools/:id/course-options`, `/schools/:id/sessions/:sessionId/bookings`, `/invoices`, `/memberships/:id/invoices`, `/memberships/:id/extensions` | `PORTAL_SCHOOL_SERVICES_ENABLED` | signed in | CRM, Creator | School workspace, invoices and membership add-ons |
| `POST /portal/management/schools/:id/qualifications`, `/sessions`, `/tutors`, `/sessions/:sessionId/bookings` | `PORTAL_SCHOOL_SERVICES_ENABLED` and `PORTAL_SCHOOL_WRITES_ENABLED` | signed in | CRM, Creator | Add qualifications, course dates, tutors and bookings |
| `GET /portal/checkout/quote`, `POST /portal/checkout/quote` | `PORTAL_BILLING_ENABLED` | signed in | CRM, Stripe (prices) | Server-built price summary; the POST form carries insurance answers |
| `POST /portal/checkout` | `PORTAL_BILLING_ENABLED` | signed in, rate limited | CRM, Stripe | Creates the Stripe Checkout Session for an accreditation, venue, membership add-ons, membership or insurance. Creator handles payment afterwards. Needs a `sk_test_` key |
| `GET /portal/vouchers` | `PORTAL_VOUCHERS_ENABLED` | signed in | CRM `Discount_Voucher` (module name is a setting: `PORTAL_VOUCHER_MODULE`) | The member's own £25 GTi voucher; the code is shown only while usable. Read only: Creator issues and voids it |
| `POST/GET/PUT/DELETE /portal/drafts...` | `PORTAL_CRM_DRAFTS_ENABLED` | signed in | CRM | Saved applications (membership and insurance) |
| `GET /portal/diagnostics/modules`, `/fields`, `/find` | `PORTAL_DIAGNOSTICS_ENABLED` and an email allow-list | signed in, allow-listed | CRM metadata only | Read-only field and module names while connecting the CRM |

Failures return `{error, code}` with a fixed message. Upstream bodies, URLs and keys are never returned or logged. Pricing and
checkout are described in `docs/api-contracts/pricing-payments.md`.

## Environment variables (never committed)

Sent on deploy by `scripts/deploy-functions.sh` (see below). They can also be viewed in the console:
Serverless > Functions > `beauty_guild_api` > Configuration > Environment Variables.

| Name | Required | Notes |
| --- | --- | --- |
| `LOQATE_API_KEY` | yes (address) | Secret. Without it address routes return 503 |
| `LOQATE_API_BASE_URL` | no | Default `https://api.addressy.com` |
| `LOQATE_COUNTRY_FILTER` | no | e.g. `GBR` |
| `LOQATE_MAX_RESULTS` | no | Default 40, max 100 |
| `CRM_API_DOMAIN` | no | Default `https://www.zohoapis.eu`, https origin only |
| `CRM_CONNECTION_NAME` | no | Default `zohocrm` |

## Catalyst Connection required for `/courses`

Connections are per project. Create a Zoho CRM connection in the **BeautyGuildPortal** console
named to match `CRM_CONNECTION_NAME` (default `zohocrm`) with scope `ZohoCRM.modules.courses.READ`
(or `ZohoCRM.modules.ALL` if the narrower scope is not offered). Use a CRM user with read access
to the Courses module only.

## Develop and test

~~~sh
cd apps/portal/functions/beauty_guild_api
npm install
npm test          # unit tests, no network or Catalyst needed
~~~

## Deploy (Development)

~~~sh
cd apps/portal
scripts/deploy-functions.sh
~~~

The script reads the variables above from a local file outside the repo
(`~/Documents/GitHub/BGV2-env/Key-Development-Value.txt`, or set `BGV2_ENV_FILE`), sends only the
variables this function needs through `deployment.env_variables` in `catalyst-config.json`, then
restores the file so no secrets are left in the repo. A plain `catalyst deploy --only functions`
also keeps the existing values, but the script is the way to change them.

**Switching features on and off:** on/off switches live in `~/Documents/GitHub/BGV2-env/feature-flags.env` (or `BGV2_FLAGS_FILE`), outside the repo, for example `PORTAL_RECORDS_ENABLED=true`. The script sends only the switches and settings it knows about, including `PORTAL_BILLING_ENABLED`, `PORTAL_PUBLIC_ORIGIN`, and `STRIPE_SECRET_KEY` (never the Stripe webhook secret: Creator owns the webhook; prices are found by lookup key, so no price IDs are sent). To switch a feature off, remove its line and run the script again. Client-side switches are `VITE_` flags set when building (for example `VITE_PORTAL_RECORDS=true`), so rebuild and redeploy the client too.

Then check `https://<project-domain>/server/beauty_guild_api/health`. Build the client with
`VITE_DATA_MODE=api VITE_API_BASE_URL=/server/beauty_guild_api VITE_ENABLED_LEGACY_APIS=courses,address`
to use these routes from the portal.

The script refuses to deploy from a checkout that does not include the latest `origin/main`, because the Development function is shared and a deploy replaces all of it: an older checkout would silently put older code live. It stamps the deployment with the commit it was built from, and after deploying it asks the live function what it is running (`GET /health` returns `build.commit`) and fails loudly if that is not what it just deployed.

To check at any time whether the live function is the version you expect (for example if the staff routes suddenly return 404):

~~~sh
scripts/verify-function.sh               # expects the latest origin/main
scripts/verify-function.sh 1a2b3c4d      # expects that commit
~~~

