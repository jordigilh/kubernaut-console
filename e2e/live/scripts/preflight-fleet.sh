#!/usr/bin/env bash
# Preflight checks for the release/v1.6 fleet-management live E2E suite
# (README-v16-fleet-openshift.md), run before every test session against the
# hub/spoke SNO clusters. Read-only — makes no changes to the cluster.
#
# Codifies the checks that have been done ad hoc, by hand, every session so
# far. Added 2026-08-27 after a live incident where the fleet MCP Gateway
# broker silently stopped serving tool calls for ~7h (kube-mcp-server hung
# and stopped logging entirely; both MCPServerRegistrations went NotReady)
# with no alerting — a "last log timestamp" recency check here would have
# caught it immediately instead of an hour of live debugging starting from
# the wrong assumption (token expiry).
#
# Usage:
#   export KUBECONFIG=/path/to/hub-kubeconfig
#   e2e/live/scripts/preflight-fleet.sh
#
# Exit code: 0 if every check passes, 1 if any hard failure is found. Warnings
# (yellow) don't fail the script but are worth reading before you trust a run.
set -uo pipefail

PASS=0
WARN=0
FAIL=0

pass() { echo "  [PASS] $1"; PASS=$((PASS+1)); }
warn() { echo "  [WARN] $1"; WARN=$((WARN+1)); }
fail() { echo "  [FAIL] $1"; FAIL=$((FAIL+1)); }

section() { echo; echo "=== $1 ==="; }

if ! command -v oc >/dev/null 2>&1; then
  echo "error: 'oc' not found on PATH" >&2
  exit 1
fi
if ! oc whoami >/dev/null 2>&1; then
  echo "error: not logged in / KUBECONFIG not pointed at a live cluster" >&2
  exit 1
fi
echo "Cluster: $(oc whoami --show-server 2>/dev/null)"

# --- Kubernaut CR: console/AF/gateway/fleet flags ---------------------------
section "Kubernaut CR"
CR_JSON=$(oc get kubernaut -n kubernaut-system -o json 2>/dev/null | python3 -c 'import json,sys; d=json.load(sys.stdin); print(json.dumps(d["items"][0] if "items" in d else d))' 2>/dev/null)
if [[ -z "$CR_JSON" ]]; then
  fail "no Kubernaut CR found in kubernaut-system"
else
  console_enabled=$(echo "$CR_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("spec",{}).get("console",{}).get("enabled"))')
  af_enabled=$(echo "$CR_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("spec",{}).get("apiFrontend",{}).get("enabled"))')
  gw_enabled=$(echo "$CR_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("spec",{}).get("gateway",{}).get("enabled"))')
  rbac_bindings=$(echo "$CR_JSON" | python3 -c 'import json,sys; print(len(json.load(sys.stdin).get("spec",{}).get("apiFrontend",{}).get("rbac",{}).get("roleBindings",[]) or []))')

  [[ "$console_enabled" == "True" ]] && pass "spec.console.enabled=true" || fail "spec.console.enabled=$console_enabled (need true)"
  [[ "$af_enabled" == "True" ]] && pass "spec.apiFrontend.enabled=true" || fail "spec.apiFrontend.enabled=$af_enabled (need true)"
  if [[ "$gw_enabled" == "False" ]]; then
    pass "spec.gateway.enabled=false (expected — this suite is console/chat-driven, not webhook-driven)"
  else
    warn "spec.gateway.enabled=$gw_enabled (this suite doesn't need Gateway; confirm this is intentional for your run)"
  fi
  if [[ "$rbac_bindings" -gt 0 ]]; then
    pass "spec.apiFrontend.rbac.roleBindings has $rbac_bindings binding(s)"
  else
    fail "spec.apiFrontend.rbac.roleBindings is empty — every tool call will 403 regardless of login working (see kubernaut-operator's 03-deploy.md troubleshooting section)"
  fi
fi

# --- Core pod health ---------------------------------------------------------
section "Core pods (kubernaut-system)"
for label in "app.kubernetes.io/component=kubernaut-console" "app.kubernetes.io/component=apifrontend" "app.kubernetes.io/component=kubernaut-agent"; do
  status=$(oc get pod -n kubernaut-system -l "$label" -o jsonpath='{.items[0].status.phase}{" "}{.items[0].status.containerStatuses[0].ready}' 2>/dev/null)
  if [[ "$status" == "Running true" ]]; then
    pass "$label: Running, ready"
  else
    fail "$label: $status"
  fi
done

# --- Fleet MCP Gateway stack --------------------------------------------------
section "Fleet MCP Gateway"

for ns_dep in "mcp-system:kube-mcp-server" "mcp-system:mcp-gateway" "mcp-system:mcp-gateway-controller"; do
  ns="${ns_dep%%:*}"; dep="${ns_dep##*:}"
  avail=$(oc get deploy "$dep" -n "$ns" -o jsonpath='{.status.availableReplicas}' 2>/dev/null)
  [[ "${avail:-0}" -ge 1 ]] && pass "$dep deployment available" || fail "$dep deployment not available (availableReplicas=${avail:-0})"
done

# The actual bug that motivated this script: kube-mcp-server can be
# "Running"/"Ready" per Kubernetes while its own request-handling loop is
# silently wedged and has stopped logging anything at all. Staleness in its
# log stream is the cheapest reliable signal something's wrong, well before
# a real test run hits it and fails mysteriously.
for dep in kube-mcp-server; do
  last_log_epoch=$(oc logs -n mcp-system "deploy/$dep" --tail=1 --timestamps 2>/dev/null | head -1 | cut -d' ' -f1)
  if [[ -z "$last_log_epoch" ]]; then
    warn "$dep: no logs found at all (can't assess recency)"
  else
    last_epoch=$(python3 -c "
import datetime, sys
try:
    ts = datetime.datetime.fromisoformat('$last_log_epoch'.replace('Z', '+00:00'))
    print(int((datetime.datetime.now(datetime.UTC) - ts).total_seconds()))
except Exception:
    print(-1)
")
    if [[ "$last_epoch" == "-1" ]]; then
      warn "$dep: couldn't parse last log timestamp ($last_log_epoch)"
    elif [[ "$last_epoch" -gt 900 ]]; then
      fail "$dep: last log line is $((last_epoch/60))m old — likely wedged (kubernaut#TBD pattern: pod Running/Ready but request loop hung, stops logging entirely). Restart it: oc rollout restart deploy/$dep -n mcp-system"
    else
      pass "$dep: logged within the last $((last_epoch/60))m"
    fi
  fi
done

for reg in loopback spoke; do
  ready=$(oc get mcpserverregistration "$reg" -n mcp-system -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}' 2>/dev/null)
  msg=$(oc get mcpserverregistration "$reg" -n mcp-system -o jsonpath='{.status.conditions[?(@.type=="Ready")].message}' 2>/dev/null)
  if [[ "$ready" == "True" ]]; then
    pass "MCPServerRegistration/$reg: Ready"
  else
    fail "MCPServerRegistration/$reg: NotReady ($msg)"
  fi
done

ext_ready=$(oc get mcpgatewayextension mcp-gateway-extension -n mcp-system -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}' 2>/dev/null)
[[ "$ext_ready" == "True" ]] && pass "MCPGatewayExtension: Ready" || fail "MCPGatewayExtension: NotReady"

# Live functional check, not just status fields: an actual tool call through
# the exact path a real test uses. Requires a valid AF-side or KA-side
# ServiceAccount token with kube-mcp-server audience; skipped if unavailable
# rather than failing preflight on missing local tooling.
broker_secret_exp=$(oc get secret kube-mcp-server-broker-cred -n mcp-system -o jsonpath='{.data.token}' 2>/dev/null | base64 -d 2>/dev/null | python3 -c "
import sys, json, base64, datetime
try:
    t = sys.stdin.read().strip()
    p = t.split('.')[1]; p += '=' * (-len(p) % 4)
    c = json.loads(base64.urlsafe_b64decode(p))
    exp = datetime.datetime.fromtimestamp(c['exp'], datetime.UTC)
    now = datetime.datetime.now(datetime.UTC)
    mins_left = int((exp - now).total_seconds() / 60)
    print(mins_left)
except Exception:
    print('ERR')
" 2>/dev/null)
if [[ "$broker_secret_exp" == "ERR" || -z "$broker_secret_exp" ]]; then
  warn "kube-mcp-server-broker-cred: couldn't decode/check expiry"
elif [[ "$broker_secret_exp" -lt 0 ]]; then
  fail "kube-mcp-server-broker-cred: token EXPIRED ${broker_secret_exp#-}m ago — rotate it (see README-v16-fleet-openshift.md troubleshooting) and note: the derived mcp-gateway-config Secret must also be deleted to force regeneration, it does not auto-refresh"
elif [[ "$broker_secret_exp" -lt 60 ]]; then
  warn "kube-mcp-server-broker-cred: expires in ${broker_secret_exp}m — rotate before a long session"
else
  pass "kube-mcp-server-broker-cred: valid for ${broker_secret_exp}m"
fi

# FleetMetadataCache has no CR/status of its own to query — the only
# ground-truth signal that fleet is *functionally* live (as opposed to a
# Kubernaut CR field that may or may not be the actual source of truth for a
# given operator version — found 2026-08-27 that spec.fleet can be absent
# from the CR entirely while FMC is still correctly fleet-federating) is its
# own "New cluster discovered" log line for every registered cluster name.
fmc_pod=$(oc get pod -n kubernaut-system -l 'app.kubernetes.io/component=fleetmetadatacache' -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
if [[ -z "$fmc_pod" ]]; then
  warn "FleetMetadataCache: no pod found (skip cluster-discovery check — fine if this cluster doesn't use fleet)"
else
  discovered=$(oc logs -n kubernaut-system "$fmc_pod" 2>/dev/null | grep -o '"cluster":"[^"]*"' | sort -u | sed 's/"cluster":"//;s/"$//')
  missing=""
  for reg in loopback spoke; do
    echo "$discovered" | grep -qx "$reg" || missing="$missing $reg"
  done
  if [[ -z "$missing" ]]; then
    pass "FleetMetadataCache: discovered all registered clusters (${discovered//$'\n'/, })"
  else
    fail "FleetMetadataCache: never logged discovery for:$missing — check FMC logs/restart it (oc logs -n kubernaut-system $fmc_pod)"
  fi
fi

# --- Workflow catalog ---------------------------------------------------------
section "Workflow catalog"
wf_count=$(oc get remediationworkflow -n kubernaut-system --no-headers 2>/dev/null | wc -l | tr -d ' ')
at_count=$(oc get actiontype -n kubernaut-system --no-headers 2>/dev/null | wc -l | tr -d ' ')
[[ "${wf_count:-0}" -gt 0 ]] && pass "RemediationWorkflow catalog: $wf_count entries" || fail "RemediationWorkflow catalog is empty — seed from kubernaut-demo-scenarios first"
[[ "${at_count:-0}" -gt 0 ]] && pass "ActionType catalog: $at_count entries" || fail "ActionType catalog is empty — seed from kubernaut-demo-scenarios first"

if [[ "${fleet_enabled:-}" == "True" && "${wf_count:-0}" -gt 0 ]]; then
  no_cluster_label=$(oc get remediationworkflow -n kubernaut-system -o json 2>/dev/null | python3 -c "
import json, sys
d = json.load(sys.stdin)
missing = [i['metadata']['name'] for i in d.get('items', []) if 'cluster' not in i.get('spec', {}).get('labels', {})]
print(len(missing))
")
  [[ "${no_cluster_label:-0}" -eq 0 ]] && pass "all RemediationWorkflows have labels.cluster set (required for fleet discovery)" || fail "$no_cluster_label RemediationWorkflow(s) missing labels.cluster — undiscoverable when fleet is enabled"
fi

# Every RemediationWorkflow bundles its own runner ServiceAccount/ClusterRole/
# ClusterRoleBinding (see e.g. kubernaut-demo-scenarios' crashloop.yaml), but
# WorkflowExecution's Job dispatch is fleet-aware (client_factory.go:
# ClusterID="" -> local, non-empty -> MCP-Gateway-routed remote) — so those
# ServiceAccounts need to exist on whichever cluster fixtures actually target,
# not necessarily hub. Missing 2026-08-27: went completely undetected until a
# live test hung on "serviceaccount ... not found" 9+ minutes into a
# WorkflowExecution Job. Only runs when LIVE_E2E_FLEET_CLUSTER_KUBECONFIG
# points at the fixture cluster; silently skipped in v1.5 (non-fleet) mode.
if [[ -n "${LIVE_E2E_FLEET_CLUSTER_KUBECONFIG:-}" ]]; then
  section "Fleet-target workflow-runner RBAC (${LIVE_E2E_FLEET_CLUSTER_KUBECONFIG})"
  runner_sa_count=$(KUBECONFIG="$LIVE_E2E_FLEET_CLUSTER_KUBECONFIG" oc get sa -n kubernaut-workflows -l 'kubernaut.ai/workflow-runner=true' --no-headers 2>/dev/null | wc -l | tr -d ' ')
  if [[ "${runner_sa_count:-0}" -ge "${wf_count:-1}" ]]; then
    pass "workflow-runner ServiceAccounts on fleet target: $runner_sa_count (>= $wf_count catalog entries)"
  else
    fail "workflow-runner ServiceAccounts on fleet target: only $runner_sa_count found for $wf_count catalog entries — run e2e/live/scripts/provision-fleet-workflow-rbac.sh against this cluster (KUBECONFIG=$LIVE_E2E_FLEET_CLUSTER_KUBECONFIG)"
  fi
fi

# --- Keycloak / test identity --------------------------------------------------
section "Console E2E identity"
oc get secret console-e2e-keycloak-creds -n kubernaut-system >/dev/null 2>&1 \
  && pass "console-e2e-keycloak-creds Secret present" \
  || fail "console-e2e-keycloak-creds Secret missing — see README-v16-fleet-openshift.md 'Enabling console + AF on hub'"

# Every check above can be green while the auth chain is still completely
# broken: found 2026-08-27 that AF's JWT provider had no jwksURL configured,
# so it fell back to fetching JWKS from the bare issuer URL (Keycloak's realm
# info document, not .../protocol/openid-connect/certs) — every token failed
# signature verification with zero visible error at INFO log level (only
# surfaced at V(1)/DEBUG). Console/AF/gateway all reported Running/Ready the
# whole time; the first symptom would have been every single Playwright test
# failing at the chat textarea (masked as "Unable to Verify Access"). This is
# the one check in this script that exercises the exact request path (nginx
# -> oauth2-proxy -> AF, real Keycloak token, real signature verification) a
# live test run depends on — skipped only if the token-fetch tooling itself
# is unavailable, never skipped just because other checks passed.
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if ! command -v node >/dev/null 2>&1; then
  warn "auth end-to-end check: 'node' not found on PATH — can't fetch a Keycloak token, skipping"
elif [[ ! -f "$script_dir/keycloak-token.mjs" ]]; then
  warn "auth end-to-end check: keycloak-token.mjs not found next to this script — skipping"
else
  console_host=$(oc get route -n kubernaut-system -l 'app.kubernetes.io/component=kubernaut-console' -o jsonpath='{.items[0].spec.host}' 2>/dev/null)
  if [[ -z "$console_host" ]]; then
    warn "auth end-to-end check: no console Route found in kubernaut-system — skipping"
  else
    # shellcheck disable=SC1090
    source "$script_dir/fetch-creds.sh" >/dev/null 2>&1
    e2e_token=$(node "$script_dir/keycloak-token.mjs" 2>/dev/null)
    if [[ -z "$e2e_token" ]]; then
      warn "auth end-to-end check: keycloak-token.mjs returned no token — check console-e2e-keycloak-creds / Keycloak reachability, skipping"
    else
      access_status=$(curl -sk -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $e2e_token" "https://${console_host}/a2a/access" 2>/dev/null)
      case "$access_status" in
        200) pass "auth end-to-end: /a2a/access via https://${console_host} returned 200 (real token, real signature verification)" ;;
        401) fail "auth end-to-end: /a2a/access returned 401 — token rejected. Check AF's rendered jwtProviders[].jwksURL isn't empty (falls back to the bare issuer URL, which is NOT a JWKS document, and every token fails signature verification silently at INFO level — bump spec.apiFrontend.logging.level to DEBUG to confirm: 'malformed token: signature verification failed')" ;;
        403) fail "auth end-to-end: /a2a/access returned 403 — token validates but RBAC denies it. Check spec.apiFrontend.rbac.roleBindings group/persona mapping" ;;
        502|503|504) fail "auth end-to-end: /a2a/access returned $access_status — transport-level failure (e.g. AF serving plain HTTP while nginx proxies HTTPS, or AF/oauth2-proxy down). Check AF logs for 'TLS disabled' / 'server listening (TLS)'" ;;
        *) fail "auth end-to-end: /a2a/access returned unexpected status $access_status" ;;
      esac
    fi
  fi
fi

# --- Summary -------------------------------------------------------------------
section "Summary"
echo "  $PASS passed, $WARN warnings, $FAIL failures"
if [[ "$FAIL" -gt 0 ]]; then
  echo
  echo "Preflight FAILED. Fix the [FAIL] items above before running the suite —"
  echo "running against a known-broken environment produces false-negative test"
  echo "results that look like product bugs."
  exit 1
fi
if [[ "$WARN" -gt 0 ]]; then
  echo
  echo "Preflight passed with warnings. Review them before trusting a full run."
fi
exit 0
