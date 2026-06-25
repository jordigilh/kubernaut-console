/**
 * ChatContainer Status Stream Integration Tests
 *
 * Proves the banner is driven by the status stream (useRRStatus), NOT the chat
 * stream. Validates the dual-channel architecture separation.
 */
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { ChatContainer } from "./ChatContainer";
import { streamA2A } from "../lib/a2a-client";
import { subscribeRRStatus } from "../lib/a2a-status-client";
import { callMcpTool } from "../lib/mcp-client";
import { _resetSession } from "../lib/mcp-client";
import { markWorkflowResolved, savePersistedPhase } from "../lib/session-state";
import type { StatusSubscribeOptions } from "../lib/a2a-status-client";

vi.mock("../lib/a2a-client", () => ({
  buildStreamRequest: vi.fn((_text: string) => ({
    task: { message: { role: "user", parts: [{ kind: "text", text: _text }] } },
  })),
  streamA2A: vi.fn(),
}));

vi.mock("../lib/a2a-status-client", () => ({
  subscribeRRStatus: vi.fn(),
}));

vi.mock("../lib/mcp-client", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../lib/mcp-client")>();
  return {
    ...orig,
    callMcpTool: vi.fn().mockResolvedValue({ error: { code: -1, message: "mock" } }),
  };
});

const mockStreamA2A = vi.mocked(streamA2A);
const mockSubscribeStatus = vi.mocked(subscribeRRStatus);
const mockCallMcpTool = vi.mocked(callMcpTool);

beforeAll(() => {
  Element.prototype.scrollTo = vi.fn();
});

describe("ChatContainer — Banner Status Stream Separation", () => {
  beforeEach(() => {
    sessionStorage.clear();
    _resetSession();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockStreamA2A.mockReset();
    mockSubscribeStatus.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function emitRRFromChatStream(opts: { onEvent?: (event: unknown) => void; onComplete?: () => void }) {
    const { onEvent, onComplete } = opts;
    onEvent?.({
      kind: "status-update",
      taskId: "t1",
      contextId: "ctx-1",
      status: { state: "working", message: { role: "agent", parts: [{ kind: "text", text: "Investigating..." }] } },
      metadata: { type: "rr_update", rr_id: "rr-test-001", phase: "Investigating", alert_name: "KubePodCrashLooping", namespace: "demo" },
    });
    onComplete?.();
  }

  it("IT-CONSOLE-BANNER-001: banner phase is driven by status stream, not chat stream phase", async () => {
    mockStreamA2A.mockImplementation(async (_req: unknown, opts: {
      onEvent?: (event: unknown) => void;
      onComplete?: () => void;
    }) => {
      emitRRFromChatStream(opts);
    });

    let statusOpts: StatusSubscribeOptions | undefined;
    mockSubscribeStatus.mockImplementation(async (_rrId, opts) => {
      statusOpts = opts;
      opts.onPhaseChange("Verifying", {});
    });

    render(<ChatContainer />);
    const input = screen.getByRole("textbox", { name: /type your message/i });
    await act(async () => {
      fireEvent.change(input, { target: { value: "test" } });
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
      vi.advanceTimersByTime(100);
    });

    await waitFor(() => {
      expect(screen.getByText(/Verifying/)).toBeInTheDocument();
    });
  });

  it("IT-CONSOLE-BANNER-002: chat stream 'Reconnecting...' does NOT affect banner phase display", async () => {
    mockStreamA2A.mockImplementation(async (_req: unknown, opts: {
      onEvent?: (event: unknown) => void;
      onComplete?: () => void;
      onReconnecting?: (attempt: number) => void;
    }) => {
      emitRRFromChatStream(opts);
      opts.onReconnecting?.(1);
    });

    mockSubscribeStatus.mockImplementation(async (_rrId, opts) => {
      opts.onPhaseChange("Verifying", {});
    });

    render(<ChatContainer />);
    const input = screen.getByRole("textbox", { name: /type your message/i });
    await act(async () => {
      fireEvent.change(input, { target: { value: "test" } });
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
      vi.advanceTimersByTime(100);
    });

    await waitFor(() => {
      expect(screen.getByText(/Verifying/)).toBeInTheDocument();
    });
    expect(screen.queryByText("Reconnecting...")).not.toBeInTheDocument();
  });

  it("IT-CONSOLE-BANNER-003: status stream opens when rr_id is first received from chat", async () => {
    mockStreamA2A.mockImplementation(async (_req: unknown, opts: {
      onEvent?: (event: unknown) => void;
      onComplete?: () => void;
    }) => {
      emitRRFromChatStream(opts);
    });

    mockSubscribeStatus.mockImplementation(async () => {});

    render(<ChatContainer />);
    const input = screen.getByRole("textbox", { name: /type your message/i });
    await act(async () => {
      fireEvent.change(input, { target: { value: "test" } });
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
      vi.advanceTimersByTime(100);
    });

    await waitFor(() => {
      expect(mockSubscribeStatus).toHaveBeenCalledWith("rr-test-001", expect.anything());
    });
  });

  it("IT-CONSOLE-BANNER-004: status stream phase overrides chat stream phase for banner", async () => {
    mockStreamA2A.mockImplementation(async (_req: unknown, opts: {
      onEvent?: (event: unknown) => void;
      onComplete?: () => void;
    }) => {
      opts.onEvent?.({
        kind: "status-update",
        taskId: "t1",
        contextId: "ctx-1",
        status: { state: "working", message: { role: "agent", parts: [{ kind: "text", text: "Investigating..." }] } },
        metadata: { type: "rr_update", rr_id: "rr-test-001", phase: "Investigating", alert_name: "KubePodCrashLooping", namespace: "demo" },
      });
      opts.onComplete?.();
    });

    mockSubscribeStatus.mockImplementation(async (_rrId, opts) => {
      opts.onPhaseChange("Executing", {});
    });

    render(<ChatContainer />);
    const input = screen.getByRole("textbox", { name: /type your message/i });
    await act(async () => {
      fireEvent.change(input, { target: { value: "test" } });
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
      vi.advanceTimersByTime(100);
    });

    await waitFor(() => {
      expect(screen.getByText(/Executing/)).toBeInTheDocument();
    });
    expect(screen.queryByText(/Investigating/)).not.toBeInTheDocument();
  });

  it("IT-CONSOLE-BANNER-005: stale Investigating status does not regress banner after workflow execution", async () => {
    savePersistedPhase("remediation");
    markWorkflowResolved("rr-test-001");

    mockStreamA2A.mockImplementation(async (_req: unknown, opts: {
      onEvent?: (event: unknown) => void;
      onComplete?: () => void;
    }) => {
      emitRRFromChatStream(opts);
    });

    mockSubscribeStatus.mockImplementation(async (_rrId, opts) => {
      opts.onPhaseChange("Investigating", {});
    });

    render(<ChatContainer />);
    const input = screen.getByRole("textbox", { name: /type your message/i });
    await act(async () => {
      fireEvent.change(input, { target: { value: "investigate crashloop" } });
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
      vi.advanceTimersByTime(100);
    });

    await waitFor(() => {
      expect(screen.getByText(/Executing/)).toBeInTheDocument();
    });
    expect(screen.queryByText(/^Investigating/)).not.toBeInTheDocument();
  });

  it("IT-CONSOLE-BANNER-006: status stream Verifying wins over stale chat investigation phase", async () => {
    mockStreamA2A.mockImplementation(async (_req: unknown, opts: {
      onEvent?: (event: unknown) => void;
      onComplete?: () => void;
    }) => {
      emitRRFromChatStream(opts);
    });

    mockSubscribeStatus.mockImplementation(async (_rrId, opts) => {
      opts.onPhaseChange("Investigating", {});
      opts.onPhaseChange("Verifying", { ea_phase: "Stabilizing" });
    });

    render(<ChatContainer />);
    const input = screen.getByRole("textbox", { name: /type your message/i });
    await act(async () => {
      fireEvent.change(input, { target: { value: "test" } });
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
      vi.advanceTimersByTime(100);
    });

    await waitFor(() => {
      expect(screen.getByText(/Verifying/)).toBeInTheDocument();
    });
  });

  it("IT-CONSOLE-BANNER-007: AwaitingApproval overrides remediation phase (ratchet bypass) [#23]", async () => {
    mockStreamA2A.mockImplementation(async (_req: unknown, opts: {
      onEvent?: (event: unknown) => void;
      onComplete?: () => void;
    }) => {
      emitRRFromChatStream(opts);
    });

    mockSubscribeStatus.mockImplementation(async (_rrId, opts) => {
      // Simulate: workflow selected (phase advances to Executing/remediation),
      // then CRD reports AwaitingApproval — this is the exact bug scenario from #23
      opts.onPhaseChange("Executing", {});
      opts.onPhaseChange("AwaitingApproval", { approval_request_name: "kubernaut-system/rar-test-001" });
    });

    render(<ChatContainer />);
    const input = screen.getByRole("textbox", { name: /type your message/i });
    await act(async () => {
      fireEvent.change(input, { target: { value: "test" } });
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
      vi.advanceTimersByTime(100);
    });

    await waitFor(() => {
      expect(screen.getByText(/Decision pending/)).toBeInTheDocument();
    });
    expect(screen.queryByText(/Executing/)).not.toBeInTheDocument();
  });

  it("IT-CONSOLE-BANNER-008: AwaitingApproval after workflow selection still shows decision phase [#23]", async () => {
    savePersistedPhase("remediation");
    markWorkflowResolved("rr-test-001");

    mockStreamA2A.mockImplementation(async (_req: unknown, opts: {
      onEvent?: (event: unknown) => void;
      onComplete?: () => void;
    }) => {
      emitRRFromChatStream(opts);
    });

    mockSubscribeStatus.mockImplementation(async (_rrId, opts) => {
      // Status stream reports AwaitingApproval even though local phase is already "remediation"
      opts.onPhaseChange("AwaitingApproval", { approval_request_name: "kubernaut-system/rar-test-002" });
    });

    render(<ChatContainer />);
    const input = screen.getByRole("textbox", { name: /type your message/i });
    await act(async () => {
      fireEvent.change(input, { target: { value: "investigate crashloop" } });
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
      vi.advanceTimersByTime(100);
    });

    await waitFor(() => {
      expect(screen.getByText(/Decision pending/)).toBeInTheDocument();
    });
  });

  it("IT-CONSOLE-BANNER-009: approval card injection triggers scroll to bottom [#24]", async () => {
    const scrollToMock = vi.fn();
    Element.prototype.scrollTo = scrollToMock;

    mockStreamA2A.mockImplementation(async (_req: unknown, opts: {
      onEvent?: (event: unknown) => void;
      onComplete?: () => void;
    }) => {
      emitRRFromChatStream(opts);
    });

    mockCallMcpTool.mockResolvedValue({
      result: {
        content: [{ type: "text", text: JSON.stringify({
          metadata: { name: "rar-test-scroll", namespace: "kubernaut-system" },
          spec: {
            confidence: 0.95,
            confidenceLevel: "high",
            reason: "Production approval required",
            requiredBy: new Date(Date.now() + 300_000).toISOString(),
          },
        }) }],
      },
    });

    mockSubscribeStatus.mockImplementation(async (_rrId, opts) => {
      opts.onPhaseChange("AwaitingApproval", { approval_request_name: "kubernaut-system/rar-test-scroll" });
    });

    render(<ChatContainer />);
    const input = screen.getByRole("textbox", { name: /type your message/i });

    scrollToMock.mockClear();

    await act(async () => {
      fireEvent.change(input, { target: { value: "test" } });
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
      vi.advanceTimersByTime(100);
    });

    await waitFor(() => {
      expect(mockCallMcpTool).toHaveBeenCalledWith(
        "kubernaut_get_approval_request",
        expect.objectContaining({ rar_id: "kubernaut-system/rar-test-scroll" }),
        expect.anything(),
      );
    });

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    // After approval card is injected, scroll should have been triggered
    expect(scrollToMock).toHaveBeenCalled();
    const lastScrollCall = scrollToMock.mock.calls[scrollToMock.mock.calls.length - 1];
    expect(lastScrollCall[0]).toHaveProperty("behavior", "smooth");
  });
});
