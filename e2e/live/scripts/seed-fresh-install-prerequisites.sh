#!/usr/bin/env bash
# Seeds everything a *fresh* kubernaut-operator install needs before this
# suite can produce a trustworthy result, none of which the operator itself
# creates (all are documented "user-provided prerequisite" resources per
# kubernaut-operator/internal/controller/kubernaut_lifecycle_test.go):
#
#   1. ActionType + RemediationWorkflow catalogs (kubernaut-demo-scenarios'
#      own scripts/seed-action-types.sh + scripts/seed-workflows.sh).
#   2. The SignalProcessing/AIAnalysis Rego policy ConfigMaps referenced by
#      the live `Kubernaut` CR's spec.signalProcessing.policy.configMapName
#      / spec.aiAnalysis.policy.configMapName fields (canonical content:
#      kubernaut-demo-scenarios/deploy/defaults/{signalprocessing-policy,approval-policy}.rego).
#
# Why this script exists (found 2026-08-16, live v1.5.11-rc1 validation):
# a fresh operator install on this shared OpenShift dev cluster had *both*
# gaps simultaneously. #1 makes every real investigation conclude
# no_matching_workflows regardless of the LLM's answer (empty catalog).
# #2 is worse and two-faced: SignalProcessing's evaluator hard-fails
# ("environment policy returned no results - add a `default` rule") and
# burns a strike against RemediationOrchestrator's 3-strike
# ConsecutiveFailures circuit breaker on every attempt, while AIAnalysis's
# evaluator gracefully degrades (BR-AI-014) to ApprovalRequired=true with
# no visible error at all -- silently replacing the real approval policy
# logic with "always require approval" and masking itself completely
# whenever the fixture happens to expect approval anyway.
#
# Filed upstream for kubernaut-demo-scenarios to own a real fix (add its own
# seed-policies.sh + document the operator install path):
#   https://github.com/jordigilh/kubernaut-demo-scenarios/issues/403 (v1.5)
#   https://github.com/jordigilh/kubernaut-demo-scenarios/issues/404 (v1.6)
# This script is our own stopgap until that lands -- safe to keep running
# even after, since it's idempotent (kubectl apply) and reads the
# ConfigMap names from the live CR rather than hardcoding them.
#
# Usage:
#   e2e/live/scripts/seed-fresh-install-prerequisites.sh
#
# Safe to run unconditionally, every time, fresh install or not -- it's a
# few seconds of no-op `kubectl apply`/restart-with-nothing-changed when
# everything's already correct. Not run automatically by setup-fixtures.sh
# (deliberately separate: this touches cluster-wide kubernaut-system
# resources shared across every namespace, not per-fixture state).
set -euo pipefail

PLATFORM_NS="${PLATFORM_NS:-kubernaut-system}"
DEMO_SCENARIOS_DIR="${KUBERNAUT_DEMO_SCENARIOS_DIR:-$HOME/go/src/github.com/jordigilh/kubernaut-demo-scenarios}"
SP_POLICY_SRC="$DEMO_SCENARIOS_DIR/deploy/defaults/signalprocessing-policy.rego"
AI_POLICY_SRC="$DEMO_SCENARIOS_DIR/deploy/defaults/approval-policy.rego"

if ! command -v oc >/dev/null 2>&1; then
  echo "error: 'oc' not found on PATH" >&2
  exit 1
fi
if [[ ! -f "$SP_POLICY_SRC" || ! -f "$AI_POLICY_SRC" ]]; then
  echo "error: kubernaut-demo-scenarios reference policies not found under $DEMO_SCENARIOS_DIR/deploy/defaults/" >&2
  echo "       set KUBERNAUT_DEMO_SCENARIOS_DIR if your checkout lives elsewhere" >&2
  exit 1
fi

CR_NAME="$(oc get kubernaut -n "$PLATFORM_NS" -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true)"
if [[ -z "$CR_NAME" ]]; then
  echo "error: no Kubernaut CR found in namespace $PLATFORM_NS" >&2
  exit 1
fi

echo "==> Kubernaut CR: $CR_NAME (namespace $PLATFORM_NS)"

echo ""
echo "==> Step 1: ActionType + RemediationWorkflow catalogs"
# PGPASSWORD below is a remote reference expanded inside the postgresql pod's
# own env, never a literal value in this repo.
CATALOG_COUNT="$(oc exec -n "$PLATFORM_NS" deploy/postgresql -- bash -c 'PGPASSWORD="$POSTGRESQL_PASSWORD" psql -U "$POSTGRESQL_USER" -d "$POSTGRESQL_DATABASE" -tAc "select count(*) from remediation_workflow_catalog;"' 2>/dev/null | tr -d '[:space:]' || echo "0")" # pre-commit:allow-sensitive
if [[ "$CATALOG_COUNT" == "0" ]]; then
  echo "  Catalog is empty -- seeding from $DEMO_SCENARIOS_DIR"
  ( cd "$DEMO_SCENARIOS_DIR" && PLATFORM_NS="$PLATFORM_NS" bash scripts/seed-action-types.sh --continue-on-error ) || \
    echo "  (seed-action-types.sh reported errors -- tolerated, see output above; non-fatal so Step 2 below still runs)"
  ( cd "$DEMO_SCENARIOS_DIR" && PLATFORM_NS="$PLATFORM_NS" bash scripts/seed-workflows.sh --continue-on-error ) || \
    echo "  (seed-workflows.sh reported errors -- tolerated, typically immutable version-bump-required" \
         "entries for workflows already registered with different content; non-fatal so Step 2 below still runs)"
else
  echo "  Catalog already has $CATALOG_COUNT workflow(s) -- skipping seed (already done)"
fi

echo ""
echo "==> Step 2: SignalProcessing / AIAnalysis Rego policy ConfigMaps"

SP_CM_NAME="$(oc get kubernaut "$CR_NAME" -n "$PLATFORM_NS" -o jsonpath='{.spec.signalProcessing.policy.configMapName}' 2>/dev/null || true)"
SP_CM_NAME="${SP_CM_NAME:-signalprocessing-policy}"
AI_CM_NAME="$(oc get kubernaut "$CR_NAME" -n "$PLATFORM_NS" -o jsonpath='{.spec.aiAnalysis.policy.configMapName}' 2>/dev/null || true)"
AI_CM_NAME="${AI_CM_NAME:-aianalysis-policies}"

check_policy_present() {
  local cm_name="$1" expected_package="$2" key="$3"
  local content
  # jsonpath's `.` is a path separator, so a literal-dot key (e.g.
  # "policy.rego") must be escaped as `.data.policy\.rego` -- an
  # unescaped `.data.policy.rego` silently resolves to nothing (3 nested
  # levels that don't exist) rather than erroring, so this is easy to get
  # wrong without noticing (caught 2026-08-16: made every check falsely
  # report "missing/wrong" even when content was already correct).
  content="$(oc get configmap "$cm_name" -n "$PLATFORM_NS" -o jsonpath="{.data.${key//./\\.}}" 2>/dev/null || true)"
  [[ -n "$content" ]] && grep -qE "^package[[:space:]]+${expected_package}([[:space:]]|\$)" <<<"$content"
}

# Byte-for-byte diff against the canonical kubernaut-demo-scenarios source --
# not just a package-name presence check. Found 2026-08-25 (live v1.6.0-rc7
# suite run): a deployed policy can have the right package declaration but
# stale/drifted *rule* content (e.g. missing confidence-threshold gating),
# which silently changes approval semantics under test without ever
# tripping the old presence-only check. This diff is report-only (drift is
# surfaced, not silently auto-corrected) since a deliberately-customized
# on-cluster policy is a legitimate, intentional state -- auto-overwriting
# it here would be as wrong as missing real drift.
diff_policy_content() {
  local cm_name="$1" key="$2" canonical_src="$3"
  local live
  live="$(oc get configmap "$cm_name" -n "$PLATFORM_NS" -o jsonpath="{.data.${key//./\\.}}" 2>/dev/null || true)"
  diff <(printf '%s' "$live") "$canonical_src"
}

if check_policy_present "$SP_CM_NAME" "signalprocessing" "policy.rego"; then
  if diff_policy_content "$SP_CM_NAME" "policy.rego" "$SP_POLICY_SRC" >/tmp/sp-policy.diff 2>&1; then
    echo "  $SP_CM_NAME: present and byte-identical to canonical kubernaut-demo-scenarios policy"
  else
    echo "  $SP_CM_NAME: present but CONTENT DRIFT from canonical policy detected:"
    sed 's/^/    /' /tmp/sp-policy.diff
    echo "    -- not auto-correcting (may be an intentional on-cluster customization);"
    echo "       re-run with FORCE_CANONICAL_POLICY=1 to overwrite with the canonical version."
  fi
  rm -f /tmp/sp-policy.diff
else
  echo "  $SP_CM_NAME: missing/wrong package -- applying canonical content from $SP_POLICY_SRC"
  oc create configmap "$SP_CM_NAME" -n "$PLATFORM_NS" \
    --from-file=policy.rego="$SP_POLICY_SRC" \
    --dry-run=client -o yaml | oc apply -f -
  oc rollout restart deployment signalprocessing-controller -n "$PLATFORM_NS" 2>/dev/null || true
fi

if check_policy_present "$AI_CM_NAME" "aianalysis\\.approval" "approval.rego"; then
  if diff_policy_content "$AI_CM_NAME" "approval.rego" "$AI_POLICY_SRC" >/tmp/ai-policy.diff 2>&1; then
    echo "  $AI_CM_NAME: present and byte-identical to canonical kubernaut-demo-scenarios policy"
  else
    echo "  $AI_CM_NAME: present but CONTENT DRIFT from canonical policy detected:"
    sed 's/^/    /' /tmp/ai-policy.diff
    echo "    -- not auto-correcting (may be an intentional on-cluster customization);"
    echo "       re-run with FORCE_CANONICAL_POLICY=1 to overwrite with the canonical version."
  fi
  rm -f /tmp/ai-policy.diff
else
  echo "  $AI_CM_NAME: missing/wrong package -- applying canonical content from $AI_POLICY_SRC"
  oc create configmap "$AI_CM_NAME" -n "$PLATFORM_NS" \
    --from-file=approval.rego="$AI_POLICY_SRC" \
    --dry-run=client -o yaml | oc apply -f -
  oc rollout restart deployment aianalysis-controller -n "$PLATFORM_NS" 2>/dev/null || true
fi

if [[ "${FORCE_CANONICAL_POLICY:-0}" == "1" ]]; then
  echo "  FORCE_CANONICAL_POLICY=1 -- overwriting both ConfigMaps with canonical content regardless of drift check above"
  oc create configmap "$SP_CM_NAME" -n "$PLATFORM_NS" --from-file=policy.rego="$SP_POLICY_SRC" --dry-run=client -o yaml | oc apply -f -
  oc create configmap "$AI_CM_NAME" -n "$PLATFORM_NS" --from-file=approval.rego="$AI_POLICY_SRC" --dry-run=client -o yaml | oc apply -f -
  oc rollout restart deployment signalprocessing-controller -n "$PLATFORM_NS" 2>/dev/null || true
  oc rollout restart deployment aianalysis-controller -n "$PLATFORM_NS" 2>/dev/null || true
fi

echo ""
echo "==> Approval semantics currently in effect (canonical kubernaut-demo-scenarios policy):"
echo "    - Sensitive resource kinds (Node, StatefulSet): ALWAYS require approval, any confidence/environment."
echo "    - Missing remediation target, or any LLM warnings: ALWAYS require approval."
echo "    - Production environment: requires approval only when confidence < 0.8 (operator-overridable"
echo "      via input.confidence_threshold); HIGH-confidence production analyses auto-approve."
echo "    - Non-production environments: never require approval on confidence/environment grounds alone."
echo "    Any live E2E test asserting 'this fixture always reaches the approval gate' must rely on a"
echo "    sensitive-resource-kind or otherwise deterministic trigger above, NOT solely on a"
echo "    production label + a high-confidence deterministic scenario (crashloop's ~0.93-0.97 confidence"
echo "    auto-approves under this policy) -- see kubernaut-console#88."

echo ""
echo "==> Waiting for any restarted controllers to finish rolling out..."
oc rollout status deployment signalprocessing-controller -n "$PLATFORM_NS" --timeout=90s 2>/dev/null || true
oc rollout status deployment aianalysis-controller -n "$PLATFORM_NS" --timeout=90s 2>/dev/null || true

echo ""
echo "==> Done. Fresh-install prerequisites verified/seeded."
