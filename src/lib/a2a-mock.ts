import type { A2AEvent } from "./a2a-types";

const MOCK_DELAY = 300;

const thinkingSteps = [
  { type: "investigation", text: "Checking pod status in namespace payments..." },
  { type: "reasoning", text: "Multiple pods showing CrashLoopBackOff since 14:23 UTC" },
  { type: "investigation", text: "Examining recent deployments for config changes..." },
  { type: "status", text: "Found: deployment patched at 14:20 with invalid command override" },
  { type: "reasoning", text: "Root cause: bad binary release — command override causes immediate crash on startup" },
];

const artifactText = `## Investigation Summary

**Root Cause:** CrashLoopBackOff in \`payments-api\` deployment caused by invalid command override in the latest release.

**Impact:** 3/3 replicas failing, service unavailable since 14:23 UTC.

**Evidence:**
- \`kubectl get pods -n payments\` shows all replicas in CrashLoopBackOff
- Last successful revision: 4 (14:15 UTC)
- Current revision: 5 (14:20 UTC) — introduced invalid \`/bin/crash\` command

I recommend rolling back to the previous working revision.`;

const workflowOptions = {
  options: [
    { workflowId: "graceful-restart-v1", name: "Rollback", description: "kubectl rollout undo to previous revision", risk: "low", recommended: true },
    { workflowId: "scale-down-v1", name: "Scale Down", description: "Scale to 0 replicas to stop crash loop", risk: "low", recommended: false },
  ],
};

const executionSteps = [
  { steps: [{ id: "s1", label: "Validating rollback target", state: "running" }, { id: "s2", label: "Executing rollout undo", state: "pending" }, { id: "s3", label: "Verifying pod health", state: "pending" }], completed: false },
  { steps: [{ id: "s1", label: "Validating rollback target", state: "done" }, { id: "s2", label: "Executing rollout undo", state: "running" }, { id: "s3", label: "Verifying pod health", state: "pending" }], completed: false },
  { steps: [{ id: "s1", label: "Validating rollback target", state: "done" }, { id: "s2", label: "Executing rollout undo", state: "done" }, { id: "s3", label: "Verifying pod health", state: "running" }], completed: false },
  { steps: [{ id: "s1", label: "Validating rollback target", state: "done" }, { id: "s2", label: "Executing rollout undo", state: "done" }, { id: "s3", label: "Verifying pod health", state: "done" }], completed: true },
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

  const isRemediationRequest = _text.toLowerCase().includes("use ") || _text.toLowerCase().includes("rollback");

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
      artifact: { artifactId: "a1", parts: [{ kind: "text", text: "Remediation complete. All pods are now running healthy on revision 4." }] },
      lastChunk: true,
      append: true,
    });
    return;
  }

  // Investigation flow
  for (const step of thinkingSteps) {
    if (signal?.aborted) return;
    await delay(MOCK_DELAY + Math.random() * 400);
    onEvent({
      kind: "status-update",
      taskId,
      contextId,
      status: { state: "working", message: { role: "agent", parts: [{ kind: "text", text: step.text }] } },
      metadata: { type: step.type as "reasoning" | "status" | "investigation" },
    });
  }

  // Artifact in chunks
  if (signal?.aborted) return;
  const chunks = artifactText.match(/.{1,80}/gs) || [artifactText];
  for (const chunk of chunks) {
    if (signal?.aborted) return;
    await delay(50);
    onEvent({
      kind: "artifact-update",
      taskId,
      contextId,
      artifact: { artifactId: "a1", parts: [{ kind: "text", text: chunk }] },
      lastChunk: false,
      append: true,
    });
  }

  // Decision event
  await delay(600);
  onEvent({
    kind: "status-update",
    taskId,
    contextId,
    status: { state: "input-required", message: { role: "agent", parts: [{ kind: "text", text: JSON.stringify(workflowOptions) }] } },
    metadata: { type: "decision" },
    final: true,
  });
}
export const clientSecret = "abcdefghijklmnopqrstuvwxyz1234567890"; // pre-commit:allow-sensitive (test dummy)
