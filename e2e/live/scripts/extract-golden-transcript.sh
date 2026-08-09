#!/usr/bin/env bash
# Single-RR golden transcript capture, adapted from
# kubernaut-demo-scenarios/scripts/capture-golden-transcripts.sh — same SQL
# queries and output JSON schema (scenario/incidentId/signal/analysis/
# remediationRequest/kaResponse/traceStats/toolCalls), but driven by a known
# RR id directly (we already have it from each e2e/live run) instead of that
# script's per-namespace "find the best run" scan, and pointed at this
# cluster's actual postgresql pod (app.kubernetes.io/name=postgresql isn't
# set here, and this cluster's schema doesn't need the monthly-partition
# table name — querying the parent `audit_events` works directly).
#
# Adds one extension beyond the upstream schema: `groundTruth`, sourced from
# the live RemediationRequest/WorkflowExecution CRDs rather than only
# orchestrator audit events, plus full tool-call args/results (upstream's
# `toolCalls` is name+index only).
#
# Usage: extract-golden-transcript.sh <rr-id> <scenario-name> <out-dir> [model-label]
# Example:
#   ./e2e/live/scripts/extract-golden-transcript.sh \
#     rr-647225c070d9-6f5b35ba contract-sse-oomkill \
#     e2e/live/golden-transcripts/sonnet-5 claude-sonnet-5
#
# See e2e/live/golden-transcripts/README.md for the capture workflow and a
# note on the two response_data shapes (`interactive` vs `full_remediation`
# mode) this script has to reconcile.
set -euo pipefail

NS="kubernaut-system"
PG_POD="postgresql-6479cf7669-xsfwg"
DB_USER=$(oc get secret postgresql-secret -n "$NS" -o jsonpath='{.data.POSTGRES_USER}' | base64 -d)
DB_PASS=$(oc get secret postgresql-secret -n "$NS" -o jsonpath='{.data.POSTGRES_PASSWORD}' | base64 -d)

RR="$1"
SCENARIO="$2"
OUT_DIR="$3"
MODEL_LABEL="${4:-unknown}"
# Broad match: correlation_id is sometimes the bare RR name, sometimes
# `ai-<rr-name>` (AIAnalysis's own CR name) — LIKE on the RR name covers both
# without needing to know which prefix a given event type used.
WHERE="WHERE correlation_id LIKE '%${RR}%'"

WORKDIR=$(mktemp -d)
trap 'rm -rf "$WORKDIR"' EXIT

run_sql_to_file() {
  local sql="$1" outfile="$2" tmpfile
  tmpfile=$(mktemp)
  echo "$sql" > "$tmpfile"
  oc cp "$tmpfile" "$NS/$PG_POD:/tmp/_golden_query.sql" >/dev/null 2>&1
  rm -f "$tmpfile"
  oc exec -n "$NS" "$PG_POD" -- env PGPASSWORD="$DB_PASS" psql -U "$DB_USER" -d kubernaut \
    --no-align --tuples-only -f /tmp/_golden_query.sql > "$outfile" 2>/dev/null
}

# Full LLM response (final aiagent.response.complete payload — RCA + decision).
run_sql_to_file "
SELECT (event_data->'response_data')::text
FROM audit_events ${WHERE}
  AND event_type = 'aiagent.response.complete'
ORDER BY event_timestamp DESC LIMIT 1;" "$WORKDIR/response.json"

# Token/turn stats.
run_sql_to_file "
SELECT json_build_object(
  'totalTokens', SUM((event_data->>'tokens_used')::int),
  'llmTurns', COUNT(*)
)::text
FROM audit_events ${WHERE}
  AND event_type = 'aiagent.llm.response';" "$WORKDIR/tokenstats.json"

# Tool call count (excluding todo_write housekeeping calls).
run_sql_to_file "
SELECT COUNT(*)
FROM audit_events ${WHERE}
  AND event_type = 'aiagent.llm.tool_call'
  AND event_data->>'tool_name' != 'todo_write';" "$WORKDIR/toolcount.txt"

# Full tool call list — name/args/result (extension over upstream's
# name+index only, since args/results matter for cross-model eval diffing).
run_sql_to_file "
SELECT json_agg(json_build_object(
  'tool', event_data->>'tool_name',
  'args', event_data->'tool_arguments',
  'result', event_data->'tool_result'
) ORDER BY event_timestamp)::text
FROM audit_events ${WHERE}
  AND event_type = 'aiagent.llm.tool_call'
  AND event_data->>'tool_name' != 'todo_write';" "$WORKDIR/toollist.json"

# Signal info. NOTE: 'gateway.signal.received' (upstream's source for this)
# is emitted only for real Prometheus-webhook-ingested signals — this
# cluster's console-driven e2e/live scenarios go through
# kubernaut_investigate_alert/kubernaut_investigate instead, which never
# emits it (confirmed: zero such events exist on this cluster's DB at all,
# 2026-08-09). Falls back to the RR CRD's own spec below in the python step
# when this query is empty, rather than silently shipping signal: {}.
run_sql_to_file "
SELECT json_build_object(
  'signalName', event_data->>'signal_name',
  'namespace', event_data->>'namespace',
  'resourceKind', event_data->>'resource_kind',
  'resourceName', event_data->>'resource_name',
  'severity', event_data->>'severity'
)::text
FROM audit_events ${WHERE}
  AND event_type = 'gateway.signal.received'
ORDER BY event_timestamp LIMIT 1;" "$WORKDIR/signal.json"

# RR outcome from orchestrator events (upstream's own cross-check).
run_sql_to_file "
SELECT event_data->>'to_phase'
FROM audit_events ${WHERE}
  AND event_type = 'orchestrator.lifecycle.transitioned'
ORDER BY event_timestamp DESC LIMIT 1;" "$WORKDIR/rr_outcome.txt"

# EA result, if any.
run_sql_to_file "
SELECT event_data->>'reason'
FROM audit_events ${WHERE}
  AND event_type = 'effectiveness.assessment.completed'
ORDER BY event_timestamp DESC LIMIT 1;" "$WORKDIR/ea_outcome.txt"

# Live CRD ground truth (extension: upstream infers outcome purely from
# audit events; we also have live access to the CRDs themselves here).
oc get remediationrequest "$RR" -n "$NS" -o json > "$WORKDIR/rr.json" 2>/dev/null || echo '{}' > "$WORKDIR/rr.json"
oc get workflowexecution "we-${RR}" -n "$NS" -o jsonpath='{.status.phase}' > "$WORKDIR/wfe_phase.txt" 2>/dev/null || echo "<none>" > "$WORKDIR/wfe_phase.txt"
oc get workflowexecution "we-${RR}" -n "$NS" -o jsonpath='{.spec.workflowRef.name}' > "$WORKDIR/wfe_workflow.txt" 2>/dev/null || echo "<none>" > "$WORKDIR/wfe_workflow.txt"

mkdir -p "$OUT_DIR"

python3 <<PYEOF
import json

def load_json_or(path, default):
    try:
        with open(path) as f:
            content = f.read().strip()
            return json.loads(content) if content else default
    except (json.JSONDecodeError, FileNotFoundError):
        return default

def load_text_or(path, default):
    try:
        with open(path) as f:
            content = f.read().strip()
            return content if content else default
    except FileNotFoundError:
        return default

response = load_json_or("$WORKDIR/response.json", {})
token_stats = load_json_or("$WORKDIR/tokenstats.json", {})
signal = load_json_or("$WORKDIR/signal.json", {})
tools = load_json_or("$WORKDIR/toollist.json", [])
rr = load_json_or("$WORKDIR/rr.json", {})

if not signal:
    rr_spec = rr.get("spec", {})
    target = rr_spec.get("targetResource", {})
    signal = {
        "signalName": rr_spec.get("signalName"),
        "namespace": target.get("namespace"),
        "resourceKind": target.get("kind"),
        "resourceName": target.get("name"),
        "severity": rr_spec.get("severity"),
    }

tool_calls_count = int(load_text_or("$WORKDIR/toolcount.txt", "0") or "0")
rr_outcome_audit = load_text_or("$WORKDIR/rr_outcome.txt", "Unknown")
ea_outcome = load_text_or("$WORKDIR/ea_outcome.txt", None)
wfe_phase = load_text_or("$WORKDIR/wfe_phase.txt", "<none>")
wfe_workflow = load_text_or("$WORKDIR/wfe_workflow.txt", "<none>")

token_stats["totalToolCalls"] = tool_calls_count

rca = response.get("rootCauseAnalysis", {})
selected = response.get("selectedWorkflow", {})
status = rr.get("status", {})

# Fallback (found 2026-08-09): full_remediation mode's aiagent.response.complete
# only carries a flat 'analysis' string, not the structured
# rootCauseAnalysis/selectedWorkflow fields interactive mode's does (a real
# schema difference between the two modes on this cluster, not a query bug —
# confirmed via jsonb_object_keys). The actual selected workflow's name is
# still recoverable from the last get_workflow tool call's result.
if not selected:
    get_workflow_calls = [t for t in (tools or []) if t.get("tool") == "get_workflow"]
    if get_workflow_calls:
        last_result = get_workflow_calls[-1].get("result") or {}
        if isinstance(last_result, dict) and last_result.get("name"):
            selected = {"name": last_result["name"], "status": last_result.get("status")}

transcript = {
    "scenario": "$SCENARIO",
    "incidentId": "$RR",
    "model": "$MODEL_LABEL",
    "signal": signal,
    "analysis": {
        "phase": "Completed",
        "selectedWorkflow": selected if selected else None,
        "approvalRequired": response.get("needsHumanReview", False) == False and bool(selected),
        "needsHumanReview": response.get("needsHumanReview", False),
        "humanReviewReason": response.get("humanReviewReason"),
        "rootCauseAnalysis": rca,
    },
    "remediationRequest": {
        "outcome": "Remediated" if ea_outcome else rr_outcome_audit,
    },
    "kaResponse": {
        "confidence": response.get("confidence"),
        "analysis": response.get("analysis"),
    },
    "traceStats": token_stats,
    "toolCalls": tools or [],
    # Extension beyond upstream schema: live CRD state, since we have direct
    # cluster access at capture time (upstream only has audit-event inference).
    "groundTruth": {
        "rrPhase": status.get("overallPhase", "unknown"),
        "rrOutcome": status.get("outcome", "unknown"),
        "workflowExecutionPhase": wfe_phase,
        "workflowExecutionWorkflow": wfe_workflow,
    },
}

with open("$OUT_DIR/$SCENARIO.json", "w") as f:
    json.dump(transcript, f, indent=2)

print(f"  -> $OUT_DIR/$SCENARIO.json  "
      f"confidence={response.get('confidence')}  "
      f"workflow={((selected or {}).get('name') if isinstance(selected, dict) else selected)}  "
      f"toolCalls={tool_calls_count}  "
      f"rr={status.get('overallPhase')}/{status.get('outcome')}")
PYEOF
