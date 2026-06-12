/**
 * ChatContainer Integration Tests
 *
 * These tests exercise the full production dispatch path: ChatContainer -> useChat -> streamA2A ->
 * AgentBubble -> {ThinkingPanel, RCACard, AgentCTA, WorkflowCards, ExecutionProgress}.
 *
 * They prove wiring completeness per the Pyramid Invariant (IT proves wiring).
 */
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { ChatContainer } from "./ChatContainer";
import { streamA2A } from "../lib/a2a-client";

vi.mock("../lib/a2a-client", () => ({
  buildStreamRequest: vi.fn((_text: string) => ({
    task: { message: { role: "user", parts: [{ kind: "text", text: _text }] } },
  })),
  streamA2A: vi.fn(),
}));

vi.mock("../hooks/useAlerts", () => ({
  useAlerts: () => ({
    severity: "critical",
    summary: "KubePodCrashLooping",
    namespace: "demo-webui",
    pod: "web-frontend-c8dc85956-qm7hq",
    detail: "4 restarts, CrashLoopBackOff",
    active: true,
  }),
}));

const mockStreamA2A = vi.mocked(streamA2A);

beforeAll(() => {
  Element.prototype.scrollTo = vi.fn();
});

describe("ChatContainer Integration", () => {
  beforeEach(() => {
    sessionStorage.clear();
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

      // CTA artifact
      onEvent?.({
        kind: "artifact-update",
        taskId,
        contextId,
        artifact: {
          artifactId: "a1",
          parts: [{ kind: "text", text: "In-cluster patches won't persist -- ArgoCD selfHeal will revert them." }],
        },
        lastChunk: false,
        append: false,
      });

      // Decision payload
      const decisionPayload = {
        session_id: "sess-1",
        summary: "ConfigMap app-config contains an invalid directive.",
        rca: {
          severity: "critical",
          confidence: 0.95,
          causal_chain: [
            "Signal: Pod web-frontend in CrashLoopBackOff (4 restarts, exit code 1)",
            "Why? ConfigMap app-config contains 'invalid_directive: true'",
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
      };

      onEvent?.({
        kind: "status-update",
        taskId,
        contextId,
        status: {
          state: "input-required",
          message: { role: "agent", parts: [{ kind: "text", text: JSON.stringify(decisionPayload) }] },
        },
        metadata: { type: "decision" },
        final: true,
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

    // IT-CONSOLE-JOURNEY-001: Alert banner renders on mount (IR-4: incident visibility)
    expect(screen.getByText("KubePodCrashLooping")).toBeInTheDocument();

    // Send investigation message (AU-10: audit event generation)
    const input = screen.getByLabelText("Type your message");

    await act(async () => {
      fireEvent.change(input, { target: { value: "Investigate this alert" } });
      fireEvent.submit(input.closest("form")!);
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

    // IT-CONSOLE-JOURNEY-004: AgentCTA renders (IR-5: recommendation visibility)
    expect(screen.getByText(/In-cluster patches won't persist/)).toBeInTheDocument();

    // IT-CONSOLE-JOURNEY-001: PhaseIndicator transitions to "Decision pending"
    expect(screen.getByText("Decision pending")).toBeInTheDocument();

    // IT-CONSOLE-JOURNEY-005: WorkflowCards render (SC-5)
    expect(screen.getByTestId("workflow-card-git-revert-v2")).toBeInTheDocument();
    expect(screen.getByTestId("workflow-card-patch-configuration-v1")).toBeInTheDocument();

    // Recommended card has parameters
    expect(screen.getByText(/TARGET_RESOURCE_NAMESPACE=demo-webui/)).toBeInTheDocument();

    // Ruled out card shows reason
    expect(screen.getByText(/selfHeal:true will revert in-cluster patches/)).toBeInTheDocument();

    // IT-CONSOLE-JOURNEY-007: Countdown auto-execute timer is visible (SC-5)
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
    const input = screen.getByLabelText("Type your message");
    await act(async () => {
      fireEvent.change(input, { target: { value: "Use git-revert-v2" } });
      fireEvent.submit(input.closest("form")!);
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
      fireEvent.submit(input.closest("form")!);
      vi.advanceTimersByTime(100);
    });

    // IT-CONSOLE-JOURNEY-006: ExecutionProgress renders
    await waitFor(() => {
      expect(screen.getByText("Executing Remediation")).toBeInTheDocument();
    });

    expect(screen.getAllByText("Cloning GitOps repository").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Reverting commit caa704e8").length).toBeGreaterThanOrEqual(1);
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

    const input = screen.getByLabelText("Type your message");
    await act(async () => {
      fireEvent.change(input, { target: { value: "Investigate" } });
      fireEvent.submit(input.closest("form")!);
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

    const input = screen.getByLabelText("Type your message");
    await act(async () => {
      fireEvent.change(input, { target: { value: "Investigate" } });
      fireEvent.submit(input.closest("form")!);
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

    const input = screen.getByLabelText("Type your message");
    await act(async () => {
      fireEvent.change(input, { target: { value: "Investigate" } });
      fireEvent.submit(input.closest("form")!);
      vi.advanceTimersByTime(100);
    });

    // Stop button should be visible while streaming
    const stopButton = screen.getByLabelText("Stop agent response");
    expect(stopButton).toBeInTheDocument();

    // SC-5: Operator can cancel
    await act(async () => {
      fireEvent.click(stopButton);
      vi.advanceTimersByTime(100);
    });

    // Stop button disappears, send button returns
    await waitFor(() => {
      expect(screen.queryByLabelText("Stop agent response")).not.toBeInTheDocument();
      expect(screen.getByLabelText("Send message")).toBeInTheDocument();
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

    const input = screen.getByLabelText("Type your message");

    // First submit
    await act(async () => {
      fireEvent.change(input, { target: { value: "First message" } });
      fireEvent.submit(input.closest("form")!);
      vi.advanceTimersByTime(100);
    });

    // Second submit within 500ms -- should be rejected
    await act(async () => {
      fireEvent.change(input, { target: { value: "Second message" } });
      fireEvent.submit(input.closest("form")!);
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

    const input = screen.getByLabelText("Type your message");
    await act(async () => {
      fireEvent.change(input, { target: { value: "Persistent message" } });
      fireEvent.submit(input.closest("form")!);
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
});
