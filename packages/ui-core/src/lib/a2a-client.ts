import type { A2AEvent, JsonRpcRequest, JsonRpcResponse } from "./a2a-types";
import { readSSEStream, postForSSE, type SSEFetchError } from "./sse-reader";

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

  const fetchResult = await postForSSE(url, request, {
    signal: options.signal,
    token: options.token,
    fetchFn: options.fetchFn,
  });

  if (typeof fetchResult === "string") {
    return fetchResult;
  }
  if ("kind" in fetchResult && fetchResult.kind === "fatal") {
    options.onError(new Error(`HTTP ${fetchResult.status}: ${fetchResult.statusText}`));
    return "fatal";
  }

  const response = fetchResult;
  const streamResult = await readSSEStream(
    response.body!,
    (parsed) => {
      const rpc = parsed as unknown as JsonRpcResponse;
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
      return "continue";
    },
    { signal: options.signal, idleTimeoutMs: options.idleTimeoutMs ?? 300_000 },
  );

  return streamResult as StreamResult;
}
