import { readSSEStream, postForSSE, type SSEFetchError } from "./sse-reader";

export type RRPhase =
  | "Pending" | "Processing" | "Analyzing" | "Investigating"
  | "AwaitingApproval" | "Executing" | "Verifying"
  | "Blocked" | "Completed" | "Failed" | "TimedOut" | "Cancelled" | "Skipped";

const TERMINAL_PHASES: Set<RRPhase> = new Set(["Completed", "Failed", "TimedOut", "Cancelled", "Skipped"]);

const RR_NOT_FOUND_CODE = -32001;

export class StatusStreamError extends Error {
  code: number;
  constructor(message: string, code: number) {
    super(message);
    this.code = code;
    this.name = "StatusStreamError";
  }
}

export interface StatusSubscribeOptions {
  onPhaseChange: (phase: RRPhase, metadata: Record<string, unknown>) => void;
  onError: (error: Error | StatusStreamError) => void;
  onTerminal?: (phase: RRPhase) => void;
  onNotFound?: () => void;
  onReconnecting?: (attempt: number) => void;
  onClosing?: (reason: string) => void;
  signal?: AbortSignal;
  maxRetries?: number;
  baseUrl?: string;
  token?: string;
  fetchFn?: typeof fetch;
  idleTimeoutMs?: number;
}

export interface StatusSubscribeRequest {
  jsonrpc: "2.0";
  id: string;
  method: "status/subscribe";
  params: { rr_id: string };
}

let requestCounter = 0;

export function buildStatusSubscribeRequest(rrId: string): StatusSubscribeRequest {
  return {
    jsonrpc: "2.0",
    id: `status-${++requestCounter}`,
    method: "status/subscribe",
    params: { rr_id: rrId },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type StreamResult = "complete" | "terminal" | "aborted" | "retryable" | "fatal";

async function attemptSubscription(
  rrId: string,
  options: StatusSubscribeOptions
): Promise<StreamResult> {
  const url = `${options.baseUrl || ""}/a2a/status`;
  const request = buildStatusSubscribeRequest(rrId);

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
    if (httpErr.status === 404) {
      options.onNotFound?.();
      return "terminal";
    }
    options.onError(new Error(`HTTP ${httpErr.status}: ${httpErr.statusText}`));
    return "fatal";
  }

  const response = fetchResult as Response;
  const streamResult = await readSSEStream(
    response.body!,
    (parsed) => {
      if (parsed.error) {
        const err = parsed.error as { code: number; message: string };
        if (err.code === RR_NOT_FOUND_CODE) {
          options.onNotFound?.();
          return "terminal";
        }
        options.onError(new StatusStreamError(err.message, err.code));
        return "fatal";
      }

      if (parsed.method === "status/closing" && parsed.params) {
        const params = parsed.params as { reason: string; reconnect: boolean };
        options.onClosing?.(params.reason);
        if (params.reconnect) return "retryable";
        return "complete";
      }

      if (parsed.method === "status/update" && parsed.params) {
        const params = parsed.params as { phase: RRPhase; final?: boolean; metadata: Record<string, unknown> };
        options.onPhaseChange(params.phase, params.metadata ?? {});

        if (params.final || TERMINAL_PHASES.has(params.phase)) {
          options.onTerminal?.(params.phase);
          return "terminal";
        }
      }

      return "continue";
    },
    { signal: options.signal, idleTimeoutMs: options.idleTimeoutMs ?? 45_000 },
  );

  return streamResult as StreamResult;
}

export async function subscribeRRStatus(rrId: string, options: StatusSubscribeOptions): Promise<void> {
  const maxRetries = options.maxRetries ?? 3;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (options.signal?.aborted) return;

    if (attempt > 0) {
      options.onReconnecting?.(attempt);
      const backoff = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
      await sleep(backoff);
      if (options.signal?.aborted) return;
    }

    const result = await attemptSubscription(rrId, options);

    if (result === "terminal" || result === "aborted" || result === "fatal") return;
    if (result === "complete") return;
  }

  options.onError(new Error("Connection lost after maximum retries"));
}
