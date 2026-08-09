# Golden transcripts

Real, positive-outcome LLM investigation/remediation transcripts captured
from `e2e/live` runs against the shared OpenShift dev cluster. Each file is
one `RemediationRequest`'s full audit trail (RCA, tool calls with args/
results, final decision, ground truth from the live `RemediationRequest`/
`WorkflowExecution` CRDs).

**Only capture positive outcomes** — a real, correct investigation/decision,
not a false positive (e.g. a signal-misattribution artifact, see
[kubernaut#2018](https://github.com/jordigilh/kubernaut/issues/2018)) and not
a false negative (e.g. a test-harness bug masking real backend success).
These are meant to become model-comparison eval fixtures, so a mislabeled
transcript is worse than no transcript.

## Layout

One subdirectory per model, one file per scenario:

```
golden-transcripts/
  sonnet-5/<scenario>.json
  sonnet-4-6/<scenario>.json
```

## Capturing a new transcript

Once you have a passing test and its `RemediationRequest` id (from
`oc get remediationrequests -n kubernaut-system`, or from the test's own
console-context banner):

```bash
./e2e/live/scripts/extract-golden-transcript.sh \
  <rr-id> <scenario-name> e2e/live/golden-transcripts/<model-dir> <model-label>
```

Before trusting a captured transcript, cross-check its `groundTruth` block
and `analysis.selectedWorkflow` against what the test itself asserted —
don't just check that the script ran without error.

## Schema notes

Adapted from `kubernaut-demo-scenarios/scripts/capture-golden-transcripts.sh`
(same SQL query shapes and output JSON schema: `scenario`, `incidentId`,
`signal`, `analysis`, `remediationRequest`, `kaResponse`, `traceStats`,
`toolCalls`), with two additions documented in the script itself:

- `groundTruth`: live `RemediationRequest`/`WorkflowExecution` CRD state,
  since this script has direct cluster access at capture time (upstream's
  script only has audit-event inference).
- A fallback for `analysis.selectedWorkflow`: `full_remediation` mode's
  `aiagent.response.complete` event only carries a flat `analysis` string,
  not the structured `rootCauseAnalysis`/`selectedWorkflow` fields
  `interactive` mode's does (a real schema difference between the two modes,
  confirmed via `jsonb_object_keys` — not a query bug). When the structured
  field is empty, the script recovers the workflow name from the last
  `get_workflow` tool call's result instead.

Also note: `gateway.signal.received` (upstream's source for the `signal`
block) is only ever emitted for real Prometheus-webhook-ingested signals.
This suite's console-driven scenarios go through
`kubernaut_investigate_alert`/`kubernaut_investigate` instead, which never
emits it — confirmed zero such events exist in this cluster's DB. The script
falls back to the RR CRD's own `spec` for signal info in that case.
