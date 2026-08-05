#!/usr/bin/env bash
# Deletes every namespace provisioned by the most recent setup-fixtures.sh
# run (read from its $HOME-based fixtures.env, never from the workspace) and
# removes the state file.
#
# Usage:
#   e2e/live/scripts/teardown-fixtures.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATE_DIR="${KUBERNAUT_E2E_STATE_DIR:-$HOME/.config/kubernaut-console-e2e}"
FIXTURES_ENV_FILE="$STATE_DIR/fixtures.env"
FIXTURES_LIST="$SCRIPT_DIR/fixtures.list"

if [[ ! -f "$FIXTURES_ENV_FILE" ]]; then
  echo "No fixtures.env found at $FIXTURES_ENV_FILE — nothing to tear down." >&2
  exit 0
fi

# shellcheck disable=SC1090
source "$FIXTURES_ENV_FILE"
SUFFIX="${LIVE_E2E_NS_SUFFIX:-}"
if [[ -z "$SUFFIX" ]]; then
  echo "error: $FIXTURES_ENV_FILE has no LIVE_E2E_NS_SUFFIX, refusing to guess" >&2
  exit 1
fi

echo "Tearing down fixture namespaces for suffix '$SUFFIX'..."
while IFS='|' read -r base type; do
  [[ -z "$base" || "$base" == \#* ]] && continue
  [[ "$type" == "none" ]] && continue
  ns="${base}-${SUFFIX}"
  echo "Deleting namespace $ns..."
  oc delete namespace "$ns" --wait=false --ignore-not-found >/dev/null
done < "$FIXTURES_LIST"

rm -f "$FIXTURES_ENV_FILE"
echo "Done. Namespace deletion continues asynchronously in the background (--wait=false)."
