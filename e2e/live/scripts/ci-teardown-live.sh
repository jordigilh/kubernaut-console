#!/usr/bin/env bash
# Tear down only resources owned by this live-E2E invocation.
set +e

args=(
  --mode "${MODE}"
  --hub-kubeconfig "${HUB_KUBECONFIG}"
  --hub-cluster-name "${HUB_CLUSTER_NAME}"
  --state-file "${LIVE_E2E_STATE_FILE}"
)
if [[ "${MODE}" == "fleet" ]]; then
  args+=(--spoke-kubeconfig "${SPOKE_KUBECONFIG}" --spoke-cluster-name "${SPOKE_CLUSTER_NAME}")
fi
e2e/live/scripts/kind-teardown.sh "${args[@]}"
