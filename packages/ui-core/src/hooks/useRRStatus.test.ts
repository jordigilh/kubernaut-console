import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useRRStatus } from "./useRRStatus";

vi.mock("../lib/a2a-status-client", () => ({
  subscribeRRStatus: vi.fn(),
}));

describe("useRRStatus — Integration Tests", () => {
  let mockSubscribe: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.restoreAllMocks();
    const mod = await import("../lib/a2a-status-client");
    mockSubscribe = vi.mocked(mod.subscribeRRStatus);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("IT-CONSOLE-STATUS-001: does not subscribe when rrId is undefined", () => {
    renderHook(() => useRRStatus(undefined));
    expect(mockSubscribe).not.toHaveBeenCalled();
  });

  it("IT-CONSOLE-STATUS-002: subscribes when rrId transitions from undefined to a value", () => {
    mockSubscribe.mockImplementation(async () => {});
    const { rerender } = renderHook(({ rrId }) => useRRStatus(rrId), {
      initialProps: { rrId: undefined as string | undefined },
    });

    expect(mockSubscribe).not.toHaveBeenCalled();

    rerender({ rrId: "rr-abc-123" });
    expect(mockSubscribe).toHaveBeenCalledWith("rr-abc-123", expect.anything());
  });

  it("IT-CONSOLE-STATUS-003: onPhaseChange drives statusPhase state", async () => {
    mockSubscribe.mockImplementation(async (_rrId, opts) => {
      opts.onPhaseChange("Verifying", { stabilization_window: "60s" });
    });

    const { result } = renderHook(() => useRRStatus("rr-1"));

    await waitFor(() => {
      expect(result.current.statusPhase).toBe("Verifying");
    });
  });

  it("IT-CONSOLE-STATUS-004: statusPhase updates on each phase transition", async () => {
    mockSubscribe.mockImplementation(async (_rrId, opts) => {
      opts.onPhaseChange("Executing", {});
      opts.onPhaseChange("Verifying", {});
    });

    const { result } = renderHook(() => useRRStatus("rr-1"));

    await waitFor(() => {
      expect(result.current.statusPhase).toBe("Verifying");
    });
  });

  it("IT-CONSOLE-STATUS-005: onTerminal sets isTerminal to true", async () => {
    mockSubscribe.mockImplementation(async (_rrId, opts) => {
      opts.onPhaseChange("Completed", {});
      opts.onTerminal?.("Completed");
    });

    const { result } = renderHook(() => useRRStatus("rr-1"));

    await waitFor(() => {
      expect(result.current.isTerminal).toBe(true);
    });
  });

  it("IT-CONSOLE-STATUS-006: does not re-subscribe after terminal phase", async () => {
    mockSubscribe.mockImplementation(async (_rrId, opts) => {
      opts.onPhaseChange("Completed", {});
      opts.onTerminal?.("Completed");
    });

    const { result, rerender } = renderHook(({ rrId }) => useRRStatus(rrId), {
      initialProps: { rrId: "rr-1" as string | undefined },
    });

    await waitFor(() => {
      expect(result.current.isTerminal).toBe(true);
    });

    mockSubscribe.mockClear();
    rerender({ rrId: "rr-1" });
    expect(mockSubscribe).not.toHaveBeenCalled();
  });

  it("IT-CONSOLE-STATUS-007: re-subscribes when rrId changes to a different value", async () => {
    mockSubscribe.mockImplementation(async () => {});

    const { rerender } = renderHook(({ rrId }) => useRRStatus(rrId), {
      initialProps: { rrId: "rr-1" as string | undefined },
    });

    expect(mockSubscribe).toHaveBeenCalledTimes(1);

    rerender({ rrId: "rr-2" });
    expect(mockSubscribe).toHaveBeenCalledTimes(2);
    expect(mockSubscribe).toHaveBeenLastCalledWith("rr-2", expect.anything());
  });

  it("IT-CONSOLE-STATUS-008: onReconnecting sets statusConnection to 'reconnecting'", async () => {
    mockSubscribe.mockImplementation(async (_rrId, opts) => {
      opts.onReconnecting?.(1);
    });

    const { result } = renderHook(() => useRRStatus("rr-1"));

    await waitFor(() => {
      expect(result.current.statusConnection).toBe("reconnecting");
    });
  });

  it("IT-CONSOLE-STATUS-009: onError sets statusConnection to 'error' after prior connection", async () => {
    mockSubscribe.mockImplementation(async (_rrId, opts) => {
      opts.onPhaseChange("Investigating", {});
      opts.onError(new Error("connection failed"));
    });

    const { result } = renderHook(() => useRRStatus("rr-1"));

    await waitFor(() => {
      expect(result.current.statusConnection).toBe("error");
    });
  });

  it("IT-CONSOLE-STATUS-010: statusConnection is 'connected' after successful phase event", async () => {
    mockSubscribe.mockImplementation(async (_rrId, opts) => {
      opts.onPhaseChange("Investigating", {});
    });

    const { result } = renderHook(() => useRRStatus("rr-1"));

    await waitFor(() => {
      expect(result.current.statusConnection).toBe("connected");
    });
  });

  it("IT-CONSOLE-STATUS-011: aborts subscription on unmount", async () => {
    let capturedSignal: AbortSignal | undefined;
    mockSubscribe.mockImplementation(async (_rrId, opts) => {
      capturedSignal = opts.signal;
      await new Promise(() => {});
    });

    const { unmount } = renderHook(() => useRRStatus("rr-1"));
    await act(async () => {});

    expect(capturedSignal).toBeDefined();
    expect(capturedSignal!.aborted).toBe(false);

    unmount();
    expect(capturedSignal!.aborted).toBe(true);
  });

  it("IT-CONSOLE-STATUS-012: resets state when rrId changes", async () => {
    let callCount = 0;
    mockSubscribe.mockImplementation(async (_rrId, opts) => {
      callCount++;
      if (callCount === 1) {
        opts.onPhaseChange("Verifying", {});
      }
    });

    const { result, rerender } = renderHook(({ rrId }) => useRRStatus(rrId), {
      initialProps: { rrId: "rr-1" as string | undefined },
    });

    await waitFor(() => {
      expect(result.current.statusPhase).toBe("Verifying");
    });

    rerender({ rrId: "rr-2" });

    await waitFor(() => {
      expect(result.current.statusPhase).toBeUndefined();
      expect(result.current.isTerminal).toBe(false);
    });
  });

  it("IT-CONSOLE-STATUS-013: exposes metadata from last phase event", async () => {
    mockSubscribe.mockImplementation(async (_rrId, opts) => {
      opts.onPhaseChange("Verifying", { stabilization_window: "120s", started_at: "2026-06-18T15:00:00Z" });
    });

    const { result } = renderHook(() => useRRStatus("rr-1"));

    await waitFor(() => {
      expect(result.current.statusMetadata).toEqual({ stabilization_window: "120s", started_at: "2026-06-18T15:00:00Z" });
    });
  });
});
