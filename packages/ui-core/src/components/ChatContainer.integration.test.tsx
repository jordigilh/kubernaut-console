/**
 * ChatContainer Integration Tests
 *
 * These tests exercise the full production dispatch path: ChatContainer -> useChat -> streamA2A ->
 * AgentBubble -> {ThinkingPanel, RCACard, AgentCTA, WorkflowCards}.
 *
 * They prove wiring completeness per the Pyramid Invariant (IT proves wiring).
 */
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { ChatContainer } from "./ChatContainer";
import { streamA2A } from "../lib/a2a-client";
import { _resetSession } from "../lib/mcp-client";

vi.mock("../lib/a2a-client", () => ({
  buildStreamRequest: vi.fn((_text: string) => ({
    task: { message: { role: "user", parts: [{ kind: "text", text: _text }] } },
  })),
  streamA2A: vi.fn(),
}));

const mockStreamA2A = vi.mocked(streamA2A);

beforeAll(() => {
  Element.prototype.scrollTo = vi.fn();
});

describe("ChatContainer Integration", () => {
  beforeEach(() => {
    sessionStorage.clear();
    _resetSession();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockStreamA2A.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function setupFullJourneyStream() {
    mockStreamA2A.mockImplementation(async (_req: unknown, opts: {
      onEvent?: (event: unknown) => void;
      onComplete?: () => void;
      onError?: (err: Error) => void;
      signal?: AbortSignal;
    }) => {
      const { onEvent, onComplete } = opts;
      const taskId = "mock-task-1";
      const contextId = "mock-ctx-1";

      // Preflight
      onEvent?.({
        kind: "status-update",
        taskId,
        contextId,
        status: { state: "working", message: { role: "agent", parts: [{ kind: "text", text: "Analyzing..." }] } },
        metadata: { type: "preflight" },
      });

      // Tool call
      onEvent?.({
        kind: "status-update",
        taskId,
        contextId,
        status: { state: "working", message: { role: "agent", parts: [{ kind: "text", text: "kubectl_previous_logs Pod/web-frontend-c8dc85956-qm7hq" }] } },
        metadata: { type: "tool_call" },
      });

      // Reasoning
      onEvent?.({
        kind: "status-update",
        taskId,
        contextId,
        status: { state: "working", message: { role: "agent", parts: [{ kind: "text", text: "Container failing due to invalid config file." }] } },
        metadata: { type: "reasoning" },
      });

      // investigation_summary artifact (#1408 contract: single combined artifact)
      onEvent?.({
        kind: "artifact-update",
        taskId,
        contextId,
        artifact: {
          artifactId: "inv-summary-1",
          parts: [{
            kind: "data",
            data: {
              session_id: "sess-1",
              rr_id: "rr-demo-webui-001",
              signal_name: "KubePodCrashLooping",
              summary: "ConfigMap app-config contains an invalid directive. In-cluster patches won't persist -- ArgoCD selfHeal will revert them.",
              rca: {
                severity: "critical",
                confidence: 0.95,
                causal_chain: [
                  "Signal: Pod web-frontend in CrashLoopBackOff (4 restarts, exit code 1)",
                  "Why? ConfigMap app-config contains 'invalid_directive: true'",
                  "Root cause: Bad commit synced via ArgoCD with selfHeal:true",
                ],
                target: "demo-webui/app-config",
                tool_calls_count: 19,
                llm_turns: 17,
              },
              options: [
                {
                  workflow_id: "git-revert-v2",
                  name: "git-revert-v2",
                  description: "Reverts the most recent commit.",
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
            },
            mediaType: "application/json",
          }],
          metadata: { schema: "investigation_summary" },
        },
        lastChunk: true,
        append: false,
      });

      onComplete?.();
    });
  }

  /**
   * IT-CONSOLE-JOURNEY-001 through IT-CONSOLE-JOURNEY-008
   * FedRAMP Controls: IR-4 (Incident Handling), AU-2 (Audit Events), SC-5 (DoS Protection)
   */
  it("renders the full operator investigation journey through production dispatch path", async () => {
    setupFullJourneyStream();
    render(<ChatContainer />);

    // Send investigation message (AU-10: audit event generation)
    const input = screen.getByRole("textbox", { name: /type your message/i });

    await act(async () => {
      fireEvent.change(input, { target: { value: "Investigate this alert" } });
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
      vi.advanceTimersByTime(100);
    });

    // User bubble appears
    expect(screen.getByText("Investigate this alert")).toBeInTheDocument();

    // IT-CONSOLE-JOURNEY-002: ThinkingPanel renders (AU-2: investigation visibility)
    await waitFor(() => {
      expect(screen.getByText("Analyzing...")).toBeInTheDocument();
    });

    // Tool calls appear in thinking panel (IR-4: investigation trail)
    expect(screen.getByText(/kubectl_previous_logs/)).toBeInTheDocument();

    // IT-CONSOLE-JOURNEY-003: RCA Card renders after decision (IR-4)
    await waitFor(() => {
      expect(screen.getByText("Root Cause Analysis")).toBeInTheDocument();
    });

    // Severity badge
    expect(screen.getByText("critical")).toBeInTheDocument();

    // Causal chain entries
    expect(screen.getByText(/Pod web-frontend in CrashLoopBackOff/)).toBeInTheDocument();

    // IT-CONSOLE-JOURNEY-004: RCA summary contains recommendation (IR-5)
    expect(screen.getByText(/In-cluster patches won't persist/)).toBeInTheDocument();

    // IT-CONSOLE-JOURNEY-001: PhaseIndicator transitions to "Decision pending"
    expect(screen.getByText("Decision pending")).toBeInTheDocument();

    // IT-CONSOLE-JOURNEY-005: WorkflowCards render (SC-5)
    expect(screen.getByTestId("workflow-card-git-revert-v2")).toBeInTheDocument();
    expect(screen.getByTestId("workflow-card-patch-configuration-v1")).toBeInTheDocument();

    // Recommended card has parameters
    expect(screen.getByText(/TARGET_RESOURCE_NAMESPACE=demo-webui/)).toBeInTheDocument();

    // Ruled out card shows description
    expect(screen.getByText(/Patches ConfigMap directly in the cluster/)).toBeInTheDocument();

    // IT-CONSOLE-JOURNEY-007: Execute button is visible, click to start countdown (SC-5)
    const executeButton = screen.getByRole("button", { name: /execute/i });
    expect(executeButton).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(executeButton);
    });
    expect(screen.getByText(/Executing in \d+s/)).toBeInTheDocument();

    // IT-CONSOLE-JOURNEY-008: Cancel stops countdown (SC-5: execution guard)
    const cancelButton = screen.getByLabelText("Cancel execution");
    await act(async () => {
      fireEvent.click(cancelButton);
    });

    // After cancel, countdown text should disappear
    await waitFor(() => {
      expect(screen.queryByText(/Executing in \d+s/)).not.toBeInTheDocument();
    });
  });

  /**
   * IT-CONSOLE-JOURNEY-006: ExecutionProgress renders after workflow execution
   * FedRAMP Control: IR-4 (Incident Handling - remediation tracking)
   */
  it("renders execution progress when remediation is triggered", async () => {
    mockStreamA2A.mockImplementation(async (_req: unknown, opts: {
      onEvent?: (event: unknown) => void;
      onComplete?: () => void;
    }) => {
      opts.onComplete?.();
    });

    render(<ChatContainer />);

    // Send a remediation trigger message
    const input = screen.getByRole("textbox", { name: /type your message/i });
    await act(async () => {
      fireEvent.change(input, { target: { value: "Use git-revert-v2" } });
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
      vi.advanceTimersByTime(100);
    });

    // Now simulate execution progress coming from a second stream
    mockStreamA2A.mockImplementation(async (_req: unknown, opts: {
      onEvent?: (event: unknown) => void;
      onComplete?: () => void;
    }) => {
      const taskId = "mock-task-2";
      const contextId = "mock-ctx-2";

      opts.onEvent?.({
        kind: "status-update",
        taskId,
        contextId,
        status: {
          state: "working",
          message: {
            role: "agent",
            parts: [{
              kind: "text",
              text: JSON.stringify({
                steps: [
                  { id: "s1", label: "Cloning GitOps repository", state: "running" },
                  { id: "s2", label: "Reverting commit caa704e8", state: "pending" },
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

    // Advance past rate limiter
    await act(async () => {
      vi.advanceTimersByTime(600);
    });

    // Send a second message to trigger the execution stream
    await act(async () => {
      fireEvent.change(input, { target: { value: "Execute now" } });
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
      vi.advanceTimersByTime(100);
    });

    // IT-CONSOLE-JOURNEY-006: Phase status reflects execution via InvestigationContext banner
    // (ExecutionProgress cards removed — status shown only via InvestigationContext)
    await waitFor(() => {
      expect(screen.getByTestId("phase-indicator")).toBeInTheDocument();
    });
  });

  /**
   * B2: Error/Reconnect IT
   * FedRAMP Control: SI-17 (Fail-Safe Procedures)
   */
  it("renders error banner when streamA2A calls onError", async () => {
    vi.useRealTimers();

    mockStreamA2A.mockImplementation(async (_req: unknown, opts: {
      onEvent?: (event: unknown) => void;
      onComplete?: () => void;
      onError?: (err: Error) => void;
    }) => {
      opts.onError?.(new Error("SSE connection reset"));
    });

    render(<ChatContainer />);

    const input = screen.getByRole("textbox", { name: /type your message/i });
    await act(async () => {
      fireEvent.change(input, { target: { value: "Investigate" } });
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
    });

    // SI-17: Error state is surfaced to operator
    await waitFor(() => {
      expect(screen.getByText("SSE connection reset")).toBeInTheDocument();
    });
  });

  /**
   * B2: Reconnecting status IT
   * FedRAMP Control: SI-17 (Fail-Safe Procedures)
   */
  it("shows Reconnecting status when connection is retrying", async () => {
    mockStreamA2A.mockImplementation(async (_req: unknown, opts: {
      onEvent?: (event: unknown) => void;
      onComplete?: () => void;
      onError?: (err: Error) => void;
      onReconnecting?: (attempt: number) => void;
    }) => {
      opts.onReconnecting?.(1);
    });

    render(<ChatContainer />);

    const input = screen.getByRole("textbox", { name: /type your message/i });
    await act(async () => {
      fireEvent.change(input, { target: { value: "Investigate" } });
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
      vi.advanceTimersByTime(100);
    });

    // SI-17: Reconnecting state visible to operator
    await waitFor(() => {
      expect(screen.getByText("Reconnecting...")).toBeInTheDocument();
    });
  });

  /**
   * B2: Cancel stream IT
   * FedRAMP Control: SC-5 (DoS Protection - operator can halt runaway streams)
   */
  it("cancel stops streaming and hides stop button", async () => {
    mockStreamA2A.mockImplementation(async (_req: unknown, opts: {
      onEvent?: (event: unknown) => void;
      onComplete?: () => void;
      signal?: AbortSignal;
    }) => {
      return new Promise<void>((resolve) => {
        opts.signal?.addEventListener("abort", () => {
          opts.onComplete?.();
          resolve();
        });
      });
    });

    render(<ChatContainer />);

    const input = screen.getByRole("textbox", { name: /type your message/i });
    await act(async () => {
      fireEvent.change(input, { target: { value: "Investigate" } });
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
      vi.advanceTimersByTime(100);
    });

    // Stop button should be visible while streaming
    const stopButton = screen.getByRole("button", { name: /stop/i });
    expect(stopButton).toBeInTheDocument();

    // SC-5: Operator can cancel
    await act(async () => {
      fireEvent.click(stopButton);
      vi.advanceTimersByTime(100);
    });

    // Stop button disappears, send button returns
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /stop/i })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /send/i })).toBeInTheDocument();
    });
  });

  /**
   * B3: Rate limit IT
   * FedRAMP Control: SC-5 (DoS Protection - double-submit protection)
   */
  it("rejects double-submit within 500ms resulting in only one user bubble", async () => {
    mockStreamA2A.mockImplementation(async (_req: unknown, opts: {
      onComplete?: () => void;
    }) => {
      opts.onComplete?.();
    });

    render(<ChatContainer />);

    const input = screen.getByRole("textbox", { name: /type your message/i });

    // First submit
    await act(async () => {
      fireEvent.change(input, { target: { value: "First message" } });
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
      vi.advanceTimersByTime(100);
    });

    // Second submit within 500ms -- should be rejected
    await act(async () => {
      fireEvent.change(input, { target: { value: "Second message" } });
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
      vi.advanceTimersByTime(100);
    });

    // Only one user message should appear
    const userBubbles = screen.getAllByText("First message");
    expect(userBubbles.length).toBe(1);
    expect(screen.queryByText("Second message")).not.toBeInTheDocument();
  });

  /**
   * B4: Persistence IT
   * FedRAMP Control: AU-10 (Audit Reduction - session continuity)
   */
  it("restores messages from sessionStorage on re-mount", async () => {
    mockStreamA2A.mockImplementation(async (_req: unknown, opts: {
      onEvent?: (event: unknown) => void;
      onComplete?: () => void;
    }) => {
      opts.onEvent?.({
        kind: "artifact-update",
        taskId: "t1",
        contextId: "ctx-1",
        artifact: { artifactId: "a1", parts: [{ kind: "text", text: "Agent reply persisted" }] },
        append: true,
      });
      opts.onComplete?.();
    });

    const { unmount } = render(<ChatContainer />);

    const input = screen.getByRole("textbox", { name: /type your message/i });
    await act(async () => {
      fireEvent.change(input, { target: { value: "Persistent message" } });
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
      vi.advanceTimersByTime(100);
    });

    // Verify initial render
    await waitFor(() => {
      expect(screen.getByText("Persistent message")).toBeInTheDocument();
      expect(screen.getByText("Agent reply persisted")).toBeInTheDocument();
    });

    // Unmount and re-mount
    unmount();
    render(<ChatContainer />);

    // AU-10: Messages restored from sessionStorage
    await waitFor(() => {
      expect(screen.getByText("Persistent message")).toBeInTheDocument();
      expect(screen.getByText("Agent reply persisted")).toBeInTheDocument();
    });
  });

  // AC-6/IR-4: Approval card wiring — user approve sends silent A2A message
  it("IT-CONSOLE-APPROVAL-001: renders ApprovalCard from approval_request event and sends silent approve via MCP+A2A", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy.mockImplementation(() => Promise.resolve(
      new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: "ok" }] } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    ));

    mockStreamA2A.mockImplementationOnce(async (_req, opts: {
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
            role: "agent",
            parts: [{
              kind: "text",
              text: JSON.stringify({
                name: "rar-rr-drift-xyz",
                namespace: "kubernaut-system",
                confidence: 0.85,
                confidenceLevel: "High",
                reason: "Production namespace requires approval",
                evidenceCollected: ["ArgoCD out-of-sync"],
                requiredBy: new Date(Date.now() + 3600_000).toISOString(),
              }),
            }],
          },
        },
        metadata: { type: "approval_request" },
      });
      opts.onComplete?.();
    });

    // Follow-up stream
    mockStreamA2A.mockImplementation(async (_req, opts: { onComplete?: () => void }) => {
      opts.onComplete?.();
    });

    render(<ChatContainer />);
    const input = screen.getByRole("textbox", { name: /type your message/i });
    await act(async () => {
      fireEvent.change(input, { target: { value: "investigate alert" } });
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
      vi.advanceTimersByTime(600);
    });

    // Approval card renders
    await waitFor(() => {
      expect(screen.getByText("Approval Required")).toBeInTheDocument();
      expect(screen.getByText("High")).toBeInTheDocument();
      expect(screen.getByText("85%")).toBeInTheDocument();
      expect(screen.getByText(/Production namespace requires approval/)).toBeInTheDocument();
    });

    // Click Approve — triggers MCP call then silent A2A follow-up
    const approveBtn = screen.getByRole("button", { name: /approve/i });
    await act(async () => {
      fireEvent.click(approveBtn);
    });

    // Wait for async MCP init (delay after 202 notification) to complete
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith("/mcp", expect.objectContaining({ method: "POST" }));
    });
    // Verify no user bubble with "Approve rar-..." (silent)
    expect(screen.queryByText("Approve rar-rr-drift-xyz")).not.toBeInTheDocument();
    // streamA2A called twice (initial + follow-up)
    await waitFor(() => {
      expect(mockStreamA2A).toHaveBeenCalledTimes(2);
    });

    fetchSpy.mockRestore();
  });

  // AU-2/SI-4: InvestigationContext banner wiring — proves RR ID flows from
  // investigation_summary artifact through useChat to the rendered banner
  it("IT-CONSOLE-CTX-001: AU-2 — investigation_summary artifact populates context banner with RR ID", async () => {
    mockStreamA2A.mockImplementation(async (_req, opts: {
      onEvent?: (event: unknown) => void;
      onComplete?: () => void;
    }) => {
      opts.onEvent?.({
        kind: "artifact-update",
        taskId: "t1",
        contextId: "ctx-1",
        artifact: {
          artifactId: "inv-summary-it",
          parts: [{
            kind: "data",
            data: {
              session_id: "sess-it-001",
              rr_id: "rr-9e1b7bf4140b-ed9f1796",
              signal_name: "KubePodCrashLooping",
              summary: "ConfigMap invalid directive",
              rca: {
                severity: "critical",
                confidence: 0.95,
                target: "demo-webui/app-config",
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

    render(<ChatContainer />);
    const input = screen.getByRole("textbox", { name: /type your message/i });
    await act(async () => {
      fireEvent.change(input, { target: { value: "investigate" } });
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
      vi.advanceTimersByTime(100);
    });

    await waitFor(() => {
      const ctxBanner = screen.getByTestId("investigation-context");
      expect(ctxBanner).toHaveTextContent("rr-9e1b7bf4140b-ed9f1796");
      expect(ctxBanner).toHaveTextContent("KubePodCrashLooping");
      expect(ctxBanner).toHaveTextContent("demo-webui");
    });
  });

  // CLS Prevention: Banner always rendered (zero layout shift)
  it("IT-CONSOLE-BANNER-ALWAYS-001: investigation context banner is always rendered even before investigation starts", async () => {
    mockStreamA2A.mockImplementation(async (_req: unknown, opts: { onComplete?: () => void }) => {
      opts.onComplete?.();
    });

    render(<ChatContainer />);

    const banner = screen.getByTestId("investigation-context");
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent("Ready");
    expect(banner.className).toContain("kn-context-bar");
  });

  // IR-4: execution_progress artifact wiring — renders execution steps from structured artifact
  it("IT-CONSOLE-EXEC-001: renders ExecutionProgress from execution_progress artifact event", async () => {
    mockStreamA2A.mockImplementation(async (_req, opts: {
      onEvent?: (event: unknown) => void;
      onComplete?: () => void;
    }) => {
      opts.onEvent?.({
        kind: "artifact-update",
        taskId: "t1",
        contextId: "ctx-1",
        artifact: {
          artifactId: "progress-001",
          parts: [{
            kind: "data",
            data: {
              type: "execution_progress",
              schema_version: "1.0",
              rr_name: "rr-abc123",
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

    render(<ChatContainer />);
    const input = screen.getByRole("textbox", { name: /type your message/i });
    await act(async () => {
      fireEvent.change(input, { target: { value: "execute remediation" } });
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
      vi.advanceTimersByTime(100);
    });

    await waitFor(() => {
      expect(screen.getAllByText("Executing").length).toBeGreaterThan(0);
    });
  });

  it("IT-CONSOLE-UX-001: '+New' button shows confirmation modal before clearing history", async () => {
    mockStreamA2A.mockImplementation(async (_req, opts: { onComplete?: () => void }) => {
      opts.onComplete?.();
    });

    render(<ChatContainer />);
    const input = screen.getByRole("textbox", { name: /type your message/i });
    await act(async () => {
      fireEvent.change(input, { target: { value: "Hello" } });
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
      vi.advanceTimersByTime(100);
    });

    const newBtn = screen.getByLabelText("New conversation");
    await act(async () => {
      fireEvent.click(newBtn);
    });

    // Modal should appear
    expect(screen.getByText("Start new conversation?")).toBeInTheDocument();
    expect(screen.getByText("Current history will be cleared. This cannot be undone.")).toBeInTheDocument();

    // Cancel should dismiss modal
    const cancelBtn = screen.getByRole("button", { name: /cancel/i });
    await act(async () => {
      fireEvent.click(cancelBtn);
    });

    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  it("IT-CONSOLE-UX-002: connection lost state shows retry button in header", async () => {
    mockStreamA2A.mockImplementation(async (_req, opts: {
      onEvent?: (event: unknown) => void;
      onComplete?: () => void;
      onError?: (err: Error) => void;
      onConnectionLost?: () => void;
      onReconnecting?: (attempt: number) => void;
      signal?: AbortSignal;
    }) => {
      opts.onConnectionLost?.();
    });

    render(<ChatContainer />);
    const input = screen.getByRole("textbox", { name: /type your message/i });
    await act(async () => {
      fireEvent.change(input, { target: { value: "Investigate" } });
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
      vi.advanceTimersByTime(100);
    });

    await waitFor(() => {
      expect(screen.getByLabelText(/connection lost/i)).toBeInTheDocument();
    });
  });

  it("IT-CONSOLE-UX-003: MessageBar is rendered", () => {
    mockStreamA2A.mockImplementation(async () => {});

    render(<ChatContainer />);
    const inputForm = document.querySelector(".kn-input-form");
    expect(inputForm).toBeInTheDocument();
    const textInput = screen.getByRole("textbox", { name: /type your message/i });
    expect(textInput).toBeInTheDocument();
  });

  // AC-6: Approve button triggers MCP call with correct payload (not A2A text message)
  it("IT-CONSOLE-MCP-001: approve button calls POST /mcp with kubernaut_approve tool", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    // First stream call: emit approval_request
    mockStreamA2A.mockImplementationOnce(async (_req: unknown, opts: {
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
            role: "agent",
            parts: [{
              kind: "text",
              text: JSON.stringify({
                name: "rar-rr-test-001",
                namespace: "kubernaut-system",
                confidence: 0.9,
                confidenceLevel: "High",
                reason: "Production namespace",
                requiredBy: new Date(Date.now() + 3600_000).toISOString(),
              }),
            }],
          },
        },
        metadata: { type: "approval_request" },
      });
      opts.onComplete?.();
    });

    // Mock MCP fetch response (factory to avoid body-already-read)
    fetchSpy.mockImplementation(() => Promise.resolve(
      new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: "Approved" }] } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    ));

    // Follow-up stream: just complete
    mockStreamA2A.mockImplementation(async (_req: unknown, opts: { onComplete?: () => void }) => {
      opts.onComplete?.();
    });

    render(<ChatContainer />);
    const input = screen.getByRole("textbox", { name: /type your message/i });
    await act(async () => {
      fireEvent.change(input, { target: { value: "investigate" } });
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
      vi.advanceTimersByTime(600);
    });

    // Approval card should render
    await waitFor(() => {
      expect(screen.getByText("Approval Required")).toBeInTheDocument();
    });

    // Click Approve
    const approveBtn = screen.getByRole("button", { name: /approve/i });
    await act(async () => {
      fireEvent.click(approveBtn);
    });

    // AC-6: Verify MCP was called (not A2A text message)
    // Wait for async MCP init (delay after 202 notification) to complete
    let mcpCall: unknown[] | undefined;
    await waitFor(() => {
      mcpCall = fetchSpy.mock.calls.find(c => {
        if (c[0] !== "/mcp") return false;
        const b = JSON.parse((c[1] as RequestInit).body as string);
        return b.method === "tools/call";
      });
      expect(mcpCall).toBeDefined();
    });
    const body = JSON.parse((mcpCall![1] as RequestInit).body as string);
    expect(body.params.name).toBe("kubernaut_approve");
    expect(body.params.arguments.rar_name).toBe("rar-rr-test-001");
    expect(body.params.arguments.decision).toBe("Approved");
    expect(body.params.arguments.reason).toContain("Approved by");

    fetchSpy.mockRestore();
  });

  // AU-2: On MCP success, follow-up A2A message is sent to resume LLM monitoring
  it("IT-CONSOLE-MCP-002: sends follow-up A2A message after successful MCP approval", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    mockStreamA2A.mockImplementationOnce(async (_req: unknown, opts: {
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
            role: "agent",
            parts: [{
              kind: "text",
              text: JSON.stringify({
                name: "rar-rr-test-002",
                namespace: "kubernaut-system",
                confidence: 0.8,
                confidenceLevel: "High",
                reason: "Policy match",
                requiredBy: new Date(Date.now() + 3600_000).toISOString(),
              }),
            }],
          },
        },
        metadata: { type: "approval_request" },
      });
      opts.onComplete?.();
    });

    fetchSpy.mockImplementation(() => Promise.resolve(
      new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: "ok" }] } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    ));

    // Follow-up stream: just complete
    mockStreamA2A.mockImplementation(async (_req: unknown, opts: { onComplete?: () => void }) => {
      opts.onComplete?.();
    });

    render(<ChatContainer />);
    const input = screen.getByRole("textbox", { name: /type your message/i });
    await act(async () => {
      fireEvent.change(input, { target: { value: "investigate" } });
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
      vi.advanceTimersByTime(600);
    });

    await waitFor(() => {
      expect(screen.getByText("Approval Required")).toBeInTheDocument();
    });

    const approveBtn = screen.getByRole("button", { name: /approve/i });
    await act(async () => {
      fireEvent.click(approveBtn);
    });

    // AU-2: Follow-up A2A message sent after approval
    // Wait for async MCP init (delay after 202 notification) + follow-up sendMessage
    await waitFor(() => {
      expect(mockStreamA2A).toHaveBeenCalledTimes(2);
    });

    fetchSpy.mockRestore();
  });

  // SI-10: On MCP failure, error shown and NO follow-up sent
  it("IT-CONSOLE-MCP-003: MCP failure shows error, does NOT send follow-up A2A message", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    mockStreamA2A.mockImplementationOnce(async (_req: unknown, opts: {
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
            role: "agent",
            parts: [{
              kind: "text",
              text: JSON.stringify({
                name: "rar-rr-test-003",
                namespace: "kubernaut-system",
                confidence: 0.7,
                confidenceLevel: "Medium",
                reason: "RBAC check",
                requiredBy: new Date(Date.now() + 3600_000).toISOString(),
              }),
            }],
          },
        },
        metadata: { type: "approval_request" },
      });
      opts.onComplete?.();
    });

    // MCP returns error (SAR check failed) - factory to avoid body-already-read
    fetchSpy.mockImplementation(() => Promise.resolve(
      new Response(JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        error: { code: -32603, message: "SAR check failed: user lacks remediation-approver role" },
      }), { status: 200, headers: { "Content-Type": "application/json" } })
    ));

    render(<ChatContainer />);
    const input = screen.getByRole("textbox", { name: /type your message/i });
    await act(async () => {
      fireEvent.change(input, { target: { value: "investigate" } });
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
      vi.advanceTimersByTime(600);
    });

    await waitFor(() => {
      expect(screen.getByText("Approval Required")).toBeInTheDocument();
    });

    const approveBtn = screen.getByRole("button", { name: /approve/i });
    await act(async () => {
      fireEvent.click(approveBtn);
    });

    // SI-10: Error is displayed (setError is called after async MCP resolution)
    await waitFor(() => {
      expect(screen.getByText(/SAR check failed/)).toBeInTheDocument();
    });

    // SI-10: NO follow-up A2A message sent (only initial stream call)
    expect(mockStreamA2A).toHaveBeenCalledTimes(1);

    fetchSpy.mockRestore();
  });

  // AC-6: Decline calls MCP with "Rejected" decision
  it("IT-CONSOLE-MCP-004: decline button calls MCP with decision=Rejected", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    mockStreamA2A.mockImplementationOnce(async (_req: unknown, opts: {
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
            role: "agent",
            parts: [{
              kind: "text",
              text: JSON.stringify({
                name: "rar-rr-test-004",
                namespace: "kubernaut-system",
                confidence: 0.6,
                confidenceLevel: "Medium",
                reason: "Needs review",
                requiredBy: new Date(Date.now() + 3600_000).toISOString(),
              }),
            }],
          },
        },
        metadata: { type: "approval_request" },
      });
      opts.onComplete?.();
    });

    fetchSpy.mockImplementation(() => Promise.resolve(
      new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: "Rejected" }] } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    ));

    // Follow-up stream
    mockStreamA2A.mockImplementation(async (_req: unknown, opts: { onComplete?: () => void }) => {
      opts.onComplete?.();
    });

    render(<ChatContainer />);
    const input = screen.getByRole("textbox", { name: /type your message/i });
    await act(async () => {
      fireEvent.change(input, { target: { value: "investigate" } });
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
      vi.advanceTimersByTime(600);
    });

    await waitFor(() => {
      expect(screen.getByText("Approval Required")).toBeInTheDocument();
    });

    const declineBtn = screen.getByRole("button", { name: /decline/i });
    await act(async () => {
      fireEvent.click(declineBtn);
    });

    // AC-6: MCP called with Rejected decision
    let mcpCall: unknown[] | undefined;
    await waitFor(() => {
      mcpCall = fetchSpy.mock.calls.find(c => {
        if (c[0] !== "/mcp") return false;
        const b = JSON.parse((c[1] as RequestInit).body as string);
        return b.method === "tools/call";
      });
      expect(mcpCall).toBeDefined();
    });
    const body = JSON.parse((mcpCall![1] as RequestInit).body as string);
    expect(body.params.arguments.decision).toBe("Rejected");

    fetchSpy.mockRestore();
  });

  /**
   * IT-CONSOLE-VERDICT-001: alignment_check_failed with verdict payload renders security findings
   * FedRAMP Controls: SI-4 (Information System Monitoring), IR-4 (Incident Handling)
   */
  it("IT-CONSOLE-VERDICT-001: alignment_check_failed event with verdict payload renders security findings inline", async () => {
    mockStreamA2A.mockImplementation(async (_req: unknown, opts: {
      onEvent?: (event: unknown) => void;
      onComplete?: () => void;
    }) => {
      const taskId = "mock-task-verdict";
      const contextId = "mock-ctx-verdict";

      // Investigation thinking entries
      opts.onEvent?.({
        kind: "status-update",
        taskId,
        contextId,
        status: { state: "working", message: { role: "agent", parts: [{ kind: "text", text: "Checking for existing active remediation..." }] } },
        metadata: { type: "preflight" },
      });
      opts.onEvent?.({
        kind: "status-update",
        taskId,
        contextId,
        status: { state: "working", message: { role: "agent", parts: [{ kind: "text", text: "kubectl_get ConfigMap/app-config" }] } },
        metadata: { type: "tool_call" },
      });

      // alignment_check_failed with full verdict payload
      opts.onEvent?.({
        kind: "status-update",
        taskId,
        contextId,
        status: {
          state: "working",
          message: {
            parts: [{
              kind: "text",
              text: JSON.stringify({
                result: "suspicious",
                circuit_breaker_activated: true,
                summary: "Prompt injection detected in tool output from kubectl_get ConfigMap/app-config",
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

    render(<ChatContainer />);
    const input = screen.getByRole("textbox", { name: /type your message/i });
    await act(async () => {
      fireEvent.change(input, { target: { value: "Investigate this alert" } });
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
      vi.advanceTimersByTime(100);
    });

    // Thinking panel renders investigation steps
    await waitFor(() => {
      expect(screen.getAllByText(/kubectl_get ConfigMap/).length).toBeGreaterThanOrEqual(1);
    });

    // Security findings render inline
    await waitFor(() => {
      expect(screen.getByRole("group", { name: /security findings/i })).toBeInTheDocument();
    });

    // Verdict summary displayed
    expect(screen.getByText(/Prompt injection detected/)).toBeInTheDocument();

    // Finding details displayed
    expect(screen.getByText(/encoded shell commands/)).toBeInTheDocument();

    // Workflow cards and escape hatches NOT rendered
    expect(screen.queryByRole("button", { name: /execute/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /no action needed/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /escalate to team/i })).not.toBeInTheDocument();
  });

  // #1437: Target divergence rendered when searched_target differs from signal_target
  it("IT-CONSOLE-TARGET-001: renders target divergence explanation when searched_target differs from signal_target", async () => {
    mockStreamA2A.mockImplementationOnce(async (_req: unknown, opts: {
      onEvent?: (event: unknown) => void;
      onComplete?: () => void;
    }) => {
      opts.onEvent?.({
        kind: "artifact-update",
        taskId: "t1",
        contextId: "ctx-1",
        artifact: {
          artifactId: "inv-1",
          parts: [{
            kind: "data",
            data: {
              session_id: "s1",
              rr_id: "rr-target-divergence",
              signal_name: "KubePodCrashLooping",
              summary: "ConfigMap misconfiguration causing crash loop",
              rca: { severity: "critical", confidence: 0.88, target: "Deployment/worker (demo-storefront)", causal_chain: ["Bad nginx config"], tool_calls_count: 5, llm_turns: 3 },
              options: [],
              searched_target: { api_version: "v1", kind: "ConfigMap", name: "worker-config", namespace: "demo-storefront" },
              signal_target: { api_version: "apps/v1", kind: "Deployment", name: "worker", namespace: "demo-storefront" },
            },
          }],
          metadata: { type: "investigation_summary" },
        },
      });
      opts.onComplete?.();
    });

    render(<ChatContainer />);
    const input = screen.getByRole("textbox", { name: /type your message/i });
    await act(async () => {
      fireEvent.change(input, { target: { value: "investigate" } });
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
      vi.advanceTimersByTime(600);
    });

    // Divergence callout renders with both targets
    await waitFor(() => {
      expect(screen.getByText("No remediation workflows found")).toBeInTheDocument();
    });
    const divergencePanel = screen.getByLabelText(/target divergence/i);
    expect(divergencePanel).toBeInTheDocument();
    expect(screen.getByText(/ConfigMap\/worker-config/)).toBeInTheDocument();
    expect(screen.getByText(/root cause to a different resource/)).toBeInTheDocument();

    // Escape hatches remain available
    expect(screen.getByRole("button", { name: /no action needed/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /escalate to team/i })).toBeInTheDocument();
  });

  // #1437: No divergence callout when targets match
  it("IT-CONSOLE-TARGET-002: does NOT render divergence when searched_target equals signal_target", async () => {
    mockStreamA2A.mockImplementationOnce(async (_req: unknown, opts: {
      onEvent?: (event: unknown) => void;
      onComplete?: () => void;
    }) => {
      opts.onEvent?.({
        kind: "artifact-update",
        taskId: "t1",
        contextId: "ctx-1",
        artifact: {
          artifactId: "inv-1",
          parts: [{
            kind: "data",
            data: {
              session_id: "s1",
              rr_id: "rr-same-target",
              signal_name: "KubePodCrashLooping",
              summary: "Deployment OOM",
              rca: { severity: "high", confidence: 0.9, target: "Deployment/worker", causal_chain: ["OOM"], tool_calls_count: 3, llm_turns: 2 },
              options: [{ workflow_id: "wf-rollback", name: "Rollback", description: "Roll back deployment", recommended: true }],
              searched_target: { api_version: "apps/v1", kind: "Deployment", name: "worker", namespace: "demo-storefront" },
              signal_target: { api_version: "apps/v1", kind: "Deployment", name: "worker", namespace: "demo-storefront" },
            },
          }],
          metadata: { type: "investigation_summary" },
        },
      });
      opts.onComplete?.();
    });

    render(<ChatContainer />);
    const input = screen.getByRole("textbox", { name: /type your message/i });
    await act(async () => {
      fireEvent.change(input, { target: { value: "investigate" } });
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
      vi.advanceTimersByTime(600);
    });

    // Workflow card renders (targets match — no divergence)
    await waitFor(() => {
      expect(screen.getByText("Rollback")).toBeInTheDocument();
    });
    expect(screen.queryByText("No remediation workflows found")).not.toBeInTheDocument();
  });

  // AC-6: Dismiss calls kubernaut_complete_no_action via MCP (no escalation_reason)
  it("IT-CONSOLE-DISMISS-001: 'No action needed' calls MCP kubernaut_complete_no_action without escalation_reason", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    // Stream emits investigation_summary (to set rrId) then workflow options
    mockStreamA2A.mockImplementationOnce(async (_req: unknown, opts: {
      onEvent?: (event: unknown) => void;
      onComplete?: () => void;
    }) => {
      opts.onEvent?.({
        kind: "artifact-update",
        taskId: "t1",
        contextId: "ctx-1",
        artifact: {
          artifactId: "inv-1",
          parts: [{ kind: "data", data: { session_id: "s1", rr_id: "rr-test-dismiss-001", signal_name: "TestAlert", rca: { summary: "Test" }, options: [{ workflow_id: "wf-1", name: "Test WF", description: "desc", recommended: true }] } }],
          metadata: { type: "investigation_summary" },
        },
      });
      opts.onComplete?.();
    });

    fetchSpy.mockImplementation(() => Promise.resolve(
      new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { status: "completed_no_action", reason: "dismissed" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    ));

    // Follow-up stream
    mockStreamA2A.mockImplementation(async (_req: unknown, opts: { onComplete?: () => void }) => {
      opts.onComplete?.();
    });

    render(<ChatContainer />);
    const input = screen.getByRole("textbox", { name: /type your message/i });
    await act(async () => {
      fireEvent.change(input, { target: { value: "investigate" } });
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
      vi.advanceTimersByTime(600);
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /no action needed/i })).toBeInTheDocument();
    });

    const dismissBtn = screen.getByRole("button", { name: /no action needed/i });
    await act(async () => {
      fireEvent.click(dismissBtn);
    });

    // AC-6: MCP called with kubernaut_complete_no_action, no escalation_reason
    let mcpCall: unknown[] | undefined;
    await waitFor(() => {
      mcpCall = fetchSpy.mock.calls.find(c => {
        if (c[0] !== "/mcp") return false;
        const b = JSON.parse((c[1] as RequestInit).body as string);
        return b.method === "tools/call";
      });
      expect(mcpCall).toBeDefined();
    });
    const body = JSON.parse((mcpCall![1] as RequestInit).body as string);
    expect(body.params.name).toBe("kubernaut_complete_no_action");
    expect(body.params.arguments.rr_id).toBe("rr-test-dismiss-001");
    expect(body.params.arguments.escalation_reason).toBeUndefined();

    fetchSpy.mockRestore();
  });

  // AC-6 + AU-2: Escalate calls kubernaut_complete_no_action with escalation_reason
  it("IT-CONSOLE-ESCALATE-001: 'Escalate to team' calls MCP with escalation_reason via inline input", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    mockStreamA2A.mockImplementationOnce(async (_req: unknown, opts: {
      onEvent?: (event: unknown) => void;
      onComplete?: () => void;
    }) => {
      opts.onEvent?.({
        kind: "artifact-update",
        taskId: "t1",
        contextId: "ctx-1",
        artifact: {
          artifactId: "inv-1",
          parts: [{ kind: "data", data: { session_id: "s1", rr_id: "rr-test-escalate-001", signal_name: "TestAlert", rca: { summary: "Test" }, options: [{ workflow_id: "wf-1", name: "Test WF", description: "desc", recommended: true }] } }],
          metadata: { type: "investigation_summary" },
        },
      });
      opts.onComplete?.();
    });

    fetchSpy.mockImplementation(() => Promise.resolve(
      new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { status: "escalated", reason: "Escalated", escalation_reason: "DBA team" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    ));

    mockStreamA2A.mockImplementation(async (_req: unknown, opts: { onComplete?: () => void }) => {
      opts.onComplete?.();
    });

    render(<ChatContainer />);
    const input = screen.getByRole("textbox", { name: /type your message/i });
    await act(async () => {
      fireEvent.change(input, { target: { value: "investigate" } });
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
      vi.advanceTimersByTime(600);
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /escalate to team/i })).toBeInTheDocument();
    });

    const escalateBtn = screen.getByRole("button", { name: /escalate to team/i });
    await act(async () => {
      fireEvent.click(escalateBtn);
    });

    // AU-2: Inline input appears for reason
    await waitFor(() => {
      expect(screen.getByLabelText(/escalation reason/i)).toBeInTheDocument();
    });
    const reasonInput = screen.getByLabelText(/escalation reason/i);
    await act(async () => {
      fireEvent.change(reasonInput, { target: { value: "DBA team needed for schema migration" } });
    });
    const submitBtn = screen.getByRole("button", { name: /submit escalation/i });
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    // AC-6: MCP called with escalation_reason
    let mcpCall: unknown[] | undefined;
    await waitFor(() => {
      mcpCall = fetchSpy.mock.calls.find(c => {
        if (c[0] !== "/mcp") return false;
        const b = JSON.parse((c[1] as RequestInit).body as string);
        return b.method === "tools/call";
      });
      expect(mcpCall).toBeDefined();
    });
    const body = JSON.parse((mcpCall![1] as RequestInit).body as string);
    expect(body.params.name).toBe("kubernaut_complete_no_action");
    expect(body.params.arguments.rr_id).toBe("rr-test-escalate-001");
    expect(body.params.arguments.escalation_reason).toBe("DBA team needed for schema migration");

    fetchSpy.mockRestore();
  });
});
