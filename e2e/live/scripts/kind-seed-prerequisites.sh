#!/usr/bin/env bash
# Seed the user-owned catalog and verify the exact policy inputs used by the
# live Kind lane. This intentionally fails on the first seed error; a partial
# catalog is not a valid E2E environment.
set -euo pipefail

MODE=""
HUB_KUBECONFIG=""
SPOKE_KUBECONFIG=""
SCENARIOS_DIR=""
RUNTIME_MANIFEST=""

usage() {
  echo "usage: $0 --mode local|fleet|fullpipeline --hub-kubeconfig PATH [--spoke-kubeconfig PATH] [--scenarios-dir PATH] [--runtime-manifest PATH]" >&2
  exit 2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode) MODE="${2:-}"; shift 2 ;;
    --hub-kubeconfig) HUB_KUBECONFIG="${2:-}"; shift 2 ;;
    --spoke-kubeconfig) SPOKE_KUBECONFIG="${2:-}"; shift 2 ;;
    --scenarios-dir) SCENARIOS_DIR="${2:-}"; shift 2 ;;
    --runtime-manifest) RUNTIME_MANIFEST="${2:-}"; shift 2 ;;
    *) usage ;;
  esac
done

[[ "$MODE" == "local" || "$MODE" == "fleet" || "$MODE" == "fullpipeline" ]] || usage
[[ -s "$HUB_KUBECONFIG" ]] || { echo "error: hub kubeconfig is missing" >&2; exit 1; }
if [[ "$MODE" != "fullpipeline" ]]; then
  [[ -d "$SCENARIOS_DIR/scripts" ]] || { echo "error: scenario scripts are missing" >&2; exit 1; }
fi
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

if [[ "$MODE" == "fullpipeline" ]]; then
  [[ -s "$RUNTIME_MANIFEST" ]] || { echo "error: native FullPipeline runtime manifest is missing" >&2; exit 1; }
  [[ "$(jq -er '.mode' "$RUNTIME_MANIFEST")" == "fullpipeline" ]] || {
    echo "error: native FullPipeline runtime manifest has the wrong mode" >&2
    exit 1
  }
  [[ "$(jq -er '.clusters.hub.name' "$RUNTIME_MANIFEST")" == "fullpipeline-e2e" ]] || {
    echo "error: native FullPipeline runtime manifest does not identify fullpipeline-e2e" >&2
    exit 1
  }

  echo "==> Verifying upstream RemediationWorkflow catalog (read-only)"
  workflow_json="$(kubectl --kubeconfig "$HUB_KUBECONFIG" get remediationworkflows -n "$PLATFORM_NS" -o json)"
  workflow_count="$(jq -r '.items | length' <<<"$workflow_json")"
  [[ "$workflow_count" -gt 0 ]] || { echo "error: upstream workflow catalog is empty" >&2; exit 1; }

  while IFS= read -r workflow_key; do
    [[ -n "$workflow_key" ]] || continue
    workflow_name="${workflow_key%%:*}"
    environment="${workflow_key#*:}"
    expected_uuid="$(jq -er --arg key "$workflow_key" '.fullPipeline.workflowUUIDs[$key]' "$RUNTIME_MANIFEST")"
    workflow_resource="$(jq -er --arg name "$workflow_name" '.items[] | select(.metadata.name == $name)' <<<"$workflow_json")" || {
      echo "error: upstream workflow ${workflow_name} is missing" >&2
      exit 1
    }
    jq -e --arg environment "$environment" --arg expected_uuid "$expected_uuid" '
      (.spec.labels.environment // []) as $environments
      | ([ $environments ] | flatten | map(tostring) | index($environment)) != null
      and (.status.workflowId // "") == $expected_uuid
      and (.status.catalogStatus // "") == "Active"
    ' <<<"$workflow_resource" >/dev/null || {
      echo "error: upstream workflow ${workflow_key} is not the active manifest-selected catalog entry" >&2
      exit 1
    }
  done < <(jq -er '.fullPipeline.workflowUUIDs | keys[]' "$RUNTIME_MANIFEST")

  echo "==> Verifying upstream mock-LLM scenario ConfigMap (read-only)"
  command -v ruby >/dev/null 2>&1 || { echo "error: ruby is required to parse scenarios.yaml" >&2; exit 1; }
  scenarios_json="$(kubectl --kubeconfig "$HUB_KUBECONFIG" get configmap mock-llm-scenarios -n "$PLATFORM_NS" -o json)"
  jq -e '.metadata.name == "mock-llm-scenarios" and ((.data["scenarios.yaml"] // "") | length > 0)' <<<"$scenarios_json" >/dev/null || {
    echo "error: upstream mock-llm-scenarios ConfigMap has no scenarios.yaml" >&2
    exit 1
  }
  scenarios_yaml="$(jq -er '.data["scenarios.yaml"]' <<<"$scenarios_json")"
  scenario_namespaces="$(ruby -ryaml -e '
    document = YAML.safe_load(STDIN.read, permitted_classes: [], aliases: false)
    roots = document.is_a?(Hash) ? [document["scenario_selectors"], document["transcript_scenarios"]] : []
    walk = lambda do |value|
      case value
      when Array
        value.each { |item| walk.call(item) }
      when Hash
        namespace = value["namespace"]
        puts namespace if namespace.is_a?(String) && !namespace.empty?
        value.each_value { |item| walk.call(item) }
      end
    end
    roots.each { |root| walk.call(root) }
  ' <<<"$scenarios_yaml")" || {
    echo "error: upstream mock-LLM scenarios.yaml is not valid YAML" >&2
    exit 1
  }
  while IFS= read -r namespace; do
    [[ -n "$namespace" ]] || continue
    grep -Fqx -- "$namespace" <<<"$scenario_namespaces" || {
      echo "error: upstream mock-LLM scenarios do not contain namespace ${namespace}" >&2
      exit 1
    }
  done < <(jq -er '.fullPipeline.remediateNamespaces | to_entries[] | .value' "$RUNTIME_MANIFEST")

  echo "==> Verifying upstream stable memory-eater target (read-only)"
  target_json="$(kubectl --kubeconfig "$HUB_KUBECONFIG" get deployment memory-eater -n "$PLATFORM_NS" -o json)"
  jq -e '
    .metadata.namespace == "kubernaut-system"
    and .metadata.name == "memory-eater"
    and (.spec.replicas // 0) > 0
  ' <<<"$target_json" >/dev/null || {
    echo "error: upstream kubernaut-system/memory-eater target is missing or scaled down" >&2
    exit 1
  }
  target_pods="$(kubectl --kubeconfig "$HUB_KUBECONFIG" get pods -n "$PLATFORM_NS" -l app=memory-eater -o json)"
  jq -e '[.items[]?.status.containerStatuses[]? | (.state.waiting.reason // .state.terminated.reason // .lastState.terminated.reason)] | any(.[]; . == "CrashLoopBackOff" or . == "OOMKilled" or . == "Error")' <<<"$target_pods" >/dev/null || {
    echo "error: upstream stable memory-eater target is not showing an OOM/crash fault" >&2
    exit 1
  }

  echo "Native FullPipeline catalog, scenarios, and stable target verified without mutation"
  exit 0
fi

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
