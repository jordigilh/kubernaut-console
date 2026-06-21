export type SSEStreamResult = "complete" | "aborted" | "retryable";

export interface SSEReaderOptions {
  signal?: AbortSignal;
  idleTimeoutMs?: number;
}

/**
 * Reads an SSE stream from a response body, invoking a handler for each
 * parsed JSON payload from `data:` lines. The handler can return a result
 * to stop reading early ("complete", "retryable", "fatal", or "terminal").
 *
 * Returns "complete" when the stream ends normally, "aborted" if signal fires,
 * or "retryable" on idle timeout or network error.
 */
export async function readSSEStream(
  body: ReadableStream<Uint8Array>,
  onFrame: (parsed: Record<string, unknown>) => "continue" | "complete" | "retryable" | "fatal" | "terminal" | "not_found",
  options?: SSEReaderOptions,
): Promise<SSEStreamResult | "fatal" | "terminal" | "not_found"> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const idleTimeout = options?.idleTimeoutMs ?? 300_000;

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
        return "retryable";
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
    }
  } catch {
    if (options?.signal?.aborted) return "aborted";
    return "retryable";
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
