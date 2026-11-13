#!/usr/bin/env bash
# Strict, read-only readiness and contract checks for the upstream demo setup.
# A provisioning command that returns successfully is not a live-E2E pass.
# pass/fail are reporting helpers; the short boolean assertions below are
# intentionally non-fatal so the script can print the complete failure set.
# shellcheck disable=SC2015
set -uo pipefail

MODE=""
HUB_KUBECONFIG=""
SPOKE_KUBECONFIG=""
HUB_CLUSTER_NAME=""
SPOKE_CLUSTER_NAME=""
RUNTIME_MANIFEST=""
IMAGE_TAG=""
OPERATOR_IMAGE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode) MODE="${2:-}"; shift 2 ;;
    --hub-kubeconfig) HUB_KUBECONFIG="${2:-}"; shift 2 ;;
    --spoke-kubeconfig) SPOKE_KUBECONFIG="${2:-}"; shift 2 ;;
    --hub-cluster-name) HUB_CLUSTER_NAME="${2:-}"; shift 2 ;;
    --spoke-cluster-name) SPOKE_CLUSTER_NAME="${2:-}"; shift 2 ;;
    --runtime-manifest) RUNTIME_MANIFEST="${2:-}"; shift 2 ;;
    --image-tag) IMAGE_TAG="${2:-}"; shift 2 ;;
    --operator-image) OPERATOR_IMAGE="${2:-}"; shift 2 ;;
    *) echo "error: unknown argument $1" >&2; exit 2 ;;
  esac
done

[[ "$MODE" == "local" || "$MODE" == "fleet" || "$MODE" == "fullpipeline" ]] || { echo "error: invalid mode" >&2; exit 2; }

for command in kubectl jq curl; do
  command -v "$command" >/dev/null 2>&1 || { echo "error: $command is required" >&2; exit 1; }
done
[[ -s "$HUB_KUBECONFIG" ]] || { echo "error: hub kubeconfig is missing" >&2; exit 1; }
if [[ "$MODE" == "fleet" && ! -s "$SPOKE_KUBECONFIG" ]]; then
  echo "error: fleet mode requires a spoke kubeconfig" >&2
  exit 1
fi

PASS=0
FAIL=0
pass() { echo "[PASS] $1"; PASS=$((PASS + 1)); }
fail() { echo "[FAIL] $1" >&2; FAIL=$((FAIL + 1)); }

hub() { kubectl --kubeconfig "$HUB_KUBECONFIG" "$@"; }
spoke() { kubectl --kubeconfig "$SPOKE_KUBECONFIG" "$@"; }

CONSOLE_URL="https://kubernaut-console.local:8843"
API_FRONTEND_URL="https://127.0.0.1:18443"
KEYCLOAK_URL="https://keycloak:8443/realms/kubernaut-demo"
EXPECTED_REMOTE_CLUSTER_ID="remote-cluster"
EXPECTED_GATEWAY_TYPE=""
EXPECTED_GATEWAY_NAMESPACE="mcp-system"

if [[ -n "$RUNTIME_MANIFEST" ]]; then
  if [[ ! -s "$RUNTIME_MANIFEST" ]]; then
    echo "error: runtime manifest is missing" >&2
    exit 1
  fi
  manifest_mode="$(jq -er '.mode' "$RUNTIME_MANIFEST")" || { echo "error: runtime manifest has no mode" >&2; exit 1; }
  [[ "$manifest_mode" == "$MODE" ]] || { echo "error: runtime manifest mode does not match preflight mode" >&2; exit 1; }
  CONSOLE_URL="$(jq -er '.urls.console' "$RUNTIME_MANIFEST")" || { echo "error: runtime manifest has no Console URL" >&2; exit 1; }
  API_FRONTEND_URL="$(jq -er '.urls.apiFrontend' "$RUNTIME_MANIFEST")" || { echo "error: runtime manifest has no API Frontend URL" >&2; exit 1; }
  KEYCLOAK_URL="$(jq -er '.urls.keycloak' "$RUNTIME_MANIFEST")" || { echo "error: runtime manifest has no Keycloak URL" >&2; exit 1; }
  [[ "$(jq -er '.clusters.hub.name' "$RUNTIME_MANIFEST")" == "$HUB_CLUSTER_NAME" ]] || { echo "error: runtime manifest hub cluster mismatch" >&2; exit 1; }
  [[ "$(jq -er '.kubeconfigs.hub' "$RUNTIME_MANIFEST")" == "$HUB_KUBECONFIG" ]] || { echo "error: runtime manifest hub kubeconfig mismatch" >&2; exit 1; }
  if [[ "$MODE" == "fleet" ]]; then
    [[ "$(jq -er '.clusters.spoke.name' "$RUNTIME_MANIFEST")" == "$SPOKE_CLUSTER_NAME" ]] || { echo "error: runtime manifest spoke cluster mismatch" >&2; exit 1; }
    [[ "$(jq -er '.kubeconfigs.spoke' "$RUNTIME_MANIFEST")" == "$SPOKE_KUBECONFIG" ]] || { echo "error: runtime manifest spoke kubeconfig mismatch" >&2; exit 1; }
    EXPECTED_REMOTE_CLUSTER_ID="$(jq -er '.fleet.remoteClusterID' "$RUNTIME_MANIFEST")" || { echo "error: runtime manifest has no remote cluster ID" >&2; exit 1; }
    EXPECTED_GATEWAY_TYPE="$(jq -er '.fleet.gateway.type' "$RUNTIME_MANIFEST")" || { echo "error: runtime manifest has no gateway type" >&2; exit 1; }
    EXPECTED_GATEWAY_NAMESPACE="$(jq -er '.fleet.gateway.namespace' "$RUNTIME_MANIFEST")" || { echo "error: runtime manifest has no gateway namespace" >&2; exit 1; }
  fi
fi

check_kubeconfig_identity() {
  local label="$1" kubeconfig="$2" expected_name="$3"
  local context cluster server
  context="$(kubectl --kubeconfig "$kubeconfig" config current-context 2>/dev/null || true)"
  cluster="$(kubectl --kubeconfig "$kubeconfig" config view --minify -o jsonpath='{.contexts[0].context.cluster}' 2>/dev/null || true)"
  server="$(kubectl --kubeconfig "$kubeconfig" config view --minify -o jsonpath='{.clusters[0].cluster.server}' 2>/dev/null || true)"
  if [[ -n "$context" && -n "$cluster" && -n "$server" && ( -z "$expected_name" || "$cluster" == "kind-${expected_name}" ) ]]; then
    pass "$label kubeconfig targets ${cluster} (${context})"
  else
    fail "$label kubeconfig is missing, stale, or targets ${cluster:-<unknown>}"
  fi
}

check_pod_image() {
  local label="$1" kubeconfig="$2" expected="$3"
  local pods
  pods="$(kubectl --kubeconfig "$kubeconfig" get pods --all-namespaces -o json 2>/dev/null || true)"
  if [[ -n "$pods" ]] && jq -e --arg expected "$expected" '
    [.items[]? | (.spec.containers[]?, .spec.initContainers[]?) | select(.image == $expected)] | length > 0
  ' <<<"$pods" >/dev/null 2>&1; then
    pass "$label uses image ${expected}"
  else
    fail "$label does not use expected image ${expected}"
  fi
}

check_cluster() {
  local label="$1" kubeconfig="$2"
  if kubectl --kubeconfig "$kubeconfig" cluster-info >/dev/null 2>&1; then
    pass "$label Kubernetes API reachable"
  else
    fail "$label Kubernetes API is not reachable"
  fi
}

check_deployment() {
  local label="$1" kubeconfig="$2" namespace="$3" name="$4"
  if kubectl --kubeconfig "$kubeconfig" get deployment "$name" -n "$namespace" >/dev/null 2>&1 \
    && kubectl --kubeconfig "$kubeconfig" rollout status "deployment/$name" -n "$namespace" --timeout=180s >/dev/null 2>&1; then
    pass "$label deployment/$name ready"
  else
    fail "$label deployment/$name is not ready"
  fi
}

check_service_endpoints() {
  local label="$1" kubeconfig="$2" namespace="$3" name="$4"
  local service endpoints
  service="$(kubectl --kubeconfig "$kubeconfig" get service "$name" -n "$namespace" -o json 2>/dev/null || true)"
  endpoints="$(kubectl --kubeconfig "$kubeconfig" get endpoints "$name" -n "$namespace" -o json 2>/dev/null || true)"
  if [[ -n "$service" ]] && jq -e '.spec.ports | length > 0' <<<"$service" >/dev/null 2>&1 \
    && [[ -n "$endpoints" ]] \
    && jq -e '[.subsets[]?.addresses[]?] | length > 0' <<<"$endpoints" >/dev/null 2>&1; then
    pass "$label service/$name has ready endpoints"
  else
    fail "$label service/$name is missing or has no ready endpoints"
  fi
}

check_operator_readiness() {
  local deployments
  deployments="$(hub get deployments -n kubernaut-system -l 'app.kubernetes.io/managed-by=kubernaut-operator' -o json 2>/dev/null || true)"
  if [[ -z "$deployments" ]] || ! jq -e '.items | length > 0 and all(.[]; ((.spec.replicas // 0) > 0 and (.status.readyReplicas // 0) == .spec.replicas and (.status.updatedReplicas // 0) == .spec.replicas and (.status.availableReplicas // 0) == .spec.replicas))' <<<"$deployments" >/dev/null 2>&1; then
    fail "operator-managed application Deployments are not all Ready"
  else
    pass "operator-managed application Deployments are Ready"
  fi
}

check_kubeconfig_identity "Hub" "$HUB_KUBECONFIG" "$HUB_CLUSTER_NAME"
if [[ "$MODE" == "fleet" ]]; then
  check_kubeconfig_identity "Spoke" "$SPOKE_KUBECONFIG" "$SPOKE_CLUSTER_NAME"
fi

check_cluster "Hub" "$HUB_KUBECONFIG"
if [[ "$MODE" == "fleet" ]]; then
  check_cluster "Spoke" "$SPOKE_KUBECONFIG"
fi

cr_json="$(hub get kubernauts -n kubernaut-system -o json 2>/dev/null || true)"
if [[ -z "$cr_json" ]] || ! jq -e '.items | length == 1' <<<"$cr_json" >/dev/null 2>&1; then
  fail "exactly one Kubernaut CR exists in kubernaut-system"
else
  jq -e '.items[0].status.phase == "Running"' <<<"$cr_json" >/dev/null 2>&1 \
    && pass "Kubernaut CR phase is Running" || fail "Kubernaut CR phase is not Running"
  for condition in BYOValidated MigrationComplete ServicesDeployed TLSReady; do
    jq -e --arg condition "$condition" '.items[0].status.conditions // [] | any(.[]; .type == $condition and .status == "True")' <<<"$cr_json" >/dev/null 2>&1 \
      && pass "Kubernaut condition ${condition}=True" || fail "Kubernaut condition ${condition} is not True"
  done
  jq -e '.items[0].status.services // [] | length > 0 and all(.[]; .ready == true)' <<<"$cr_json" >/dev/null 2>&1 \
    && pass "Kubernaut service status is Ready" || fail "one or more Kubernaut service statuses are not Ready"
  jq -e '.items[0].spec.console.enabled == true' <<<"$cr_json" >/dev/null 2>&1 \
    && pass "Console enabled in Kubernaut CR" || fail "Console is not enabled in Kubernaut CR"
  jq -e '.items[0].spec.apiFrontend.enabled == true' <<<"$cr_json" >/dev/null 2>&1 \
    && pass "API Frontend enabled in Kubernaut CR" || fail "API Frontend is not enabled in Kubernaut CR"
  jq -e '.items[0].spec.gateway.enabled == false' <<<"$cr_json" >/dev/null 2>&1 \
    && pass "Gateway disabled for console-driven lane" || fail "Gateway must be disabled for this console-driven lane"
  if [[ "$MODE" == "fleet" ]]; then
    jq -e '.items[0].spec.fleet.enabled == true' <<<"$cr_json" >/dev/null 2>&1 \
      && pass "Fleet enabled in Kubernaut CR" || fail "Fleet is not enabled in Kubernaut CR"
  else
    jq -e '(.items[0].spec.fleet.enabled // false) == false' <<<"$cr_json" >/dev/null 2>&1 \
      && pass "Fleet disabled in local Kubernaut CR" || fail "Fleet must be disabled in local mode"
  fi
fi

check_operator_readiness
check_deployment "Hub" "$HUB_KUBECONFIG" traefik-system traefik
check_deployment "Mock LLM" "$HUB_KUBECONFIG" kubernaut-system mock-llm
check_service_endpoints "Mock LLM" "$HUB_KUBECONFIG" kubernaut-system mock-llm

if [[ -n "$IMAGE_TAG" ]]; then
  check_pod_image "Console" "$HUB_KUBECONFIG" "localhost/kubernaut-console:${IMAGE_TAG}"
fi
if [[ -n "$OPERATOR_IMAGE" ]]; then
  check_pod_image "Operator" "$HUB_KUBECONFIG" "$OPERATOR_IMAGE"
fi

keycloak_name="$(hub get deployments -n idp -o json 2>/dev/null | jq -r '.items[] | select(.metadata.name | contains("keycloak")) | .metadata.name' | head -1)"
if [[ -n "$keycloak_name" ]]; then
  check_deployment "Identity" "$HUB_KUBECONFIG" idp "$keycloak_name"
else
  fail "no Keycloak deployment found in idp"
fi

hub get ingress kubernaut-console -n kubernaut-system >/dev/null 2>&1 \
  && pass "Console Ingress exists" || fail "Console Ingress is missing"

console_status="$(curl -ksS --max-time 20 -o /dev/null -w '%{http_code}' --resolve kubernaut-console.local:8843:127.0.0.1 "${CONSOLE_URL%/}/" 2>/dev/null || true)"
case "$console_status" in
  200|302) pass "Console edge responds with HTTP ${console_status}" ;;
  *) fail "Console edge returned HTTP ${console_status:-no-response}" ;
esac

api_frontend_status="$(curl -ksS --max-time 20 -o /dev/null -w '%{http_code}' "${API_FRONTEND_URL%/}/readyz" 2>/dev/null || true)"
case "$api_frontend_status" in
  200|204) pass "API Frontend readiness responds with HTTP ${api_frontend_status}" ;;
  *) fail "API Frontend readiness returned HTTP ${api_frontend_status:-no-response}" ;;
esac

keycloak_status="$(curl -ksS --max-time 20 -o /dev/null -w '%{http_code}' --resolve keycloak:8443:127.0.0.1 "$KEYCLOAK_URL" 2>/dev/null || true)"
[[ "$keycloak_status" == "200" ]] && pass "Keycloak demo realm responds" || fail "Keycloak demo realm returned HTTP ${keycloak_status:-no-response}"

workflow_count="$(hub get remediationworkflows -n kubernaut-system --no-headers 2>/dev/null | awk 'NF {count++} END {print count+0}')"
action_count="$(hub get actiontypes -n kubernaut-system --no-headers 2>/dev/null | awk 'NF {count++} END {print count+0}')"
[[ "$workflow_count" -gt 0 ]] && pass "RemediationWorkflow catalog has ${workflow_count} entries" || fail "RemediationWorkflow catalog is empty"
[[ "$action_count" -gt 0 ]] && pass "ActionType catalog has ${action_count} entries" || fail "ActionType catalog is empty"

check_action_type() {
  local resource="$1" expected_name="$2" action_json
  action_json="$(hub get actiontype "$resource" -n kubernaut-system -o json 2>/dev/null || true)"
  if [[ -n "$action_json" ]] && jq -e --arg expected "$expected_name" '
    .metadata.name != null
    and .spec.name == $expected
    and .status.registered == true
    and .status.catalogStatus == "Active"
  ' <<<"$action_json" >/dev/null 2>&1; then
    pass "Required ActionType ${expected_name} is registered and Active"
  else
    fail "Required ActionType ${expected_name} is missing, unregistered, or not Active"
  fi
}

check_workflow() {
  local resource="$1" expected_action="$2" expected_service_account="$3" workflow_json
  workflow_json="$(hub get remediationworkflow "$resource" -n kubernaut-system -o json 2>/dev/null || true)"
  if [[ -n "$workflow_json" ]] && jq -e --arg expected_action "$expected_action" --arg expected_sa "$expected_service_account" '
    .metadata.name != null
    and .spec.actionType == $expected_action
    and .spec.execution.engine == "job"
    and .spec.execution.serviceAccountName == $expected_sa
    and (.status.workflowId // "") != ""
    and .status.catalogStatus == "Active"
  ' <<<"$workflow_json" >/dev/null 2>&1; then
    pass "Required workflow ${resource} is registered and Active"
  else
    fail "Required workflow ${resource} is missing, unregistered, or has an unexpected execution contract"
  fi
}

check_action_type rollback-deployment RollbackDeployment
check_action_type fix-stateful-set-pvc FixStatefulSetPVC
check_workflow crashloop-rollback-v1 RollbackDeployment crashloop-rollback-v1-runner
check_workflow fix-statefulset-pvc-v1 FixStatefulSetPVC fix-statefulset-pvc-v1-runner

if [[ "$MODE" == "fleet" ]]; then
  check_deployment "Fleet MCP" "$HUB_KUBECONFIG" "$EXPECTED_GATEWAY_NAMESPACE" kube-mcp-server
  check_deployment "Fleet metadata cache" "$HUB_KUBECONFIG" "$EXPECTED_GATEWAY_NAMESPACE" fleetmetadatacache
  gateway_type="$EXPECTED_GATEWAY_TYPE"
  if [[ -z "$gateway_type" ]] && hub get deployment mcp-gateway -n "$EXPECTED_GATEWAY_NAMESPACE" >/dev/null 2>&1; then
    gateway_type="kuadrant"
  elif [[ -z "$gateway_type" ]] && hub get deployment envoy-gateway -n envoy-gateway-system >/dev/null 2>&1; then
    gateway_type="eaigw"
  fi
  if [[ "$gateway_type" == "kuadrant" ]]; then
    check_deployment "Kuadrant gateway" "$HUB_KUBECONFIG" "$EXPECTED_GATEWAY_NAMESPACE" mcp-gateway-controller
    check_deployment "Kuadrant gateway" "$HUB_KUBECONFIG" "$EXPECTED_GATEWAY_NAMESPACE" mcp-gateway
    registration="$EXPECTED_REMOTE_CLUSTER_ID"
    registration_json="$(hub get mcpserverregistration "$registration" -n "$EXPECTED_GATEWAY_NAMESPACE" -o json 2>/dev/null || true)"
    if [[ -n "$registration_json" ]] && jq -e '.status.conditions // [] | any(.[]; .type == "Ready" and .status == "True")' <<<"$registration_json" >/dev/null 2>&1; then
      pass "MCPServerRegistration/${registration} Ready"
    else
      fail "MCPServerRegistration/${registration} is not Ready"
    fi
  elif [[ "$gateway_type" == "eaigw" ]]; then
    check_deployment "EAIGW" "$HUB_KUBECONFIG" envoy-gateway-system envoy-gateway
    check_deployment "EAIGW" "$HUB_KUBECONFIG" envoy-ai-gateway-system ai-gateway-controller
    check_service_endpoints "EAIGW" "$HUB_KUBECONFIG" envoy-gateway-system mcp-gateway
    backend_json="$(hub get backends.gateway.envoyproxy.io "$EXPECTED_REMOTE_CLUSTER_ID" -n "$EXPECTED_GATEWAY_NAMESPACE" -o json 2>/dev/null || true)"
    [[ -n "$backend_json" ]] && pass "EAIGW ${EXPECTED_REMOTE_CLUSTER_ID} Backend exists" || fail "EAIGW ${EXPECTED_REMOTE_CLUSTER_ID} Backend is missing"
    route_json="$(hub get mcproutes.aigateway.envoyproxy.io kube-mcp-server-route -n "$EXPECTED_GATEWAY_NAMESPACE" -o json 2>/dev/null || true)"
    if [[ -n "$route_json" ]] && jq -e '[.status.parents[]?.conditions[]?, .status.conditions[]?] | any(.[]; .status == "True" and (.type == "Accepted" or .type == "Programmed" or .type == "Ready"))' <<<"$route_json" >/dev/null 2>&1; then
      pass "EAIGW MCPRoute/kube-mcp-server-route is accepted"
    else
      fail "EAIGW MCPRoute/kube-mcp-server-route is not accepted"
    fi
  else
    fail "no supported fleet gateway topology was detected"
  fi
  spoke get namespace kubernaut-workflows >/dev/null 2>&1 \
    && pass "Spoke workflow execution namespace exists" || fail "Spoke workflow execution namespace is missing"
  for service_account in crashloop-rollback-v1-runner fix-statefulset-pvc-v1-runner; do
    spoke get serviceaccount "$service_account" -n kubernaut-workflows >/dev/null 2>&1 \
      && pass "Spoke runner ServiceAccount ${service_account} exists" || fail "Spoke runner ServiceAccount ${service_account} is missing"
  done
fi

echo "Preflight: ${PASS} passed, ${FAIL} failed"
[[ "$FAIL" -eq 0 ]]
