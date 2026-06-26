import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useChat } from "./useChat";

vi.mock("../lib/a2a-client", () => ({
  buildStreamRequest: vi.fn((text: string, contextId?: string) => ({
    jsonrpc: "2.0",
    method: "message/stream",
    params: { message: { parts: [{ kind: "text", text }], contextId } },
  })),
  streamA2A: vi.fn(async (_req: unknown, opts: { onComplete?: () => void }) => {
    opts.onComplete?.();
  }),
}));

vi.mock("../lib/a2a-mock", () => ({
  mockStreamA2A: vi.fn(),
}));

const CONTEXT_KEY = "kubernaut-console-context";
const PENDING_CONTEXT_KEY = "kubernaut-pending-context"; // pre-commit:allow-sensitive

describe("useChat — Session Awareness (ADR-008)", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("SC-7: resetContext generates fresh UUID for session isolation", () => {
    it("UT-CONSOLE-SESSION-009: resetContext stores a new UUID in sessionStorage", () => {
      const { result } = renderHook(() => useChat());

      act(() => {
        result.current.resetContext();
      });

      const stored = sessionStorage.getItem(CONTEXT_KEY);
      expect(stored).toBeTruthy();
      expect(stored).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it("UT-CONSOLE-SESSION-010: resetContext produces different UUID on each call", () => {
      const { result } = renderHook(() => useChat());

      act(() => {
        result.current.resetContext();
      });
      const first = sessionStorage.getItem(CONTEXT_KEY);

      act(() => {
        result.current.resetContext();
      });
      const second = sessionStorage.getItem(CONTEXT_KEY);

      expect(first).not.toBe(second);
    });
  });

  describe("SC-7: addPendingContext persists deferred context in sessionStorage", () => {
    it("UT-CONSOLE-SESSION-011: addPendingContext stores entry in sessionStorage", () => {
      const { result } = renderHook(() => useChat());

      act(() => {
        result.current.addPendingContext("<previous_investigation>\n  rr_id: ns/rr-1\n</previous_investigation>");
      });

      const stored = sessionStorage.getItem(PENDING_CONTEXT_KEY);
      expect(stored).toBeTruthy();
      const parsed = JSON.parse(stored!);
      expect(parsed).toHaveLength(1);
      expect(parsed[0]).toContain("rr_id: ns/rr-1");
    });

    it("UT-CONSOLE-SESSION-012: addPendingContext accumulates multiple entries", () => {
      const { result } = renderHook(() => useChat());

      act(() => {
        result.current.addPendingContext("context-1");
        result.current.addPendingContext("context-2");
      });

      const stored = JSON.parse(sessionStorage.getItem(PENDING_CONTEXT_KEY)!);
      expect(stored).toHaveLength(2);
      expect(stored[0]).toBe("context-1");
      expect(stored[1]).toBe("context-2");
    });

    it("UT-CONSOLE-SESSION-013: pending context survives hook re-render (loaded from sessionStorage)", () => {
      sessionStorage.setItem(PENDING_CONTEXT_KEY, JSON.stringify(["pre-stored context"]));

      const { result } = renderHook(() => useChat());

      act(() => {
        result.current.addPendingContext("new context");
      });

      const stored = JSON.parse(sessionStorage.getItem(PENDING_CONTEXT_KEY)!);
      expect(stored).toHaveLength(2);
      expect(stored[0]).toBe("pre-stored context");
      expect(stored[1]).toBe("new context");
    });
  });

  describe("SC-7: sendMessage prepends pending context and clears it", () => {
    it("UT-CONSOLE-SESSION-014: sendMessage prepends pending context to request text", async () => {
      vi.useRealTimers();
      const { buildStreamRequest } = await import("../lib/a2a-client");
      (buildStreamRequest as ReturnType<typeof vi.fn>).mockClear();

      const { result } = renderHook(() => useChat());

      act(() => {
        result.current.addPendingContext("<previous_investigation>\n  rr_id: ns/rr-1\n</previous_investigation>");
      });

      await act(async () => {
        await result.current.sendMessage("show me the audit traces");
      });

      const lastCall = (buildStreamRequest as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(lastCall[0]).toContain("<previous_investigation>");
      expect(lastCall[0]).toContain("rr_id: ns/rr-1");
      expect(lastCall[0]).toContain("show me the audit traces");
    });

    it("UT-CONSOLE-SESSION-015: sendMessage clears pending context from sessionStorage after consumption", async () => {
      vi.useRealTimers();
      const { result } = renderHook(() => useChat());

      act(() => {
        result.current.addPendingContext("some context");
      });

      expect(sessionStorage.getItem(PENDING_CONTEXT_KEY)).toBeTruthy();

      await act(async () => {
        await result.current.sendMessage("hello");
      });

      expect(sessionStorage.getItem(PENDING_CONTEXT_KEY)).toBeNull();
    });

    it("UT-CONSOLE-SESSION-016: sendMessage does NOT prepend context for silent messages", async () => {
      vi.useRealTimers();
      const { buildStreamRequest } = await import("../lib/a2a-client");

      const { result } = renderHook(() => useChat());

      act(() => {
        result.current.addPendingContext("should-not-prepend");
      });

      await act(async () => {
        await result.current.sendMessage("silent msg", { silent: true });
      });

      const calls = (buildStreamRequest as ReturnType<typeof vi.fn>).mock.calls;
      const lastCall = calls[calls.length - 1];
      expect(lastCall[0]).toBe("silent msg");
      expect(lastCall[0]).not.toContain("should-not-prepend");
    });

    it("UT-CONSOLE-SESSION-017: sendMessage without pending context sends text unmodified", async () => {
      vi.useRealTimers();
      const { buildStreamRequest } = await import("../lib/a2a-client");
      (buildStreamRequest as ReturnType<typeof vi.fn>).mockClear();

      const { result } = renderHook(() => useChat());

      await act(async () => {
        await result.current.sendMessage("plain message");
      });

      const lastCall = (buildStreamRequest as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(lastCall[0]).toBe("plain message");
    });
  });

  describe("AC-6: clearHistory also clears pending context", () => {
    it("UT-CONSOLE-SESSION-018: clearHistory removes pending context from sessionStorage", () => {
      const { result } = renderHook(() => useChat());

      act(() => {
        result.current.addPendingContext("leftover context");
      });

      expect(sessionStorage.getItem(PENDING_CONTEXT_KEY)).toBeTruthy();

      act(() => {
        result.current.clearHistory();
      });

      expect(sessionStorage.getItem(PENDING_CONTEXT_KEY)).toBeNull();
    });
  });
});
