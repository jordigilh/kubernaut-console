#!/usr/bin/env bash
# Create fresh, per-run fault fixtures from the pinned demo-scenario source.
# The hub owns the application; fleet fixtures are deliberately created only
# on the spoke so a later successful WorkflowExecution proves remote routing.
set -euo pipefail

MODE=""
HUB_KUBECONFIG=""
SPOKE_KUBECONFIG=""
SCENARIOS_DIR=""
STATE_FILE=""
SUFFIX=""
FIXTURES_LIST="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/fixtures.list"

usage() {
  echo "usage: $0 --mode local|fleet|fullpipeline --hub-kubeconfig PATH --scenarios-dir PATH --state-file PATH --suffix SUFFIX [--spoke-kubeconfig PATH]" >&2
  exit 2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode) MODE="${2:-}"; shift 2 ;;
    --hub-kubeconfig) HUB_KUBECONFIG="${2:-}"; shift 2 ;;
    --spoke-kubeconfig) SPOKE_KUBECONFIG="${2:-}"; shift 2 ;;
    --scenarios-dir) SCENARIOS_DIR="${2:-}"; shift 2 ;;
    --state-file) STATE_FILE="${2:-}"; shift 2 ;;
    --suffix) SUFFIX="${2:-}"; shift 2 ;;
    *) usage ;;
  esac
done

[[ "$MODE" == "local" || "$MODE" == "fleet" || "$MODE" == "fullpipeline" ]] || usage
[[ -s "$HUB_KUBECONFIG" ]] || { echo "error: hub kubeconfig is missing" >&2; exit 1; }
[[ -d "$SCENARIOS_DIR/scenarios" ]] || { echo "error: scenario manifests are missing" >&2; exit 1; }
[[ -n "$SUFFIX" ]] || usage
[[ -n "$STATE_FILE" ]] || usage
if [[ "$MODE" == "fleet" && ! -s "$SPOKE_KUBECONFIG" ]]; then
  echo "error: fleet mode requires a spoke kubeconfig" >&2
  exit 1
fi
if [[ ! "$SUFFIX" =~ ^[a-z0-9][a-z0-9-]{0,24}[a-z0-9]$ ]]; then
  echo "error: fixture suffix must be a short DNS label: $SUFFIX" >&2
  exit 1
fi

for command in kubectl jq; do
  command -v "$command" >/dev/null 2>&1 || { echo "error: $command is required" >&2; exit 1; }
done

if [[ "$MODE" == "fleet" ]]; then
  TARGET_KUBECONFIG="$SPOKE_KUBECONFIG"
else
  TARGET_KUBECONFIG="$HUB_KUBECONFIG"
fi

target_kubectl() { kubectl --kubeconfig "$TARGET_KUBECONFIG" "$@"; }

create_namespace() {
  local namespace="$1"
  target_kubectl create namespace "$namespace" --dry-run=client -o yaml | target_kubectl apply -f - >/dev/null
  target_kubectl label namespace "$namespace" kubernaut.ai/managed=true --overwrite >/dev/null
  target_kubectl label namespace "$namespace" kubernaut.ai/environment=production --overwrite >/dev/null
}

apply_retargeted() {
  local source_file="$1" source_namespace="$2" namespace="$3"
  sed "s/${source_namespace}/${namespace}/g" "$source_file" | target_kubectl apply -f - >/dev/null
}

wait_deployment() {
  local namespace="$1" name="$2"
  target_kubectl rollout status "deployment/${name}" -n "$namespace" --timeout=180s >/dev/null
}

setup_crashloop() {
  local namespace="$1"
  create_namespace "$namespace"
  apply_retargeted "$SCENARIOS_DIR/scenarios/crashloop/manifests/configmap.yaml" demo-checkout "$namespace"
  apply_retargeted "$SCENARIOS_DIR/scenarios/crashloop/manifests/deployment.yaml" demo-checkout "$namespace"
  apply_retargeted "$SCENARIOS_DIR/scenarios/crashloop/manifests/prometheus-rule.yaml" demo-checkout "$namespace"
  wait_deployment "$namespace" worker
  target_kubectl patch deployment worker -n "$namespace" --type=json \
    -p='[{"op":"add","path":"/spec/template/spec/containers/0/command","value":["sh","-c","echo fatal: bad release 1.1.0 -- aborting && exit 1"]}]' >/dev/null

  for _ in $(seq 1 60); do
    if target_kubectl get pods -n "$namespace" -l app=worker -o json \
      | jq -e '[.items[].status.containerStatuses[]?.state.waiting.reason] | any(. == "CrashLoopBackOff")' >/dev/null; then
      return
    fi
    sleep 2
  done
  echo "error: crashloop fixture did not reach CrashLoopBackOff: $namespace" >&2
  exit 1
}

setup_memory_eater() {
  local namespace="$1"
  create_namespace "$namespace"
  # The pinned repository calls this scenario memory-leak. The Console suite's
  # long-standing target contract is memory-eater, so retarget the validated
  # source manifest without inventing a workload or image.
  sed -e "s/demo-telemetry/${namespace}/g" -e 's/data-service/memory-eater/g' \
    "$SCENARIOS_DIR/scenarios/memory-leak/manifests/deployment.yaml" \
    | target_kubectl apply -f - >/dev/null
  sed "s/demo-telemetry/${namespace}/g" \
    "$SCENARIOS_DIR/scenarios/memory-leak/manifests/prometheus-rule.yaml" \
    | target_kubectl apply -f - >/dev/null
  wait_deployment "$namespace" memory-eater
}

setup_statefulset() {
  local namespace="$1" source_namespace=demo-keystore storage_size
  apply_retargeted "$SCENARIOS_DIR/scenarios/statefulset-pvc-failure/manifests/namespace.yaml" "$source_namespace" "$namespace"
  apply_retargeted "$SCENARIOS_DIR/scenarios/statefulset-pvc-failure/manifests/statefulset.yaml" "$source_namespace" "$namespace"
  apply_retargeted "$SCENARIOS_DIR/scenarios/statefulset-pvc-failure/manifests/prometheus-rule.yaml" "$source_namespace" "$namespace"
  target_kubectl rollout status statefulset/kv-store -n "$namespace" --timeout=180s >/dev/null
  storage_size="$(target_kubectl get pvc data-kv-store-2 -n "$namespace" -o jsonpath='{.spec.resources.requests.storage}')"
  [[ -n "$storage_size" ]] || { echo "error: statefulset fixture PVC has no storage request" >&2; exit 1; }
  target_kubectl scale statefulset kv-store -n "$namespace" --replicas=2 >/dev/null
  target_kubectl rollout status statefulset/kv-store -n "$namespace" --timeout=90s >/dev/null
  target_kubectl delete pvc data-kv-store-2 -n "$namespace" --wait=true --timeout=60s >/dev/null
  cat <<EOF | target_kubectl create -f - >/dev/null
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: data-kv-store-2
  namespace: ${namespace}
  labels:
    app: kv-store
spec:
  accessModes: ["ReadWriteOnce"]
  storageClassName: broken-storage-class
  resources:
    requests:
      storage: ${storage_size}
EOF
  target_kubectl scale statefulset kv-store -n "$namespace" --replicas=3 >/dev/null
  target_kubectl get pvc data-kv-store-2 -n "$namespace" -o jsonpath='{.spec.storageClassName}' | grep -qx broken-storage-class
}

mkdir -p "$(dirname "$STATE_FILE")"
: > "$STATE_FILE"
chmod 600 "$STATE_FILE"
{
  echo "# Generated by kind-setup-fixtures.sh; namespace names only."
  echo "export LIVE_E2E_NS_SUFFIX=${SUFFIX}"
  echo "export LIVE_E2E_FIXTURE_MODE=${MODE}"
} >> "$STATE_FILE"

while IFS='|' read -r base type; do
  [[ -z "$base" || "$base" == \#* ]] && continue
  namespace="${base}-${SUFFIX}"
  case "$type" in
    crashloop)
      echo "==> Provisioning crashloop fixture ${namespace}"
      setup_crashloop "$namespace"
      ;;
    memory-eater)
      echo "==> Provisioning memory fixture ${namespace}"
      setup_memory_eater "$namespace"
      ;;
    statefulset-pvc-failure)
      echo "==> Provisioning StatefulSet/PVC fixture ${namespace}"
      setup_statefulset "$namespace"
      ;;
    none)
      echo "==> No fixture required for ${namespace}"
      continue
      ;;
    *)
      echo "error: unknown fixture type ${type} for ${base}" >&2
      exit 1
      ;;
  esac
  echo "# ${base} -> ${namespace}" >> "$STATE_FILE"
done < "$FIXTURES_LIST"

echo "Fixtures ready on ${MODE} target cluster; state file: ${STATE_FILE}"
