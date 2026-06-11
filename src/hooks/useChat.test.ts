import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useChat } from "./useChat";

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
});

const clientSecret = "abcdefghijklmnopqrstuvwxyz1234567890"; // pre-commit:allow-sensitive (test dummy)
