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
ENV_FILE="${BGV2_ENV_FILE:-$HOME/Documents/GitHub/BGV2-env/Key-Development-Value.txt}"
CONFIG="functions/beauty_guild_api/catalyst-config.json"
ALLOWED="LOQATE_API_KEY LOQATE_API_BASE_URL LOQATE_COUNTRY_FILTER LOQATE_MAX_RESULTS CRM_API_DOMAIN CRM_CONNECTION_NAME"

[ -f "$ENV_FILE" ] || { echo "Env file not found: $ENV_FILE" >&2; exit 1; }
if git ls-files --error-unmatch "$ENV_FILE" >/dev/null 2>&1; then
  echo "Refusing to use an env file that is tracked by git." >&2; exit 1
fi

BACKUP="$(mktemp)"
cp "$CONFIG" "$BACKUP"
restore() { cp "$BACKUP" "$CONFIG"; rm -f "$BACKUP"; }
trap restore EXIT

ENV_FILE="$ENV_FILE" CONFIG="$CONFIG" ALLOWED="$ALLOWED" node -e '
const fs = require("fs");
const allowed = new Set(process.env.ALLOWED.split(" "));
const vars = {};
for (const line of fs.readFileSync(process.env.ENV_FILE, "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*[=:\t ]\s*(.*?)\s*$/);
  if (m && allowed.has(m[1]) && m[2] !== "") vars[m[1]] = m[2].replace(/^["\x27]|["\x27]$/g, "");
}
const config = JSON.parse(fs.readFileSync(process.env.CONFIG, "utf8"));
config.deployment.env_variables = vars;
fs.writeFileSync(process.env.CONFIG, JSON.stringify(config, null, 2) + "\n");
console.log("Sending variables:", Object.keys(vars).join(", ") || "(none)");
'

catalyst deploy --only functions
echo "Done. $CONFIG restored (no secrets left in the repo)."
