import type { A2AEvent } from "./a2a-types";

const MOCK_DELAY = 300;

const preflightSteps = [
  { type: "preflight", text: "Analyzing..." },
  { type: "preflight", text: "Checking for existing active remediation..." },
  { type: "preflight", text: "No active remediation exists. Launching fresh investigation." },
];

const investigationSteps = [
  { type: "tool_call", text: "kubectl_previous_logs Pod/web-frontend-c8dc85956-qm7hq" },
  { type: "tool_call", text: "kubectl_describe Pod/web-frontend-c8dc85956-qm7hq" },
  { type: "tool_call", text: "kubectl_events Pod/web-frontend-c8dc85956-qm7hq" },
  { type: "reasoning", text: "Container failing due to invalid config file. Investigating ConfigMap..." },
  { type: "tool_call", text: "kubectl_get_by_name ConfigMap/app-config -n demo-webui" },
  { type: "reasoning", text: "GitOps-managed environment detected. Checking ArgoCD Application..." },
  { type: "tool_call", text: "kubectl_get_by_name Application/demo-webui -n argocd" },
  { type: "reasoning", text: "selfHeal:true configured. In-cluster patches will be reverted automatically." },
  { type: "tool_call", text: "git_log --oneline -5 demo-webui" },
  { type: "reasoning", text: "Commit caa704e8 introduced invalid_directive: true to app-config." },
];

const ctaText = "In-cluster patches won't persist -- ArgoCD selfHeal will revert them. I recommend a Git revert.\nSelect a workflow, or tell me if you'd like to investigate further.";

const decisionPayload = {
  session_id: "sess-gitops-drift-001",
  summary: "ConfigMap app-config contains an invalid directive introduced by Git commit caa704e8, synced by ArgoCD. With selfHeal:true, in-cluster patches are futile -- the fix must be applied at the Git source via a revert.",
  rca: {
    severity: "critical",
    confidence: 0.95,
    causal_chain: [
      "Signal: Pod web-frontend in CrashLoopBackOff (4 restarts, exit code 1)",
      "Why? [emerg] invalid directive found in /etc/demo-http-server/config.yaml",
      "Why? ConfigMap app-config contains 'invalid_directive: true'",
      "Why? Git commit caa704e8 introduced the invalid directive",
      "Root cause: Bad commit synced via ArgoCD with selfHeal:true",
    ],
    target: "ConfigMap/app-config in demo-webui",
    tool_calls_count: 19,
    llm_turns: 17,
  },
  options: [
    {
      workflow_id: "git-revert-v2",
      name: "git-revert-v2",
      description: "Reverts the most recent commit in a GitOps-managed repository to undo a bad change. ArgoCD will automatically reconcile the reverted healthy state.",
      risk: "low",
      recommended: true,
      parameters: {
        TARGET_RESOURCE_NAMESPACE: "demo-webui",
        TARGET_RESOURCE_KIND: "v1/ConfigMap",
        TARGET_RESOURCE_NAME: "app-config",
      },
    },
    {
      workflow_id: "patch-configuration-v1",
      name: "patch-configuration-v1",
      description: "Patches ConfigMap directly in the cluster.",
      risk: "high",
      recommended: false,
      ruled_out_reason: "selfHeal:true will revert in-cluster patches",
    },
  ],
};

const executionSteps = [
  { steps: [{ id: "s1", label: "Cloning GitOps repository", state: "running" }, { id: "s2", label: "Reverting commit caa704e8", state: "pending" }, { id: "s3", label: "Pushing and verifying ArgoCD sync", state: "pending" }], completed: false },
  { steps: [{ id: "s1", label: "Cloning GitOps repository", state: "done" }, { id: "s2", label: "Reverting commit caa704e8", state: "running" }, { id: "s3", label: "Pushing and verifying ArgoCD sync", state: "pending" }], completed: false },
  { steps: [{ id: "s1", label: "Cloning GitOps repository", state: "done" }, { id: "s2", label: "Reverting commit caa704e8", state: "done" }, { id: "s3", label: "Pushing and verifying ArgoCD sync", state: "running" }], completed: false },
  { steps: [{ id: "s1", label: "Cloning GitOps repository", state: "done" }, { id: "s2", label: "Reverting commit caa704e8", state: "done" }, { id: "s3", label: "Pushing and verifying ArgoCD sync", state: "done" }], completed: true },
];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const contextId = `mock-ctx-${Date.now()}`;

export async function mockStreamA2A(
  _text: string,
  onEvent: (event: A2AEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  const taskId = `mock-task-${Date.now()}`;

  const isRemediationRequest = _text.toLowerCase().includes("use ") || _text.toLowerCase().includes("git-revert");

  if (isRemediationRequest) {
    for (const stepState of executionSteps) {
      if (signal?.aborted) return;
      await delay(800);
      onEvent({
        kind: "status-update",
        taskId,
        contextId,
        status: { state: "working", message: { role: "agent", parts: [{ kind: "text", text: JSON.stringify(stepState) }] } },
        metadata: { type: "output" },
      });
    }
    await delay(400);
    onEvent({
      kind: "artifact-update",
      taskId,
      contextId,
      artifact: { artifactId: "a1", parts: [{ kind: "text", text: "Git revert complete. ArgoCD will reconcile the healthy state within 60 seconds." }] },
      lastChunk: true,
      append: true,
    });
    return;
  }

  // Preflight steps
  for (const step of preflightSteps) {
    if (signal?.aborted) return;
    await delay(MOCK_DELAY);
    onEvent({
      kind: "status-update",
      taskId,
      contextId,
      status: { state: "working", message: { role: "agent", parts: [{ kind: "text", text: step.text }] } },
      metadata: { type: step.type as "preflight" },
    });
  }

  // Investigation steps
  for (const step of investigationSteps) {
    if (signal?.aborted) return;
    await delay(MOCK_DELAY + Math.random() * 300);
    onEvent({
      kind: "status-update",
      taskId,
      contextId,
      status: { state: "working", message: { role: "agent", parts: [{ kind: "text", text: step.text }] } },
      metadata: { type: step.type as "reasoning" | "tool_call" },
    });
  }

  // Investigation summary as structured multi-part artifact (DataPart + text fallback)
  if (signal?.aborted) return;
  await delay(400);
  onEvent({
    kind: "artifact-update",
    taskId,
    contextId,
    artifact: {
      artifactId: "investigation-001",
      parts: [
        {
          kind: "data",
          data: {
            type: "investigation_summary",
            schema_version: "1.0",
            rr_id: "rr-gitops-001",
            ...decisionPayload,
          },
          mediaType: "application/json",
          metadata: { schema: "investigation_summary", schema_version: "1.0" },
        },
        {
          kind: "text",
          text: ctaText,
        },
      ],
      metadata: { type: "investigation_summary" },
    },
    lastChunk: true,
    append: false,
  });
}
