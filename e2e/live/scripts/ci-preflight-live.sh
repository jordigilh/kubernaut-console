#!/usr/bin/env bash
# Dispatch the shared live topology preflight with the mode-specific inputs.
set -euo pipefail

: "${MODE:?MODE is required}"
: "${HUB_KUBECONFIG:?HUB_KUBECONFIG is required}"
: "${HUB_CLUSTER_NAME:?HUB_CLUSTER_NAME is required}"
: "${LIVE_E2E_SETUP_MANIFEST:?LIVE_E2E_SETUP_MANIFEST is required}"
: "${KUBERNAUT_OPERATOR_IMAGE:?KUBERNAUT_OPERATOR_IMAGE is required}"

args=(
  --mode "${MODE}"
  --hub-kubeconfig "${HUB_KUBECONFIG}"
  --hub-cluster-name "${HUB_CLUSTER_NAME}"
  --runtime-manifest "${LIVE_E2E_SETUP_MANIFEST}"
  --image-tag "${ARTIFACT_TAG}"
  --operator-image "${KUBERNAUT_OPERATOR_IMAGE}"
)
if [[ "${MODE}" == "fleet" ]]; then
  args+=(--spoke-kubeconfig "${SPOKE_KUBECONFIG}" --spoke-cluster-name "${SPOKE_CLUSTER_NAME}")
fi
e2e/live/scripts/kind-preflight.sh "${args[@]}"
