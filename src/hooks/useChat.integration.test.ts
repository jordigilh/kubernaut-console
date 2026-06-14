import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useChat } from "./useChat";

vi.mock("../lib/a2a-client", () => ({
  buildStreamRequest: vi.fn((_text: string, contextId?: string) => ({
    jsonrpc: "2.0",
    id: "test-req",
    method: "message/stream",
    params: { message: { role: "user", parts: [{ kind: "text", text: _text }], contextId } },
  })),
  streamA2A: vi.fn(),
}));

vi.mock("../lib/a2a-mock", () => ({
  mockStreamA2A: vi.fn(),
}));

describe("IT: Structured artifact flow (SSE -> DataPart -> ChatMessage state)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    sessionStorage.clear();
    vi.useFakeTimers();
  });

  it("IT-CONSOLE-ARTIFACT-001: full flow from artifact-update with DataPart to populated ChatMessage", async () => {
    vi.useRealTimers();
    const { streamA2A: streamFn } = await import("../lib/a2a-client");
    const mockedStream = vi.mocked(streamFn);

    mockedStream.mockImplementation(async (_req, opts) => {
      opts.onEvent({
        kind: "status-update",
        taskId: "t1",
        contextId: "ctx-it-1",
        status: { state: "working", message: { role: "agent", parts: [{ kind: "text", text: "Checking pre-conditions..." }] } },
        metadata: { type: "preflight" },
      });

      opts.onEvent({
        kind: "status-update",
        taskId: "t1",
        contextId: "ctx-it-1",
        status: { state: "working", message: { role: "agent", parts: [{ kind: "text", text: "kubectl_get_pods -n demo" }] } },
        metadata: { type: "tool_call" },
      });

      opts.onEvent({
        kind: "artifact-update",
        taskId: "t1",
        contextId: "ctx-it-1",
        artifact: {
          artifactId: "investigation-it-001",
          parts: [
            {
              kind: "data",
              data: {
                type: "investigation_summary",
                schema_version: "1.0",
                session_id: "ka-it-session",
                rr_id: "rr-it-001",
                summary: "GitOps drift detected: ConfigMap modified outside Git source.",
                rca: {
                  severity: "critical",
                  confidence: 0.95,
                  target: "ConfigMap/app-config in demo-webui",
                  causal_chain: [
                    "Pod CrashLoopBackOff",
                    "Invalid config directive",
                    "ConfigMap changed via bad commit",
                    "ArgoCD selfHeal will revert manual patches",
                  ],
                  rca_summary: "Bad commit introduced invalid_directive in ConfigMap.",
                  tool_calls_count: 19,
                  llm_turns: 17,
                },
                options: [
                  {
                    workflow_id: "git-revert-v2",
                    name: "git-revert-v2",
                    description: "Reverts the most recent commit to restore healthy state.",
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
                    description: "Direct in-cluster ConfigMap patch.",
                    risk: "high",
                    recommended: false,
                    ruled_out_reason: "selfHeal:true will revert in-cluster patches",
                  },
                ],
              },
              mediaType: "application/json",
              metadata: { schema: "investigation_summary", schema_version: "1.0" },
            },
            {
              kind: "text",
              text: "Investigation complete. Recommend git-revert-v2.",
            },
          ],
          metadata: { type: "investigation_summary" },
        },
        lastChunk: true,
        append: false,
      });

      opts.onComplete?.();
    });

    const { result } = renderHook(() => useChat());
    await act(async () => { await result.current.sendMessage("pods crashing in demo-webui"); });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    expect(result.current.messages).toHaveLength(2);
    const agentMsg = result.current.messages[1];

    expect(agentMsg.role).toBe("agent");
    expect(agentMsg.phase).toBe("decision");
    expect(agentMsg.text).toBe("");

    expect(agentMsg.rca).toBeDefined();
    expect(agentMsg.rca!.severity).toBe("critical");
    expect(agentMsg.rca!.confidence).toBe(0.95);
    expect(agentMsg.rca!.target).toBe("ConfigMap/app-config in demo-webui");
    expect(agentMsg.rca!.causalChain).toHaveLength(4);
    expect(agentMsg.rca!.toolCallsCount).toBe(19);
    expect(agentMsg.rca!.llmTurns).toBe(17);
    expect(agentMsg.rca!.summary).toBe("GitOps drift detected: ConfigMap modified outside Git source.");

    expect(agentMsg.workflowOptions).toHaveLength(2);
    expect(agentMsg.workflowOptions![0].workflowId).toBe("git-revert-v2");
    expect(agentMsg.workflowOptions![0].recommended).toBe(true);
    expect(agentMsg.workflowOptions![0].parameters).toEqual({
      TARGET_RESOURCE_NAMESPACE: "demo-webui",
      TARGET_RESOURCE_KIND: "v1/ConfigMap",
      TARGET_RESOURCE_NAME: "app-config",
    });
    expect(agentMsg.workflowOptions![1].ruledOutReason).toContain("selfHeal");

    expect(agentMsg.thinking).toHaveLength(2);
    expect(agentMsg.thinking![0].type).toBe("preflight");
    expect(agentMsg.thinking![1].type).toBe("tool_call");
  });

  it("IT-CONSOLE-ARTIFACT-002: text-only artifact preserves backward compatibility", async () => {
    vi.useRealTimers();
    const { streamA2A: streamFn } = await import("../lib/a2a-client");
    const mockedStream = vi.mocked(streamFn);

    mockedStream.mockImplementation(async (_req, opts) => {
      opts.onEvent({
        kind: "artifact-update",
        taskId: "t1",
        contextId: "ctx-it-2",
        artifact: {
          artifactId: "legacy-1",
          parts: [{ kind: "text", text: "Here is the analysis." }],
        },
        lastChunk: true,
        append: false,
      });
      opts.onEvent({
        kind: "artifact-update",
        taskId: "t1",
        contextId: "ctx-it-2",
        artifact: {
          artifactId: "legacy-1",
          parts: [{ kind: "text", text: " Additional info appended." }],
        },
        lastChunk: true,
        append: true,
      });
      opts.onComplete?.();
    });

    const { result } = renderHook(() => useChat());
    await act(async () => { await result.current.sendMessage("hello"); });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    const agentMsg = result.current.messages[1];
    expect(agentMsg.text).toBe("Here is the analysis. Additional info appended.");
    expect(agentMsg.rca).toBeUndefined();
    expect(agentMsg.workflowOptions).toBeUndefined();
    expect(agentMsg.phase).toBe("investigation");
  });
});

describe("IT: Status event metadata extracts RR context for early banner population", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    sessionStorage.clear();
    vi.useFakeTimers();
  });

  it("IT-CONSOLE-STATUS-META-001: extracts rr_id, alertName, namespace, resource, and phase from status event metadata", async () => {
    vi.useRealTimers();
    const { streamA2A: streamFn } = await import("../lib/a2a-client");
    const mockedStream = vi.mocked(streamFn);

    mockedStream.mockImplementation(async (_req, opts) => {
      opts.onEvent({
        kind: "status-update",
        taskId: "t1",
        contextId: "ctx-meta-1",
        status: { state: "working", message: { role: "agent", parts: [{ kind: "text", text: "Starting..." }] } },
        metadata: {
          type: "keepalive",
          rr_id: "rr-meta-001",
          alert_name: "HighLatency",
          namespace: "production",
          kind: "Deployment",
          target: "api-frontend",
          phase: "Investigating",
        },
      });
      opts.onComplete?.();
    });

    const { result } = renderHook(() => useChat());
    await act(async () => { await result.current.sendMessage("check alerts"); });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    const agentMsg = result.current.messages.find(m => m.role === "agent")!;
    expect(agentMsg.rrId).toBe("rr-meta-001");
    expect(agentMsg.alertName).toBe("HighLatency");
    expect(agentMsg.namespace).toBe("production");
    expect(agentMsg.resource).toBe("Deployment/api-frontend");
    expect(agentMsg.phase).toBe("investigation");
  });

  it("IT-CONSOLE-STATUS-META-002: keepalive with metadata populates banner without adding text content", async () => {
    vi.useRealTimers();
    const { streamA2A: streamFn } = await import("../lib/a2a-client");
    const mockedStream = vi.mocked(streamFn);

    mockedStream.mockImplementation(async (_req, opts) => {
      opts.onEvent({
        kind: "status-update",
        taskId: "t1",
        contextId: "ctx-meta-2",
        status: { state: "working", message: { role: "agent", parts: [{ kind: "text", text: "" }] } },
        metadata: {
          type: "keepalive",
          rr_id: "rr-meta-002",
          phase: "Processing",
        },
      });
      opts.onComplete?.();
    });

    const { result } = renderHook(() => useChat());
    await act(async () => { await result.current.sendMessage("ping"); });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    const agentMsg = result.current.messages.find(m => m.role === "agent")!;
    expect(agentMsg.rrId).toBe("rr-meta-002");
    expect(agentMsg.phase).toBe("investigation");
    expect(agentMsg.text).toBe("");
  });

  it("IT-CONSOLE-STATUS-META-003: phase mapping covers all CRD phases", async () => {
    vi.useRealTimers();
    const { streamA2A: streamFn } = await import("../lib/a2a-client");
    const mockedStream = vi.mocked(streamFn);

    const phaseExpectations: [string, string][] = [
      ["Pending", "investigation"],
      ["Processing", "investigation"],
      ["Analyzing", "investigation"],
      ["Investigating", "investigation"],
      ["AwaitingApproval", "decision"],
      ["Executing", "remediation"],
      ["Verifying", "verifying"],
      ["Blocked", "failed"],
      ["Completed", "complete"],
      ["Failed", "failed"],
      ["TimedOut", "failed"],
      ["Skipped", "complete"],
      ["Cancelled", "complete"],
    ];

    for (const [crdPhase, expectedPhase] of phaseExpectations) {
      vi.resetAllMocks();
      sessionStorage.clear();

      mockedStream.mockImplementation(async (_req, opts) => {
        opts.onEvent({
          kind: "status-update",
          taskId: "t1",
          contextId: `ctx-phase-${crdPhase}`,
          status: { state: "working", message: { role: "agent", parts: [] } },
          metadata: { type: "keepalive", rr_id: `rr-${crdPhase}`, phase: crdPhase },
        });
        opts.onComplete?.();
      });

      const { result } = renderHook(() => useChat());
      await act(async () => { await result.current.sendMessage("test"); });

      await waitFor(() => {
        expect(result.current.isStreaming).toBe(false);
      });

      const agentMsg = result.current.messages.find(m => m.role === "agent");
      expect(agentMsg?.phase).toBe(expectedPhase);
    }
  });

  it("IT-CONSOLE-STATUS-META-004: resource displays target-only when kind is absent", async () => {
    vi.useRealTimers();
    const { streamA2A: streamFn } = await import("../lib/a2a-client");
    const mockedStream = vi.mocked(streamFn);

    mockedStream.mockImplementation(async (_req, opts) => {
      opts.onEvent({
        kind: "status-update",
        taskId: "t1",
        contextId: "ctx-meta-4",
        status: { state: "working", message: { role: "agent", parts: [] } },
        metadata: { type: "keepalive", rr_id: "rr-meta-004", target: "my-pod-xyz" },
      });
      opts.onComplete?.();
    });

    const { result } = renderHook(() => useChat());
    await act(async () => { await result.current.sendMessage("test"); });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    const agentMsg = result.current.messages.find(m => m.role === "agent")!;
    expect(agentMsg.resource).toBe("my-pod-xyz");
  });
});
