import { describe, it, expect, vi, beforeEach } from "vitest";
import { streamA2A, buildStreamRequest } from "./a2a-client";
import type { A2AEvent } from "./a2a-types";

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

describe("buildStreamRequest", () => {
  it("builds a JSON-RPC 2.0 message/stream request", () => {
    const req = buildStreamRequest("hello", "ctx-123");
    expect(req.jsonrpc).toBe("2.0");
    expect(req.method).toBe("message/stream");
    expect(req.params.message.role).toBe("user");
    expect(req.params.message.parts[0]).toEqual({ kind: "text", text: "hello" });
    expect(req.params.message.contextId).toBe("ctx-123");
  });

  it("omits contextId when not provided", () => {
    const req = buildStreamRequest("test");
    expect(req.params.message.contextId).toBeUndefined();
  });
});

describe("streamA2A", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("parses a single artifact-update event", async () => {
    const events: A2AEvent[] = [];
    const rpcResponse = {
      jsonrpc: "2.0",
      id: "1",
      result: {
        kind: "artifact-update",
        taskId: "t1",
        contextId: "ctx-1",
        artifact: { artifactId: "a1", parts: [{ kind: "text", text: "Hello" }] },
        lastChunk: true,
      },
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValue(createSSEResponse([sseFrame(rpcResponse)]));

    const onComplete = vi.fn();
    await streamA2A(buildStreamRequest("test"), {
      onEvent: (e) => events.push(e),
      onError: () => {},
      onComplete,
      maxRetries: 0,
    });

    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("artifact-update");
    expect(onComplete).toHaveBeenCalled();
  });

  it("parses a status-update event with metadata.type", async () => {
    const events: A2AEvent[] = [];
    const rpcResponse = {
      jsonrpc: "2.0",
      id: "1",
      result: {
        kind: "status-update",
        taskId: "t1",
        contextId: "ctx-1",
        status: {
          state: "working",
          message: { role: "agent", parts: [{ kind: "text", text: "Investigating..." }] },
        },
        metadata: { type: "investigation" },
      },
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValue(createSSEResponse([sseFrame(rpcResponse)]));

    await streamA2A(buildStreamRequest("test"), {
      onEvent: (e) => events.push(e),
      onError: () => {},
      onComplete: () => {},
      maxRetries: 0,
    });

    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("status-update");
    if (events[0].kind === "status-update") {
      expect(events[0].metadata?.type).toBe("investigation");
    }
  });

  it("handles multiple frames in one chunk", async () => {
    const events: A2AEvent[] = [];
    const frame1 = sseFrame({
      jsonrpc: "2.0", id: "1",
      result: { kind: "status-update", taskId: "t1", contextId: "ctx-1", status: { state: "working" }, metadata: { type: "status" } },
    });
    const frame2 = sseFrame({
      jsonrpc: "2.0", id: "2",
      result: { kind: "artifact-update", taskId: "t1", contextId: "ctx-1", artifact: { artifactId: "a1", parts: [{ kind: "text", text: "Done" }] }, lastChunk: true },
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValue(createSSEResponse([frame1, frame2]));

    await streamA2A(buildStreamRequest("test"), {
      onEvent: (e) => events.push(e),
      onError: () => {},
      onComplete: () => {},
      maxRetries: 0,
    });

    expect(events).toHaveLength(2);
  });

  it("handles partial frames split across chunks", async () => {
    const events: A2AEvent[] = [];
    const fullFrame = sseFrame({
      jsonrpc: "2.0", id: "1",
      result: { kind: "artifact-update", taskId: "t1", contextId: "ctx-1", artifact: { artifactId: "a1", parts: [{ kind: "text", text: "Split" }] }, lastChunk: true },
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
    const response = new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response);

    await streamA2A(buildStreamRequest("test"), {
      onEvent: (e) => events.push(e),
      onError: () => {},
      onComplete: () => {},
      maxRetries: 0,
    });

    expect(events).toHaveLength(1);
    if (events[0].kind === "artifact-update") {
      expect(events[0].artifact.parts[0].text).toBe("Split");
    }
  });

  it("skips malformed JSON frames without crashing", async () => {
    const events: A2AEvent[] = [];
    const badFrame = "data: {not valid json\n\n";
    const goodFrame = sseFrame({
      jsonrpc: "2.0", id: "2",
      result: { kind: "artifact-update", taskId: "t1", contextId: "ctx-1", artifact: { artifactId: "a1", parts: [{ kind: "text", text: "OK" }] }, lastChunk: true },
    });

    const body = badFrame + goodFrame;
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(body));
        controller.close();
      },
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(stream, { status: 200 }));

    await streamA2A(buildStreamRequest("test"), {
      onEvent: (e) => events.push(e),
      onError: () => {},
      onComplete: () => {},
      maxRetries: 0,
    });

    expect(events).toHaveLength(1);
  });

  it("ignores empty data: lines and comments", async () => {
    const events: A2AEvent[] = [];
    const body = ": keep-alive\n\ndata:\n\n" + sseFrame({
      jsonrpc: "2.0", id: "1",
      result: { kind: "artifact-update", taskId: "t1", contextId: "ctx-1", artifact: { artifactId: "a1", parts: [{ kind: "text", text: "After" }] }, lastChunk: true },
    });

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(body));
        controller.close();
      },
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(stream, { status: 200 }));

    await streamA2A(buildStreamRequest("test"), {
      onEvent: (e) => events.push(e),
      onError: () => {},
      onComplete: () => {},
      maxRetries: 0,
    });

    expect(events).toHaveLength(1);
  });

  it("calls onError for JSON-RPC error response", async () => {
    const rpcError = { jsonrpc: "2.0", id: "1", error: { code: -32600, message: "Invalid Request" } };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(createSSEResponse([sseFrame(rpcError)]));

    const onError = vi.fn();
    await streamA2A(buildStreamRequest("test"), {
      onEvent: () => {},
      onError,
      onComplete: () => {},
      maxRetries: 0,
    });

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "Invalid Request" }));
  });

  it("calls onError for 4xx HTTP status (non-retryable)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("Forbidden", { status: 403, statusText: "Forbidden" }));

    const onError = vi.fn();
    await streamA2A(buildStreamRequest("test"), {
      onEvent: () => {},
      onError,
      onComplete: () => {},
      maxRetries: 0,
    });

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "HTTP 403: Forbidden" }));
  });

  it("retries on 5xx and calls onReconnecting", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("Error", { status: 502 }))
      .mockResolvedValueOnce(createSSEResponse([sseFrame({
        jsonrpc: "2.0", id: "1",
        result: { kind: "artifact-update", taskId: "t1", contextId: "ctx-1", artifact: { artifactId: "a1", parts: [{ kind: "text", text: "Retried" }] }, lastChunk: true },
      })]));

    const events: A2AEvent[] = [];
    const onReconnecting = vi.fn();
    await streamA2A(buildStreamRequest("test"), {
      onEvent: (e) => events.push(e),
      onError: () => {},
      onComplete: () => {},
      onReconnecting,
      maxRetries: 1,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onReconnecting).toHaveBeenCalledWith(1);
    expect(events).toHaveLength(1);
  });

  it("respects abort signal", async () => {
    const controller = new AbortController();
    controller.abort();

    const onEvent = vi.fn();
    const onComplete = vi.fn();
    await streamA2A(buildStreamRequest("test"), {
      onEvent,
      onError: () => {},
      onComplete,
      signal: controller.signal,
      maxRetries: 0,
    });

    expect(onEvent).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("UT-CONSOLE-A2A-010: retries on JSON-RPC -32603 with 'execution in progress' and succeeds", async () => {
    const transientError = {
      jsonrpc: "2.0",
      id: "1",
      error: { code: -32603, message: "Internal error", data: { error: "task execution is already in progress" } },
    };
    const successFrame = {
      jsonrpc: "2.0",
      id: "2",
      result: { kind: "artifact-update", taskId: "t1", contextId: "ctx-1", artifact: { artifactId: "a1", parts: [{ kind: "text", text: "OK" }] }, lastChunk: true },
    };

    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(createSSEResponse([sseFrame(transientError)]))
      .mockResolvedValueOnce(createSSEResponse([sseFrame(successFrame)]));

    const events: A2AEvent[] = [];
    const onError = vi.fn();
    const onReconnecting = vi.fn();
    await streamA2A(buildStreamRequest("test"), {
      onEvent: (e) => events.push(e),
      onError,
      onComplete: () => {},
      onReconnecting,
      maxRetries: 1,
      preRetryDelayMs: 10,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onReconnecting).toHaveBeenCalledWith(1);
    expect(onError).not.toHaveBeenCalled();
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("artifact-update");
  });

  it("UT-CONSOLE-A2A-011: JSON-RPC -32603 with unrelated error text remains fatal", async () => {
    const fatalError = {
      jsonrpc: "2.0",
      id: "1",
      error: { code: -32603, message: "Internal error", data: { error: "unexpected nil pointer" } },
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValue(createSSEResponse([sseFrame(fatalError)]));

    const onError = vi.fn();
    const onReconnecting = vi.fn();
    await streamA2A(buildStreamRequest("test"), {
      onEvent: () => {},
      onError,
      onComplete: () => {},
      onReconnecting,
      maxRetries: 2,
    });

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "Internal error" }));
    expect(onReconnecting).not.toHaveBeenCalled();
  });

  // ── kubernaut#2096 follow-up (2026-08-11) ───────────────────────────────
  //
  // jordigilh's spike on kubernaut#2096 disproved the original "120s
  // per-model-call timeout" theory (every model call gets a fresh budget;
  // the observed error is "context canceled", which only an explicit
  // ancestor cancel() produces, never a deadline) and pointed at the client
  // disconnecting/retrying the a2a stream mid-investigation as the more
  // likely trigger, deferred as separate follow-up work. A follow-up spike
  // here (real `streamA2A`/`readSSEStream`/`postForSSE` code, only `fetch`
  // mocked -- exactly as jordigilh's spike only faked the boundary
  // `model.LLM`) found the client-side half of a concrete mechanism: before
  // this fix, `streamA2A` resubmitted a byte-identical request (same
  // id/messageId/contextId, no taskId) on *any* non-fatal stream failure,
  // including a genuine mid-investigation network drop. Reading the
  // vendored a2a-go/ADK stack confirmed that resubmission is never
  // deduplicated server-side: neither `a2aproject/a2a-go/v2`'s task manager
  // (keyed off TaskID, which this client never sets, so every call mints a
  // fresh one) nor `google.golang.org/adk`'s executor/runner (no locking
  // keyed off contextId/sessionId at all) would stop a second, independent
  // execution from starting against the same session while the first might
  // still be running -- a real, confirmed duplicate-execution risk
  // regardless of whether it is the exact #2096 mechanism.
  //
  // Fix: `readSSEStream`/`postForSSE` failures the reader detects on its
  // own (idle timeout, read-time network error) after a live response body
  // was already handed back are now "disconnected", not "retryable" --
  // distinct from a server-attested safe-to-resubmit signal (e.g. AF's own
  // "task execution is already in progress" reply, still exercised by
  // UT-CONSOLE-A2A-010 above). `streamA2A` treats "disconnected" as
  // terminal for the stream and does NOT resubmit; it fires
  // `onStreamInterrupted` instead so the caller can tell the user the
  // investigation may still be running rather than silently risking a
  // duplicate.
  it("does NOT resubmit after a mid-stream drop; fires onStreamInterrupted instead", async () => {
    let pullCount = 0;
    const droppedConnectionStream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pullCount++;
        if (pullCount === 1) {
          // Mid-frame: no trailing \n\n, so no event is ever parsed from
          // this attempt -- mirrors a real investigation that had already
          // started streaming but hadn't reached a client-visible artifact.
          controller.enqueue(
            new TextEncoder().encode('data: {"jsonrpc":"2.0","id":"1","result":{"kind":"status-update"'),
          );
          return;
        }
        controller.error(new TypeError("network error: connection reset"));
      },
    });
    const droppedResponse = new Response(droppedConnectionStream, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    });

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(droppedResponse);

    const request = buildStreamRequest("investigate the alert in payments", "ctx-existing");
    const events: A2AEvent[] = [];
    const onError = vi.fn();
    const onComplete = vi.fn();
    const onConnectionLost = vi.fn();
    const onStreamInterrupted = vi.fn();
    await streamA2A(request, {
      onEvent: (e) => events.push(e),
      onError,
      onComplete,
      onConnectionLost,
      onStreamInterrupted,
      maxRetries: 3,
      preRetryDelayMs: 5,
    });

    // Exactly one attempt -- no resubmission of the same task/session identity.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onStreamInterrupted).toHaveBeenCalledTimes(1);
    expect(onConnectionLost).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
    expect(events).toHaveLength(0);
  });

  it("UT-CONSOLE-A2A-012: preRetryDelayMs is applied before the first retry attempt", async () => {
    const transientError = {
      jsonrpc: "2.0",
      id: "1",
      error: { code: -32603, message: "Internal error", data: { error: "task execution is already in progress" } },
    };
    const successFrame = {
      jsonrpc: "2.0",
      id: "2",
      result: { kind: "artifact-update", taskId: "t1", contextId: "ctx-1", artifact: { artifactId: "a1", parts: [{ kind: "text", text: "Delayed" }] }, lastChunk: true },
    };

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(createSSEResponse([sseFrame(transientError)]))
      .mockResolvedValueOnce(createSSEResponse([sseFrame(successFrame)]));

    const preRetryDelayMs = 150;
    const start = Date.now();
    await streamA2A(buildStreamRequest("test"), {
      onEvent: () => {},
      onError: () => {},
      onComplete: () => {},
      maxRetries: 1,
      preRetryDelayMs,
    });
    const elapsed = Date.now() - start;

    expect(elapsed).toBeGreaterThanOrEqual(preRetryDelayMs - 10);
  });

  // kubernaut-console#93 (F-15): an SSE response that never terminates a
  // frame (no "\n\n") must not grow the buffer unboundedly -- it should
  // fail visibly and immediately instead of retrying against a broken/
  // hostile upstream.
  it("UT-CONSOLE-A2A-018: an oversized/never-terminated SSE response surfaces onError and does not retry", async () => {
    const oversizedStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("x".repeat(50)));
        // Deliberately never close/terminate a frame -- simulates a
        // misbehaving upstream. readSSEStream's own cap enforcement is
        // what ends this, not stream completion.
      },
    });
    const oversizedResponse = new Response(oversizedStream, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    });

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(oversizedResponse);
    const onError = vi.fn();
    const onComplete = vi.fn();
    const onConnectionLost = vi.fn();

    await streamA2A(buildStreamRequest("test"), {
      onEvent: () => {},
      onError,
      onComplete,
      onConnectionLost,
      maxRetries: 3,
      maxBufferBytes: 20,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining("oversized") }));
    expect(onConnectionLost).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });
});
