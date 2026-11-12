#!/usr/bin/env bash
# Dispatch the mode-specific prerequisite check. FullPipeline is read-only;
# local/fleet use the pinned scenario source for their owned catalog.
set -euo pipefail

: "${MODE:?MODE is required}"
: "${HUB_KUBECONFIG:?HUB_KUBECONFIG is required}"

args=(--mode "${MODE}" --hub-kubeconfig "${HUB_KUBECONFIG}")
if [[ "${MODE}" == "fullpipeline" ]]; then
  args+=(--runtime-manifest "${LIVE_E2E_SETUP_MANIFEST}")
else
  args+=(--scenarios-dir "${LIVE_E2E_SCENARIOS_DIR}")
  if [[ "${MODE}" == "fleet" ]]; then
    args+=(--spoke-kubeconfig "${SPOKE_KUBECONFIG}")
  fi
fi
e2e/live/scripts/kind-seed-prerequisites.sh "${args[@]}"
