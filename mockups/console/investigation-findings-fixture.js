/* Authored synthetic UI fixtures shaped by current RCAData/WorkflowOption/AlignmentVerdict fields.
 * Not a historical capture, an AF response, workflow selection or a full production-parity claim. */
(() => {
  'use strict';
  const rca = Object.freeze({
    severity: 'high', confidence: 91, target: 'Deployment/demo-operator', namespace: 'demo-operator', clusterId: 'spoke-a',
    summary: 'The workload continues to OOM after an applied memory increase. Continuing memory growth is the probable mechanism; more headroom is a temporary mitigation, not a durable correction.',
    causalChain: Object.freeze(['Signal: OOMKilled restarts were reported for the workload.', 'Observation: Memory growth continued after the prior limit increase was applied.', 'Mechanism: The underlying memory-growth behavior remains unresolved.']),
    toolCallsCount: 12, llmTurns: 6, promptTokens: 12450, completionTokens: 1840, totalTokens: 14290, tokenMetricsAvailable: true, metricsPending: false,
  });
  const parameters = Object.freeze({ TARGET_RESOURCE_NAMESPACE: 'demo-operator', TARGET_RESOURCE_NAME: 'demo-operator', TARGET_RESOURCE_KIND: 'Deployment' });
  const options = Object.freeze([
    Object.freeze({ workflowId: 'wf-demo-01', version: '1.0.7', name: 'increase-memory-limits-gitops-v1', recommended: true, risk: 'Medium', description: 'Propose a reviewed GitOps memory-limit change, preserving the Argo CD desired-state path. Expected benefit is temporary headroom.', parameters }),
    Object.freeze({ workflowId: 'wf-approval-container-memory', version: '1.0.0', name: 'increase-container-memory', recommended: false, risk: 'Medium', description: 'Patch the live workload memory limit directly.', ruledOutReason: 'A direct live change can be reconciled away for this GitOps-managed target.', parameters }),
  ]);
  const alignment = Object.freeze({ result: 'blocked', flagged: 2, total: 7, summary: 'The alignment review flagged unexpected tool behavior. Remediation remains blocked in this synthetic example.', findings: Object.freeze([
    Object.freeze({ step_index: 3, step_kind: 'tool_call', tool: 'synthetic_tool', explanation: 'The requested operation was outside the established investigation scope.' }),
    Object.freeze({ step_index: 5, step_kind: 'tool_call', tool: 'synthetic_tool', explanation: 'The proposed follow-up did not match the authorized target context.' }),
  ]) });
  function snapshot(mode = 'complete') {
    const result = { mode, rca: { ...rca }, options: [...options], selectionConfidence: 84, priorEffectiveness: '0.00', alignment: null, divergence: null, discoveryPending: false };
    if (mode === 'metrics-pending') result.rca = { ...rca, confidence: 0, toolCallsCount: 0, llmTurns: 0, tokenMetricsAvailable: false, metricsPending: true };
    if (mode === 'discovery-pending') { result.options = []; result.discoveryPending = true; }
    if (mode === 'target-divergence') {
      result.rca = { ...rca, target: 'StatefulSet/shared-cache', namespace: 'observability', summary: 'This separate synthetic variant traces the signal to an upstream shared-cache workload. The signal target and root-cause target differ.', causalChain: ['Signal: The original workload reported repeated failures.', 'Observation: A shared dependency remained unavailable.', 'Mechanism: The fault was attributed to the shared-cache workload in this variant.'] };
      result.divergence = { signalTarget: { kind: 'Deployment', name: 'demo-operator', namespace: 'demo-operator' }, discoveryTarget: { kind: 'StatefulSet', name: 'shared-cache', namespace: 'observability' } };
      result.options = [];
    }
    if (mode === 'alignment-blocked') { result.alignment = alignment; result.options = []; }
    return result;
  }
  window.KubernautFindingsFixture = Object.freeze({ snapshot });
})();
