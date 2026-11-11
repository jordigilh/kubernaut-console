#!/usr/bin/env bash
# Prove that at least one successful Job-backed WorkflowExecution selected the
# remote cluster and ran on the spoke. A completed hub CR alone is insufficient.
set -euo pipefail

HUB_KUBECONFIG=""
SPOKE_KUBECONFIG=""
SUFFIX=""
CLUSTER_ID=""
TIMEOUT_SECONDS=180
OUTPUT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --hub-kubeconfig) HUB_KUBECONFIG="${2:-}"; shift 2 ;;
    --spoke-kubeconfig) SPOKE_KUBECONFIG="${2:-}"; shift 2 ;;
    --suffix) SUFFIX="${2:-}"; shift 2 ;;
    --cluster-id) CLUSTER_ID="${2:-}"; shift 2 ;;
    --timeout-seconds) TIMEOUT_SECONDS="${2:-}"; shift 2 ;;
    --output) OUTPUT="${2:-}"; shift 2 ;;
    *) echo "error: unknown argument $1" >&2; exit 2 ;;
  esac
done

[[ -s "$HUB_KUBECONFIG" && -s "$SPOKE_KUBECONFIG" ]] || { echo "error: both kubeconfigs are required" >&2; exit 1; }
[[ "$SUFFIX" =~ ^[a-z0-9][a-z0-9-]{0,24}[a-z0-9]$ ]] || { echo "error: invalid fixture suffix" >&2; exit 1; }
[[ "$CLUSTER_ID" =~ ^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$ ]] || { echo "error: invalid remote cluster ID" >&2; exit 1; }
command -v kubectl >/dev/null 2>&1 || { echo "error: kubectl is required" >&2; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "error: jq is required" >&2; exit 1; }

deadline=$((SECONDS + TIMEOUT_SECONDS))
proof=""
while (( SECONDS < deadline )); do
  wfes="$(kubectl --kubeconfig "$HUB_KUBECONFIG" get workflowexecutions -n kubernaut-system -o json 2>/dev/null || echo '{"items":[]}')"
  candidates="$(jq -r --arg suffix "$SUFFIX" --arg cluster_id "$CLUSTER_ID" '
    .items[]?
    | select(.spec.clusterID == $cluster_id)
    | select(.status.phase == "Completed")
    | select((.spec.targetResource // "") | contains($suffix))
    | [.metadata.name, .spec.targetResource, .spec.workflowRef.serviceAccountName, (.status.executionRef.name // "")] | @tsv
  ' <<<"$wfes" 2>/dev/null || true)"

  while IFS=$'\t' read -r wfe_name target_resource service_account execution_ref; do
    [[ -z "$wfe_name" || -z "$execution_ref" ]] && continue
    [[ "$service_account" == *-runner ]] || continue
    jobs="$(kubectl --kubeconfig "$SPOKE_KUBECONFIG" get jobs -n kubernaut-workflows -o json 2>/dev/null || echo '{"items":[]}')"
    job="$(jq -r --arg wfe "$wfe_name" --arg execution "$execution_ref" '
      .items[]?
      | select((.metadata.labels["kubernaut.ai/workflow-execution"] // "") == $wfe or .metadata.name == $execution)
      | select((.status.succeeded // 0) >= 1)
       | [.metadata.name, (.status.succeeded // 0), (.spec.template.spec.serviceAccountName // ""), (.metadata.annotations["kubernaut.ai/target-resource"] // .metadata.labels["kubernaut.ai/target-resource"] // "")] | @tsv
    ' <<<"$jobs" 2>/dev/null | head -1)"
    [[ -n "$job" ]] || continue

    IFS=$'\t' read -r job_name succeeded job_service_account job_target_resource <<<"$job"
    [[ "$job_service_account" == "$service_account" ]] || continue
    [[ "$job_target_resource" == "$target_resource" ]] || continue
    if kubectl --kubeconfig "$HUB_KUBECONFIG" get job "$job_name" -n kubernaut-workflows >/dev/null 2>&1; then
      echo "error: execution Job ${job_name} also exists on the hub; remote execution was not proven" >&2
      exit 1
    fi
    proof="$(jq -n \
      --arg wfe "$wfe_name" \
      --arg target "$target_resource" \
      --arg execution "$execution_ref" \
       --arg job "$job_name" \
       --arg service_account "$job_service_account" \
       --arg cluster_id "$CLUSTER_ID" \
      --argjson succeeded "$succeeded" \
      '{clusterID:$cluster_id,workflowExecution:$wfe,targetResource:$target,executionRef:$execution,spokeJob:$job,serviceAccount:$service_account,succeeded:$succeeded}')"
    break 2
  done <<<"$candidates"

  [[ -n "$proof" ]] && break
  sleep 5
done

if [[ -z "$proof" ]]; then
  echo "error: no successful remote-cluster WorkflowExecution Job was found on the spoke" >&2
  exit 1
fi

if [[ -n "$OUTPUT" ]]; then
  mkdir -p "$(dirname "$OUTPUT")"
  umask 077
  printf '%s\n' "$proof" >"$OUTPUT"
fi
printf '%s\n' "$proof"
