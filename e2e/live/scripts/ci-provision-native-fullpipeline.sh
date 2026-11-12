#!/usr/bin/env bash
# Provision the native mock-LLM FullPipeline topology without running the
# upstream Ginkgo suite. The temporary Go module imports the pinned upstream
# test/infrastructure package and calls its authoritative setup function.
set -euo pipefail

: "${KUBERNAUT_ROOT:=${GITHUB_WORKSPACE:-$(pwd)}/kubernaut}"
: "${HUB_CLUSTER_NAME:?HUB_CLUSTER_NAME is required}"
: "${HUB_KUBECONFIG:?HUB_KUBECONFIG is required}"
: "${LIVE_E2E_RUNTIME_ROOT:?LIVE_E2E_RUNTIME_ROOT is required}"
: "${LIVE_E2E_NATIVE_LOG:?LIVE_E2E_NATIVE_LOG is required}"
: "${KUBERNAUT_CI_ARTIFACT_TAG:?KUBERNAUT_CI_ARTIFACT_TAG is required}"
: "${KUBERNAUT_CONSOLE_IMAGE:?KUBERNAUT_CONSOLE_IMAGE is required}"
: "${KUBERNAUT_OPERATOR_IMAGE:?KUBERNAUT_OPERATOR_IMAGE is required}"
: "${KUBERNAUT_OPERATOR_IMAGE_TAR:?KUBERNAUT_OPERATOR_IMAGE_TAR is required}"
: "${KUBERNAUT_OPERATOR_CHART_PATH:?KUBERNAUT_OPERATOR_CHART_PATH is required}"
: "${KUBERNAUT_DEPENDENCY_CHART_PATH:?KUBERNAUT_DEPENDENCY_CHART_PATH is required}"
: "${LIVE_E2E_NATIVE_SETUP_METADATA:=${LIVE_E2E_RUNTIME_ROOT}/native-setup.json}"

[[ -d "${KUBERNAUT_ROOT}" ]] || { echo "error: upstream checkout is missing: ${KUBERNAUT_ROOT}" >&2; exit 1; }
[[ "${HUB_CLUSTER_NAME}" == "fullpipeline-e2e" ]] || { echo "error: native setup requires fullpipeline-e2e" >&2; exit 1; }

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
module_dir="${LIVE_E2E_RUNTIME_ROOT}/native-setup-module"
mkdir -p "${module_dir}"
chmod 700 "${module_dir}"
cat >"${module_dir}/go.mod" <<EOF
module kubernaut-console-native-fullpipeline-setup

go 1.26.10

require github.com/jordigilh/kubernaut v0.0.0

replace github.com/jordigilh/kubernaut => ${KUBERNAUT_ROOT}
EOF

export KUBERNAUT_ROOT
export LIVE_E2E_NATIVE_SETUP_METADATA
export GOWORK=off
export KUBECONFIG="${HUB_KUBECONFIG}"
umask 077
mkdir -p "$(dirname "${LIVE_E2E_NATIVE_LOG}")"

set +e
(cd "${module_dir}" && GOFLAGS=-mod=mod go run "${script_dir}/native-fullpipeline-setup.go") 2>&1 | tee "${LIVE_E2E_NATIVE_LOG}"
status="${PIPESTATUS[0]}"
set -e
chmod 600 "${LIVE_E2E_NATIVE_LOG}"
exit "${status}"
