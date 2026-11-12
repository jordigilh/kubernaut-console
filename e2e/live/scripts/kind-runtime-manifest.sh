#!/usr/bin/env bash
# Emit the sanitized runtime contract produced after a live topology bootstrap.
#
# This file deliberately contains paths, identities, URLs, and resource
# metadata only. It never reads Secret data or the LLM credential file.
set -euo pipefail

MODE=""
HUB_KUBECONFIG=""
SPOKE_KUBECONFIG=""
HUB_CLUSTER_NAME=""
SPOKE_CLUSTER_NAME=""
OUTPUT=""
CONSOLE_URL=""
API_FRONTEND_URL=""
KEYCLOAK_URL=""
DEX_URL=""
NATIVE_LOG=""
NATIVE_SETUP_METADATA=""
ARTIFACT_TAG=""
CONSOLE_SHA=""
KUBERNAUT_SHA=""
OPERATOR_SHA=""
SCENARIOS_SHA=""

usage() {
  echo "usage: $0 --mode local|fleet|fullpipeline --hub-kubeconfig PATH [--spoke-kubeconfig PATH] --hub-cluster-name NAME [--spoke-cluster-name NAME] --output PATH --console-url URL --api-frontend-url URL [--keycloak-url URL] [--dex-url URL] [--native-log PATH] [--native-setup-metadata PATH] --artifact-tag TAG --console-sha SHA --kubernaut-sha SHA --operator-sha SHA --scenarios-sha SHA" >&2
  exit 2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode) MODE="${2:-}"; shift 2 ;;
    --hub-kubeconfig) HUB_KUBECONFIG="${2:-}"; shift 2 ;;
    --spoke-kubeconfig) SPOKE_KUBECONFIG="${2:-}"; shift 2 ;;
    --hub-cluster-name) HUB_CLUSTER_NAME="${2:-}"; shift 2 ;;
    --spoke-cluster-name) SPOKE_CLUSTER_NAME="${2:-}"; shift 2 ;;
    --output) OUTPUT="${2:-}"; shift 2 ;;
    --console-url) CONSOLE_URL="${2:-}"; shift 2 ;;
    --api-frontend-url) API_FRONTEND_URL="${2:-}"; shift 2 ;;
    --keycloak-url) KEYCLOAK_URL="${2:-}"; shift 2 ;;
    --dex-url) DEX_URL="${2:-}"; shift 2 ;;
    --native-log) NATIVE_LOG="${2:-}"; shift 2 ;;
    --native-setup-metadata) NATIVE_SETUP_METADATA="${2:-}"; shift 2 ;;
    --artifact-tag) ARTIFACT_TAG="${2:-}"; shift 2 ;;
    --console-sha) CONSOLE_SHA="${2:-}"; shift 2 ;;
    --kubernaut-sha) KUBERNAUT_SHA="${2:-}"; shift 2 ;;
    --operator-sha) OPERATOR_SHA="${2:-}"; shift 2 ;;
    --scenarios-sha) SCENARIOS_SHA="${2:-}"; shift 2 ;;
    *) usage ;;
  esac
done

[[ "$MODE" == "local" || "$MODE" == "fleet" || "$MODE" == "fullpipeline" ]] || usage
[[ -s "$HUB_KUBECONFIG" ]] || { echo "error: hub kubeconfig is missing" >&2; exit 1; }
[[ "$HUB_CLUSTER_NAME" =~ ^[a-z0-9-]+$ ]] || { echo "error: invalid hub cluster name" >&2; exit 1; }
[[ -n "$OUTPUT" && -n "$ARTIFACT_TAG" ]] || usage
if [[ "$MODE" == "fullpipeline" ]]; then
  [[ "$HUB_CLUSTER_NAME" == "fullpipeline-e2e" ]] || { echo "error: FullPipeline must use the native fullpipeline-e2e cluster" >&2; exit 1; }
  [[ "$CONSOLE_URL" =~ ^https?://[^[:space:]]+$ ]] || { echo "error: invalid FullPipeline Console URL" >&2; exit 1; }
  [[ "$DEX_URL" =~ ^https://[^[:space:]]+$ ]] || { echo "error: invalid FullPipeline Dex URL" >&2; exit 1; }
else
  [[ "$CONSOLE_URL" =~ ^https://[^[:space:]]+$ ]] || { echo "error: invalid Console URL" >&2; exit 1; }
fi
[[ "$API_FRONTEND_URL" =~ ^https://[^[:space:]]+$ ]] || { echo "error: invalid API Frontend URL" >&2; exit 1; }
if [[ "$MODE" != "fullpipeline" ]]; then
  [[ "$KEYCLOAK_URL" =~ ^https://[^[:space:]]+$ ]] || { echo "error: invalid Keycloak URL" >&2; exit 1; }
fi
for sha in "$CONSOLE_SHA" "$KUBERNAUT_SHA" "$OPERATOR_SHA" "$SCENARIOS_SHA"; do
  [[ "$sha" =~ ^[0-9a-f]{40}$ ]] || { echo "error: source SHA must be a lowercase 40-character commit SHA" >&2; exit 1; }
done
if [[ "$MODE" == "fleet" ]]; then
  [[ -s "$SPOKE_KUBECONFIG" ]] || { echo "error: fleet mode requires a spoke kubeconfig" >&2; exit 1; }
  [[ "$SPOKE_CLUSTER_NAME" =~ ^[a-z0-9-]+$ ]] || { echo "error: invalid spoke cluster name" >&2; exit 1; }
fi

for command in kubectl jq; do
  command -v "$command" >/dev/null 2>&1 || { echo "error: $command is required" >&2; exit 1; }
done

cluster_identity() {
  local kubeconfig="$1" expected_name="$2" label="$3"
  local context cluster server
  context="$(kubectl --kubeconfig "$kubeconfig" config current-context 2>/dev/null || true)"
  cluster="$(kubectl --kubeconfig "$kubeconfig" config view --minify -o jsonpath='{.contexts[0].context.cluster}' 2>/dev/null || true)"
  server="$(kubectl --kubeconfig "$kubeconfig" config view --minify -o jsonpath='{.clusters[0].cluster.server}' 2>/dev/null || true)"
  [[ -n "$context" && -n "$cluster" && -n "$server" ]] || {
    echo "error: ${label} kubeconfig has no current context" >&2
    exit 1
  }
  [[ "$cluster" == "kind-${expected_name}" ]] || {
    echo "error: ${label} kubeconfig targets cluster ${cluster}, expected kind-${expected_name}" >&2
    exit 1
  }
  jq -n --arg context "$context" --arg cluster "$cluster" --arg server "$server" \
    '{context:$context,cluster:$cluster,server:$server}'
}

hub_identity="$(cluster_identity "$HUB_KUBECONFIG" "$HUB_CLUSTER_NAME" Hub)"
spoke_identity='null'
if [[ "$MODE" == "fleet" ]]; then
  spoke_identity="$(cluster_identity "$SPOKE_KUBECONFIG" "$SPOKE_CLUSTER_NAME" Spoke)"
  hub_server="$(jq -r '.server' <<<"$hub_identity")"
  spoke_server="$(jq -r '.server' <<<"$spoke_identity")"
  [[ "$hub_server" != "$spoke_server" ]] || {
    echo "error: fleet hub and spoke kubeconfigs resolve to the same API server" >&2
    exit 1
  }
fi

hub() { kubectl --kubeconfig "$HUB_KUBECONFIG" "$@"; }

if [[ "$MODE" == "fullpipeline" ]]; then
  cr_json="$(hub get kubernaut kubernaut -n kubernaut-system -o json 2>/dev/null || true)"
  [[ -n "$cr_json" ]] || { echo "error: native FullPipeline Kubernaut CR is missing" >&2; exit 1; }
  jq -e '.metadata.name == "kubernaut" and .metadata.namespace == "kubernaut-system"' <<<"$cr_json" >/dev/null || {
    echo "error: unexpected native FullPipeline Kubernaut CR identity" >&2
    exit 1
  }

  workflow_json="$(hub get remediationworkflows -n kubernaut-system -o json 2>/dev/null || true)"
  [[ -n "$workflow_json" ]] || { echo "error: native FullPipeline workflow catalog is missing" >&2; exit 1; }
  workflow_uuids="$(jq -c '
    [ .items[] as $item
      | ($item.spec.labels.environment // []) as $environments
      | (if ($environments | type) == "array" then $environments else [$environments] end)[] as $environment
      | select(($item.metadata.name // "") != "")
      | select(($item.status.workflowId // "") != "")
      | select(($environment | type) == "string" and ($environment | length) > 0)
      | {key: ($item.metadata.name + ":" + $environment), value: $item.status.workflowId}
    ] | from_entries
  ' <<<"$workflow_json")" || { echo "error: could not extract native workflow UUIDs" >&2; exit 1; }

  required_workflows=(
    "oomkill-increase-memory-v1:staging"
    "gitops-drift-2390-v1:staging"
    "fullpipeline-consent-job-v1:staging"
  )
  for workflow_key in "${required_workflows[@]}"; do
    jq -e --arg key "$workflow_key" '.[$key] | type == "string" and length > 0' <<<"$workflow_uuids" >/dev/null || {
      echo "error: native workflow UUID is missing for ${workflow_key}" >&2
      exit 1
    }
  done

  native_namespace_from_log() {
    local key="$1" value=""
    if [[ -n "$NATIVE_LOG" && -f "$NATIVE_LOG" ]]; then
      value="$(grep -E "^[[:space:]]+${key}[[:space:]]+→[[:space:]]+[a-z0-9-]+$" "$NATIVE_LOG" | tail -1 | sed -E 's/^[[:space:]]+[^[:space:]]+[[:space:]]+→[[:space:]]+//')"
    fi
    printf '%s' "$value"
  }

  native_namespace_from_cluster() {
    local prefix="$1" namespaces matches count
    namespaces="$(hub get namespaces -o json 2>/dev/null || true)"
    matches="$(jq -r --arg prefix "$prefix" '.items[]?.metadata.name | select(startswith($prefix))' <<<"$namespaces" | sort -u)"
    count="$(grep -c . <<<"$matches" || true)"
    if [[ "$count" == "1" ]]; then
      printf '%s' "$matches"
    elif [[ "$count" == "0" ]]; then
      printf ''
    else
      echo "error: native namespace prefix ${prefix} matched ${count} namespaces" >&2
      exit 1
    fi
  }

  native_namespace() {
    local key="$1" prefix="$2" value
    value=""
    if [[ -n "$NATIVE_SETUP_METADATA" && -s "$NATIVE_SETUP_METADATA" ]]; then
      value="$(jq -r --arg key "$key" '.remediateNamespaces[$key] // empty' "$NATIVE_SETUP_METADATA" 2>/dev/null || true)"
    fi
    [[ -n "$value" ]] || value="$(native_namespace_from_log "$key")"
    [[ -n "$value" ]] || value="$(native_namespace_from_cluster "$prefix")"
    [[ "$value" =~ ^${prefix}[a-z0-9-]+$ ]] || {
      echo "error: native namespace mapping ${key} is missing or malformed" >&2
      exit 1
    }
    printf '%s' "$value"
  }

  remediate_namespaces="$(jq -n \
    --arg autonomous "$(native_namespace autonomous fp-auto-)" \
    --arg interactive "$(native_namespace interactive fp-int-)" \
    --arg cross_namespace "$(native_namespace cross-namespace fp-e2e-1292-)" \
    --arg interactive_streaming "$(native_namespace interactive-streaming fp-ints-)" \
    --arg combined_investigate "$(native_namespace combined-investigate fp-comb-)" \
    --arg full_interactive "$(native_namespace full-interactive fp-full-)" \
    --arg consent_phase2 "$(native_namespace consent-phase2 fp-cg2-)" \
    --arg consent_phase3 "$(native_namespace consent-phase3 fp-cg3-)" \
    --arg terminal_1912 "$(native_namespace terminal-1912 fp-t1912-)" \
    --arg not_actionable_1918 "$(native_namespace not-actionable-1918 fp-na1918-)" \
    --arg standalone_execution_cluster_id "$(native_namespace standalone-exec-cluster-id fp-standalone-2378-)" \
    '{autonomous:$autonomous,interactive:$interactive,"cross-namespace":$cross_namespace,"interactive-streaming":$interactive_streaming,"combined-investigate":$combined_investigate,"full-interactive":$full_interactive,"consent-phase2":$consent_phase2,"consent-phase3":$consent_phase3,"terminal-1912":$terminal_1912,"not-actionable-1918":$not_actionable_1918,"standalone-exec-cluster-id":$standalone_execution_cluster_id}')"

  mkdir -p "$(dirname "$OUTPUT")"
  umask 077
  jq -n \
    --arg mode "$MODE" \
    --arg artifact_tag "$ARTIFACT_TAG" \
    --arg console_sha "$CONSOLE_SHA" \
    --arg kubernaut_sha "$KUBERNAUT_SHA" \
    --arg operator_sha "$OPERATOR_SHA" \
    --arg scenarios_sha "$SCENARIOS_SHA" \
    --arg hub_cluster "$HUB_CLUSTER_NAME" \
    --arg hub_kubeconfig "$HUB_KUBECONFIG" \
    --arg target_kubeconfig "$HUB_KUBECONFIG" \
    --arg console_url "$CONSOLE_URL" \
    --arg api_frontend_url "$API_FRONTEND_URL" \
    --arg dex_url "$DEX_URL" \
    --argjson hub_identity "$hub_identity" \
    --argjson workflow_uuids "$workflow_uuids" \
    --argjson remediate_namespaces "$remediate_namespaces" \
    '{schemaVersion:1,
      kind:"kubernaut-console-live-e2e-runtime",
      mode:$mode,
      artifactTag:$artifact_tag,
      sources:{console:$console_sha,kubernaut:$kubernaut_sha,operator:$operator_sha,demoScenarios:$scenarios_sha},
      clusters:{hub:{name:$hub_cluster,kubeconfig:$hub_kubeconfig,identity:$hub_identity},spoke:null},
      kubeconfigs:{hub:$hub_kubeconfig,spoke:"",target:$target_kubeconfig},
      urls:{console:$console_url,apiFrontend:$api_frontend_url,keycloak:"",dex:$dex_url},
      auth:{mode:"dex-server-proxy",dexURL:$dex_url},
      fleet:{enabled:false,remoteClusterID:"",gateway:{type:"none",namespace:"",endpoint:""}},
      fixtures:{owner:"native-fullpipeline",cluster:$hub_cluster,kubeconfig:$hub_kubeconfig},
      fullPipeline:{clusterName:$hub_cluster,kubeconfig:$hub_kubeconfig,namespace:"kubernaut-system",monitoringNamespace:"monitoring",workflowUUIDs:$workflow_uuids,remediateNamespaces:$remediate_namespaces,targets:{memoryEater:{kind:"Deployment",namespace:"kubernaut-system",name:"memory-eater"}}},
      provisioner:{entrypoint:"e2e/live/scripts/ci-provision-native-fullpipeline.sh",source:"Console adapter -> infrastructure.SetupFullPipelineInfrastructure (pinned upstream)"}}
    ' >"$OUTPUT"
  chmod 600 "$OUTPUT"
  jq . "$OUTPUT"
  exit 0
fi

cr_json="$(hub get kubernaut kubernaut -n kubernaut-system -o json 2>/dev/null || true)"
[[ -n "$cr_json" ]] || { echo "error: Kubernaut CR is missing" >&2; exit 1; }
jq -e '.metadata.name == "kubernaut" and .metadata.namespace == "kubernaut-system"' <<<"$cr_json" >/dev/null || {
  echo "error: unexpected Kubernaut CR identity" >&2
  exit 1
}

fleet_enabled="$(jq -r '.spec.fleet.enabled // false' <<<"$cr_json")"
gateway_type="$(jq -r '.spec.fleet.mcpGateway.type // ""' <<<"$cr_json")"
gateway_namespace="$(jq -r '.spec.fleet.mcpGateway.namespace // "mcp-system"' <<<"$cr_json")"
gateway_endpoint="$(jq -r '.spec.fleet.mcpGateway.endpoint // ""' <<<"$cr_json")"
remote_cluster_id=""

if [[ "$MODE" == "fleet" ]]; then
  [[ "$fleet_enabled" == "true" ]] || { echo "error: fleet runtime manifest requested but Fleet is disabled" >&2; exit 1; }
  [[ "$gateway_type" == "eaigw" || "$gateway_type" == "kuadrant" ]] || {
    echo "error: unsupported Fleet gateway type: ${gateway_type:-<empty>}" >&2
    exit 1
  }
  [[ -n "$gateway_endpoint" ]] || { echo "error: Fleet gateway endpoint is empty" >&2; exit 1; }
  if [[ "$gateway_type" == "eaigw" ]]; then
    backends="$(hub get backends.gateway.envoyproxy.io -n "$gateway_namespace" -o json 2>/dev/null || true)"
    remote_cluster_id="$(jq -r '.items[]? | select(.metadata.name == "remote-cluster") | .metadata.name' <<<"$backends" | head -1)"
  else
    registrations="$(hub get mcpserverregistrations -n "$gateway_namespace" -o json 2>/dev/null || true)"
    remote_cluster_id="$(jq -r '.items[]? | select(.metadata.name == "remote-cluster") | .metadata.name' <<<"$registrations" | head -1)"
  fi
  [[ "$remote_cluster_id" == "remote-cluster" ]] || {
    echo "error: setup did not create the remote-cluster Fleet identity" >&2
    exit 1
  }
else
  [[ "$fleet_enabled" != "true" ]] || { echo "error: local runtime manifest found Fleet enabled" >&2; exit 1; }
  gateway_type="none"
  gateway_namespace=""
  gateway_endpoint=""
fi

fixture_cluster="$HUB_CLUSTER_NAME"
fixture_kubeconfig="$HUB_KUBECONFIG"
fixture_owner="hub"
target_kubeconfig="$HUB_KUBECONFIG"
if [[ "$MODE" == "fleet" ]]; then
  fixture_cluster="$SPOKE_CLUSTER_NAME"
  fixture_kubeconfig="$SPOKE_KUBECONFIG"
  fixture_owner="spoke"
  target_kubeconfig="$SPOKE_KUBECONFIG"
fi

mkdir -p "$(dirname "$OUTPUT")"
umask 077
jq -n \
  --arg mode "$MODE" \
  --arg artifact_tag "$ARTIFACT_TAG" \
  --arg console_sha "$CONSOLE_SHA" \
  --arg kubernaut_sha "$KUBERNAUT_SHA" \
  --arg operator_sha "$OPERATOR_SHA" \
  --arg scenarios_sha "$SCENARIOS_SHA" \
  --arg hub_cluster "$HUB_CLUSTER_NAME" \
  --arg spoke_cluster "$SPOKE_CLUSTER_NAME" \
  --arg hub_kubeconfig "$HUB_KUBECONFIG" \
  --arg spoke_kubeconfig "$SPOKE_KUBECONFIG" \
  --arg target_kubeconfig "$target_kubeconfig" \
  --arg fixture_cluster "$fixture_cluster" \
  --arg fixture_kubeconfig "$fixture_kubeconfig" \
  --arg fixture_owner "$fixture_owner" \
  --arg console_url "$CONSOLE_URL" \
  --arg api_frontend_url "$API_FRONTEND_URL" \
  --arg keycloak_url "$KEYCLOAK_URL" \
  --arg auth_mode "keycloak-oidc-browser" \
  --arg remote_cluster_id "$remote_cluster_id" \
  --arg gateway_type "$gateway_type" \
  --arg gateway_namespace "$gateway_namespace" \
  --arg gateway_endpoint "$gateway_endpoint" \
  --argjson hub_identity "$hub_identity" \
  --argjson spoke_identity "$spoke_identity" \
  '{schemaVersion:1,
    kind:"kubernaut-console-live-e2e-runtime",
    mode:$mode,
    artifactTag:$artifact_tag,
    sources:{console:$console_sha,kubernaut:$kubernaut_sha,operator:$operator_sha,demoScenarios:$scenarios_sha},
    clusters:{hub:{name:$hub_cluster,kubeconfig:$hub_kubeconfig,identity:$hub_identity},spoke:(if $mode == "fleet" then {name:$spoke_cluster,kubeconfig:$spoke_kubeconfig,identity:$spoke_identity} else null end)},
    kubeconfigs:{hub:$hub_kubeconfig,spoke:(if $mode == "fleet" then $spoke_kubeconfig else "" end),target:$target_kubeconfig},
    urls:{console:$console_url,apiFrontend:$api_frontend_url,keycloak:$keycloak_url},
    auth:{mode:$auth_mode,keycloakURL:$keycloak_url},
    fleet:{enabled:($mode == "fleet"),remoteClusterID:$remote_cluster_id,gateway:{type:$gateway_type,namespace:$gateway_namespace,endpoint:$gateway_endpoint}},
    fixtures:{owner:$fixture_owner,cluster:$fixture_cluster,kubeconfig:$fixture_kubeconfig},
    provisioner:{entrypoint:"e2e/live/scripts/ci-provision-demo-infra.sh",source:"pinned upstream Make target"}}
  ' >"$OUTPUT"
chmod 600 "$OUTPUT"
jq . "$OUTPUT"
