#!/usr/bin/env bash
# Dispatch the shared prerequisite seeding for every live topology.
set -euo pipefail

: "${MODE:?MODE is required}"
: "${HUB_KUBECONFIG:?HUB_KUBECONFIG is required}"

args=(--mode "${MODE}" --hub-kubeconfig "${HUB_KUBECONFIG}")
args+=(--scenarios-dir "${LIVE_E2E_SCENARIOS_DIR}")
if [[ "${MODE}" == "fleet" ]]; then
  args+=(--spoke-kubeconfig "${SPOKE_KUBECONFIG}")
fi
e2e/live/scripts/kind-seed-prerequisites.sh "${args[@]}"
