#!/usr/bin/env bash
# Define isolated paths and the environment contract for one live lane.
set -euo pipefail

: "${MODE:?MODE is required}"

case "${MODE}" in
  local|fleet)
    root="${RUNNER_TEMP}/kubernaut-console-live-${MODE}-${GITHUB_RUN_ID}"
    hub_cluster="kubernaut-live-${MODE}-${GITHUB_RUN_ID}"
    spoke_cluster="kubernaut-live-${MODE}-spoke-${GITHUB_RUN_ID}"
    hub_kubeconfig="${HOME}/.kube/${hub_cluster}-config"
    spoke_kubeconfig="${HOME}/.kube/${spoke_cluster}-config"
    target_kubeconfig="${hub_kubeconfig}"
    if [[ "${MODE}" == "fleet" ]]; then
      target_kubeconfig="${spoke_kubeconfig}"
    fi
    mkdir -p "${HOME}/.kube" "${root}/artifacts" "${root}/runtime" "${root}/diagnostics"
    chmod 700 "${root}" "${root}/artifacts" "${root}/runtime" "${root}/diagnostics"
    {
      echo "LIVE_E2E_ROOT=${root}"
      echo "LIVE_E2E_ARTIFACT_ROOT=${root}/artifacts"
      echo "LIVE_E2E_RUNTIME_ROOT=${root}/runtime"
      echo "LIVE_E2E_DIAGNOSTICS_ROOT=${root}/diagnostics"
      echo "HUB_CLUSTER_NAME=${hub_cluster}"
      echo "SPOKE_CLUSTER_NAME=${spoke_cluster}"
      echo "HUB_KUBECONFIG=${hub_kubeconfig}"
      echo "LIVE_E2E_HUB_KUBECONFIG=${hub_kubeconfig}"
      echo "SPOKE_KUBECONFIG=${spoke_kubeconfig}"
      echo "LIVE_E2E_STATE_FILE=${root}/fixtures.env"
      echo "LIVE_E2E_REPORT=${root}/live-e2e-kind.json"
      echo "LIVE_E2E_JSON_REPORT=${root}/live-e2e-kind.json"
      echo "LIVE_E2E_CONSOLE_URL=https://kubernaut-console.local:8843"
      echo "LIVE_E2E_API_FRONTEND_URL=https://127.0.0.1:18443"
      echo "LIVE_E2E_KEYCLOAK_URL=https://keycloak:8443/realms/kubernaut-demo"
      echo "LIVE_E2E_SETUP_MANIFEST=${root}/runtime/setup-runtime.json"
      echo "LIVE_E2E_AUTH_STATE=${root}/local-auth-state.json"
      echo "LIVE_E2E_KUBE_TOOL=kubectl"
      echo "LIVE_E2E_TARGET_KUBECONFIG=${target_kubeconfig}"
      echo "LIVE_E2E_IGNORE_HTTPS_ERRORS=true"
      echo "KUBECONFIG=${hub_kubeconfig}"
    } >> "${GITHUB_ENV}"
    ;;
  fullpipeline)
    root="${RUNNER_TEMP}/kubernaut-console-live-fullpipeline-${GITHUB_RUN_ID}"
    kubeconfig="${HOME}/.kube/fullpipeline-e2e-config"
    mkdir -p "${HOME}/.kube" "${root}/artifacts" "${root}/runtime" "${root}/diagnostics"
    chmod 700 "${root}" "${root}/artifacts" "${root}/runtime" "${root}/diagnostics"
    {
      echo "LIVE_E2E_ROOT=${root}"
      echo "LIVE_E2E_ARTIFACT_ROOT=${root}/artifacts"
      echo "LIVE_E2E_RUNTIME_ROOT=${root}/runtime"
      echo "LIVE_E2E_DIAGNOSTICS_ROOT=${root}/diagnostics"
      echo "HUB_CLUSTER_NAME=fullpipeline-e2e"
      echo "HUB_KUBECONFIG=${kubeconfig}"
      echo "LIVE_E2E_HUB_KUBECONFIG=${kubeconfig}"
      echo "LIVE_E2E_STATE_FILE=${root}/native-fixture.env"
      echo "LIVE_E2E_REPORT=${root}/live-e2e-fullpipeline.json"
      echo "LIVE_E2E_JSON_REPORT=${root}/live-e2e-fullpipeline.json"
      echo "LIVE_E2E_CONSOLE_URL=http://127.0.0.1:5174"
      echo "LIVE_E2E_API_FRONTEND_URL=https://127.0.0.1:18443"
      echo "LIVE_E2E_DEX_URL=https://127.0.0.1:30556/dex"
      echo "LIVE_E2E_SETUP_MANIFEST=${root}/runtime/setup-runtime.json"
      echo "LIVE_E2E_NATIVE_SETUP_METADATA=${root}/runtime/native-setup.json"
      echo "LIVE_E2E_NATIVE_LOG=${root}/runtime/upstream-fullpipeline.log"
      echo "LIVE_E2E_KUBE_TOOL=kubectl"
      echo "LIVE_E2E_TARGET_KUBECONFIG=${kubeconfig}"
      echo "LIVE_E2E_IGNORE_HTTPS_ERRORS=true"
      echo "KUBECONFIG=${kubeconfig}"
    } >> "${GITHUB_ENV}"
    ;;
  *)
    echo "error: unsupported MODE=${MODE}" >&2
    exit 2
    ;;
esac

if [[ "${MODE}" != "fullpipeline" ]]; then
  echo "Fixture suffix: r${GITHUB_RUN_ID}"
  echo "LIVE_E2E_NS_SUFFIX=r${GITHUB_RUN_ID}" >> "${GITHUB_ENV}"
fi
