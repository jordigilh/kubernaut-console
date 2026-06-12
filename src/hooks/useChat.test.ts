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

    it("UT-CONSOLE-CHAT-013: onReconnecting sets connectionStatus and error with attempt count", async () => {
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
      expect(result.current.error).toBe("Connection lost, retrying (attempt 2)...");
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
});
