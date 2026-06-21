import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { subscribeRRStatus, buildStatusSubscribeRequest } from "./a2a-status-client";
import type { StatusSubscribeOptions, RRPhase } from "./a2a-status-client";

function createSSEResponse(frames: string[]): Response {
  const body = frames.join("");
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

function sseFrame(data: object): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

function delayedSSEResponse(frames: string[], delayMs: number): Response {
  const stream = new ReadableStream({
    async start(controller) {
      for (const frame of frames) {
        await new Promise((r) => setTimeout(r, delayMs));
        controller.enqueue(new TextEncoder().encode(frame));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

describe("buildStatusSubscribeRequest", () => {
  it("UT-CONSOLE-STATUS-001: builds a JSON-RPC 2.0 status/subscribe request", () => {
    const req = buildStatusSubscribeRequest("rr-abc-123");
    expect(req.jsonrpc).toBe("2.0");
    expect(req.method).toBe("status/subscribe");
    expect(req.params.rr_id).toBe("rr-abc-123");
    expect(req.id).toBeDefined();
  });

  it("UT-CONSOLE-STATUS-002: generates unique ids for sequential requests", () => {
    const req1 = buildStatusSubscribeRequest("rr-1");
    const req2 = buildStatusSubscribeRequest("rr-2");
    expect(req1.id).not.toBe(req2.id);
  });
});

describe("subscribeRRStatus", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("UT-CONSOLE-STATUS-003: sends POST to /a2a/status with correct headers", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      createSSEResponse([sseFrame({
        jsonrpc: "2.0", method: "status/update",
        params: { rr_id: "rr-1", phase: "Completed", timestamp: "2026-06-18T15:00:00Z", metadata: {} },
      })])
    );

    await subscribeRRStatus("rr-1", { onPhaseChange: vi.fn(), onError: vi.fn() });

    expect(fetchMock).toHaveBeenCalledWith(
      "/a2a/status",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        }),
      })
    );
  });

  it("UT-CONSOLE-STATUS-004: request body contains JSON-RPC status/subscribe with rr_id", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      createSSEResponse([sseFrame({
        jsonrpc: "2.0", method: "status/update",
        params: { rr_id: "rr-xyz", phase: "Completed", timestamp: "2026-06-18T15:00:00Z", metadata: {} },
      })])
    );

    await subscribeRRStatus("rr-xyz", { onPhaseChange: vi.fn(), onError: vi.fn() });

    const body = JSON.parse(fetchMock.mock.calls[0][1]!.body as string);
    expect(body.jsonrpc).toBe("2.0");
    expect(body.method).toBe("status/subscribe");
    expect(body.params.rr_id).toBe("rr-xyz");
  });

  it("UT-CONSOLE-STATUS-005: parses phase from status/update event and calls onPhaseChange", async () => {
    const onPhaseChange = vi.fn();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      createSSEResponse([sseFrame({
        jsonrpc: "2.0", method: "status/update",
        params: { rr_id: "rr-1", phase: "Verifying", timestamp: "2026-06-18T15:00:00Z", metadata: { stabilization_window: "60s" } },
      })])
    );

    await subscribeRRStatus("rr-1", { onPhaseChange, onError: vi.fn() });

    expect(onPhaseChange).toHaveBeenCalledWith("Verifying", { stabilization_window: "60s" });
  });

  it("UT-CONSOLE-STATUS-006: delivers multiple phase transitions in order", async () => {
    const phases: RRPhase[] = [];
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      createSSEResponse([
        sseFrame({ jsonrpc: "2.0", method: "status/update", params: { rr_id: "rr-1", phase: "Executing", timestamp: "t1", metadata: {} } }),
        sseFrame({ jsonrpc: "2.0", method: "status/update", params: { rr_id: "rr-1", phase: "Verifying", timestamp: "t2", metadata: {} } }),
        sseFrame({ jsonrpc: "2.0", method: "status/update", params: { rr_id: "rr-1", phase: "Completed", timestamp: "t3", metadata: {} } }),
      ])
    );

    await subscribeRRStatus("rr-1", { onPhaseChange: (p) => phases.push(p), onError: vi.fn() });

    expect(phases).toEqual(["Executing", "Verifying", "Completed"]);
  });

  it("UT-CONSOLE-STATUS-007: calls onTerminal when RR reaches terminal phase", async () => {
    const onTerminal = vi.fn();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      createSSEResponse([sseFrame({
        jsonrpc: "2.0", method: "status/update",
        params: { rr_id: "rr-1", phase: "Completed", timestamp: "t1", metadata: {} },
      })])
    );

    await subscribeRRStatus("rr-1", { onPhaseChange: vi.fn(), onError: vi.fn(), onTerminal });

    expect(onTerminal).toHaveBeenCalledWith("Completed");
  });

  it("UT-CONSOLE-STATUS-008: terminal phases include Completed, Failed, TimedOut, Cancelled, Skipped", async () => {
    const terminalPhases: RRPhase[] = ["Completed", "Failed", "TimedOut", "Cancelled", "Skipped"];

    for (const phase of terminalPhases) {
      const onTerminal = vi.fn();
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        createSSEResponse([sseFrame({
          jsonrpc: "2.0", method: "status/update",
          params: { rr_id: "rr-1", phase, timestamp: "t1", metadata: {} },
        })])
      );

      await subscribeRRStatus("rr-1", { onPhaseChange: vi.fn(), onError: vi.fn(), onTerminal });
      expect(onTerminal).toHaveBeenCalledWith(phase);
      vi.restoreAllMocks();
    }
  });

  it("UT-CONSOLE-STATUS-009: does not call onTerminal for non-terminal phases", async () => {
    const onTerminal = vi.fn();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      createSSEResponse([
        sseFrame({ jsonrpc: "2.0", method: "status/update", params: { rr_id: "rr-1", phase: "Executing", timestamp: "t1", metadata: {} } }),
        sseFrame({ jsonrpc: "2.0", method: "status/update", params: { rr_id: "rr-1", phase: "Verifying", timestamp: "t2", metadata: {} } }),
        sseFrame({ jsonrpc: "2.0", method: "status/update", params: { rr_id: "rr-1", phase: "Completed", timestamp: "t3", metadata: {} } }),
      ])
    );

    await subscribeRRStatus("rr-1", { onPhaseChange: vi.fn(), onError: vi.fn(), onTerminal });

    expect(onTerminal).toHaveBeenCalledTimes(1);
    expect(onTerminal).toHaveBeenCalledWith("Completed");
  });

  it("UT-CONSOLE-STATUS-010: retries on 5xx with exponential backoff", async () => {
    vi.useFakeTimers();
    const onReconnecting = vi.fn();
    const onPhaseChange = vi.fn();

    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("Error", { status: 502 }))
      .mockResolvedValueOnce(
        createSSEResponse([sseFrame({
          jsonrpc: "2.0", method: "status/update",
          params: { rr_id: "rr-1", phase: "Completed", timestamp: "t1", metadata: {} },
        })])
      );

    const promise = subscribeRRStatus("rr-1", { onPhaseChange, onError: vi.fn(), onReconnecting, maxRetries: 1 });
    await vi.advanceTimersByTimeAsync(2000);
    await promise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onReconnecting).toHaveBeenCalledWith(1);
    expect(onPhaseChange).toHaveBeenCalledWith("Completed", {});
  });

  it("UT-CONSOLE-STATUS-011: calls onError after max retries exhausted", async () => {
    vi.useFakeTimers();
    const onError = vi.fn();

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("Error", { status: 503 }));

    const promise = subscribeRRStatus("rr-1", { onPhaseChange: vi.fn(), onError, maxRetries: 2 });
    await vi.advanceTimersByTimeAsync(20000);
    await promise;

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining("retries") }));
  });

  it("UT-CONSOLE-STATUS-012: abort via returned unsubscribe function stops the stream", async () => {
    const controller = new AbortController();
    const onPhaseChange = vi.fn();

    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, opts) => {
      const signal = (opts as RequestInit).signal;
      return new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      });
    });

    const promise = subscribeRRStatus("rr-1", { onPhaseChange, onError: vi.fn(), signal: controller.signal, maxRetries: 0 });
    controller.abort();
    await promise;

    expect(onPhaseChange).not.toHaveBeenCalled();
  });

  it("UT-CONSOLE-STATUS-013: handles JSON-RPC error response (rr_not_found)", async () => {
    const onNotFound = vi.fn();
    const onError = vi.fn();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      createSSEResponse([sseFrame({
        jsonrpc: "2.0", id: "1",
        error: { code: -32001, message: "rr_not_found" },
      })])
    );

    await subscribeRRStatus("rr-nonexistent", { onPhaseChange: vi.fn(), onError, onNotFound, maxRetries: 0 });

    expect(onNotFound).toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("UT-CONSOLE-STATUS-014: uses custom baseUrl when provided", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      createSSEResponse([sseFrame({
        jsonrpc: "2.0", method: "status/update",
        params: { rr_id: "rr-1", phase: "Completed", timestamp: "t1", metadata: {} },
      })])
    );

    await subscribeRRStatus("rr-1", { onPhaseChange: vi.fn(), onError: vi.fn(), baseUrl: "https://af.example.com" });

    expect(fetchMock).toHaveBeenCalledWith("https://af.example.com/a2a/status", expect.anything());
  });

  it("UT-CONSOLE-STATUS-015: passes Authorization header when token provided", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      createSSEResponse([sseFrame({
        jsonrpc: "2.0", method: "status/update",
        params: { rr_id: "rr-1", phase: "Completed", timestamp: "t1", metadata: {} },
      })])
    );

    await subscribeRRStatus("rr-1", { onPhaseChange: vi.fn(), onError: vi.fn(), token: "my-token" });

    const headers = fetchMock.mock.calls[0][1]!.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer my-token");
  });

  it("UT-CONSOLE-STATUS-016: handles partial SSE frames split across chunks", async () => {
    const phases: RRPhase[] = [];
    const fullFrame = sseFrame({
      jsonrpc: "2.0", method: "status/update",
      params: { rr_id: "rr-1", phase: "Verifying", timestamp: "t1", metadata: {} },
    });
    const half1 = fullFrame.slice(0, 20);
    const half2 = fullFrame.slice(20);

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(half1));
        controller.enqueue(new TextEncoder().encode(half2));
        controller.close();
      },
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } })
    );

    await subscribeRRStatus("rr-1", { onPhaseChange: (p) => phases.push(p), onError: vi.fn() });

    expect(phases).toEqual(["Verifying"]);
  });

  it("UT-CONSOLE-STATUS-017: ignores malformed SSE frames without crashing", async () => {
    const phases: RRPhase[] = [];
    const frames = [
      "data: not-json\n\n",
      sseFrame({ jsonrpc: "2.0", method: "status/update", params: { rr_id: "rr-1", phase: "Completed", timestamp: "t1", metadata: {} } }),
    ];

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      createSSEResponse(frames)
    );

    await subscribeRRStatus("rr-1", { onPhaseChange: (p) => phases.push(p), onError: vi.fn() });

    expect(phases).toEqual(["Completed"]);
  });

  it("UT-CONSOLE-STATUS-018: does not retry on terminal phase received (stream ends cleanly)", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      createSSEResponse([sseFrame({
        jsonrpc: "2.0", method: "status/update",
        params: { rr_id: "rr-1", phase: "Completed", timestamp: "t1", metadata: {} },
      })])
    );

    await subscribeRRStatus("rr-1", { onPhaseChange: vi.fn(), onError: vi.fn(), maxRetries: 3 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("UT-CONSOLE-STATUS-019: retries on network error (fetch throw)", async () => {
    vi.useFakeTimers();
    const onReconnecting = vi.fn();

    vi.spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(
        createSSEResponse([sseFrame({
          jsonrpc: "2.0", method: "status/update",
          params: { rr_id: "rr-1", phase: "Completed", timestamp: "t1", metadata: {} },
        })])
      );

    const promise = subscribeRRStatus("rr-1", { onPhaseChange: vi.fn(), onError: vi.fn(), onReconnecting, maxRetries: 1 });
    await vi.advanceTimersByTimeAsync(2000);
    await promise;

    expect(onReconnecting).toHaveBeenCalledWith(1);
  });

  it("UT-CONSOLE-STATUS-020: does not retry when abort signal is raised", async () => {
    const controller = new AbortController();
    const onReconnecting = vi.fn();

    vi.spyOn(globalThis, "fetch").mockRejectedValue(new DOMException("Aborted", "AbortError"));
    controller.abort();

    await subscribeRRStatus("rr-1", { onPhaseChange: vi.fn(), onError: vi.fn(), onReconnecting, signal: controller.signal, maxRetries: 3 });

    expect(onReconnecting).not.toHaveBeenCalled();
  });

  it("UT-CONSOLE-STATUS-021: uses final flag to detect terminal (even if phase name is unrecognized)", async () => {
    const onTerminal = vi.fn();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      createSSEResponse([sseFrame({
        jsonrpc: "2.0", method: "status/update",
        params: { rr_id: "rr-1", phase: "SomeNewPhase", final: true, timestamp: "t1", metadata: {} },
      })])
    );

    await subscribeRRStatus("rr-1", { onPhaseChange: vi.fn(), onError: vi.fn(), onTerminal, maxRetries: 0 });

    expect(onTerminal).toHaveBeenCalledWith("SomeNewPhase");
  });

  it("UT-CONSOLE-STATUS-022: handles status/closing event and calls onClosing callback", async () => {
    const onClosing = vi.fn();
    const onPhaseChange = vi.fn();

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      createSSEResponse([
        sseFrame({ jsonrpc: "2.0", method: "status/update", params: { rr_id: "rr-1", phase: "Verifying", final: false, timestamp: "t1", metadata: {} } }),
        sseFrame({ jsonrpc: "2.0", method: "status/closing", params: { reason: "token_expiry", reconnect: true } }),
      ])
    );

    await subscribeRRStatus("rr-1", { onPhaseChange, onError: vi.fn(), onClosing, maxRetries: 0 });

    expect(onClosing).toHaveBeenCalledWith("token_expiry");
    expect(onPhaseChange).toHaveBeenCalledWith("Verifying", {});
  });

  it("UT-CONSOLE-STATUS-023: status/closing with reconnect:true triggers retry", async () => {
    vi.useFakeTimers();
    const onReconnecting = vi.fn();
    const onPhaseChange = vi.fn();

    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        createSSEResponse([
          sseFrame({ jsonrpc: "2.0", method: "status/closing", params: { reason: "token_expiry", reconnect: true } }),
        ])
      )
      .mockResolvedValueOnce(
        createSSEResponse([
          sseFrame({ jsonrpc: "2.0", method: "status/update", params: { rr_id: "rr-1", phase: "Completed", final: true, timestamp: "t2", metadata: {} } }),
        ])
      );

    const promise = subscribeRRStatus("rr-1", { onPhaseChange, onError: vi.fn(), onReconnecting, maxRetries: 1 });
    await vi.advanceTimersByTimeAsync(2000);
    await promise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onReconnecting).toHaveBeenCalledWith(1);
  });

  it("UT-CONSOLE-STATUS-024: idle timeout triggers retry when no data received", async () => {
    vi.useFakeTimers();
    const onReconnecting = vi.fn();

    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      const stream = new ReadableStream({
        start() {
          // never enqueue — simulates dead connection
        },
      });
      return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } });
    });

    const promise = subscribeRRStatus("rr-1", { onPhaseChange: vi.fn(), onError: vi.fn(), onReconnecting, maxRetries: 1, idleTimeoutMs: 100 });
    await vi.advanceTimersByTimeAsync(5000);
    await promise;

    expect(onReconnecting).toHaveBeenCalledWith(1);
  });

  it("UT-CONSOLE-STATUS-025: passes error code to onError for access_denied", async () => {
    const onError = vi.fn();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      createSSEResponse([sseFrame({
        jsonrpc: "2.0", id: "1",
        error: { code: -32002, message: "access_denied" },
      })])
    );

    await subscribeRRStatus("rr-1", { onPhaseChange: vi.fn(), onError, maxRetries: 0 });

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({
      message: "access_denied",
      code: -32002,
    }));
  });
});
