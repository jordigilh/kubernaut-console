#!/usr/bin/env bash
# Provisions all e2e/live fixture namespaces needed by playwright.live-v15.config.ts
# (the release/v1.5 / shared-OpenShift-dev-cluster suite) with a fresh, random
# suffix, then prints an env file to `source` before running the suite.
#
# Why randomized namespaces (2026-08-05): RemediationOrchestrator has three
# independent safety mechanisms that key off the *target resource identity*,
# not the test name, and all three fire on a namespace that's already been
# remediated (or failed to remediate) a few times earlier in the same
# session/day:
#   - ConsecutiveFailures (BR-ORCH-042): 3 consecutive Failed/Blocked RRs for
#     the same signal-target fingerprint block *all* new RRs on it for 1h.
#   - RecentlyRemediated (DD-WE-001): blocks re-running the *same* workflow
#     on the same target within 5m of a prior success.
#   - IneffectiveChain (issue #214, BR-ORCH-042.5): 3 consecutive ineffective
#     remediations (hash-chain match) within a 4h lookback escalates to
#     manual review instead of retrying.
# Before this script, the workaround was hand-bumping the namespace's numeric
# suffix (console-e2e-lifecycle -> -2 -> -3, see full-remediation-lifecycle.spec.ts's
# TARGETS comment) every time one fouled — this script does the equivalent
# automatically, on every run, so it never needs to happen by hand again.
#
# Credentials handling: this script never writes secrets into the workspace.
# The only file it writes lives under $HOME (KUBERNAUT_E2E_STATE_DIR, default
# ~/.config/kubernaut-console-e2e/), and it contains namespace names only —
# no credentials. See fetch-creds.sh for the (separate) Keycloak credential
# cache, also $HOME-based.
#
# Usage:
#   e2e/live/scripts/setup-fixtures.sh [suffix]
#   source ~/.config/kubernaut-console-e2e/fixtures.env
#   npx playwright test --config=playwright.live-v15.config.ts
#
# Prerequisites: KUBECONFIG pointed at the shared OpenShift dev cluster, and
# a local checkout of kubernaut-demo-scenarios (see DEMO_SCENARIOS_DIR below)
# for the crashloop scenario's ConfigMap/Deployment manifests.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATE_DIR="${KUBERNAUT_E2E_STATE_DIR:-$HOME/.config/kubernaut-console-e2e}"
FIXTURES_ENV_FILE="$STATE_DIR/fixtures.env"
DEMO_SCENARIOS_DIR="${KUBERNAUT_DEMO_SCENARIOS_DIR:-$HOME/go/src/github.com/jordigilh/kubernaut-demo-scenarios}"
CONFIGMAP_MANIFEST="$DEMO_SCENARIOS_DIR/scenarios/crashloop/manifests/configmap.yaml"
DEPLOYMENT_MANIFEST="$DEMO_SCENARIOS_DIR/scenarios/crashloop/manifests/deployment.yaml"
PROMETHEUS_RULE_MANIFEST="$DEMO_SCENARIOS_DIR/scenarios/crashloop/manifests/prometheus-rule.yaml"
FIXTURES_LIST="$SCRIPT_DIR/fixtures.list"

if ! command -v oc >/dev/null 2>&1; then
  echo "error: 'oc' not found on PATH" >&2
  exit 1
fi
if [[ ! -f "$CONFIGMAP_MANIFEST" || ! -f "$DEPLOYMENT_MANIFEST" || ! -f "$PROMETHEUS_RULE_MANIFEST" ]]; then
  echo "error: kubernaut-demo-scenarios crashloop manifests not found under $DEMO_SCENARIOS_DIR" >&2
  echo "       set KUBERNAUT_DEMO_SCENARIOS_DIR if your checkout lives elsewhere" >&2
  exit 1
fi

SUFFIX="${1:-$(openssl rand -hex 3 2>/dev/null || printf '%06x' "$RANDOM")}"
echo "Fixture run suffix: $SUFFIX"

mkdir -p "$STATE_DIR"
chmod 700 "$STATE_DIR"

# Shared, cluster-wide PrometheusRule (openshift-monitoring) that fires
# KubePodCrashLooping for every console-e2e-* namespace regardless of run
# suffix. Idempotent/self-healing: re-sources its annotation text from
# kubernaut-demo-scenarios' own crashloop prometheus-rule.yaml on every run
# instead of hand-copying it once, so it can never silently drift from the
# text the golden transcripts were actually captured against.
#
# Why this matters (found 2026-08-07 live validation): this rule's `summary`
# annotation had drifted to a hand-written approximation ("...is in
# CrashLoopBackOff.") instead of the demo-scenario's actual text ("...is
# restarting repeatedly (N restarts in 5m)."), which is part of the alert
# content a real LLM's RCA sees. Two consecutive crashloopTarget runs
# concluded no_matching_workflows instead of the documented
# crashloop-rollback-v1 while this drift was live — reverted immediately
# once caught, but the *drift itself* (a hand-authored rule silently
# diverging from its source of truth) was the actual defect, independent of
# whether that specific text difference was the proximate cause. This
# function is the fix: never hand-author this text again.
ensure_console_e2e_alerts_rule() {
  local summary description
  summary=$(oc create --dry-run=client -f "$PROMETHEUS_RULE_MANIFEST" -o jsonpath='{.spec.groups[0].rules[0].annotations.summary}')
  description=$(oc create --dry-run=client -f "$PROMETHEUS_RULE_MANIFEST" -o jsonpath='{.spec.groups[0].rules[0].annotations.description}')
  cat <<EOF | oc apply -f - >/dev/null
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: console-e2e-alerts
  namespace: openshift-monitoring
  labels:
    console-e2e: "true"
spec:
  groups:
  - name: console-e2e
    rules:
    - alert: KubePodCrashLooping
      expr: |
        max_over_time(
          kube_pod_container_status_waiting_reason{
            namespace=~"console-e2e-.*",
            reason="CrashLoopBackOff"
          }[2m]
        ) > 0
      for: 30s
      labels:
        severity: critical
      annotations:
        summary: |
          $summary
        description: |
          $description
EOF
}

echo "Ensuring console-e2e-alerts PrometheusRule matches kubernaut-demo-scenarios' text..."
ensure_console_e2e_alerts_rule

create_namespace() {
  local ns="$1" env_label="$2"
  oc create namespace "$ns" --dry-run=client -o yaml | oc apply -f - >/dev/null
  oc label namespace "$ns" kubernaut.ai/managed=true --overwrite >/dev/null
  if [[ "$env_label" == "production" ]]; then
    # Required for crashloop-rollback-v1 (and every sibling rollback
    # workflow) to match at all: the catalog registers them with
    # labels.environment: ["production"], no wildcard (confirmed via direct
    # remediation_workflow_catalog query, 2026-08-05). Without this label,
    # workflow discovery returns zero candidates regardless of confidence.
    oc label namespace "$ns" kubernaut.ai/environment=production --overwrite >/dev/null
  fi
}

# crashloop: kubernaut-demo-scenarios' `worker` Deployment (a real
# demo-http-server), retargeted per-namespace, then faulted with a bad
# release command override — same shape as
# kubernaut-demo-scenarios/scenarios/crashloop/inject-bad-release.sh.
setup_crashloop() {
  local ns="$1"
  create_namespace "$ns" "production"
  sed "s/namespace: demo-checkout/namespace: $ns/" "$CONFIGMAP_MANIFEST" | oc apply -f - >/dev/null
  sed "s/namespace: demo-checkout/namespace: $ns/" "$DEPLOYMENT_MANIFEST" | oc apply -f - >/dev/null
  oc rollout status "deployment/worker" -n "$ns" --timeout=120s >/dev/null
  oc patch deployment worker -n "$ns" --type=json \
    -p '[{"op":"add","path":"/spec/template/spec/containers/0/command","value":["sh","-c","echo fatal: bad release 1.1.0 -- aborting && exit 1"]}]' \
    >/dev/null
}

# memory-eater: throttled OOM-loop fixture (see helpers.ts's oomkillTarget
# doc comment). nodeAffinity avoids dev-worker-1 (persistent CRI-O
# CreateContainerError/"broken pipe" node, kubernaut-console live-suite
# incident 2026-08-02) and the throttled `dd ... count=5; sleep 1` loop
# avoids overwhelming CRI-O with a tight OOM-kill restart cycle (same
# incident) — both confirmed necessary by direct reproduction, not
# precautionary.
setup_memory_eater() {
  local ns="$1"
  create_namespace "$ns" ""
  cat <<EOF | oc apply -f - >/dev/null
apiVersion: apps/v1
kind: Deployment
metadata:
  name: memory-eater
  namespace: $ns
  labels:
    app: memory-eater
spec:
  replicas: 1
  selector:
    matchLabels:
      app: memory-eater
  template:
    metadata:
      labels:
        app: memory-eater
    spec:
      affinity:
        nodeAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
            nodeSelectorTerms:
            - matchExpressions:
              - key: kubernetes.io/hostname
                operator: NotIn
                values:
                - dev-worker-1.redhat-internal.com
      containers:
      - name: memory-eater
        image: registry.access.redhat.com/ubi9/ubi-minimal:latest
        imagePullPolicy: IfNotPresent
        command: ["/bin/sh", "-c"]
        args:
          - "echo Allocating memory to trigger OOMKilled...; i=0; while true; do dd if=/dev/zero of=/dev/shm/fill\$i bs=1M count=5 2>/dev/null; i=\$((i+1)); sleep 1; done"
        resources:
          requests:
            memory: "20Mi"
          limits:
            memory: "50Mi"
EOF
}

: > "$FIXTURES_ENV_FILE"
echo "# Generated by setup-fixtures.sh on $(date -u +%FT%TZ). Namespace names only — no credentials." >> "$FIXTURES_ENV_FILE"
echo "export LIVE_E2E_NS_SUFFIX=$SUFFIX" >> "$FIXTURES_ENV_FILE"

while IFS='|' read -r base type; do
  [[ -z "$base" || "$base" == \#* ]] && continue
  ns="${base}-${SUFFIX}"
  case "$type" in
    crashloop)
      echo "Provisioning $ns (crashloop)..."
      setup_crashloop "$ns"
      ;;
    memory-eater)
      echo "Provisioning $ns (memory-eater)..."
      setup_memory_eater "$ns"
      ;;
    none)
      echo "Skipping $ns (no fixture needed, text-only reference)"
      ;;
    *)
      echo "warning: unknown fixture type '$type' for $base, skipping" >&2
      continue
      ;;
  esac
  echo "# $base -> $ns" >> "$FIXTURES_ENV_FILE"
done < "$FIXTURES_LIST"

chmod 600 "$FIXTURES_ENV_FILE"

echo ""
echo "All fixtures provisioned under suffix '$SUFFIX'."
echo "Next steps:"
echo "  source $FIXTURES_ENV_FILE"
echo "  npx playwright test --config=playwright.live-v15.config.ts"
echo ""
echo "When done, tear down with:"
echo "  e2e/live/scripts/teardown-fixtures.sh"
