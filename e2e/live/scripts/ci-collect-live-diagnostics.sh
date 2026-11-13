#!/usr/bin/env bash
# Collect redacted diagnostics for one live topology.
set +e

args=(
  --mode "${MODE}"
  --hub-kubeconfig "${HUB_KUBECONFIG}"
  --output "${LIVE_E2E_DIAGNOSTICS_ROOT}"
)
if [[ "${MODE}" == "fleet" ]]; then
  args+=(--spoke-kubeconfig "${SPOKE_KUBECONFIG}")
fi
e2e/live/scripts/collect-kind-diagnostics.sh "${args[@]}"
