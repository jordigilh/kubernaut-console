#!/usr/bin/env bash
# Provisions the per-workflow runner ServiceAccount/ClusterRole/
# ClusterRoleBinding trio that every kubernaut-demo-scenarios
# RemediationWorkflow manifest bundles (WorkflowExecution's Job.spec.
# serviceAccountName references it — see each workflow's manifest) onto
# whichever cluster KUBECONFIG currently points at.
#
# Why this exists (2026-08-27 fleet validation): in fleet mode, the
# RemediationWorkflow/ActionType *catalog* lives on the hub (control plane),
# but WorkflowExecution's Job dispatch is fleet-aware
# (pkg/workflowexecution/executor/client_factory.go: ClusterID="" -> local
# client, non-empty -> MCP-Gateway-routed remote client) — so the Job the
# fleet-remote WorkflowExecution creates actually runs *on that remote
# cluster* (e.g. spoke), and needs its runner ServiceAccount + RBAC to exist
# there, not on hub. kubernaut-demo-scenarios' own scripts/seed-workflows.sh
# already applies these RBAC docs correctly (see its _apply_workflow_yaml
# helper) -- but it also unconditionally applies the RemediationWorkflow CR
# itself, which does not belong on a plain fleet-managed target cluster
# (likely has no RemediationWorkflow CRD installed at all) and would abort
# the whole run on the first file. This script does exactly what
# seed-workflows.sh does, minus the RemediationWorkflow doc.
#
# Idempotent: kubectl apply is a no-op when a resource is unchanged. Safe to
# re-run any time, including against a cluster that already has some or all
# of these resources.
#
# Usage:
#   export KUBECONFIG=/path/to/spoke-kubeconfig
#   e2e/live/scripts/provision-fleet-workflow-rbac.sh
set -euo pipefail

DEMO_SCENARIOS_DIR="${KUBERNAUT_DEMO_SCENARIOS_DIR:-$HOME/go/src/github.com/jordigilh/kubernaut-demo-scenarios}"
WORKFLOWS_DIR="$DEMO_SCENARIOS_DIR/deploy/remediation-workflows"

if ! command -v oc >/dev/null 2>&1; then
  echo "error: 'oc' not found on PATH" >&2
  exit 1
fi
if [[ ! -d "$WORKFLOWS_DIR" ]]; then
  echo "error: $WORKFLOWS_DIR not found — set KUBERNAUT_DEMO_SCENARIOS_DIR if your checkout lives elsewhere" >&2
  exit 1
fi

echo "Target cluster: $(oc whoami --show-server 2>/dev/null || echo '?')"
echo "Provisioning workflow-runner ServiceAccount/ClusterRole/ClusterRoleBinding trios from $WORKFLOWS_DIR ..."

tmpfile="$(mktemp)"
trap 'rm -f "$tmpfile"' EXIT

python3 -c "
import glob, sys

out = []
count = 0
files = sorted(glob.glob('$WORKFLOWS_DIR/**/*.yaml', recursive=True))
for yf in files:
    with open(yf) as f:
        content = f.read()
    for doc in content.split('\n---\n'):
        if 'kind: RemediationWorkflow' in doc or not doc.strip():
            continue
        out.append(doc.strip())
        count += 1

with open('$tmpfile', 'w') as f:
    f.write('\n---\n'.join(out) + '\n')

print(f'Extracted {count} RBAC doc(s) from {len(files)} workflow manifest(s)', file=sys.stderr)
"

oc apply -f "$tmpfile"

echo "Done. Verify: oc get sa -n kubernaut-workflows -l kubernaut.ai/workflow-runner=true"
