#!/usr/bin/env bash
# Delete only the run-owned fixture namespaces and Kind clusters.
set -euo pipefail

MODE=""
HUB_KUBECONFIG=""
SPOKE_KUBECONFIG=""
HUB_CLUSTER_NAME=""
SPOKE_CLUSTER_NAME=""
STATE_FILE=""
FIXTURES_LIST="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/fixtures.list"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode) MODE="${2:-}"; shift 2 ;;
    --hub-kubeconfig) HUB_KUBECONFIG="${2:-}"; shift 2 ;;
    --spoke-kubeconfig) SPOKE_KUBECONFIG="${2:-}"; shift 2 ;;
    --hub-cluster-name) HUB_CLUSTER_NAME="${2:-}"; shift 2 ;;
    --spoke-cluster-name) SPOKE_CLUSTER_NAME="${2:-}"; shift 2 ;;
    --state-file) STATE_FILE="${2:-}"; shift 2 ;;
    *) echo "error: unknown argument $1" >&2; exit 2 ;;
  esac
done

[[ "$MODE" == "local" || "$MODE" == "fleet" || "$MODE" == "fullpipeline" ]] || { echo "error: invalid mode" >&2; exit 2; }
[[ "$HUB_CLUSTER_NAME" =~ ^[a-z0-9-]+$ ]] || { echo "error: refusing non-DNS hub cluster name" >&2; exit 1; }
if [[ "$MODE" == "fullpipeline" ]]; then
  [[ "$HUB_CLUSTER_NAME" == "fullpipeline-e2e" ]] || {
    echo "error: native FullPipeline teardown may delete only the exact fullpipeline-e2e cluster" >&2
    exit 1
  }
  [[ -z "$SPOKE_CLUSTER_NAME" && -z "$SPOKE_KUBECONFIG" ]] || {
    echo "error: native FullPipeline teardown refuses spoke-cluster arguments" >&2
    exit 1
  }
  if ! command -v kind >/dev/null 2>&1; then
    echo "error: kind is required to tear down the native FullPipeline cluster" >&2
    exit 1
  fi
  export KIND_EXPERIMENTAL_PROVIDER="${KIND_EXPERIMENTAL_PROVIDER:-podman}"
  if ! kind delete cluster --name fullpipeline-e2e >/dev/null 2>&1; then
    echo "error: failed to delete the native FullPipeline Kind cluster: fullpipeline-e2e" >&2
    exit 1
  fi
  rm -f "$STATE_FILE"
  echo "Exact native FullPipeline Kind cluster removed: fullpipeline-e2e"
  exit 0
fi
if [[ "$MODE" == "fleet" && ! "$SPOKE_CLUSTER_NAME" =~ ^[a-z0-9-]+$ ]]; then
  echo "error: refusing non-DNS spoke cluster name" >&2
  exit 1
fi

suffix=""
if [[ -f "$STATE_FILE" ]]; then
  suffix="$(sed -n 's/^export LIVE_E2E_NS_SUFFIX=//p' "$STATE_FILE" | head -1)"
fi
if [[ -n "$suffix" && "$suffix" =~ ^[a-z0-9-]+$ ]]; then
  target_kubeconfig="$HUB_KUBECONFIG"
  [[ "$MODE" == "fleet" ]] && target_kubeconfig="$SPOKE_KUBECONFIG"
  if [[ -s "$target_kubeconfig" ]] && command -v kubectl >/dev/null 2>&1; then
    while IFS='|' read -r base type; do
      [[ -z "$base" || "$base" == \#* || "$type" == "none" ]] && continue
      namespace="${base}-${suffix}"
      if [[ "$namespace" =~ ^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$ ]]; then
        kubectl --kubeconfig "$target_kubeconfig" delete namespace "$namespace" --ignore-not-found --wait=false >/dev/null 2>&1 || true
      fi
    done < "$FIXTURES_LIST"
  fi
fi

if command -v kind >/dev/null 2>&1; then
  export KIND_EXPERIMENTAL_PROVIDER="${KIND_EXPERIMENTAL_PROVIDER:-podman}"
  kind delete cluster --name "$HUB_CLUSTER_NAME" >/dev/null 2>&1 || true
  if [[ "$MODE" == "fleet" ]]; then
    kind delete cluster --name "$SPOKE_CLUSTER_NAME" >/dev/null 2>&1 || true
  fi
fi

rm -f "$STATE_FILE"
echo "Run-owned ${MODE} Kind resources removed"
