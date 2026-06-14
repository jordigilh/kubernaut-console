import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useChat } from "./useChat";
import type { RCAData, WorkflowOption } from "./useChat";

vi.mock("../lib/a2a-client", () => ({
  buildStreamRequest: vi.fn(() => ({ jsonrpc: "2.0", method: "message/stream", params: { message: { parts: [{ kind: "text", text: "test" }] } } })),
  streamA2A: vi.fn(async (_req: unknown, opts: { onComplete?: () => void }) => {
    opts.onComplete?.();
  }),
}));

vi.mock("../lib/a2a-mock", () => ({
  mockStreamA2A: vi.fn(async (_text: string, onEvent: (evt: unknown) => void) => {
    onEvent({
      kind: "artifact-update",
      taskId: "t1",
      contextId: "ctx-mock",
      artifact: { artifactId: "a1", parts: [{ kind: "text", text: "mock response" }] },
      append: true,
    });
  }),
}));

describe("useChat", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // SC-5: Denial of Service Protection
  // Rate limiting prevents operator input from flooding the backend
  describe("SC-5: Rate limiting protects against input flooding", () => {
    it("UT-CONSOLE-CHAT-001: rejects rapid-fire messages within 500ms cooldown", async () => {
      vi.useRealTimers();
      const { result } = renderHook(() => useChat());

      await act(async () => {
        await result.current.sendMessage("first");
      });

      const countAfterFirst = result.current.messages.length;

      await act(async () => {
        await result.current.sendMessage("second");
      });

      expect(result.current.messages.length).toBe(countAfterFirst);
    });

    it("UT-CONSOLE-CHAT-002: allows messages after cooldown expires", async () => {
      vi.useRealTimers();
      const { result } = renderHook(() => useChat());

      await act(async () => {
        await result.current.sendMessage("first");
      });

      const countAfterFirst = result.current.messages.length;

      await new Promise((r) => setTimeout(r, 600));

      await act(async () => {
        await result.current.sendMessage("second");
      });

      expect(result.current.messages.length).toBeGreaterThan(countAfterFirst);
    });
  });

  // AU-10: Non-repudiation — conversation context preserved for audit trail
  describe("AU-10: Session persistence preserves conversation for audit reconstruction", () => {
    it("UT-CONSOLE-CHAT-003: saves messages to sessionStorage after stream completes", async () => {
      vi.useRealTimers();
      const { result } = renderHook(() => useChat());

      await act(async () => {
        await result.current.sendMessage("hello");
      });

      await waitFor(() => {
        expect(result.current.isStreaming).toBe(false);
      });

      const stored = sessionStorage.getItem("kubernaut-console-messages");
      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored!);
      expect(parsed.length).toBeGreaterThan(0);
      expect(parsed[0].text).toBe("hello");
      expect(parsed[0].role).toBe("user");
    });

    it("UT-CONSOLE-CHAT-004: restores conversation context on page reload", async () => {
      vi.useRealTimers();
      const existingMessages = [
        { id: "msg-1", role: "user", text: "restored message", timestamp: Date.now() },
      ];
      sessionStorage.setItem("kubernaut-console-messages", JSON.stringify(existingMessages));

      const { result } = renderHook(() => useChat());

      expect(result.current.messages).toHaveLength(1);
      expect(result.current.messages[0].text).toBe("restored message");
    });

    it("UT-CONSOLE-CHAT-005: clearHistory removes conversation context and A2A session binding", async () => {
      vi.useRealTimers();
      sessionStorage.setItem("kubernaut-console-messages", JSON.stringify([{ id: "1", role: "user", text: "x", timestamp: 1 }]));
      sessionStorage.setItem("kubernaut-console-context", "ctx-123");

      const { result } = renderHook(() => useChat());

      act(() => {
        result.current.clearHistory();
      });

      expect(result.current.messages).toHaveLength(0);
      expect(sessionStorage.getItem("kubernaut-console-context")).toBeNull();
    });
  });

  describe("Extended decision payload with RCA", () => {
    // SI-7: Software, Firmware, and Information Integrity — decision payload integrity verification
    it("UT-CONSOLE-CHAT-006: parses RCA fields from extended decision payload", async () => {
      vi.useRealTimers();
      const { streamA2A: streamFn } = await import("../lib/a2a-client");
      const mockedStream = vi.mocked(streamFn);

      mockedStream.mockImplementation(async (_req, opts) => {
        opts.onEvent({
          kind: "status-update",
          taskId: "t1",
          contextId: "ctx-1",
          status: {
            state: "input-required",
            message: {
              role: "agent",
              parts: [{
                kind: "text",
                text: JSON.stringify({
                  session_id: "sess-1",
                  summary: "ConfigMap app-config contains an invalid directive.",
                  rca: {
                    severity: "critical",
                    confidence: 0.95,
                    causal_chain: [
                      "Signal: Pod web-frontend in CrashLoopBackOff",
                      "Why? invalid directive in config.yaml",
                      "Root cause: Bad commit synced via ArgoCD",
                    ],
                    target: "ConfigMap/app-config in demo-webui",
                    tool_calls_count: 19,
                    llm_turns: 17,
                  },
                  options: [
                    { workflow_id: "git-revert-v2", name: "git-revert-v2", description: "Reverts commit", risk: "low", recommended: true, parameters: { TARGET_RESOURCE_NAME: "app-config" } },
                  ],
                }),
              }],
            },
          },
          metadata: { type: "decision" },
          final: true,
        });
        opts.onComplete?.();
      });

      const { result } = renderHook(() => useChat());
      await act(async () => { await result.current.sendMessage("test"); });

      await waitFor(() => {
        const agentMsg = result.current.messages.find(m => m.role === "agent");
        expect(agentMsg?.rca).toBeDefined();
      });

      const agentMsg = result.current.messages.find(m => m.role === "agent")!;
      const rca: RCAData = agentMsg.rca!;
      expect(rca.severity).toBe("critical");
      expect(rca.confidence).toBe(0.95);
      expect(rca.causalChain).toHaveLength(3);
      expect(rca.target).toBe("ConfigMap/app-config in demo-webui");
      expect(rca.toolCallsCount).toBe(19);
      expect(rca.llmTurns).toBe(17);
      expect(rca.summary).toBe("ConfigMap app-config contains an invalid directive.");
    });

    // SI-7: Software, Firmware, and Information Integrity — workflow parameters parsed faithfully from backend
    it("UT-CONSOLE-CHAT-007: parses workflow parameters and ruledOutReason from decision payload", async () => {
      vi.useRealTimers();
      const { streamA2A: streamFn } = await import("../lib/a2a-client");
      const mockedStream = vi.mocked(streamFn);

      mockedStream.mockImplementation(async (_req, opts) => {
        opts.onEvent({
          kind: "status-update",
          taskId: "t1",
          contextId: "ctx-1",
          status: {
            state: "input-required",
            message: {
              role: "agent",
              parts: [{
                kind: "text",
                text: JSON.stringify({
                  session_id: "sess-1",
                  summary: "Test summary",
                  options: [
                    {
                      workflow_id: "git-revert-v2",
                      name: "git-revert-v2",
                      description: "Reverts commit",
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
                      description: "Patches ConfigMap",
                      risk: "high",
                      recommended: false,
                      ruled_out_reason: "selfHeal:true will revert in-cluster patches",
                    },
                  ],
                }),
              }],
            },
          },
          metadata: { type: "decision" },
          final: true,
        });
        opts.onComplete?.();
      });

      const { result } = renderHook(() => useChat());
      await act(async () => { await result.current.sendMessage("test"); });

      await waitFor(() => {
        const agentMsg = result.current.messages.find(m => m.role === "agent");
        expect(agentMsg?.workflowOptions).toBeDefined();
      });

      const agentMsg = result.current.messages.find(m => m.role === "agent")!;
      const opts: WorkflowOption[] = agentMsg.workflowOptions!;

      expect(opts[0].parameters).toEqual({
        TARGET_RESOURCE_NAMESPACE: "demo-webui",
        TARGET_RESOURCE_KIND: "v1/ConfigMap",
        TARGET_RESOURCE_NAME: "app-config",
      });
      expect(opts[1].ruledOutReason).toBe("selfHeal:true will revert in-cluster patches");
    });

    it("UT-CONSOLE-CHAT-008: sets phase to 'decision' when decision payload is received", async () => {
      vi.useRealTimers();
      const { streamA2A: streamFn } = await import("../lib/a2a-client");
      const mockedStream = vi.mocked(streamFn);

      mockedStream.mockImplementation(async (_req, opts) => {
        opts.onEvent({
          kind: "status-update",
          taskId: "t1",
          contextId: "ctx-1",
          status: {
            state: "input-required",
            message: {
              role: "agent",
              parts: [{
                kind: "text",
                text: JSON.stringify({
                  session_id: "sess-1",
                  summary: "RCA summary",
                  options: [{ workflow_id: "wf-1", name: "Test", description: "desc", recommended: true }],
                }),
              }],
            },
          },
          metadata: { type: "decision" },
          final: true,
        });
        opts.onComplete?.();
      });

      const { result } = renderHook(() => useChat());
      await act(async () => { await result.current.sendMessage("test"); });

      await waitFor(() => {
        const agentMsg = result.current.messages.find(m => m.role === "agent");
        expect(agentMsg?.phase).toBe("decision");
      });
    });

    it("UT-CONSOLE-CHAT-009: parses preflight thinking entries with type 'preflight'", async () => {
      vi.useRealTimers();
      const { streamA2A: streamFn } = await import("../lib/a2a-client");
      const mockedStream = vi.mocked(streamFn);

      mockedStream.mockImplementation(async (_req, opts) => {
        opts.onEvent({
          kind: "status-update",
          taskId: "t1",
          contextId: "ctx-1",
          status: {
            state: "working",
            message: { role: "agent", parts: [{ kind: "text", text: "Checking for existing active remediation..." }] },
          },
          metadata: { type: "preflight" },
        });
        opts.onComplete?.();
      });

      const { result } = renderHook(() => useChat());
      await act(async () => { await result.current.sendMessage("test"); });

      await waitFor(() => {
        const agentMsg = result.current.messages.find(m => m.role === "agent");
        expect(agentMsg?.thinking).toHaveLength(1);
      });

      const agentMsg = result.current.messages.find(m => m.role === "agent")!;
      expect(agentMsg.thinking![0].type).toBe("preflight");
      expect(agentMsg.thinking![0].text).toBe("Checking for existing active remediation...");
    });

    it("UT-CONSOLE-CHAT-010: parses tool_call thinking entries", async () => {
      vi.useRealTimers();
      const { streamA2A: streamFn } = await import("../lib/a2a-client");
      const mockedStream = vi.mocked(streamFn);

      mockedStream.mockImplementation(async (_req, opts) => {
        opts.onEvent({
          kind: "status-update",
          taskId: "t1",
          contextId: "ctx-1",
          status: {
            state: "working",
            message: { role: "agent", parts: [{ kind: "text", text: "kubectl_get ConfigMap/app-config" }] },
          },
          metadata: { type: "tool_call" },
        });
        opts.onComplete?.();
      });

      const { result } = renderHook(() => useChat());
      await act(async () => { await result.current.sendMessage("test"); });

      await waitFor(() => {
        const agentMsg = result.current.messages.find(m => m.role === "agent");
        expect(agentMsg?.thinking).toHaveLength(1);
      });

      const agentMsg = result.current.messages.find(m => m.role === "agent")!;
      expect(agentMsg.thinking![0].type).toBe("tool_call");
    });

    it("UT-CONSOLE-CHAT-011: exposes investigationStartTime when streaming begins", async () => {
      vi.useRealTimers();
      const { result } = renderHook(() => useChat());

      await act(async () => { await result.current.sendMessage("test"); });

      expect(result.current.investigationStartTime).toBeDefined();
      expect(typeof result.current.investigationStartTime).toBe("number");
    });
  });

  // SI-17: Fail-Safe Procedures — error handling
  describe("SI-17: Error handling and connection resilience", () => {
    it("UT-CONSOLE-CHAT-012: onError sets error state with message", async () => {
      vi.useRealTimers();
      const { streamA2A: streamFn } = await import("../lib/a2a-client");
      const mockedStream = vi.mocked(streamFn);

      mockedStream.mockImplementation(async (_req, opts) => {
        opts.onError(new Error("Backend unavailable"));
      });

      const { result } = renderHook(() => useChat());
      await act(async () => { await result.current.sendMessage("test"); });

      await waitFor(() => {
        expect(result.current.error).toBe("Backend unavailable");
      });
      expect(result.current.isStreaming).toBe(false);
      expect(result.current.connectionStatus).toBe("idle");
    });

    it("UT-CONSOLE-CHAT-013: onReconnecting sets connectionStatus without showing error banner", async () => {
      vi.useRealTimers();
      const { streamA2A: streamFn } = await import("../lib/a2a-client");
      const mockedStream = vi.mocked(streamFn);

      mockedStream.mockImplementation(async (_req, opts) => {
        opts.onReconnecting?.(2);
      });

      const { result } = renderHook(() => useChat());
      await act(async () => { await result.current.sendMessage("test"); });

      await waitFor(() => {
        expect(result.current.connectionStatus).toBe("reconnecting");
      });
      expect(result.current.error).toBeNull();
    });

    it("UT-CONSOLE-CHAT-014: onConnectionLost sets connectionStatus to 'lost'", async () => {
      vi.useRealTimers();
      const { streamA2A: streamFn } = await import("../lib/a2a-client");
      const mockedStream = vi.mocked(streamFn);

      mockedStream.mockImplementation(async (_req, opts) => {
        opts.onConnectionLost?.();
      });

      const { result } = renderHook(() => useChat());
      await act(async () => { await result.current.sendMessage("test"); });

      await waitFor(() => {
        expect(result.current.connectionStatus).toBe("lost");
      });
    });
  });

  // SC-5: Cancel stream control
  describe("SC-5: cancelStream aborts active connection", () => {
    it("UT-CONSOLE-CHAT-015: cancelStream aborts controller, resets streaming and connection", async () => {
      vi.useRealTimers();
      const { streamA2A: streamFn } = await import("../lib/a2a-client");
      const mockedStream = vi.mocked(streamFn);

      let signalRef: AbortSignal | undefined;
      mockedStream.mockImplementation(async (_req, opts) => {
        signalRef = opts.signal;
        return new Promise(() => {});
      });

      const { result } = renderHook(() => useChat());
      act(() => { result.current.sendMessage("test"); });

      await waitFor(() => {
        expect(result.current.isStreaming).toBe(true);
      });

      act(() => { result.current.cancelStream(); });

      await waitFor(() => {
        expect(result.current.isStreaming).toBe(false);
        expect(result.current.connectionStatus).toBe("idle");
      });
      expect(signalRef?.aborted).toBe(true);
    });
  });

  // IR-4: Output event parsing (execution steps)
  describe("IR-4: Execution step output parsing", () => {
    it("UT-CONSOLE-CHAT-016: parses output event into executionSteps", async () => {
      vi.useRealTimers();
      const { streamA2A: streamFn } = await import("../lib/a2a-client");
      const mockedStream = vi.mocked(streamFn);

      mockedStream.mockImplementation(async (_req, opts) => {
        opts.onEvent({
          kind: "status-update",
          taskId: "t1",
          contextId: "ctx-1",
          status: {
            state: "working",
            message: {
              role: "agent",
              parts: [{
                kind: "text",
                text: JSON.stringify({
                  steps: [
                    { id: "s1", label: "Cloning GitOps repository", state: "done" },
                    { id: "s2", label: "Reverting commit", state: "running" },
                  ],
                  completed: false,
                }),
              }],
            },
          },
          metadata: { type: "output" },
        });
        opts.onComplete?.();
      });

      const { result } = renderHook(() => useChat());
      await act(async () => { await result.current.sendMessage("test"); });

      await waitFor(() => {
        const agentMsg = result.current.messages.find(m => m.role === "agent");
        expect(agentMsg?.executionSteps).toHaveLength(2);
      });

      const agentMsg = result.current.messages.find(m => m.role === "agent")!;
      expect(agentMsg.executionSteps![0].label).toBe("Cloning GitOps repository");
      expect(agentMsg.executionSteps![1].state).toBe("running");
      expect(agentMsg.phase).toBe("remediation");
      expect(agentMsg.executionComplete).toBe(false);
    });

    it("UT-CONSOLE-CHAT-017: sets phase to 'complete' and executionComplete when steps are done", async () => {
      vi.useRealTimers();
      const { streamA2A: streamFn } = await import("../lib/a2a-client");
      const mockedStream = vi.mocked(streamFn);

      mockedStream.mockImplementation(async (_req, opts) => {
        opts.onEvent({
          kind: "status-update",
          taskId: "t1",
          contextId: "ctx-1",
          status: {
            state: "working",
            message: {
              role: "agent",
              parts: [{
                kind: "text",
                text: JSON.stringify({
                  steps: [{ id: "s1", label: "Done step", state: "done" }],
                  completed: true,
                }),
              }],
            },
          },
          metadata: { type: "output" },
        });
        opts.onComplete?.();
      });

      const { result } = renderHook(() => useChat());
      await act(async () => { await result.current.sendMessage("test"); });

      await waitFor(() => {
        const agentMsg = result.current.messages.find(m => m.role === "agent");
        expect(agentMsg?.executionComplete).toBe(true);
        expect(agentMsg?.phase).toBe("complete");
      });
    });
  });

  // SI-7: Payload integrity - truncation and malformed handling
  describe("SI-7: Truncated and malformed payload handling", () => {
    it("UT-CONSOLE-CHAT-018: ignores truncated decision payload (>=512 chars ending with '...')", async () => {
      vi.useRealTimers();
      const { streamA2A: streamFn } = await import("../lib/a2a-client");
      const mockedStream = vi.mocked(streamFn);

      const longText = "x".repeat(512) + "...";

      mockedStream.mockImplementation(async (_req, opts) => {
        opts.onEvent({
          kind: "status-update",
          taskId: "t1",
          contextId: "ctx-1",
          status: {
            state: "input-required",
            message: { role: "agent", parts: [{ kind: "text", text: longText }] },
          },
          metadata: { type: "decision" },
          final: true,
        });
        opts.onComplete?.();
      });

      const { result } = renderHook(() => useChat());
      await act(async () => { await result.current.sendMessage("test"); });

      await waitFor(() => {
        expect(result.current.isStreaming).toBe(false);
      });

      const agentMsg = result.current.messages.find(m => m.role === "agent");
      expect(agentMsg?.phase).not.toBe("decision");
      expect(agentMsg?.rca).toBeUndefined();
      expect(agentMsg?.workflowOptions).toBeUndefined();
    });

    it("UT-CONSOLE-CHAT-019: ignores truncated output payload (>=512 chars ending with '...')", async () => {
      vi.useRealTimers();
      const { streamA2A: streamFn } = await import("../lib/a2a-client");
      const mockedStream = vi.mocked(streamFn);

      const longText = "y".repeat(512) + "...";

      mockedStream.mockImplementation(async (_req, opts) => {
        opts.onEvent({
          kind: "status-update",
          taskId: "t1",
          contextId: "ctx-1",
          status: {
            state: "working",
            message: { role: "agent", parts: [{ kind: "text", text: longText }] },
          },
          metadata: { type: "output" },
        });
        opts.onComplete?.();
      });

      const { result } = renderHook(() => useChat());
      await act(async () => { await result.current.sendMessage("test"); });

      await waitFor(() => {
        expect(result.current.isStreaming).toBe(false);
      });

      const agentMsg = result.current.messages.find(m => m.role === "agent");
      expect(agentMsg?.executionSteps).toBeUndefined();
    });

    it("UT-CONSOLE-CHAT-020: gracefully handles malformed JSON in decision payload", async () => {
      vi.useRealTimers();
      const { streamA2A: streamFn } = await import("../lib/a2a-client");
      const mockedStream = vi.mocked(streamFn);

      mockedStream.mockImplementation(async (_req, opts) => {
        opts.onEvent({
          kind: "status-update",
          taskId: "t1",
          contextId: "ctx-1",
          status: {
            state: "input-required",
            message: { role: "agent", parts: [{ kind: "text", text: "{not valid json" }] },
          },
          metadata: { type: "decision" },
          final: true,
        });
        opts.onComplete?.();
      });

      const { result } = renderHook(() => useChat());
      await act(async () => { await result.current.sendMessage("test"); });

      await waitFor(() => {
        expect(result.current.isStreaming).toBe(false);
      });

      const agentMsg = result.current.messages.find(m => m.role === "agent");
      expect(agentMsg?.rca).toBeUndefined();
      expect(agentMsg?.workflowOptions).toBeUndefined();
    });

    it("UT-CONSOLE-CHAT-021: gracefully handles malformed JSON in output payload", async () => {
      vi.useRealTimers();
      const { streamA2A: streamFn } = await import("../lib/a2a-client");
      const mockedStream = vi.mocked(streamFn);

      mockedStream.mockImplementation(async (_req, opts) => {
        opts.onEvent({
          kind: "status-update",
          taskId: "t1",
          contextId: "ctx-1",
          status: {
            state: "working",
            message: { role: "agent", parts: [{ kind: "text", text: "broken json {{" }] },
          },
          metadata: { type: "output" },
        });
        opts.onComplete?.();
      });

      const { result } = renderHook(() => useChat());
      await act(async () => { await result.current.sendMessage("test"); });

      await waitFor(() => {
        expect(result.current.isStreaming).toBe(false);
      });

      const agentMsg = result.current.messages.find(m => m.role === "agent");
      expect(agentMsg?.executionSteps).toBeUndefined();
    });
  });

  describe("SI-7: Structured artifact handling (A2A DataPart)", () => {
    it("UT-CONSOLE-CHAT-022: parses investigation_summary DataPart into rca and workflowOptions", async () => {
      vi.useRealTimers();
      const { streamA2A: streamFn } = await import("../lib/a2a-client");
      const mockedStream = vi.mocked(streamFn);

      mockedStream.mockImplementation(async (_req, opts) => {
        opts.onEvent({
          kind: "artifact-update",
          taskId: "t1",
          contextId: "ctx-1",
          artifact: {
            artifactId: "investigation-001",
            parts: [
              {
                kind: "data",
                data: {
                  type: "investigation_summary",
                  schema_version: "1.0",
                  session_id: "ka-session-1",
                  rr_id: "rr-abc123",
                  summary: "Root cause identified: OOM kill on worker deployment.",
                  rca: {
                    severity: "high",
                    confidence: 0.92,
                    target: "deployment/worker",
                    causal_chain: ["OOM kill", "memory limit too low"],
                    rca_summary: "The worker is OOM-killing.",
                    tool_calls_count: 8,
                    llm_turns: 3,
                  },
                  options: [
                    {
                      workflow_id: "rollback-v1",
                      name: "Rolling restart",
                      description: "Restart pods sequentially",
                      risk: "low",
                      recommended: true,
                      parameters: { TARGET_NAMESPACE: "demo-checkout" },
                    },
                  ],
                },
                mediaType: "application/json",
                metadata: { schema: "investigation_summary", schema_version: "1.0" },
              },
              {
                kind: "text",
                text: "Investigation complete. Severity: high.",
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
      await act(async () => { await result.current.sendMessage("investigate"); });

      await waitFor(() => {
        expect(result.current.isStreaming).toBe(false);
      });

      const agentMsg = result.current.messages.find(m => m.role === "agent");
      expect(agentMsg?.phase).toBe("decision");
      expect(agentMsg?.rca).toBeDefined();
      expect(agentMsg?.rca?.severity).toBe("high");
      expect(agentMsg?.rca?.confidence).toBe(0.92);
      expect(agentMsg?.rca?.target).toBe("deployment/worker");
      expect(agentMsg?.rca?.causalChain).toEqual(["OOM kill", "memory limit too low"]);
      expect(agentMsg?.rca?.toolCallsCount).toBe(8);
      expect(agentMsg?.rca?.llmTurns).toBe(3);
      expect(agentMsg?.rca?.summary).toBe("Root cause identified: OOM kill on worker deployment.");
      expect(agentMsg?.workflowOptions).toHaveLength(1);
      expect(agentMsg?.workflowOptions?.[0].workflowId).toBe("rollback-v1");
      expect(agentMsg?.workflowOptions?.[0].recommended).toBe(true);
    });

    it("UT-CONSOLE-CHAT-023: falls back to text concatenation when no DataPart is present", async () => {
      vi.useRealTimers();
      const { streamA2A: streamFn } = await import("../lib/a2a-client");
      const mockedStream = vi.mocked(streamFn);

      mockedStream.mockImplementation(async (_req, opts) => {
        opts.onEvent({
          kind: "artifact-update",
          taskId: "t1",
          contextId: "ctx-1",
          artifact: {
            artifactId: "a1",
            parts: [{ kind: "text", text: "Plain text response" }],
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

      const agentMsg = result.current.messages.find(m => m.role === "agent");
      expect(agentMsg?.text).toBe("Plain text response");
      expect(agentMsg?.rca).toBeUndefined();
    });

    it("UT-CONSOLE-CHAT-024: suppresses text when structured DataPart is present (no duplication)", async () => {
      vi.useRealTimers();
      const { streamA2A: streamFn } = await import("../lib/a2a-client");
      const mockedStream = vi.mocked(streamFn);

      mockedStream.mockImplementation(async (_req, opts) => {
        opts.onEvent({
          kind: "artifact-update",
          taskId: "t1",
          contextId: "ctx-1",
          artifact: {
            artifactId: "investigation-001",
            parts: [
              {
                kind: "data",
                data: {
                  type: "investigation_summary",
                  schema_version: "1.0",
                  session_id: "s1",
                  rr_id: "rr-1",
                  summary: "",
                  rca: { severity: "low", confidence: 0.5, target: "pod/test" },
                },
                mediaType: "application/json",
                metadata: { schema: "investigation_summary" },
              },
              {
                kind: "text",
                text: "Fallback text for standard clients.",
              },
            ],
            metadata: { schema: "investigation_summary" },
          },
          lastChunk: true,
          append: false,
        });
        opts.onComplete?.();
      });

      const { result } = renderHook(() => useChat());
      await act(async () => { await result.current.sendMessage("test"); });

      await waitFor(() => {
        expect(result.current.isStreaming).toBe(false);
      });

      const agentMsg = result.current.messages.find(m => m.role === "agent");
      expect(agentMsg?.text).toBe("");
      expect(agentMsg?.rca).toBeDefined();
    });

    it("UT-CONSOLE-CHAT-025: ignores DataPart with unknown schema type", async () => {
      vi.useRealTimers();
      const { streamA2A: streamFn } = await import("../lib/a2a-client");
      const mockedStream = vi.mocked(streamFn);

      mockedStream.mockImplementation(async (_req, opts) => {
        opts.onEvent({
          kind: "artifact-update",
          taskId: "t1",
          contextId: "ctx-1",
          artifact: {
            artifactId: "a1",
            parts: [
              {
                kind: "data",
                data: { type: "unknown_schema", version: "1.0" },
                mediaType: "application/json",
              },
              {
                kind: "text",
                text: "Some text fallback",
              },
            ],
          },
          lastChunk: true,
          append: false,
        });
        opts.onComplete?.();
      });

      const { result } = renderHook(() => useChat());
      await act(async () => { await result.current.sendMessage("test"); });

      await waitFor(() => {
        expect(result.current.isStreaming).toBe(false);
      });

      const agentMsg = result.current.messages.find(m => m.role === "agent");
      expect(agentMsg?.text).toBe("Some text fallback");
      expect(agentMsg?.rca).toBeUndefined();
    });
  });

  describe("Thinking suppression on structured artifact", () => {
    it("UT-CONSOLE-CHAT-027: preserves all thinking entries when artifact arrives (auto-collapse handles UX)", async () => {
      vi.useRealTimers();
      const { streamA2A: streamFn } = await import("../lib/a2a-client");
      const mockedStream = vi.mocked(streamFn);

      mockedStream.mockImplementation(async (_req, opts) => {
        opts.onEvent({
          kind: "status-update",
          taskId: "t1",
          contextId: "ctx-1",
          status: {
            state: "working",
            message: { role: "agent", parts: [{ kind: "text", text: "Checking for existing active remediation..." }] },
          },
          metadata: { type: "preflight" },
        });
        opts.onEvent({
          kind: "status-update",
          taskId: "t1",
          contextId: "ctx-1",
          status: {
            state: "working",
            message: { role: "agent", parts: [{ kind: "text", text: "kubectl_get Pod/web-frontend" }] },
          },
          metadata: { type: "tool_call" },
        });
        opts.onEvent({
          kind: "status-update",
          taskId: "t1",
          contextId: "ctx-1",
          status: {
            state: "working",
            message: { role: "agent", parts: [{ kind: "text", text: "The pod is in CrashLoopBackOff due to invalid config." }] },
          },
          metadata: { type: "reasoning" },
        });
        opts.onEvent({
          kind: "status-update",
          taskId: "t1",
          contextId: "ctx-1",
          status: {
            state: "working",
            message: { role: "agent", parts: [{ kind: "text", text: "Investigation in progress..." }] },
          },
          metadata: { type: "investigation" },
        });
        opts.onEvent({
          kind: "artifact-update",
          taskId: "t1",
          contextId: "ctx-1",
          artifact: {
            artifactId: "a1",
            parts: [{
              kind: "data",
              data: {
                session_id: "s1",
                summary: "Root cause found",
                rca: { severity: "high", confidence: 0.9, target: "pod/test", causal_chain: ["a", "b"] },
                options: [{ workflow_id: "wf-1", name: "Fix", description: "Fix it", recommended: true }],
              },
              mediaType: "application/json",
            }],
            metadata: { schema: "investigation_summary" },
          },
          lastChunk: true,
          append: false,
        });
        opts.onComplete?.();
      });

      const { result } = renderHook(() => useChat());
      await act(async () => { await result.current.sendMessage("test"); });

      await waitFor(() => {
        const agentMsg = result.current.messages.find(m => m.role === "agent");
        expect(agentMsg?.rca).toBeDefined();
      });

      const agentMsg = result.current.messages.find(m => m.role === "agent")!;
      expect(agentMsg.thinking).toBeDefined();
      expect(agentMsg.thinking!.length).toBe(4);
      expect(agentMsg.thinking!.some(e => e.type === "preflight")).toBe(true);
      expect(agentMsg.thinking!.some(e => e.type === "tool_call")).toBe(true);
      expect(agentMsg.thinking!.some(e => e.type === "reasoning")).toBe(true);
      expect(agentMsg.thinking!.some(e => e.type === "investigation")).toBe(true);
    });
  });

  // IR-4: Incident Handling — structured execution progress from artifact events
  describe("IR-4: execution_progress artifact handler", () => {
    it("UT-CONSOLE-CHAT-031: parses execution_progress artifact into executionSteps with correct phase states", async () => {
      vi.useRealTimers();
      const { streamA2A: streamFn } = await import("../lib/a2a-client");
      const mockedStream = vi.mocked(streamFn);

      mockedStream.mockImplementation(async (_req, opts) => {
        opts.onEvent({
          kind: "artifact-update",
          taskId: "t1",
          contextId: "ctx-1",
          artifact: {
            artifactId: "progress-001",
            parts: [
              {
                kind: "data",
                data: {
                  type: "execution_progress",
                  schema_version: "1.0",
                  rr_name: "rr-abc123",
                  current_phase: "Executing",
                  started_at: "2026-06-11T10:00:00Z",
                },
                mediaType: "application/json",
              },
              { kind: "text", text: "Phase 3/5: Executing workflow" },
            ],
            metadata: { type: "execution_progress" },
          },
          lastChunk: true,
          append: false,
        });
        opts.onComplete?.();
      });

      const { result } = renderHook(() => useChat());
      await act(async () => { await result.current.sendMessage("test"); });

      await waitFor(() => {
        const agentMsg = result.current.messages.find(m => m.role === "agent");
        expect(agentMsg?.executionSteps).toBeDefined();
      });

      const agentMsg = result.current.messages.find(m => m.role === "agent")!;
      expect(agentMsg.executionSteps!.length).toBeGreaterThan(0);
      const executing = agentMsg.executionSteps!.find(s => s.label === "Executing");
      expect(executing?.state).toBe("running");
      expect(agentMsg.phase).toBe("remediation");
      expect(agentMsg.executionComplete).toBe(false);
    });

    it("UT-CONSOLE-CHAT-032: extracts stabilization_window from execution_progress artifact metadata", async () => {
      vi.useRealTimers();
      const { streamA2A: streamFn } = await import("../lib/a2a-client");
      const mockedStream = vi.mocked(streamFn);

      mockedStream.mockImplementation(async (_req, opts) => {
        opts.onEvent({
          kind: "artifact-update",
          taskId: "t1",
          contextId: "ctx-1",
          artifact: {
            artifactId: "progress-002",
            parts: [{
              kind: "data",
              data: {
                type: "execution_progress",
                schema_version: "1.0",
                rr_name: "rr-abc123",
                current_phase: "Verifying",
                started_at: "2026-06-11T10:00:00Z",
              },
              mediaType: "application/json",
            }],
            metadata: { type: "execution_progress", stabilization_window: "60s" },
          },
          lastChunk: true,
          append: false,
        });
        opts.onComplete?.();
      });

      const { result } = renderHook(() => useChat());
      await act(async () => { await result.current.sendMessage("test"); });

      await waitFor(() => {
        const agentMsg = result.current.messages.find(m => m.role === "agent");
        expect(agentMsg?.stabilizationWindow).toBe(60);
      });

      const agentMsg = result.current.messages.find(m => m.role === "agent")!;
      expect(agentMsg.phase).toBe("verifying");
    });

    it("UT-CONSOLE-CHAT-033: marks terminal state and sets phase to complete on Completed", async () => {
      vi.useRealTimers();
      const { streamA2A: streamFn } = await import("../lib/a2a-client");
      const mockedStream = vi.mocked(streamFn);

      mockedStream.mockImplementation(async (_req, opts) => {
        opts.onEvent({
          kind: "artifact-update",
          taskId: "t1",
          contextId: "ctx-1",
          artifact: {
            artifactId: "progress-003",
            parts: [{
              kind: "data",
              data: {
                type: "execution_progress",
                schema_version: "1.0",
                rr_name: "rr-abc123",
                current_phase: "Completed",
                started_at: "2026-06-11T10:00:00Z",
                completed_at: "2026-06-11T10:05:00Z",
              },
              mediaType: "application/json",
            }],
            metadata: { type: "execution_progress" },
          },
          lastChunk: true,
          append: false,
        });
        opts.onComplete?.();
      });

      const { result } = renderHook(() => useChat());
      await act(async () => { await result.current.sendMessage("test"); });

      await waitFor(() => {
        const agentMsg = result.current.messages.find(m => m.role === "agent");
        expect(agentMsg?.executionComplete).toBe(true);
        expect(agentMsg?.phase).toBe("complete");
      });
    });
  });

  // AU-2: Audit Events — RR ID extraction for audit trail correlation
  describe("AU-2: rrId extraction from AF payloads", () => {
    it("UT-CONSOLE-CHAT-037: extracts rrId from investigation_summary artifact (rr_id field)", async () => {
      vi.useRealTimers();
      const { streamA2A: streamFn } = await import("../lib/a2a-client");
      const mockedStream = vi.mocked(streamFn);

      mockedStream.mockImplementation(async (_req, opts) => {
        opts.onEvent({
          kind: "artifact-update",
          taskId: "t1",
          contextId: "ctx-1",
          artifact: {
            artifactId: "inv-summary-1",
            parts: [{
              kind: "data",
              data: {
                session_id: "sess-001",
                rr_id: "rr-9e1b7bf4140b-ed9f1796",
                summary: "ConfigMap contains invalid directive",
                rca: {
                  severity: "critical",
                  confidence: 0.95,
                  target: "ConfigMap/app-config",
                  causal_chain: ["Bad config"],
                  tool_calls_count: 5,
                  llm_turns: 3,
                },
                options: [],
              },
              mediaType: "application/json",
            }],
            metadata: { schema: "investigation_summary" },
          },
          lastChunk: true,
          append: false,
        });
        opts.onComplete?.();
      });

      const { result } = renderHook(() => useChat());
      await act(async () => { await result.current.sendMessage("test"); });

      await waitFor(() => {
        const agentMsg = result.current.messages.find(m => m.role === "agent");
        expect(agentMsg?.rrId).toBe("rr-9e1b7bf4140b-ed9f1796");
        expect(agentMsg?.rca?.rrId).toBe("rr-9e1b7bf4140b-ed9f1796");
      });
    });

    it("UT-CONSOLE-CHAT-039: parses namespace from rca.target in investigation_summary artifact", async () => {
      vi.useRealTimers();
      const { streamA2A: streamFn } = await import("../lib/a2a-client");
      const mockedStream = vi.mocked(streamFn);

      mockedStream.mockImplementation(async (_req, opts) => {
        opts.onEvent({
          kind: "artifact-update",
          taskId: "t1",
          contextId: "ctx-1",
          artifact: {
            artifactId: "inv-ns-parse",
            parts: [{
              kind: "data",
              data: {
                session_id: "sess-ns",
                rr_id: "rr-abc123",
                signal_name: "KubePodCrashLooping",
                summary: "Pod crash",
                rca: {
                  severity: "critical",
                  confidence: 0.9,
                  target: "demo-webui/web-frontend",
                  causal_chain: ["crash"],
                  tool_calls_count: 4,
                  llm_turns: 2,
                },
                options: [],
              },
              mediaType: "application/json",
            }],
            metadata: { schema: "investigation_summary" },
          },
          lastChunk: true,
          append: false,
        });
        opts.onComplete?.();
      });

      const { result } = renderHook(() => useChat());
      await act(async () => { await result.current.sendMessage("test"); });

      await waitFor(() => {
        const agentMsg = result.current.messages.find(m => m.role === "agent");
        expect(agentMsg?.rca?.namespace).toBe("demo-webui");
        expect(agentMsg?.rca?.signalName).toBe("KubePodCrashLooping");
      });
    });

    it("UT-CONSOLE-CHAT-038: extracts rrId from execution_progress artifact (rr_name field)", async () => {
      vi.useRealTimers();
      const { streamA2A: streamFn } = await import("../lib/a2a-client");
      const mockedStream = vi.mocked(streamFn);

      mockedStream.mockImplementation(async (_req, opts) => {
        opts.onEvent({
          kind: "artifact-update",
          taskId: "t1",
          contextId: "ctx-1",
          artifact: {
            artifactId: "progress-rrid",
            parts: [{
              kind: "data",
              data: {
                type: "execution_progress",
                schema_version: "1.0",
                rr_name: "rr-9e1b7bf4140b-ed9f1796",
                current_phase: "Executing",
                started_at: "2026-06-11T10:00:00Z",
              },
              mediaType: "application/json",
            }],
            metadata: { type: "execution_progress" },
          },
          lastChunk: true,
          append: false,
        });
        opts.onComplete?.();
      });

      const { result } = renderHook(() => useChat());
      await act(async () => { await result.current.sendMessage("test"); });

      await waitFor(() => {
        const agentMsg = result.current.messages.find(m => m.role === "agent");
        expect(agentMsg?.rrId).toBe("rr-9e1b7bf4140b-ed9f1796");
      });
    });
  });

  // AC-6: Least Privilege / IR-4: Incident Handling — approval gate for remediation
  describe("AC-6/IR-4: approval_request event handling", () => {
    it("UT-CONSOLE-CHAT-034: parses approval_request status-update into ChatMessage.approvalRequest", async () => {
      vi.useRealTimers();
      const { streamA2A: streamFn } = await import("../lib/a2a-client");
      const mockedStream = vi.mocked(streamFn);

      mockedStream.mockImplementation(async (_req, opts) => {
        opts.onEvent({
          kind: "status-update",
          taskId: "t1",
          contextId: "ctx-1",
          status: {
            state: "working",
            message: {
              role: "agent",
              parts: [{
                kind: "text",
                text: JSON.stringify({
                  name: "rar-rr-gitops-drift-abc123",
                  namespace: "kubernaut-system",
                  remediationRequestName: "rr-gitops-drift-abc123",
                  confidence: 0.72,
                  confidenceLevel: "Medium",
                  reason: "Production namespace requires human approval",
                  whyApprovalRequired: "Rego policy matched",
                  investigationSummary: "ConfigMap modified outside GitOps",
                  evidenceCollected: ["ArgoCD out-of-sync", "ConfigMap differs from git"],
                  requiredBy: "2026-06-11T16:00:00Z",
                }),
              }],
            },
          },
          metadata: { type: "approval_request" },
        });
        opts.onComplete?.();
      });

      const { result } = renderHook(() => useChat());
      await act(async () => { await result.current.sendMessage("test"); });

      await waitFor(() => {
        const agentMsg = result.current.messages.find(m => m.role === "agent");
        expect(agentMsg?.approvalRequest).toBeDefined();
      });

      const agentMsg = result.current.messages.find(m => m.role === "agent")!;
      expect(agentMsg.approvalRequest!.name).toBe("rar-rr-gitops-drift-abc123");
      expect(agentMsg.approvalRequest!.confidence).toBe(0.72);
      expect(agentMsg.approvalRequest!.confidenceLevel).toBe("Medium");
      expect(agentMsg.approvalRequest!.evidenceCollected).toHaveLength(2);
      expect(agentMsg.approvalRequest!.requiredBy).toBe("2026-06-11T16:00:00Z");
    });

    it("UT-CONSOLE-CHAT-035: parses approval_request_resolved and sets approvalResolution", async () => {
      vi.useRealTimers();
      const { streamA2A: streamFn } = await import("../lib/a2a-client");
      const mockedStream = vi.mocked(streamFn);

      mockedStream.mockImplementation(async (_req, opts) => {
        opts.onEvent({
          kind: "status-update",
          taskId: "t1",
          contextId: "ctx-1",
          status: {
            state: "working",
            message: {
              role: "agent",
              parts: [{
                kind: "text",
                text: JSON.stringify({
                  name: "rar-rr-gitops-drift-abc123",
                  confidence: 0.72,
                  confidenceLevel: "Medium",
                  reason: "Test",
                  requiredBy: "2026-06-11T16:00:00Z",
                }),
              }],
            },
          },
          metadata: { type: "approval_request" },
        });
        opts.onEvent({
          kind: "status-update",
          taskId: "t1",
          contextId: "ctx-1",
          status: {
            state: "working",
            message: {
              role: "agent",
              parts: [{
                kind: "text",
                text: JSON.stringify({
                  name: "rar-rr-gitops-drift-abc123",
                  decision: "Approved",
                  decidedBy: "jane.doe@acme.com",
                  decidedAt: "2026-06-11T15:50:00Z",
                  decisionMessage: "Reviewed evidence, proceeding",
                }),
              }],
            },
          },
          metadata: { type: "approval_request_resolved" },
        });
        opts.onComplete?.();
      });

      const { result } = renderHook(() => useChat());
      await act(async () => { await result.current.sendMessage("test"); });

      await waitFor(() => {
        const agentMsg = result.current.messages.find(m => m.role === "agent");
        expect(agentMsg?.approvalResolution).toBeDefined();
      });

      const agentMsg = result.current.messages.find(m => m.role === "agent")!;
      expect(agentMsg.approvalResolution!.decision).toBe("Approved");
      expect(agentMsg.approvalResolution!.decidedBy).toBe("jane.doe@acme.com");
    });
  });

  describe("PhaseIndicator lifecycle phases", () => {
    it("UT-CONSOLE-CHAT-028: sets phase to 'verifying' when Verifying phase is detected", async () => {
      vi.useRealTimers();
      const { streamA2A: streamFn } = await import("../lib/a2a-client");
      const mockedStream = vi.mocked(streamFn);

      mockedStream.mockImplementation(async (_req, opts) => {
        opts.onEvent({
          kind: "status-update",
          taskId: "t1",
          contextId: "ctx-1",
          status: {
            state: "working",
            message: { role: "agent", parts: [{ kind: "text", text: "Remediation phase: Verifying" }] },
          },
          metadata: { type: "status" },
        });
        opts.onComplete?.();
      });

      const { result } = renderHook(() => useChat());
      await act(async () => { await result.current.sendMessage("test"); });

      await waitFor(() => {
        const agentMsg = result.current.messages.find(m => m.role === "agent");
        expect(agentMsg?.phase).toBe("verifying");
      });
    });

    it("UT-CONSOLE-CHAT-029: sets phase to 'failed' when Failed phase is detected", async () => {
      vi.useRealTimers();
      const { streamA2A: streamFn } = await import("../lib/a2a-client");
      const mockedStream = vi.mocked(streamFn);

      mockedStream.mockImplementation(async (_req, opts) => {
        opts.onEvent({
          kind: "status-update",
          taskId: "t1",
          contextId: "ctx-1",
          status: {
            state: "working",
            message: { role: "agent", parts: [{ kind: "text", text: "Remediation phase: Failed" }] },
          },
          metadata: { type: "status" },
        });
        opts.onComplete?.();
      });

      const { result } = renderHook(() => useChat());
      await act(async () => { await result.current.sendMessage("test"); });

      await waitFor(() => {
        const agentMsg = result.current.messages.find(m => m.role === "agent");
        expect(agentMsg?.phase).toBe("failed");
      });
    });

    it("UT-CONSOLE-CHAT-030: sets thinkingLabel to 'Discovering workflows' when discovery text detected", async () => {
      vi.useRealTimers();
      const { streamA2A: streamFn } = await import("../lib/a2a-client");
      const mockedStream = vi.mocked(streamFn);

      mockedStream.mockImplementation(async (_req, opts) => {
        opts.onEvent({
          kind: "status-update",
          taskId: "t1",
          contextId: "ctx-1",
          status: {
            state: "working",
            message: { role: "agent", parts: [{ kind: "text", text: "Discovering available workflows for this alert..." }] },
          },
          metadata: { type: "reasoning" },
        });
        opts.onComplete?.();
      });

      const { result } = renderHook(() => useChat());
      await act(async () => { await result.current.sendMessage("test"); });

      await waitFor(() => {
        const agentMsg = result.current.messages.find(m => m.role === "agent");
        expect(agentMsg?.thinkingLabel).toBe("Discovering workflows");
      });
    });
  });

  describe("Thinking entry merge separators", () => {
    it("UT-CONSOLE-CHAT-036: inserts paragraph break between consecutive same-type events", async () => {
      vi.useRealTimers();
      const { streamA2A: streamFn } = await import("../lib/a2a-client");
      const mockedStream = vi.mocked(streamFn);

      mockedStream.mockImplementation(async (_req, opts) => {
        opts.onEvent({
          kind: "status-update",
          taskId: "t1",
          contextId: "ctx-1",
          status: {
            state: "working",
            message: { role: "agent", parts: [{ kind: "text", text: "Container failing due to invalid config." }] },
          },
          metadata: { type: "reasoning" },
        });
        opts.onEvent({
          kind: "status-update",
          taskId: "t1",
          contextId: "ctx-1",
          status: {
            state: "working",
            message: { role: "agent", parts: [{ kind: "text", text: "**Summary:** The root cause is clear." }] },
          },
          metadata: { type: "reasoning" },
        });
        opts.onComplete?.();
      });

      const { result } = renderHook(() => useChat());
      await act(async () => { await result.current.sendMessage("test"); });

      await waitFor(() => {
        const agentMsg = result.current.messages.find(m => m.role === "agent");
        expect(agentMsg?.thinking).toHaveLength(1);
      });

      const merged = result.current.messages.find(m => m.role === "agent")!.thinking![0];
      expect(merged.text).toBe("Container failing due to invalid config.\n\n**Summary:** The root cause is clear.");
    });

    it("UT-CONSOLE-CHAT-040: concatenates mid-word tokens without inserting spaces", async () => {
      vi.useRealTimers();
      const { streamA2A: streamFn } = await import("../lib/a2a-client");
      const mockedStream = vi.mocked(streamFn);

      mockedStream.mockImplementation(async (_req, opts) => {
        opts.onEvent({
          kind: "status-update",
          taskId: "t1",
          contextId: "ctx-1",
          status: {
            state: "working",
            message: { role: "agent", parts: [{ kind: "text", text: "I'll investigate the K" }] },
          },
          metadata: { type: "reasoning" },
        });
        opts.onEvent({
          kind: "status-update",
          taskId: "t1",
          contextId: "ctx-1",
          status: {
            state: "working",
            message: { role: "agent", parts: [{ kind: "text", text: "ubePodCrashLo" }] },
          },
          metadata: { type: "reasoning" },
        });
        opts.onEvent({
          kind: "status-update",
          taskId: "t1",
          contextId: "ctx-1",
          status: {
            state: "working",
            message: { role: "agent", parts: [{ kind: "text", text: "oping incident." }] },
          },
          metadata: { type: "reasoning" },
        });
        opts.onComplete?.();
      });

      const { result } = renderHook(() => useChat());
      await act(async () => { await result.current.sendMessage("test"); });

      await waitFor(() => {
        const agentMsg = result.current.messages.find(m => m.role === "agent");
        expect(agentMsg?.thinking).toHaveLength(1);
      });

      const merged = result.current.messages.find(m => m.role === "agent")!.thinking![0];
      expect(merged.text).toBe("I'll investigate the KubePodCrashLooping incident.");
    });
  });

  describe("P0: Null guard for payload.rca in investigation_summary", () => {
    it("UT-CONSOLE-CHAT-041: gracefully handles investigation_summary without rca field", async () => {
      vi.useRealTimers();
      const { streamA2A } = await import("../lib/a2a-client");
      vi.mocked(streamA2A).mockImplementation(async (_req: unknown, opts: {
        onEvent?: (evt: unknown) => void;
        onComplete?: () => void;
      }) => {
        opts.onEvent?.({
          kind: "artifact-update",
          taskId: "t1",
          contextId: "ctx-1",
          artifact: {
            artifactId: "inv-summary-no-rca",
            parts: [{
              kind: "data",
              data: {
                session_id: "sess-1",
                rr_id: "rr-test-001",
                signal_name: "TestAlert",
                summary: "No RCA available yet",
              },
              mediaType: "application/json",
            }],
            metadata: { schema: "investigation_summary" },
          },
          lastChunk: true,
          append: false,
        });
        opts.onComplete?.();
      });

      const { result } = renderHook(() => useChat());
      await act(async () => { await result.current.sendMessage("investigate"); });

      await waitFor(() => {
        const agentMsg = result.current.messages.find(m => m.role === "agent");
        expect(agentMsg?.rca).toBeUndefined();
        expect(agentMsg?.rrId).toBe("rr-test-001");
      });
    });
  });

  describe("P0: cancelStream clears active agent bubble isStreaming", () => {
    it("UT-CONSOLE-CHAT-042: cancelStream sets isStreaming=false on the active agent message", async () => {
      vi.useRealTimers();
      const { streamA2A } = await import("../lib/a2a-client");
      vi.mocked(streamA2A).mockImplementation(async (_req: unknown, opts: {
        onEvent?: (evt: unknown) => void;
        signal?: AbortSignal;
      }) => {
        opts.onEvent?.({
          kind: "status-update",
          taskId: "t1",
          contextId: "ctx-1",
          status: { state: "working", message: { role: "agent", parts: [{ kind: "text", text: "Working..." }] } },
          metadata: { type: "reasoning" },
        });
        await new Promise<void>((resolve) => {
          opts.signal?.addEventListener("abort", () => resolve());
        });
      });

      const { result } = renderHook(() => useChat());
      act(() => { result.current.sendMessage("test"); });

      await waitFor(() => {
        expect(result.current.messages.find(m => m.role === "agent")).toBeDefined();
      });

      act(() => { result.current.cancelStream(); });

      await waitFor(() => {
        const agentMsg = result.current.messages.find(m => m.role === "agent");
        expect(agentMsg?.isStreaming).toBe(false);
      });
    });
  });

  describe("P0: Concurrent stream guard", () => {
    it("UT-CONSOLE-CHAT-043: second sendMessage aborts prior stream controller", async () => {
      vi.useRealTimers();
      const { streamA2A } = await import("../lib/a2a-client");
      const abortSignals: AbortSignal[] = [];

      vi.mocked(streamA2A).mockImplementation(async (_req: unknown, opts: {
        onComplete?: () => void;
        signal?: AbortSignal;
      }) => {
        if (opts.signal) abortSignals.push(opts.signal);
        await new Promise<void>((resolve) => {
          opts.signal?.addEventListener("abort", () => resolve());
          setTimeout(() => { opts.onComplete?.(); resolve(); }, 5000);
        });
      });

      const { result } = renderHook(() => useChat());
      act(() => { result.current.sendMessage("first"); });

      await new Promise(r => setTimeout(r, 600));

      act(() => { result.current.sendMessage("second"); });

      await waitFor(() => {
        expect(abortSignals[0]?.aborted).toBe(true);
      });
    });
  });

  describe("P2: Friendly error messages", () => {
    it("UT-CONSOLE-CHAT-044: maps network error to user-friendly message", async () => {
      vi.useRealTimers();
      const { streamA2A } = await import("../lib/a2a-client");
      vi.mocked(streamA2A).mockImplementation(async (_req: unknown, opts: {
        onError?: (err: Error) => void;
      }) => {
        opts.onError?.(new Error("Failed to fetch"));
      });

      const { result } = renderHook(() => useChat());
      await act(async () => { await result.current.sendMessage("test"); });

      await waitFor(() => {
        expect(result.current.error).toBe("Unable to reach the server. Check your connection and try again.");
      });
    });

    it("UT-CONSOLE-CHAT-045: maps HTTP 500 to user-friendly message", async () => {
      vi.useRealTimers();
      const { streamA2A } = await import("../lib/a2a-client");
      vi.mocked(streamA2A).mockImplementation(async (_req: unknown, opts: {
        onError?: (err: Error) => void;
      }) => {
        opts.onError?.(new Error("HTTP 502: Bad Gateway"));
      });

      const { result } = renderHook(() => useChat());
      await act(async () => { await result.current.sendMessage("test"); });

      await waitFor(() => {
        expect(result.current.error).toBe("The server encountered an error. Please try again in a moment.");
      });
    });
  });

  // IR-5: Recovery signal parsing
  describe("recovery signal (problem_resolved / alignment_check_failed)", () => {
    it("UT-CONSOLE-SIGNAL-001: sets recoverySignal on message when problem_resolved event arrives", async () => {
      const { streamA2A } = await import("../lib/a2a-client");
      vi.mocked(streamA2A).mockImplementation(async (_req: unknown, opts: {
        onEvent?: (event: unknown) => void;
        onComplete?: () => void;
      }) => {
        opts.onEvent?.({
          kind: "status-update",
          taskId: "t1",
          contextId: "ctx-1",
          status: {
            state: "working",
            message: { parts: [{ kind: "text", text: "" }] },
          },
          metadata: { type: "problem_resolved" },
        });
        opts.onComplete?.();
      });

      const { result } = renderHook(() => useChat());
      await act(async () => { result.current.sendMessage("test"); });

      const agentMsg = result.current.messages.find(m => m.role === "agent");
      expect(agentMsg).toBeDefined();
      expect(agentMsg!.recoverySignal).toBe("problem_resolved");
    });

    it("UT-CONSOLE-SIGNAL-002: sets recoverySignal on message when alignment_check_failed event arrives", async () => {
      const { streamA2A } = await import("../lib/a2a-client");
      vi.mocked(streamA2A).mockImplementation(async (_req: unknown, opts: {
        onEvent?: (event: unknown) => void;
        onComplete?: () => void;
      }) => {
        opts.onEvent?.({
          kind: "status-update",
          taskId: "t1",
          contextId: "ctx-1",
          status: {
            state: "working",
            message: { parts: [{ kind: "text", text: "" }] },
          },
          metadata: { type: "alignment_check_failed" },
        });
        opts.onComplete?.();
      });

      const { result } = renderHook(() => useChat());
      await act(async () => { result.current.sendMessage("test"); });

      const agentMsg = result.current.messages.find(m => m.role === "agent");
      expect(agentMsg).toBeDefined();
      expect(agentMsg!.recoverySignal).toBe("alignment_check_failed");
    });

    it("UT-CONSOLE-SIGNAL-003: parses alignmentVerdict from alignment_check_failed JSON payload", async () => {
      const { streamA2A } = await import("../lib/a2a-client");
      vi.mocked(streamA2A).mockImplementation(async (_req: unknown, opts: {
        onEvent?: (event: unknown) => void;
        onComplete?: () => void;
      }) => {
        opts.onEvent?.({
          kind: "status-update",
          taskId: "t1",
          contextId: "ctx-1",
          status: {
            state: "working",
            message: {
              parts: [{
                kind: "text",
                text: JSON.stringify({
                  result: "suspicious",
                  circuit_breaker_activated: true,
                  summary: "Prompt injection detected in tool output",
                  flagged: 1,
                  total: 12,
                  findings: [{
                    step_index: 7,
                    step_kind: "tool_result",
                    tool: "kubectl_get",
                    explanation: "ConfigMap contains encoded shell commands disguised as configuration values",
                  }],
                }),
              }],
            },
          },
          metadata: { type: "alignment_check_failed" },
        });
        opts.onComplete?.();
      });

      const { result } = renderHook(() => useChat());
      await act(async () => { result.current.sendMessage("test"); });

      const agentMsg = result.current.messages.find(m => m.role === "agent");
      expect(agentMsg).toBeDefined();
      expect(agentMsg!.recoverySignal).toBe("alignment_check_failed");
      expect(agentMsg!.alignmentVerdict).toBeDefined();
      expect(agentMsg!.alignmentVerdict!.result).toBe("suspicious");
      expect(agentMsg!.alignmentVerdict!.circuit_breaker_activated).toBe(true);
      expect(agentMsg!.alignmentVerdict!.summary).toBe("Prompt injection detected in tool output");
      expect(agentMsg!.alignmentVerdict!.flagged).toBe(1);
      expect(agentMsg!.alignmentVerdict!.total).toBe(12);
      expect(agentMsg!.alignmentVerdict!.findings).toHaveLength(1);
      expect(agentMsg!.alignmentVerdict!.findings[0].tool).toBe("kubectl_get");
    });

    it("UT-CONSOLE-SIGNAL-004: falls back to bare recoverySignal when alignment_check_failed has invalid JSON", async () => {
      const { streamA2A } = await import("../lib/a2a-client");
      vi.mocked(streamA2A).mockImplementation(async (_req: unknown, opts: {
        onEvent?: (event: unknown) => void;
        onComplete?: () => void;
      }) => {
        opts.onEvent?.({
          kind: "status-update",
          taskId: "t1",
          contextId: "ctx-1",
          status: {
            state: "working",
            message: { parts: [{ kind: "text", text: "not valid json {{{" }] },
          },
          metadata: { type: "alignment_check_failed" },
        });
        opts.onComplete?.();
      });

      const { result } = renderHook(() => useChat());
      await act(async () => { result.current.sendMessage("test"); });

      const agentMsg = result.current.messages.find(m => m.role === "agent");
      expect(agentMsg).toBeDefined();
      expect(agentMsg!.recoverySignal).toBe("alignment_check_failed");
      expect(agentMsg!.alignmentVerdict).toBeUndefined();
    });

    it("UT-CONSOLE-SIGNAL-005: falls back to bare recoverySignal when alignment_check_failed has empty message", async () => {
      const { streamA2A } = await import("../lib/a2a-client");
      vi.mocked(streamA2A).mockImplementation(async (_req: unknown, opts: {
        onEvent?: (event: unknown) => void;
        onComplete?: () => void;
      }) => {
        opts.onEvent?.({
          kind: "status-update",
          taskId: "t1",
          contextId: "ctx-1",
          status: {
            state: "working",
            message: { parts: [{ kind: "text", text: "" }] },
          },
          metadata: { type: "alignment_check_failed" },
        });
        opts.onComplete?.();
      });

      const { result } = renderHook(() => useChat());
      await act(async () => { result.current.sendMessage("test"); });

      const agentMsg = result.current.messages.find(m => m.role === "agent");
      expect(agentMsg).toBeDefined();
      expect(agentMsg!.recoverySignal).toBe("alignment_check_failed");
      expect(agentMsg!.alignmentVerdict).toBeUndefined();
    });

    it("UT-CONSOLE-SIGNAL-006: alignmentVerdict survives sessionStorage round-trip", async () => {
      vi.useRealTimers();
      const { streamA2A } = await import("../lib/a2a-client");
      vi.mocked(streamA2A).mockImplementation(async (_req: unknown, opts: {
        onEvent?: (event: unknown) => void;
        onComplete?: () => void;
      }) => {
        opts.onEvent?.({
          kind: "status-update",
          taskId: "t1",
          contextId: "ctx-1",
          status: {
            state: "working",
            message: {
              parts: [{
                kind: "text",
                text: JSON.stringify({
                  result: "suspicious",
                  circuit_breaker_activated: true,
                  summary: "Injection detected",
                  flagged: 1,
                  total: 5,
                  findings: [{ step_index: 3, step_kind: "tool_result", tool: "kubectl_get", explanation: "suspicious" }],
                }),
              }],
            },
          },
          metadata: { type: "alignment_check_failed" },
        });
        opts.onComplete?.();
      });

      const { result } = renderHook(() => useChat());
      await act(async () => { await result.current.sendMessage("test"); });

      await waitFor(() => {
        expect(result.current.isStreaming).toBe(false);
      });

      const stored = sessionStorage.getItem("kubernaut-console-messages");
      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored!);
      const agentMsg = parsed.find((m: { role: string }) => m.role === "agent");
      expect(agentMsg.alignmentVerdict).toBeDefined();
      expect(agentMsg.alignmentVerdict.result).toBe("suspicious");
      expect(agentMsg.alignmentVerdict.findings).toHaveLength(1);
    });
  });
});
