#!/usr/bin/env bash
# Collect redacted diagnostics for either live topology.
set +e

args=(
  --mode "${MODE}"
  --hub-kubeconfig "${HUB_KUBECONFIG}"
  --output "${LIVE_E2E_DIAGNOSTICS_ROOT}"
)
if [[ "${MODE}" == "fleet" ]]; then
  args+=(--spoke-kubeconfig "${SPOKE_KUBECONFIG}")
fi
if [[ "${MODE}" == "fullpipeline" ]]; then
  args+=(--native-log "${LIVE_E2E_NATIVE_LOG}")
fi
e2e/live/scripts/collect-kind-diagnostics.sh "${args[@]}"
