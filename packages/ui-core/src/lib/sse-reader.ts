export type SSEStreamResult = "complete" | "aborted" | "retryable" | "disconnected" | "buffer_overflow";

export interface SSEReaderOptions {
  signal?: AbortSignal;
  idleTimeoutMs?: number;
  /**
   * Maximum size (in JS string UTF-16 code units, an acceptable proxy for a
   * memory bound -- not exact wire bytes) the undelimited frame buffer may
   * reach before the stream is treated as failed. Guards against a
   * misbehaving/hostile upstream that never sends the `"\n\n"` frame
   * terminator, which would otherwise grow `buffer` unboundedly for the
   * life of the connection (kubernaut-console#93, FedRAMP SC-5).
   */
  maxBufferBytes?: number;
}

/** 1 MiB. Generous for any real investigation_summary/status payload while
 * still bounding a non-terminating stream's memory growth. */
export const DEFAULT_MAX_SSE_BUFFER_BYTES = 1_048_576;

/**
 * Reads an SSE stream from a response body, invoking a handler for each
 * parsed JSON payload from `data:` lines. The handler can return a result
 * to stop reading early ("complete", "retryable", "fatal", or "terminal").
 *
 * Returns "complete" when the stream ends normally, "aborted" if signal
 * fires, "retryable" when the *server itself* signalled (via a parsed
 * frame, through `onFrame`'s own return value) that a resubmission is safe,
 * or "disconnected" on idle timeout / a read-time network error that this
 * reader detected on its own.
 *
 * "retryable" and "disconnected" are deliberately distinct (kubernaut#2096
 * follow-up spike, 2026-08-11): once `postForSSE` has handed back a live
 * response body, the server has already started executing this request.
 * "retryable" only ever comes from `onFrame` itself recognizing a
 * server-attested safe-to-resubmit signal (e.g. AF's own "task execution is
 * already in progress" reply) -- the server is asserting it's safe. A read
 * error or idle timeout detected *by this reader* carries no such
 * attestation: the caller has no idea whether the in-flight execution is
 * still running. Callers must not treat "disconnected" as "safe to silently
 * resubmit the same request" the way they safely can for "retryable" --
 * doing so risks starting a second, fully independent execution against the
 * same a2a context/session (confirmed by reading the vendored
 * a2a-go/ADK stack: neither keys any collision detection off contextId, only
 * off the per-call TaskID this client never sets, so a resubmission after a
 * genuine mid-stream drop is not deduplicated by the server at all).
 */
export async function readSSEStream(
  body: ReadableStream<Uint8Array>,
  onFrame: (parsed: Record<string, unknown>) => "continue" | "complete" | "retryable" | "fatal" | "terminal" | "not_found",
  options?: SSEReaderOptions,
): Promise<SSEStreamResult | "fatal" | "terminal" | "not_found" | "disconnected"> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const idleTimeout = options?.idleTimeoutMs ?? 300_000;
  const maxBufferBytes = options?.maxBufferBytes ?? DEFAULT_MAX_SSE_BUFFER_BYTES;

  try {
    while (true) {
      let timerId: ReturnType<typeof setTimeout> | undefined;
      const readPromise = reader.read();
      const timeoutPromise = new Promise<{ done: true; value: undefined; timedOut: true }>((resolve) => {
        timerId = setTimeout(() => resolve({ done: true, value: undefined, timedOut: true }), idleTimeout);
      });

      const result = await Promise.race([readPromise, timeoutPromise]);
      clearTimeout(timerId);

      if ("timedOut" in result) {
        reader.cancel();
        return "disconnected";
      }

      const { done, value } = result;
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      let idx: number;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);

        for (const line of frame.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const json = line.slice(5).trimStart();
          if (!json) continue;

          let parsed: Record<string, unknown>;
          try {
            parsed = JSON.parse(json);
          } catch {
            continue;
          }

          const action = onFrame(parsed);
          if (action !== "continue") return action;
        }
      }

      // Checked *after* draining every complete frame from this chunk, so a
      // burst of many well-formed frames never trips a false positive --
      // only a buffer that cannot be drained (no "\n\n" found yet) and keeps
      // growing is the actual unbounded-memory-growth failure mode.
      if (buffer.length > maxBufferBytes) {
        reader.cancel();
        return "buffer_overflow";
      }
    }
  } catch {
    if (options?.signal?.aborted) return "aborted";
    return "disconnected";
  }

  return "complete";
}

export interface SSEFetchError {
  kind: "fatal";
  status: number;
  statusText: string;
}

/**
 * Performs a POST request expecting an SSE response.
 * Returns the response if successful, or a stream result for error/retry cases.
 */
export async function postForSSE(
  url: string,
  body: unknown,
  options?: {
    signal?: AbortSignal;
    token?: string;
    fetchFn?: (url: string, init?: RequestInit) => Promise<Response>;
  },
): Promise<Response | "aborted" | "retryable" | SSEFetchError> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "text/event-stream",
  };
  if (options?.token) {
    headers["Authorization"] = `Bearer ${options.token}`;
  }

  const doFetch = options?.fetchFn ?? fetch;
  let response: Response;
  try {
    response = await doFetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: options?.signal,
    });
  } catch {
    if (options?.signal?.aborted) return "aborted";
    return "retryable";
  }

  if (response.status >= 500) return "retryable";
  if (!response.ok || !response.body) {
    return { kind: "fatal", status: response.status, statusText: response.statusText };
  }

  return response;
}
