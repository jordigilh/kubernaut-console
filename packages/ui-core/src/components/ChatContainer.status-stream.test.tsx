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
import { _resetSession } from "../lib/mcp-client";
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

const mockStreamA2A = vi.mocked(streamA2A);
const mockSubscribeStatus = vi.mocked(subscribeRRStatus);

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
});
