import type { A2AEvent, JsonRpcRequest, JsonRpcResponse } from "./a2a-types";

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export interface StreamOptions {
  baseUrl?: string;
  token?: string;
  /** Custom fetch function (e.g. consoleFetch for OCP console plugins) */
  fetchFn?: FetchFn;
  onEvent: (event: A2AEvent) => void;
  onError: (error: Error) => void;
  onComplete: () => void;
  onConnectionLost?: () => void;
  onReconnecting?: (attempt: number) => void;
  signal?: AbortSignal;
  maxRetries?: number;
  idleTimeoutMs?: number;
  /** Delay before the first retry attempt (ms). Useful after aborting a previous stream to give the server time to detect the disconnect. Default: 500 */
  preRetryDelayMs?: number;
}

let requestCounter = 0;

export function buildStreamRequest(
  text: string,
  contextId?: string
): JsonRpcRequest {
  requestCounter++;
  return {
    jsonrpc: "2.0",
    id: `stream-${requestCounter}`,
    method: "message/stream",
    params: {
      message: {
        messageId: `msg-${requestCounter}`,
        ...(contextId ? { contextId } : {}),
        role: "user",
        parts: [{ kind: "text", text }],
      },
    },
  };
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function streamA2A(
  request: JsonRpcRequest,
  options: StreamOptions
): Promise<void> {
  const maxRetries = options.maxRetries ?? 3;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (options.signal?.aborted) return;

    if (attempt > 0) {
      options.onReconnecting?.(attempt);
      const backoff = attempt === 1
        ? (options.preRetryDelayMs ?? 500)
        : Math.min(1000 * Math.pow(2, attempt - 1), 8000);
      await sleep(backoff);
      if (options.signal?.aborted) return;
    }

    const result = await attemptStream(request, options);

    if (result === "complete") {
      options.onComplete();
      return;
    }
    if (result === "aborted") return;
    if (result === "fatal") {
      return;
    }
    // result === "retryable" — loop continues
    options.onConnectionLost?.();
  }

  options.onError(new Error("Connection lost after maximum retries"));
}

type StreamResult = "complete" | "aborted" | "fatal" | "retryable";

async function attemptStream(
  request: JsonRpcRequest,
  options: StreamOptions
): Promise<StreamResult> {
  const url = `${options.baseUrl || ""}/a2a/invoke`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "text/event-stream",
  };
  if (options.token) {
    headers["Authorization"] = `Bearer ${options.token}`;
  }

  const doFetch = options.fetchFn ?? fetch;
  let response: Response;
  try {
    response = await doFetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(request),
      signal: options.signal,
    });
  } catch {
    if (options.signal?.aborted) return "aborted";
    return "retryable";
  }

  if (!response.ok) {
    if (response.status >= 500) return "retryable";
    options.onError(new Error(`HTTP ${response.status}: ${response.statusText}`));
    return "fatal";
  }

  if (!response.body) {
    options.onError(new Error("Response body is null"));
    return "fatal";
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const idleTimeout = options.idleTimeoutMs ?? 300_000; // 5 min default

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
          if (line.startsWith("data:")) {
            const json = line.slice(5).trimStart();
            if (!json) continue;

            try {
              const rpc: JsonRpcResponse = JSON.parse(json);
              if (rpc.error) {
                const msg = rpc.error.message || "";
                const data = rpc.error.data as Record<string, unknown> | undefined;
                const detail = (data?.error as string) || "";
                const isTransient = /execution.*in progress|task.*in progress/i.test(msg + detail);
                if (isTransient) {
                  return "retryable";
                }
                options.onError(new Error(rpc.error.message));
                return "fatal";
              }
              if (rpc.result) {
                options.onEvent(rpc.result);
              }
            } catch {
              // Malformed JSON frame, skip
            }
          }
        }
      }
    }
  } catch {
    if (options.signal?.aborted) return "aborted";
    return "retryable";
  }

  return "complete";
}
