#!/usr/bin/env bash
# Verify this run's immutable artifacts and export the operator/chart inputs
# consumed by the upstream bootstrap.
set -euo pipefail

: "${MODE:?MODE is required}"
: "${CONSOLE_SHA:?CONSOLE_SHA is required}"
: "${KUBERNAUT_SHA:?KUBERNAUT_SHA is required}"
: "${OPERATOR_SHA:?OPERATOR_SHA is required}"
: "${SCENARIOS_SHA:?SCENARIOS_SHA is required}"
: "${ARTIFACT_TAG:?ARTIFACT_TAG is required}"

manifest="$(find "${LIVE_E2E_ARTIFACT_ROOT}" -type f -name manifest.json -print -quit)"
[[ -n "${manifest}" && -f "${manifest}" ]] || {
  echo "error: provenance manifest was not downloaded" >&2
  exit 1
}

verification_log="${LIVE_E2E_ROOT}/artifact-verification.json"
python3 e2e/live/scripts/verify-live-artifacts.py \
  --root "${LIVE_E2E_ARTIFACT_ROOT}" \
  --manifest "${manifest}" \
  --output "${LIVE_E2E_RUNTIME_ROOT}" \
  --console-sha "${CONSOLE_SHA}" \
  --kubernaut-sha "${KUBERNAUT_SHA}" \
  --operator-sha "${OPERATOR_SHA}" \
  --scenarios-sha "${SCENARIOS_SHA}" > "${verification_log}"
if [[ "${MODE}" == "fullpipeline" ]]; then
  mv "${verification_log}" "${LIVE_E2E_RUNTIME_ROOT}/verification.json"
fi

scenario_root="$(jq -er '.scenarioRoot' "${LIVE_E2E_RUNTIME_ROOT}/runtime.json")"
operator_chart="$(jq -er '.operatorChartPath' "${LIVE_E2E_RUNTIME_ROOT}/runtime.json")"
dependency_chart="$(jq -er '.dependencyChartPath' "${LIVE_E2E_RUNTIME_ROOT}/runtime.json")"
operator_image="$(jq -er '.operatorImage' "${LIVE_E2E_RUNTIME_ROOT}/runtime.json")"
operator_tar="$(find "${LIVE_E2E_ARTIFACT_ROOT}" -type f -name operator-image.tar -print -quit)"
[[ -d "${scenario_root}" && -d "${operator_chart}" && -d "${dependency_chart}" ]] || exit 1
[[ -n "${operator_tar}" && -f "${operator_tar}" ]] || exit 1

{
  echo "LIVE_E2E_SCENARIOS_DIR=${scenario_root}"
  echo "KUBERNAUT_OPERATOR_CHART_PATH=${operator_chart}"
  echo "KUBERNAUT_DEPENDENCY_CHART_PATH=${dependency_chart}"
  echo "KUBERNAUT_OPERATOR_IMAGE=${operator_image}"
  echo "KUBERNAUT_OPERATOR_IMAGE_TAR=${operator_tar}"
  echo "KUBERNAUT_OPERATOR_SHA=${OPERATOR_SHA}"
  if [[ "${MODE}" == "fullpipeline" ]]; then
    console_image="$(jq -er '.consoleImage' "${LIVE_E2E_RUNTIME_ROOT}/runtime.json")"
    echo "KUBERNAUT_CONSOLE_IMAGE=${console_image}"
    echo "KUBERNAUT_CI_ARTIFACT_TAG=${ARTIFACT_TAG}"
  else
    echo "KUBERNAUT_CONSOLE_IMAGE=localhost/kubernaut-console:${ARTIFACT_TAG}"
  fi
} >> "${GITHUB_ENV}"
