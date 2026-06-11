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
});
