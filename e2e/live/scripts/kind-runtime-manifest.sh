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
ARTIFACT_TAG=""
CONSOLE_SHA=""
KUBERNAUT_SHA=""
OPERATOR_SHA=""
SCENARIOS_SHA=""

usage() {
  echo "usage: $0 --mode local|fleet|fullpipeline --hub-kubeconfig PATH [--spoke-kubeconfig PATH] --hub-cluster-name NAME [--spoke-cluster-name NAME] --output PATH --console-url URL --api-frontend-url URL --keycloak-url URL --artifact-tag TAG --console-sha SHA --kubernaut-sha SHA --operator-sha SHA --scenarios-sha SHA" >&2
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
[[ "$CONSOLE_URL" =~ ^https://[^[:space:]]+$ ]] || { echo "error: invalid Console URL" >&2; exit 1; }
[[ "$API_FRONTEND_URL" =~ ^https://[^[:space:]]+$ ]] || { echo "error: invalid API Frontend URL" >&2; exit 1; }
[[ "$KEYCLOAK_URL" =~ ^https://[^[:space:]]+$ ]] || { echo "error: invalid Keycloak URL" >&2; exit 1; }
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
