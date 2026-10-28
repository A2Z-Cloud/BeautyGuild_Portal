#!/usr/bin/env bash
# Is the Development function running the code you think it is? Asks the live function which commit it was built from (GET /health) and
# compares it with the commit you expect: the one given as the first argument, else the latest origin/main.
# Exit 0: it matches. Exit 1: it does not, or the function reports no build (it is running code from before this check existed).
#
# Usage: scripts/verify-function.sh              (expects origin/main)
#        scripts/verify-function.sh 1a2b3c4d     (expects that commit)
#        BGV2_VERIFY_TRIES=1 scripts/verify-function.sh   (one attempt, no waiting)
set -euo pipefail
cd "$(dirname "$0")/.."

FUNCTION_URL="${BGV2_FUNCTION_URL:-https://beautyguildportal-20117268527.development.catalystserverless.eu/server/beauty_guild_api}"
TRIES="${BGV2_VERIFY_TRIES:-12}"
if [ -n "${1:-}" ]; then
  EXPECTED="$1"
else
  git fetch -q origin main 2>/dev/null || true
  EXPECTED="$(git rev-parse --short=8 origin/main)"
fi

live=""
for i in $(seq 1 "$TRIES"); do
  body="$(curl -sS -m 20 "$FUNCTION_URL/health" 2>/dev/null || true)"
  live="$(printf '%s' "$body" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const b=JSON.parse(s).build;console.log(b?b.commit+(b.dirty?" (uncommitted changes)":"")+" built "+(b.builtAt||"?"):"none")}catch{console.log("unreachable")}})')"
  case "$live" in "$EXPECTED"*) echo "OK: the live function was built from $live"; exit 0;; esac
  [ "$i" -lt "$TRIES" ] && sleep 5
done
echo "NOT THE EXPECTED VERSION. Live: $live. Expected: $EXPECTED." >&2
case "$live" in
  none) echo "The live function reports no build, so it is running code from before this check existed (or someone deployed an older copy)." >&2;;
  unreachable) echo "The live function did not answer." >&2;;
  *) echo "Someone may have deployed a different version since. Deploy again from an up to date main, and ask the team who else deploys." >&2;;
esac
exit 1
