import type { McpClientOptions, McpResult } from "./mcp-client";
import { parseMcpResponse, parseScopedMcpMessage, readScopedMessages, type ScopedMcpServerRequest } from "./mcp-wire";

type TransportOptions = Pick<McpClientOptions, "baseUrl"> & {
  fetchFn?: typeof fetch;
  onServerRequest?: (request: ScopedMcpServerRequest) => McpResult | Promise<McpResult>;
};

/** Explicit transport mechanics only; neither mode verifies a host identity. */
export type ScopedMcpClientOptions = TransportOptions & (
  | { authMode: "proxy"; getToken?: McpClientOptions["getToken"] }
  | { authMode: "bearer"; getToken: () => Promise<string> }
);

const STOPPED = Symbol("invalidated");
const invalidated = (): McpResult => ({ error: { code: -1, message: "MCP client invalidated" } });
const superseded = (): McpResult => ({ error: { code: -1, message: "MCP session superseded" } });
const authUnavailable = (): McpResult => ({ error: { code: -1, message: "MCP authorization unavailable" } });
const invalidScopedResponse = (): McpResult => ({ error: { code: -1, message: "Invalid or uncorrelated MCP response" } });
const MAX_SCOPED_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_SCOPED_SSE_EVENT_BYTES = 512 * 1024;
const SUPPORTED_PROTOCOL_VERSION = "2025-03-26";

type SessionCapture = { sessionAtDispatch: string | undefined };

function isExpiredSession(error: McpResult["error"]): boolean {
  return error?.code === 404 || error?.message.includes("invalid during session initialization") === true;
}

function isSameOriginProxyTarget(url: string): boolean {
  try {
    const location = globalThis.location;
    if (!location || (location.protocol !== "https:" && location.protocol !== "http:")) return false;
    const target = new URL(url, location.href);
    return target.protocol === location.protocol && target.origin === location.origin && !target.username && !target.password;
  } catch {
    return false;
  }
}

/**
 * Unwired source-only seam. An instance captures transport inputs, not identity.
 * Its host must choose the lifetime and fence its own callbacks. No tool is replayed.
 */
export function createScopedMcpClient(options: ScopedMcpClientOptions) {
  const baseUrl = options?.baseUrl || "";
  const url = `${baseUrl}/mcp`;
  const authMode = options?.authMode;
  // Proxy mode deliberately ignores the legacy provider's no-op getToken.
  const getToken = authMode === "bearer" ? options.getToken : undefined;
  const fetchFn = options?.fetchFn ?? globalThis.fetch.bind(globalThis);
  const onServerRequest = options?.onServerRequest;
  const validProxyTarget = authMode !== "proxy" || isSameOriginProxyTarget(url);
  const controller = new AbortController();
  let active = true;
  let requestId = 0;
  let sessionId: string | undefined;
  let initialized = false;
  let initializing: Promise<McpResult | null> | undefined;
  let sessionEpoch = 0;

  function transportError(): McpResult | undefined {
    if ((authMode !== "proxy" && authMode !== "bearer") || (authMode === "bearer" && typeof getToken !== "function")) {
      return authUnavailable();
    }
    if (!validProxyTarget) return { error: { code: -1, message: "MCP proxy requires a same-origin target" } };
    return undefined;
  }

  function clearSession() {
    sessionId = undefined;
    initialized = false;
    initializing = undefined;
  }

  // Invalidation always takes precedence over a superseded session.
  function fenceError(epoch: number): McpResult | undefined {
    if (!active) return invalidated();
    if (epoch !== sessionEpoch) return superseded();
    return undefined;
  }

  // Resolve promptly on invalidation even when an injected dependency ignores abort.
  // Remove the listener after each wait so a long-lived client does not retain it.
  function whileActive<T>(work: Promise<T>): Promise<T | typeof STOPPED> {
    if (!active) {
      void work.catch(() => undefined);
      return Promise.resolve(STOPPED);
    }
    return new Promise((resolve, reject) => {
      const cleanup = () => controller.signal.removeEventListener("abort", onAbort);
      const onAbort = () => { cleanup(); resolve(STOPPED); };
      controller.signal.addEventListener("abort", onAbort, { once: true });
      work.then(
        (value) => { cleanup(); resolve(value); },
        (error: unknown) => { cleanup(); reject(error); },
      );
    });
  }

  async function buildHeaders(epoch: number, sentSession: string | undefined): Promise<Record<string, string> | McpResult> {
    const initialFence = fenceError(epoch);
    if (initialFence) return initialFence;
    const configError = transportError();
    if (configError) return configError;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    };
    if (getToken) {
      try {
        const token = await whileActive(Promise.resolve(getToken()));
        if (token === STOPPED) return invalidated();
        const tokenFence = fenceError(epoch);
        if (tokenFence) return tokenFence;
        if (typeof token !== "string" || !token.trim()) return authUnavailable();
        headers.Authorization = `Bearer ${token}`;
      } catch {
        const tokenFence = fenceError(epoch);
        if (tokenFence) return tokenFence;
        return authUnavailable();
      }
    }
    const dispatchFence = fenceError(epoch);
    if (dispatchFence) return dispatchFence;
    if (sentSession) headers["Mcp-Session-Id"] = sentSession;
    return headers;
  }

  async function sendServerResponse(
    request: ScopedMcpServerRequest,
    result: McpResult,
    epoch: number,
  ): Promise<McpResult | undefined> {
    const sentSession = sessionId;
    const headers = await buildHeaders(epoch, sentSession);
    if (!("Content-Type" in headers)) return headers;
    const body = result.error
      ? { jsonrpc: "2.0", id: request.id, error: result.error }
      : { jsonrpc: "2.0", id: request.id, result: result.result === undefined ? {} : result.result };
    try {
      const response = await whileActive(fetchFn(url, {
        method: "POST",
        redirect: "error",
        credentials: authMode === "proxy" ? "same-origin" : "omit",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]),
      }));
      if (response === STOPPED) return invalidated();
      const responseFence = fenceError(epoch);
      if (responseFence) return responseFence;
      if (!response.ok) return { error: { code: response.status, message: `HTTP ${response.status}: ${response.statusText}` } };
      return undefined;
    } catch (error) {
      const failureFence = fenceError(epoch);
      if (failureFence) return failureFence;
      return { error: { code: -1, message: error instanceof Error ? error.message : "MCP response dispatch failed" } };
    }
  }

  async function consumeResponse(response: Response, expectedId: number, epoch: number): Promise<McpResult> {
    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_SCOPED_RESPONSE_BYTES) {
      return { error: { code: -1, message: "MCP response exceeds the configured size limit" } };
    }

    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    const isSse = contentType.includes("text/event-stream");
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    let totalBytes = 0;
    let buffer = "";
    let responseSeen = false;
    let pendingResponse: McpResult | undefined;

    type FrameOutcome = { kind: "response" | "failure"; value: McpResult };

    const consumeMessages = async (messages: unknown[]): Promise<FrameOutcome | undefined> => {
      let outcome: FrameOutcome | undefined;
      for (const message of messages) {
        const parsed = parseScopedMcpMessage(message);
        if (!parsed) return { kind: "failure", value: invalidScopedResponse() };
        if (parsed.kind === "notification") continue;
        if (parsed.kind === "request") {
          const requestFence = fenceError(epoch);
          if (requestFence) return { kind: "failure", value: requestFence };
          let requestResult: McpResult;
          try {
            requestResult = parsed.envelope.method === "ping"
              ? { result: {} }
              : onServerRequest
                ? await onServerRequest(parsed.envelope)
                : { error: { code: -32601, message: `Unsupported MCP server request: ${parsed.envelope.method}` } };
          } catch (error) {
            requestResult = { error: { code: -32603, message: error instanceof Error ? error.message : "MCP server request failed" } };
          }
          const dispatchError = await sendServerResponse(parsed.envelope, requestResult, epoch);
          if (dispatchError) return { kind: "failure", value: dispatchError };
          continue;
        }
        if (responseSeen) return { kind: "failure", value: invalidScopedResponse() };
        if (parsed.envelope.id !== expectedId) return { kind: "failure", value: invalidScopedResponse() };
        responseSeen = true;
        outcome = { kind: "response", value: parseMcpResponse(JSON.stringify(parsed.envelope)) };
      }
      return outcome;
    };

    const consumeCompleteBody = async (text: string): Promise<McpResult> => {
      const bodyFence = fenceError(epoch);
      if (bodyFence) return bodyFence;
      if (encoder.encode(text).byteLength > MAX_SCOPED_RESPONSE_BYTES) {
        return { error: { code: -1, message: "MCP response exceeds the configured size limit" } };
      }
      try {
        const outcome = await consumeMessages(readScopedMessages(text));
        return outcome?.kind === "response" ? outcome.value : invalidScopedResponse();
      } catch {
        return invalidScopedResponse();
      }
    };

    const reader = response.body?.getReader();
    if (!reader) {
      const text = await whileActive(response.text());
      if (text === STOPPED) return invalidated();
      return consumeCompleteBody(text);
    }

    const parseEvent = (frame: string): unknown[] | undefined => {
      const data: string[] = [];
      for (const line of frame.split(/\r\n|\r|\n/)) {
        if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
      }
      const payload = data.join("\n");
      if (!payload.trim()) return [];
      try {
        const parsed = JSON.parse(payload);
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        return undefined;
      }
    };

    const delimiter = (): { index: number; length: number } | undefined => {
      const match = buffer.match(/\r\n\r\n|\n\n|\r\r/);
      return match && match.index !== undefined ? { index: match.index, length: match[0].length } : undefined;
    };

    const consumeFrame = async (frame: string): Promise<FrameOutcome | undefined> => {
      if (encoder.encode(frame).byteLength > MAX_SCOPED_SSE_EVENT_BYTES) {
        return { kind: "failure", value: { error: { code: -1, message: "MCP SSE event exceeds the configured size limit" } } };
      }
      const messages = parseEvent(frame);
      if (!messages) return { kind: "failure", value: invalidScopedResponse() };
      return consumeMessages(messages);
    };

    try {
      while (true) {
        const next = await whileActive(reader.read());
        if (next === STOPPED) return invalidated();
        const { done, value } = next;
        if (value) {
          totalBytes += value.byteLength;
          if (totalBytes > MAX_SCOPED_RESPONSE_BYTES) {
            return { error: { code: -1, message: "MCP response exceeds the configured size limit" } };
          }
          buffer += decoder.decode(value, { stream: true });
        }

        if (isSse) {
          while (true) {
            const boundary = delimiter();
            if (!boundary) break;
            const frame = buffer.slice(0, boundary.index);
            buffer = buffer.slice(boundary.index + boundary.length);
            const outcome = await consumeFrame(frame);
            if (outcome?.kind === "failure") return outcome.value;
            if (outcome?.kind === "response") pendingResponse = outcome.value;
          }
          if (encoder.encode(buffer).byteLength > MAX_SCOPED_SSE_EVENT_BYTES) {
            return { error: { code: -1, message: "MCP SSE event exceeds the configured size limit" } };
          }
          if (pendingResponse) {
            await reader.cancel();
            return pendingResponse;
          }
        } else if (encoder.encode(buffer).byteLength > MAX_SCOPED_RESPONSE_BYTES) {
          return { error: { code: -1, message: "MCP response exceeds the configured size limit" } };
        }

        if (done) {
          buffer += decoder.decode();
          if (isSse) {
            if (buffer.trim()) {
              const outcome = await consumeFrame(buffer);
              if (outcome?.kind === "failure") return outcome.value;
              if (outcome?.kind === "response") return outcome.value;
            }
            return invalidScopedResponse();
          }
          const body = buffer;
          return consumeCompleteBody(body);
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async function send(
    method: string,
    params?: Record<string, unknown>,
    epoch = sessionEpoch,
    capture?: SessionCapture,
  ): Promise<McpResult> {
    const initialFence = fenceError(epoch);
    if (initialFence) return initialFence;
    const configError = transportError();
    if (configError) return configError;
    const notification = method === "notifications/initialized";
    const id = notification ? undefined : ++requestId;
    const sentSession = sessionId;
    if (capture) capture.sessionAtDispatch = sentSession;
    const headers = await buildHeaders(epoch, sentSession);
    if (!("Content-Type" in headers)) return headers;

    try {
      const response = await whileActive(fetchFn(url, {
        method: "POST",
        redirect: "error",
        credentials: authMode === "proxy" ? "same-origin" : "omit",
        headers,
        body: JSON.stringify({ jsonrpc: "2.0", ...(id !== undefined ? { id } : {}), method, ...(params ? { params } : {}) }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]),
      }));
      if (response === STOPPED) return invalidated();
      const responseFence = fenceError(epoch);
      if (responseFence) return responseFence;
      if (!response.ok) return { error: { code: response.status, message: `HTTP ${response.status}: ${response.statusText}` } };

      const nextSession = response.headers.get("mcp-session-id");
      if (notification) {
        if (nextSession && epoch === sessionEpoch && sessionId === sentSession) sessionId = nextSession;
        return { result: null };
      }
      const result = await consumeResponse(response, id!, epoch);
      if (result.error) return result;
      // Do not publish a session header until its correlated body has been
      // accepted. A concurrent old response may otherwise replace the
      // current session before its own body is fenced.
      if (nextSession && epoch === sessionEpoch && sessionId === sentSession) sessionId = nextSession;
      return result;
    } catch (error) {
      const failureFence = fenceError(epoch);
      if (failureFence) return failureFence;
      return { error: { code: -1, message: error instanceof Error ? error.message : "MCP transport failed" } };
    }
  }

  function isValidInitializeResult(result: unknown): boolean {
    if (!result || typeof result !== "object" || Array.isArray(result)) return false;
    const value = result as Record<string, unknown>;
    const serverInfo = value.serverInfo;
    return value.protocolVersion === SUPPORTED_PROTOCOL_VERSION
      && Boolean(value.capabilities && typeof value.capabilities === "object" && !Array.isArray(value.capabilities))
      && Boolean(serverInfo && typeof serverInfo === "object" && !Array.isArray(serverInfo)
        && typeof (serverInfo as Record<string, unknown>).name === "string"
        && typeof (serverInfo as Record<string, unknown>).version === "string");
  }

  function ensureInitialized(): Promise<McpResult | null> {
    if (!active) return Promise.resolve(invalidated());
    if (initialized) return Promise.resolve(null);
    if (initializing) return initializing;
    // Publish the promise before injected functions can synchronously reenter.
    const work = Promise.resolve().then(async () => {
      const init = await send("initialize", {
        protocolVersion: SUPPORTED_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "kubernaut-console", version: "1.0.0" },
      });
      if (!active) return invalidated();
      if (init.error) { sessionId = undefined; return init; }
      if (!isValidInitializeResult(init.result)) {
        sessionId = undefined;
        return { error: { code: -32602, message: "Invalid or unsupported MCP initialize result" } };
      }
      const notify = await send("notifications/initialized");
      if (!active) return invalidated();
      if (notify.error) { sessionId = undefined; return notify; }
      const wait = await whileActive(new Promise<void>((resolve) => setTimeout(resolve, 300)));
      if (wait === STOPPED || !active) return invalidated();
      initialized = true;
      return null;
    });
    initializing = work;
    void work.then(() => { if (initializing === work) initializing = undefined; });
    return work;
  }

  return {
    async call(name: string, args: Record<string, string>): Promise<McpResult> {
      const capturedArgs = { ...args };
      const epoch = sessionEpoch;
      const initError = await ensureInitialized();
      if (!active) return invalidated();
      if (initError) return initError;
      const initializationFence = fenceError(epoch);
      if (initializationFence) return initializationFence;
      const capture: SessionCapture = { sessionAtDispatch: undefined };
      const result = await send("tools/call", { name, arguments: capturedArgs }, epoch, capture);
      const resultFence = fenceError(epoch);
      if (resultFence) return resultFence;
      // Only an expiry from the session this request actually used may clear
      // the current session. Headers from concurrent requests are published
      // only after their correlated bodies have been accepted.
      if (epoch === sessionEpoch && sessionId === capture.sessionAtDispatch && isExpiredSession(result.error)) {
        // A later explicit call may initialize again. Never replay this action.
        sessionEpoch++;
        clearSession();
      }
      return result;
    },
    invalidate() {
      if (!active) return;
      active = false;
      clearSession();
      controller.abort();
    },
  };
}
