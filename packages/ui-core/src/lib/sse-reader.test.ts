import { describe, it, expect, vi } from "vitest";
import { readSSEStream, postForSSE } from "./sse-reader";

function makeStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let idx = 0;
  return new ReadableStream({
    pull(controller) {
      if (idx < chunks.length) {
        controller.enqueue(encoder.encode(chunks[idx]));
        idx++;
      } else {
        controller.close();
      }
    },
  });
}

describe("sse-reader", () => {
  describe("readSSEStream", () => {
    it("parses SSE frames and invokes handler", async () => {
      const frames: Record<string, unknown>[] = [];
      const body = makeStream([
        'data: {"event":"one"}\n\n',
        'data: {"event":"two"}\n\n',
      ]);

      const result = await readSSEStream(body, (parsed) => {
        frames.push(parsed);
        return "continue";
      });

      expect(result).toBe("complete");
      expect(frames).toHaveLength(2);
      expect(frames[0]).toEqual({ event: "one" });
      expect(frames[1]).toEqual({ event: "two" });
    });

    it("stops on handler returning non-continue", async () => {
      const frames: Record<string, unknown>[] = [];
      const body = makeStream([
        'data: {"a":1}\n\ndata: {"a":2}\n\ndata: {"a":3}\n\n',
      ]);

      const result = await readSSEStream(body, (parsed) => {
        frames.push(parsed);
        if ((parsed as { a: number }).a === 2) return "fatal";
        return "continue";
      });

      expect(result).toBe("fatal");
      expect(frames).toHaveLength(2);
    });

    it("skips malformed JSON", async () => {
      const frames: Record<string, unknown>[] = [];
      const body = makeStream([
        'data: not-json\n\ndata: {"valid":true}\n\n',
      ]);

      const result = await readSSEStream(body, (parsed) => {
        frames.push(parsed);
        return "continue";
      });

      expect(result).toBe("complete");
      expect(frames).toEqual([{ valid: true }]);
    });

    it("handles multi-line SSE frames", async () => {
      const frames: Record<string, unknown>[] = [];
      const body = makeStream([
        'id: 1\ndata: {"x":1}\n\n',
      ]);

      const result = await readSSEStream(body, (parsed) => {
        frames.push(parsed);
        return "continue";
      });

      expect(result).toBe("complete");
      expect(frames).toEqual([{ x: 1 }]);
    });

    it("returns retryable on idle timeout", async () => {
      const body = makeStream([]);
      const neverEndingBody = new ReadableStream({
        pull() {
          return new Promise(() => {});
        },
      });

      const result = await readSSEStream(neverEndingBody, () => "continue", {
        idleTimeoutMs: 50,
      });

      expect(result).toBe("retryable");
    });

    it("returns aborted if signal is aborted during read", async () => {
      const controller = new AbortController();
      const body = new ReadableStream({
        pull() {
          controller.abort();
          throw new Error("aborted");
        },
      });

      const result = await readSSEStream(body, () => "continue", {
        signal: controller.signal,
      });

      expect(result).toBe("aborted");
    });

    it("handles chunked data split across multiple reads", async () => {
      const frames: Record<string, unknown>[] = [];
      const body = makeStream([
        'data: {"part',
        '":"joined"}\n\n',
      ]);

      const result = await readSSEStream(body, (parsed) => {
        frames.push(parsed);
        return "continue";
      });

      expect(result).toBe("complete");
      expect(frames).toEqual([{ part: "joined" }]);
    });
  });

  describe("postForSSE", () => {
    it("returns response on success", async () => {
      const mockBody = makeStream(['data: {}\n\n']);
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: mockBody,
      });

      const result = await postForSSE("/test", { key: "val" }, { fetchFn: mockFetch as unknown as typeof fetch });

      expect(result).toHaveProperty("ok", true);
      expect(mockFetch).toHaveBeenCalledWith(
        "/test",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ key: "val" }),
        }),
      );
    });

    it("returns retryable on 5xx", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
        body: null,
      });

      const result = await postForSSE("/test", {}, { fetchFn: mockFetch as unknown as typeof fetch });
      expect(result).toBe("retryable");
    });

    it("returns fatal error with status on 4xx", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: "Forbidden",
        body: null,
      });

      const result = await postForSSE("/test", {}, { fetchFn: mockFetch as unknown as typeof fetch });
      expect(result).toEqual({ kind: "fatal", status: 403, statusText: "Forbidden" });
    });

    it("returns retryable on network error", async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error("network"));
      const result = await postForSSE("/test", {}, { fetchFn: mockFetch as unknown as typeof fetch });
      expect(result).toBe("retryable");
    });

    it("returns aborted when signal is active", async () => {
      const controller = new AbortController();
      controller.abort();
      const mockFetch = vi.fn().mockRejectedValue(new DOMException("abort"));
      const result = await postForSSE("/test", {}, { fetchFn: mockFetch as unknown as typeof fetch, signal: controller.signal });
      expect(result).toBe("aborted");
    });

    it("includes Authorization header when token provided", async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200, body: makeStream([]) });
      await postForSSE("/test", {}, { fetchFn: mockFetch as unknown as typeof fetch, token: "my-token" });

      expect(mockFetch).toHaveBeenCalledWith(
        "/test",
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: "Bearer my-token" }),
        }),
      );
    });
  });
});
