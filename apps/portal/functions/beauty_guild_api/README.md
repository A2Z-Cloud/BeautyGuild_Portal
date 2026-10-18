# beauty_guild_api (Portal V2 backend, Advanced I/O)

Express function served at `/server/beauty_guild_api/*` on the BeautyGuildPortal Catalyst project.
It is a new, deliberately small function, not a copy of the V1 `beauty_guild_api`.

## Scope (Milestone 2, read-only)

| Route | Purpose | Upstream |
| --- | --- | --- |
| `GET /courses` | Active GTi courses | Zoho CRM `Courses` via a Catalyst Connection (cached 5 minutes) |
| `GET /address/find?text=&container=` | Address suggestions | Loqate |
| `GET /address/retrieve?id=` | One address, mapped to portal fields | Loqate |
| `GET /health` | Liveness, returns `{ok:true}` | none |

Anything other than GET returns 405 and every other path returns 404. There are no CRM writes,
payments, documents or contact lookups. Those need the verified Catalyst user to CRM Contact
mapping first (see `docs/api-contracts/milestone-2.md`).

Responses on failure are `{error, code}` with a fixed message. Upstream bodies, URLs and keys are
never returned or logged. Address routes are rate limited per client (best effort, per instance).

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

**Switching features on and off:** on/off switches live in `~/Documents/GitHub/BGV2-env/feature-flags.env` (or `BGV2_FLAGS_FILE`), outside the repo, for example `PORTAL_RECORDS_ENABLED=true`. The script sends only the switches it knows about; billing is deliberately excluded. To switch a feature off, remove its line and run the script again. Client-side switches are `VITE_` flags set when building (for example `VITE_PORTAL_RECORDS=true`), so rebuild and redeploy the client too.

Then check `https://<project-domain>/server/beauty_guild_api/health`. Build the client with
`VITE_DATA_MODE=api VITE_API_BASE_URL=/server/beauty_guild_api VITE_ENABLED_LEGACY_APIS=courses,address`
to use these routes from the portal.
