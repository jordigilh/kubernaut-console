#!/usr/bin/env bash
# Bootstrap every live lane through upstream's supported Make
# targets. The Make targets remain the canonical wrapper around
# hack/setup-demo-infra and keep CI aligned with the upstream developer path.
set -euo pipefail

: "${MODE:?MODE is required}"
: "${KUBERNAUT_ROOT:=${GITHUB_WORKSPACE:-$(pwd)}/kubernaut}"
: "${HUB_KUBECONFIG:?HUB_KUBECONFIG is required}"
: "${LLM_PROVIDER:?LLM_PROVIDER is required}"
: "${LLM_MODEL:?LLM_MODEL is required}"
: "${LLM_ENDPOINT:?LLM_ENDPOINT is required}"
: "${LLM_CREDENTIAL_FILE:?LLM_CREDENTIAL_FILE is required}"
: "${ARTIFACT_TAG:?ARTIFACT_TAG is required}"
: "${KUBERNAUT_OPERATOR_IMAGE:?KUBERNAUT_OPERATOR_IMAGE is required}"
: "${KUBERNAUT_OPERATOR_CHART_PATH:?KUBERNAUT_OPERATOR_CHART_PATH is required}"
: "${KUBERNAUT_DEPENDENCY_CHART_PATH:?KUBERNAUT_DEPENDENCY_CHART_PATH is required}"
: "${LIVE_E2E_SCENARIOS_DIR:?LIVE_E2E_SCENARIOS_DIR is required}"
: "${LIVE_E2E_NS_SUFFIX:?LIVE_E2E_NS_SUFFIX is required}"

case "${MODE}" in
  local|fullpipeline) target="setup-local-demo-infra" ;;
  fleet) target="setup-fleet-demo-infra" ;;
  *) echo "error: unsupported live E2E mode: ${MODE}" >&2; exit 2 ;;
esac
echo "Using upstream Make target: ${target}"

make_vars=(
  "KUBECONFIG=${HUB_KUBECONFIG}"
  "LLM_PROVIDER=${LLM_PROVIDER}"
  "LLM_MODEL=${LLM_MODEL}"
  "LLM_ENDPOINT=${LLM_ENDPOINT}"
  "LLM_CREDENTIALS_FILE=${LLM_CREDENTIAL_FILE}"
  "VERTEX_PROJECT=${VERTEX_PROJECT:-}"
  "VERTEX_LOCATION=${VERTEX_LOCATION:-}"
  "IMAGE_REPOSITORY=localhost"
  "IMAGE_TAG=${ARTIFACT_TAG}"
  "OPERATOR_IMAGE=${KUBERNAUT_OPERATOR_IMAGE}"
  "KUBERNAUT_OPERATOR_IMAGE=${KUBERNAUT_OPERATOR_IMAGE}"
  "KUBERNAUT_OPERATOR_IMAGE_TAR=${KUBERNAUT_OPERATOR_IMAGE_TAR:-}"
  "KUBERNAUT_OPERATOR_CHART_PATH=${KUBERNAUT_OPERATOR_CHART_PATH}"
  "KUBERNAUT_DEPENDENCY_CHART_PATH=${KUBERNAUT_DEPENDENCY_CHART_PATH}"
  "SP_POLICY_FILE=${LIVE_E2E_SCENARIOS_DIR}/deploy/defaults/signalprocessing-policy.rego"
  "AA_POLICY_FILE=${LIVE_E2E_SCENARIOS_DIR}/deploy/defaults/approval-policy.rego"
  "CLUSTER_NAME=${HUB_CLUSTER_NAME}"
)
if [[ "${MODE}" == "fleet" ]]; then
  make_vars+=("GATEWAY_TYPE=${GATEWAY_TYPE}" "REMOTE_CLUSTER_NAME=${SPOKE_CLUSTER_NAME}")
fi

env "${make_vars[@]}" make -C "${KUBERNAUT_ROOT}" "${target}"

if [[ -n "${GITHUB_ENV:-}" ]]; then
  echo "LIVE_E2E_PROVISIONER_TARGET=make ${target}" >> "${GITHUB_ENV}"
fi
