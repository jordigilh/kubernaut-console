import { describe, it, expect, vi } from "vitest";
import { readSSEStream, postForSSE, DEFAULT_MAX_SSE_BUFFER_BYTES } from "./sse-reader";

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

    // kubernaut#2096 follow-up (2026-08-11): an idle timeout is detected by
    // this reader itself, with no server attestation that resubmitting is
    // safe -- distinct from "retryable" (only ever returned when onFrame
    // itself recognizes a server-signalled safe-to-resubmit condition, e.g.
    // AF's own "task execution is already in progress" reply). See this
    // file's "disconnected" doc comment for the full mechanism.
    it("returns disconnected (not retryable) on idle timeout", async () => {
      const neverEndingBody = new ReadableStream({
        pull() {
          return new Promise(() => {});
        },
      });

      const result = await readSSEStream(neverEndingBody, () => "continue", {
        idleTimeoutMs: 50,
      });

      expect(result).toBe("disconnected");
    });

    it("returns disconnected (not retryable) on a mid-stream read error", async () => {
      const body = new ReadableStream({
        pull() {
          throw new Error("network error: connection reset");
        },
      });

      const result = await readSSEStream(body, () => "continue");

      expect(result).toBe("disconnected");
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

    // kubernaut-console#93 (F-15): the buffer had no maximum size -- a
    // non-terminating upstream could grow it unboundedly for the life of
    // the connection (client-side resource-exhaustion / SC-5).
    describe("buffer size cap (kubernaut-console#93)", () => {
      it("UT-CONSOLE-SSE-009: many small well-formed frames whose cumulative total exceeds maxBufferBytes do not trigger a false-positive overflow (each is drained immediately)", async () => {
        const frames: Record<string, unknown>[] = [];
        // 50 frames of ~12 bytes each = ~600 bytes total, but a tiny 20-byte
        // cap -- each frame is fully drained (has its own "\n\n") before the
        // next arrives, so the *leftover* buffer never exceeds the cap even
        // though the *cumulative* total sent over the stream's life does.
        const chunks = Array.from({ length: 50 }, (_, i) => `data: {"i":${i}}\n\n`);
        const body = makeStream(chunks);

        const result = await readSSEStream(
          body,
          (parsed) => {
            frames.push(parsed);
            return "continue";
          },
          { maxBufferBytes: 20 },
        );

        expect(result).toBe("complete");
        expect(frames).toHaveLength(50);
      });

      it("UT-CONSOLE-SSE-010: a stream that never sends a frame terminator and exceeds maxBufferBytes returns buffer_overflow and stops reading", async () => {
        const frames: Record<string, unknown>[] = [];
        let pulls = 0;
        const cancel = vi.fn();
        const body = new ReadableStream<Uint8Array>({
          pull(controller) {
            pulls++;
            // Defensive hard stop so a not-yet-fixed implementation fails
            // fast (assertion below) instead of spinning indefinitely.
            if (pulls > 1000) {
              controller.close();
              return;
            }
            // Never emit "\n\n" -- each chunk just grows the undelimited buffer.
            controller.enqueue(new TextEncoder().encode("x".repeat(10)));
          },
          cancel,
        });

        const result = await readSSEStream(
          body,
          (parsed) => {
            frames.push(parsed);
            return "continue";
          },
          { maxBufferBytes: 20 },
        );

        expect(result).toBe("buffer_overflow");
        expect(frames).toHaveLength(0);
        // Cap of 20 bytes, 10 bytes/pull: overflow must be detected within
        // a handful of pulls, not continue indefinitely (the exact count
        // has a small implementation-defined margin from the stream's
        // internal read-ahead queuing).
        expect(pulls).toBeLessThanOrEqual(5);
        expect(cancel).toHaveBeenCalled();
      }, 10000);

      it("UT-CONSOLE-SSE-011: a buffer sitting exactly at the cap (not exceeding it) still completes normally", async () => {
        const frames: Record<string, unknown>[] = [];
        // Leftover after the drained frame is exactly 20 bytes of undelimited
        // padding -- at the cap, not over it, so this must not overflow.
        const body = makeStream(['data: {"ok":true}\n\n', "y".repeat(20)]);

        const result = await readSSEStream(
          body,
          (parsed) => {
            frames.push(parsed);
            return "continue";
          },
          { maxBufferBytes: 20 },
        );

        expect(result).toBe("complete");
        expect(frames).toEqual([{ ok: true }]);
      });

      it("UT-CONSOLE-SSE-012: the default maxBufferBytes (no option passed) still bounds an unterminated stream", async () => {
        const oversizedChunk = "x".repeat(DEFAULT_MAX_SSE_BUFFER_BYTES + 1);
        const body = new ReadableStream<Uint8Array>({
          pull(controller) {
            controller.enqueue(new TextEncoder().encode(oversizedChunk));
            controller.close();
          },
        });

        const result = await readSSEStream(body, () => "continue");

        expect(result).toBe("buffer_overflow");
      });
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
