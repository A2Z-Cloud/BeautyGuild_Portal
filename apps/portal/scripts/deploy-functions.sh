#!/usr/bin/env bash
# Deploy beauty_guild_api to the Catalyst Development environment WITH its environment variables.
#
# Values are read from a local file kept OUTSIDE the repo and are injected into the function's
# catalyst-config.json (deployment.env_variables) only for the duration of the deploy, then the
# file is restored. Secrets are never committed, and because every deploy re-sends them a
# deploy cannot leave the function without its variables. Only the variables listed below are
# sent; the env file may hold others (Stripe, Creator, WorkDrive) that this function must not get.
#
# Usage: scripts/deploy-functions.sh            (from anywhere)
#        BGV2_ENV_FILE=/path/to/file scripts/deploy-functions.sh
set -euo pipefail

cd "$(dirname "$0")/.."

# The function is packaged with whatever is in its node_modules. A link, or a missing or empty folder, ships a package with no
# dependencies and takes the function down, so refuse before anything is changed. Fix with: npm ci (in functions/beauty_guild_api).
FN_MODULES="functions/beauty_guild_api/node_modules"
if [ -L "$FN_MODULES" ]; then
  echo "Refusing to deploy: $FN_MODULES is a link. Replace it with real dependencies: cd functions/beauty_guild_api && rm node_modules && npm ci" >&2; exit 1
fi
if [ ! -d "$FN_MODULES/express" ]; then
  echo "Refusing to deploy: $FN_MODULES is missing or incomplete. Run: cd functions/beauty_guild_api && npm ci" >&2; exit 1
fi
# The Development function is shared, and a deploy replaces all of it. A checkout that is behind main would silently put older code live
# (and wipe newer settings), so refuse unless this checkout contains the latest origin/main. Override only on purpose: BGV2_ALLOW_STALE=1.
if [ "${BGV2_ALLOW_STALE:-}" != "1" ]; then
  git fetch -q origin main 2>/dev/null || echo "Warning: could not fetch origin/main, so the check that this checkout is up to date was skipped." >&2
  if git rev-parse -q --verify origin/main >/dev/null && ! git merge-base --is-ancestor origin/main HEAD; then
    echo "Refusing to deploy: this checkout does not include the latest origin/main ($(git rev-parse --short=8 origin/main)). Update it first (git pull), or set BGV2_ALLOW_STALE=1 if you really mean to deploy older code." >&2; exit 1
  fi
fi
COMMIT="$(git rev-parse --short=8 HEAD)"
if [ -n "$(git status --porcelain -- functions/beauty_guild_api)" ]; then DIRTY=true; else DIRTY=false; fi
BUILD_INFO="functions/beauty_guild_api/build-info.json"
ENV_FILE="${BGV2_ENV_FILE:-$HOME/Documents/GitHub/BGV2-env/Key-Development-Value.txt}"
CONFIG="functions/beauty_guild_api/catalyst-config.json"
FLAGS_FILE="${BGV2_FLAGS_FILE:-$HOME/Documents/GitHub/BGV2-env/feature-flags.env}"
# Secrets and connection settings come from ENV_FILE; on/off switches come from FLAGS_FILE (optional).
# Staff API (src/staff.js): STAFF_API_SECRET and STAFF_API_SECRET_PREVIOUS are the signing secrets shared with the CRM function. The on/off
# switch and the allowed CRM roles come from the flags file. Off unless PORTAL_STAFF_API_ENABLED is true.
# Stripe: only the secret key is sent, never Creator's webhook secret (the function has no webhook of its own)
# webhook secret (STRIPE_WEBHOOK_SECRET): Creator owns that webhook. Prices are found by lookup key, so no price IDs are sent.
# The checkout itself refuses anything but an sk_test_ key.
ALLOWED="LOQATE_API_KEY LOQATE_API_BASE_URL LOQATE_COUNTRY_FILTER LOQATE_MAX_RESULTS CRM_API_DOMAIN CRM_CONNECTION_NAME CREATOR_API_DOMAIN CREATOR_CONNECTION_NAME CREATOR_ACCOUNT_OWNER CREATOR_APP_LINK_NAME CREATOR_INVOICES_REPORT WORKDRIVE_API_DOMAIN WORKDRIVE_CONNECTION_NAME STRIPE_SECRET_KEY ANALYTICS_CONNECTION_NAME ANALYTICS_API_DOMAIN ANALYTICS_ORG_ID ANALYTICS_WORKSPACE_ID ANALYTICS_SANCTIONS_TABLE CREATOR_RISK_APP_LINK_NAME CREATOR_RISK_FLOOD_REPORT CREATOR_RISK_SUBSIDENCE_REPORT STAFF_API_SECRET STAFF_API_SECRET_PREVIOUS"
FLAG_NAMES="PORTAL_DIAGNOSTICS_ENABLED PORTAL_DIAGNOSTICS_EMAILS PORTAL_DIAGNOSTICS_DOMAINS PORTAL_RECORDS_ENABLED PORTAL_DOCUMENTS_ENABLED PORTAL_SCHOOL_SERVICES_ENABLED PORTAL_SCHOOL_WRITES_ENABLED PORTAL_CRM_DRAFTS_ENABLED PORTAL_CRM_DRAFT_STATUS PORTAL_CRM_DRAFT_DEAL_STAGE PORTAL_CRM_DRAFT_REQUIRE_UNIQUE PORTAL_CRM_ACCREDITATION_ENABLED PUBLIC_SCHOOL_VERIFICATION_ENABLED PUBLIC_SCHOOL_REGISTRATION_MODULE PUBLIC_SCHOOL_REGISTRATION_FIELD PUBLIC_SCHOOL_ACTIVE_STATUS PORTAL_BILLING_ENABLED PORTAL_DISCOUNTS_ENABLED PORTAL_DISCOUNT_REFERENCE_FIELD PUBLIC_QUOTES_ENABLED PORTAL_MEMBERSHIP_CHANGES_ENABLED PORTAL_INSURANCE_CHANGES_ENABLED PORTAL_INSURANCE_CHANGES_WRITES PORTAL_INSURANCE_CHANGES_PAYMENT PORTAL_REVISION_NAME_PREFIX PORTAL_PUBLIC_ORIGIN PORTAL_RISK_SANCTIONS PORTAL_RISK_FLOOD PORTAL_RISK_SUBSIDENCE PORTAL_RISK_SANCTIONS_THRESHOLD PORTAL_RISK_SANCTIONS_MAX_AGE_HOURS PORTAL_RISK_SANCTIONS_ROW_FLOOR PORTAL_GUILD_PHONE PORTAL_QUALIFICATION_CENTRE_FIELD PORTAL_STAFF_API_ENABLED PORTAL_STAFF_API_ROLES PORTAL_STAFF_API_WINDOW_SECONDS"

[ -f "$ENV_FILE" ] || { echo "Env file not found: $ENV_FILE" >&2; exit 1; }
if git ls-files --error-unmatch "$ENV_FILE" >/dev/null 2>&1; then
  echo "Refusing to use an env file that is tracked by git." >&2; exit 1
fi

BACKUP="$(mktemp)"
cp "$CONFIG" "$BACKUP"
restore() { cp "$BACKUP" "$CONFIG"; rm -f "$BACKUP" "$BUILD_INFO"; }
trap restore EXIT

ENV_FILE="$ENV_FILE" FLAGS_FILE="$FLAGS_FILE" CONFIG="$CONFIG" ALLOWED="$ALLOWED" FLAG_NAMES="$FLAG_NAMES" node -e '
const fs = require("fs");
const vars = {};
const ENVNAMES = process.env.ALLOWED;
function load(file, names) {
  if (!file || !fs.existsSync(file)) return;
  const allowed = new Set(names.split(" "));
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*[=:\t ]\s*(.*?)\s*$/);
    if (m && allowed.has(m[1]) && m[2] !== "") vars[m[1]] = m[2].replace(/^["\x27]|["\x27]$/g, "");
  }
}
load(process.env.ENV_FILE, process.env.ALLOWED);
load(process.env.FLAGS_FILE, process.env.FLAG_NAMES);
const config = JSON.parse(fs.readFileSync(process.env.CONFIG, "utf8"));
config.deployment.env_variables = vars;
fs.writeFileSync(process.env.CONFIG, JSON.stringify(config, null, 2) + "\n");
console.log("Sending variables:", Object.keys(vars).join(", ") || "(none)");
'

# Say which commit this deployment is, so GET /health can report it (removed again by restore).
printf '{"commit":"%s","dirty":%s,"builtAt":"%s"}\n' "$COMMIT" "$DIRTY" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$BUILD_INFO"

catalyst deploy --only functions
echo "Done. $CONFIG restored (no secrets left in the repo)."
# Do not trust "deployment successful": ask the live function what it is running.
"$(dirname "$0")/verify-function.sh" "$COMMIT"
