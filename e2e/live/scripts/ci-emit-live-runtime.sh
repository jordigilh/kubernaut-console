#!/usr/bin/env bash
# Emit the sanitized runtime manifest and export its URL/identity values.
set -euo pipefail

: "${MODE:?MODE is required}"
: "${ARTIFACT_TAG:?ARTIFACT_TAG is required}"
: "${CONSOLE_SHA:?CONSOLE_SHA is required}"
: "${KUBERNAUT_SHA:?KUBERNAUT_SHA is required}"
: "${OPERATOR_SHA:?OPERATOR_SHA is required}"
: "${SCENARIOS_SHA:?SCENARIOS_SHA is required}"

e2e/live/scripts/kind-runtime-manifest.sh \
  --mode "${MODE}" \
  --hub-kubeconfig "${HUB_KUBECONFIG}" \
  --spoke-kubeconfig "${SPOKE_KUBECONFIG}" \
  --hub-cluster-name "${HUB_CLUSTER_NAME}" \
  --spoke-cluster-name "${SPOKE_CLUSTER_NAME}" \
  --output "${LIVE_E2E_SETUP_MANIFEST}" \
  --console-url "${LIVE_E2E_CONSOLE_URL}" \
  --api-frontend-url "${LIVE_E2E_API_FRONTEND_URL}" \
  --keycloak-url "${LIVE_E2E_KEYCLOAK_URL}" \
  --artifact-tag "${ARTIFACT_TAG}" \
  --console-sha "${CONSOLE_SHA}" \
  --kubernaut-sha "${KUBERNAUT_SHA}" \
  --operator-sha "${OPERATOR_SHA}" \
  --scenarios-sha "${SCENARIOS_SHA}"
{
  echo "LIVE_E2E_CONSOLE_URL=$(jq -er '.urls.console' "${LIVE_E2E_SETUP_MANIFEST}")"
  echo "LIVE_E2E_API_FRONTEND_URL=$(jq -er '.urls.apiFrontend' "${LIVE_E2E_SETUP_MANIFEST}")"
  echo "LIVE_E2E_KEYCLOAK_URL=$(jq -er '.urls.keycloak' "${LIVE_E2E_SETUP_MANIFEST}")"
  echo "LIVE_E2E_TARGET_KUBECONFIG=$(jq -er '.kubeconfigs.target' "${LIVE_E2E_SETUP_MANIFEST}")"
  if [[ "${MODE}" == "fleet" ]]; then
    echo "LIVE_E2E_FLEET_CLUSTER_ID=$(jq -er '.fleet.remoteClusterID' "${LIVE_E2E_SETUP_MANIFEST}")"
    echo "LIVE_E2E_GATEWAY_TYPE=$(jq -er '.fleet.gateway.type' "${LIVE_E2E_SETUP_MANIFEST}")"
    echo "LIVE_E2E_GATEWAY_ENDPOINT=$(jq -er '.fleet.gateway.endpoint' "${LIVE_E2E_SETUP_MANIFEST}")"
  else
    echo "LIVE_E2E_FLEET_CLUSTER_ID="
    echo "LIVE_E2E_GATEWAY_TYPE=none"
    echo "LIVE_E2E_GATEWAY_ENDPOINT="
  fi
} >> "${GITHUB_ENV}"
