#!/usr/bin/env bash
# Build the portal client in LIVE mode and deploy it to the Catalyst Development web client hosting.
#
# Why a script: the client reads its settings at build time. A build without these VITE_ flags is a demo build
# ("Catalyst Authentication is not connected", "Prices and payment are not available yet"), and deploying one takes sign-in
# and prices away from every tester. So the flags live here, and the script refuses to deploy a build that is not live.
# None of these are secrets: no Zoho, Stripe, Catalyst or OAuth secret may ever be put in a VITE_ variable.
#
# Usage: scripts/deploy-client.sh               build, check, deploy
#        scripts/deploy-client.sh --build-only  build and check, do not deploy
set -euo pipefail

cd "$(dirname "$0")/.."

export VITE_PUBLIC_BASE=/app/
export VITE_DATA_MODE=api
export VITE_API_BASE_URL=/server/beauty_guild_api
export VITE_ENABLED_LEGACY_APIS=courses,address
export VITE_CATALYST_AUTH=true
export VITE_PORTAL_RECORDS=true
export VITE_PORTAL_DOCUMENTS=true
export VITE_PORTAL_SCHOOL_SERVICES=true
export VITE_PORTAL_SCHOOL_WRITES=true
export VITE_PORTAL_BILLING=true
export VITE_PORTAL_CRM_DRAFTS=true
export VITE_PORTAL_CRM_ACCREDITATION=true
export VITE_PORTAL_PUBLIC_QUOTES=true
export VITE_PUBLIC_SCHOOL_VERIFICATION=true

# vite build (not npm run build) so the flags above are exactly what is compiled; public/client-package.json is copied into dist/ by the build.
npx vite build

# Refuse to ship a demo build: the compiled bundle must carry the live data mode.
if ! grep -q 'DATA_MODE:"api"' dist/assets/*.js; then
  echo "Refusing to deploy: dist/ is not a live build (VITE_DATA_MODE=api is not compiled in)." >&2
  exit 1
fi
[ -f dist/client-package.json ] || { echo "Refusing to deploy: dist/client-package.json is missing." >&2; exit 1; }

if [ "${1:-}" = "--build-only" ]; then
  echo "Built a live client in dist/. Not deployed (--build-only)."
  exit 0
fi

catalyst deploy --only client

echo "Deployed. Check the live portal before telling anyone: the sign-in page should embed the Catalyst form"
echo "(an iframe to /accounts/p/.../signin) and no 'opening soon' or 'not connected' messages should show."
