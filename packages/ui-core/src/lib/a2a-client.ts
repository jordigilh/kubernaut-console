import type { A2AEvent, JsonRpcRequest, JsonRpcResponse } from "./a2a-types";
import { readSSEStream, postForSSE, type SSEFetchError } from "./sse-reader";
import { isRecord } from "./type-guards";

// kubernaut-console#90 (F-12): every SSE frame was treated as a valid
// JsonRpcResponse via a bare type assertion. A frame that is valid JSON but
// has neither `.error` nor `.result` (a malformed envelope) previously fell
// through both checks below and silently returned "continue" forever --
// invisible to the caller, with the stream just hanging until idle timeout.
export function isJsonRpcResponse(data: unknown): data is JsonRpcResponse {
  if (!isRecord(data)) return false;
  if (data.jsonrpc !== "2.0") return false;
  return "error" in data || "result" in data;
}

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
  /**
   * Fired when the stream dropped *after* the server had already started
   * executing this request (a read-time network error or idle timeout, not
   * a server-attested "safe to retry" signal) -- see readSSEStream's
   * "disconnected" doc comment for the full mechanism (kubernaut#2096
   * follow-up, 2026-08-11). Unlike onConnectionLost, this is terminal for
   * the current stream attempt: the same request is deliberately NOT
   * resubmitted, since the server has no way to deduplicate it against the
   * still-possibly-running original (no collision detection is keyed off
   * contextId anywhere in the a2a-go/ADK stack, only off a per-call TaskID
   * this client never sets). Callers should tell the user the investigation
   * may still be running rather than silently starting a second one.
   */
  onStreamInterrupted?: () => void;
  signal?: AbortSignal;
  maxRetries?: number;
  idleTimeoutMs?: number;
  /** Delay before the first retry attempt (ms). Useful after aborting a previous stream to give the server time to detect the disconnect. Default: 500 */
  preRetryDelayMs?: number;
  /** See `SSEReaderOptions.maxBufferBytes` (kubernaut-console#93). Default: 1 MiB. */
  maxBufferBytes?: number;
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
    if (result === "disconnected") {
      options.onStreamInterrupted?.();
      return;
    }
    if (result === "buffer_overflow") {
      // kubernaut-console#93 (F-15): a non-terminating/oversized SSE
      // response is not transient -- retrying would just repeat the same
      // failure against a broken or hostile upstream, so this fails
      // immediately instead of falling through to the retry loop.
      options.onError(new Error("Received an oversized response from the server; connection terminated."));
      return;
    }
    options.onConnectionLost?.();
  }

  options.onError(new Error("Connection lost after maximum retries"));
}

type StreamResult = "complete" | "aborted" | "fatal" | "retryable" | "disconnected" | "buffer_overflow";

async function attemptStream(
  request: JsonRpcRequest,
  options: StreamOptions
): Promise<StreamResult> {
  const url = `${options.baseUrl || ""}/a2a/invoke`;

  const fetchResult = await postForSSE(url, request, {
    signal: options.signal,
    token: options.token,
    fetchFn: options.fetchFn,
  });

  if (typeof fetchResult === "string") {
    return fetchResult;
  }
  if ("kind" in fetchResult && (fetchResult as SSEFetchError).kind === "fatal") {
    const httpErr = fetchResult as SSEFetchError;
    options.onError(new Error(`HTTP ${httpErr.status}: ${httpErr.statusText}`));
    return "fatal";
  }

  const response = fetchResult as Response;
  const streamResult = await readSSEStream(
    response.body!,
    (parsed) => {
      if (!isJsonRpcResponse(parsed)) {
        console.error("[a2a] SSE frame failed JSON-RPC envelope validation (neither error nor result)", parsed);
        options.onError(new Error("Received a malformed response from the server."));
        return "fatal";
      }
      const rpc = parsed;
      if (rpc.error) {
        const msg = rpc.error.message || "";
        const data = (rpc.error as Record<string, unknown>).data as Record<string, unknown> | undefined;
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
      return "continue";
    },
    { signal: options.signal, idleTimeoutMs: options.idleTimeoutMs ?? 300_000, maxBufferBytes: options.maxBufferBytes },
  );

  return streamResult as StreamResult;
}
