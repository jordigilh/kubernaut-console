#!/usr/bin/env bash
# Create or consume the fixture set for one live topology.
set -euo pipefail

: "${MODE:?MODE is required}"
: "${HUB_KUBECONFIG:?HUB_KUBECONFIG is required}"
: "${LIVE_E2E_STATE_FILE:?LIVE_E2E_STATE_FILE is required}"

args=(
  --mode "${MODE}"
  --hub-kubeconfig "${HUB_KUBECONFIG}"
  --state-file "${LIVE_E2E_STATE_FILE}"
)
if [[ "${MODE}" == "fullpipeline" ]]; then
  args+=(--runtime-manifest "${LIVE_E2E_SETUP_MANIFEST}")
else
  args+=(--scenarios-dir "${LIVE_E2E_SCENARIOS_DIR}" --suffix "${LIVE_E2E_NS_SUFFIX}")
  if [[ "${MODE}" == "fleet" ]]; then
    args+=(--spoke-kubeconfig "${SPOKE_KUBECONFIG}")
  fi
fi
e2e/live/scripts/kind-setup-fixtures.sh "${args[@]}"
