/**
 * ChatContainer Session Awareness Integration Tests (ADR-008)
 *
 * Validates the full terminal→context-save→reset→next-message-prepend flow
 * and browser refresh recovery from sessionStorage.
 */
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { ChatContainer } from "./ChatContainer";
import { streamA2A } from "../lib/a2a-client";
import { subscribeRRStatus } from "../lib/a2a-status-client";
import type { StatusSubscribeOptions } from "../lib/a2a-status-client";

vi.mock("../lib/a2a-client", () => ({
  buildStreamRequest: vi.fn((text: string, contextId?: string) => ({
    jsonrpc: "2.0",
    method: "message/stream",
    params: { message: { parts: [{ kind: "text", text }], contextId } },
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
    callMcpTool: vi.fn().mockResolvedValue({ result: {} }),
    _resetSession: orig._resetSession,
  };
});

const mockStreamA2A = vi.mocked(streamA2A);
const mockSubscribeStatus = vi.mocked(subscribeRRStatus);

const CONTEXT_KEY = "kubernaut-console-context";
const PENDING_CONTEXT_KEY = "kubernaut-pending-context"; // pre-commit:allow-sensitive

beforeAll(() => {
  Element.prototype.scrollTo = vi.fn();
});

describe("ChatContainer — Session Awareness (ADR-008)", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockStreamA2A.mockReset();
    mockSubscribeStatus.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function setupChatWithRR() {
    mockStreamA2A.mockImplementation(async (_req: unknown, opts: {
      onEvent?: (event: unknown) => void;
      onComplete?: () => void;
    }) => {
      opts.onEvent?.({
        kind: "status-update",
        taskId: "t1",
        contextId: "ctx-initial-session",
        status: { state: "working", message: { role: "agent", parts: [{ kind: "text", text: "Investigating..." }] } },
        metadata: {
          type: "rr_update",
          rr_id: "kubernaut-system/rr-redis-oom-42",
          phase: "Investigating",
          alert_name: "KubePodCrashLooping",
          namespace: "production",
          kind: "Deployment",
          target: "cache-primary",
        },
      });
      opts.onComplete?.();
    });
  }

  it("IT-CONSOLE-SESSION-001: terminal status saves deferred context to sessionStorage", async () => {
    setupChatWithRR();

    mockSubscribeStatus.mockImplementation(async (_rrId, opts) => {
      opts.onPhaseChange("Executing", { kind: "Deployment", target: "cache-primary", alert_name: "KubePodCrashLooping" });
      opts.onPhaseChange("Completed", { kind: "Deployment", target: "cache-primary", alert_name: "KubePodCrashLooping" });
      opts.onTerminal("Completed");
    });

    render(<ChatContainer />);
    const input = screen.getByRole("textbox", { name: /type your message/i });
    await act(async () => {
      fireEvent.change(input, { target: { value: "investigate redis" } });
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
      vi.advanceTimersByTime(100);
    });

    await waitFor(() => {
      const stored = sessionStorage.getItem(PENDING_CONTEXT_KEY);
      expect(stored).toBeTruthy();
      const parsed = JSON.parse(stored!);
      expect(parsed[0]).toContain("<previous_investigation>");
      expect(parsed[0]).toContain("rr_id: kubernaut-system/rr-redis-oom-42");
    });
  });

  it("IT-CONSOLE-SESSION-002: terminal status generates fresh contextId (UUID) in sessionStorage", async () => {
    setupChatWithRR();

    mockSubscribeStatus.mockImplementation(async (_rrId, opts) => {
      opts.onPhaseChange("Completed", {});
      opts.onTerminal("Completed");
    });

    render(<ChatContainer />);
    const input = screen.getByRole("textbox", { name: /type your message/i });
    await act(async () => {
      fireEvent.change(input, { target: { value: "investigate" } });
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
      vi.advanceTimersByTime(100);
    });

    await waitFor(() => {
      const stored = sessionStorage.getItem(CONTEXT_KEY);
      expect(stored).toBeTruthy();
      expect(stored).not.toBe("ctx-initial-session");
      expect(stored).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });
  });

  it("IT-CONSOLE-SESSION-003: next message after terminal prepends deferred context", async () => {
    setupChatWithRR();

    let statusOpts: StatusSubscribeOptions | undefined;
    mockSubscribeStatus.mockImplementation(async (_rrId, opts) => {
      statusOpts = opts;
      opts.onPhaseChange("Executing", {});
    });

    const { buildStreamRequest } = await import("../lib/a2a-client");
    (buildStreamRequest as ReturnType<typeof vi.fn>).mockClear();

    render(<ChatContainer />);
    const input = screen.getByRole("textbox", { name: /type your message/i });

    await act(async () => {
      fireEvent.change(input, { target: { value: "investigate redis" } });
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
      vi.advanceTimersByTime(100);
    });

    await act(async () => {
      statusOpts?.onPhaseChange("Completed", { kind: "Deployment", target: "cache-primary" });
      statusOpts?.onTerminal("Completed");
      vi.advanceTimersByTime(100);
    });

    (buildStreamRequest as ReturnType<typeof vi.fn>).mockClear();

    mockStreamA2A.mockImplementation(async (_req: unknown, opts: {
      onComplete?: () => void;
    }) => {
      opts.onComplete?.();
    });

    await act(async () => {
      vi.advanceTimersByTime(600);
    });

    await act(async () => {
      fireEvent.change(input, { target: { value: "show audit traces" } });
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
      vi.advanceTimersByTime(100);
    });

    await waitFor(() => {
      const calls = (buildStreamRequest as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const sentText = calls[0][0] as string;
      expect(sentText).toContain("<previous_investigation>");
      expect(sentText).toContain("show audit traces");
    });
  });

  it("IT-CONSOLE-SESSION-004: deferred context is consumed — second message has no prefix", async () => {
    setupChatWithRR();

    let statusOpts: StatusSubscribeOptions | undefined;
    mockSubscribeStatus.mockImplementation(async (_rrId, opts) => {
      statusOpts = opts;
      opts.onPhaseChange("Executing", {});
    });

    const { buildStreamRequest } = await import("../lib/a2a-client");

    render(<ChatContainer />);
    const input = screen.getByRole("textbox", { name: /type your message/i });

    await act(async () => {
      fireEvent.change(input, { target: { value: "investigate" } });
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
      vi.advanceTimersByTime(100);
    });

    await act(async () => {
      statusOpts?.onPhaseChange("Completed", {});
      statusOpts?.onTerminal("Completed");
      vi.advanceTimersByTime(100);
    });

    mockStreamA2A.mockImplementation(async (_req: unknown, opts: {
      onComplete?: () => void;
    }) => {
      opts.onComplete?.();
    });

    await act(async () => {
      vi.advanceTimersByTime(600);
    });

    await act(async () => {
      fireEvent.change(input, { target: { value: "first post-terminal" } });
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
      vi.advanceTimersByTime(100);
    });

    (buildStreamRequest as ReturnType<typeof vi.fn>).mockClear();

    await act(async () => {
      vi.advanceTimersByTime(600);
    });

    await act(async () => {
      fireEvent.change(input, { target: { value: "second message" } });
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
      vi.advanceTimersByTime(100);
    });

    await waitFor(() => {
      const calls = (buildStreamRequest as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const sentText = calls[0][0] as string;
      expect(sentText).toBe("second message");
      expect(sentText).not.toContain("<previous_investigation>");
    });
  });

  it("IT-CONSOLE-SESSION-005: session is NOT reset during active phases (AwaitingApproval)", async () => {
    setupChatWithRR();

    mockSubscribeStatus.mockImplementation(async (_rrId, opts) => {
      opts.onPhaseChange("AwaitingApproval", { approval_request_name: "rar-test" });
    });

    render(<ChatContainer />);
    const input = screen.getByRole("textbox", { name: /type your message/i });

    await act(async () => {
      fireEvent.change(input, { target: { value: "investigate" } });
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
      vi.advanceTimersByTime(100);
    });

    await waitFor(() => {
      const pending = sessionStorage.getItem(PENDING_CONTEXT_KEY);
      expect(pending).toBeNull();
    });
  });

  it("IT-CONSOLE-SESSION-006: browser refresh recovery — pending context loaded from sessionStorage", async () => {
    sessionStorage.setItem(PENDING_CONTEXT_KEY, JSON.stringify([
      "<previous_investigation>\n  rr_id: ns/rr-pre-refresh\n  phase: Succeeded\n</previous_investigation>",
    ]));
    sessionStorage.setItem(CONTEXT_KEY, "fresh-uuid-from-before-refresh");

    mockStreamA2A.mockImplementation(async (_req: unknown, opts: {
      onComplete?: () => void;
    }) => {
      opts.onComplete?.();
    });
    mockSubscribeStatus.mockImplementation(async () => {});

    const { buildStreamRequest } = await import("../lib/a2a-client");
    (buildStreamRequest as ReturnType<typeof vi.fn>).mockClear();

    render(<ChatContainer />);
    const input = screen.getByRole("textbox", { name: /type your message/i });

    await act(async () => {
      fireEvent.change(input, { target: { value: "what happened?" } });
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
      vi.advanceTimersByTime(100);
    });

    await waitFor(() => {
      const calls = (buildStreamRequest as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const sentText = calls[0][0] as string;
      expect(sentText).toContain("rr_id: ns/rr-pre-refresh");
      expect(sentText).toContain("what happened?");
      const sentContextId = calls[0][1];
      expect(sentContextId).toBe("fresh-uuid-from-before-refresh");
    });
  });
});
