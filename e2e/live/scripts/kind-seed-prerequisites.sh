#!/usr/bin/env bash
# Seed the user-owned catalog and verify the exact policy inputs used by the
# live Kind lane. This intentionally fails on the first seed error; a partial
# catalog is not a valid E2E environment.
set -euo pipefail

MODE=""
HUB_KUBECONFIG=""
SPOKE_KUBECONFIG=""
SCENARIOS_DIR=""

usage() {
  echo "usage: $0 --mode local|fleet|fullpipeline --hub-kubeconfig PATH --scenarios-dir PATH [--spoke-kubeconfig PATH]" >&2
  exit 2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode) MODE="${2:-}"; shift 2 ;;
    --hub-kubeconfig) HUB_KUBECONFIG="${2:-}"; shift 2 ;;
    --spoke-kubeconfig) SPOKE_KUBECONFIG="${2:-}"; shift 2 ;;
    --scenarios-dir) SCENARIOS_DIR="${2:-}"; shift 2 ;;
    *) usage ;;
  esac
done

[[ "$MODE" == "local" || "$MODE" == "fleet" || "$MODE" == "fullpipeline" ]] || usage
[[ -s "$HUB_KUBECONFIG" ]] || { echo "error: hub kubeconfig is missing" >&2; exit 1; }
[[ -d "$SCENARIOS_DIR/scripts" ]] || { echo "error: scenario scripts are missing" >&2; exit 1; }
if [[ "$MODE" == "fleet" && ! -s "$SPOKE_KUBECONFIG" ]]; then
  echo "error: fleet mode requires a spoke kubeconfig" >&2
  exit 1
fi

for command in kubectl jq sha256sum cmp; do
  command -v "$command" >/dev/null 2>&1 || { echo "error: $command is required" >&2; exit 1; }
done

PLATFORM_NS="kubernaut-system"
export PLATFORM_NS
export WE_NAMESPACE="kubernaut-workflows"
export KUBECONFIG="$HUB_KUBECONFIG"

if [[ "$MODE" == "fleet" ]]; then
  export HUB_KUBECONFIG="$HUB_KUBECONFIG"
  export SPOKE_KUBECONFIG="$SPOKE_KUBECONFIG"
  export FLEET_EXECUTION_CLUSTER_ID="hub"
fi

echo "==> Seeding ActionType catalog"
bash "$SCENARIOS_DIR/scripts/seed-action-types.sh" --timeout 120

echo "==> Seeding RemediationWorkflow catalog"
bash "$SCENARIOS_DIR/scripts/seed-workflows.sh"

workflow_count="$(kubectl --kubeconfig "$HUB_KUBECONFIG" get remediationworkflows -n "$PLATFORM_NS" --no-headers 2>/dev/null | awk 'NF {count++} END {print count+0}')"
action_count="$(kubectl --kubeconfig "$HUB_KUBECONFIG" get actiontypes -n "$PLATFORM_NS" --no-headers 2>/dev/null | awk 'NF {count++} END {print count+0}')"
[[ "$workflow_count" -gt 0 ]] || { echo "error: workflow catalog is empty" >&2; exit 1; }
[[ "$action_count" -gt 0 ]] || { echo "error: ActionType catalog is empty" >&2; exit 1; }

for workflow in crashloop-rollback-v1 fix-statefulset-pvc-v1; do
  kubectl --kubeconfig "$HUB_KUBECONFIG" get remediationworkflow "$workflow" -n "$PLATFORM_NS" >/dev/null
done

if [[ "$MODE" == "fleet" ]]; then
  for service_account in crashloop-rollback-v1-runner fix-statefulset-pvc-v1-runner; do
    kubectl --kubeconfig "$SPOKE_KUBECONFIG" get serviceaccount "$service_account" -n "$WE_NAMESPACE" >/dev/null
  done
fi

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

canonical_sp="$SCENARIOS_DIR/deploy/defaults/signalprocessing-policy.rego"
canonical_aa="$SCENARIOS_DIR/deploy/defaults/approval-policy.rego"
[[ -f "$canonical_sp" && -f "$canonical_aa" ]] || { echo "error: canonical policies are missing" >&2; exit 1; }

kubectl --kubeconfig "$HUB_KUBECONFIG" get configmap signalprocessing-policy -n "$PLATFORM_NS" -o json \
  | jq -er '.data["policy.rego"]' > "$tmp_dir/signalprocessing-policy.rego"
kubectl --kubeconfig "$HUB_KUBECONFIG" get configmap aianalysis-policy -n "$PLATFORM_NS" -o json \
  | jq -er '.data["approval.rego"]' > "$tmp_dir/approval-policy.rego"
cmp -s "$canonical_sp" "$tmp_dir/signalprocessing-policy.rego" || {
  echo "error: signalprocessing-policy differs from the pinned scenario policy" >&2
  exit 1
}
cmp -s "$canonical_aa" "$tmp_dir/approval-policy.rego" || {
  echo "error: aianalysis-policy differs from the pinned scenario policy" >&2
  exit 1
}

echo "Catalog verified: ${workflow_count} RemediationWorkflow(s), ${action_count} ActionType(s)"
echo "Canonical SignalProcessing and AIAnalysis policies verified"
