import type { McpClientOptions, McpResult } from "./mcp-client";
import { parseScopedMcpResponse } from "./mcp-wire";

type TransportOptions = Pick<McpClientOptions, "baseUrl"> & {
  fetchFn?: typeof fetch;
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
        if (typeof token !== "string" || !token.trim()) {
          return authUnavailable();
        }
        headers.Authorization = `Bearer ${token}`;
      } catch {
        const tokenFence = fenceError(epoch);
        if (tokenFence) return tokenFence;
        return authUnavailable();
      }
    }
    const dispatchFence = fenceError(epoch);
    if (dispatchFence) return dispatchFence;
    const sentSession = sessionId;
    if (capture) capture.sessionAtDispatch = sentSession;
    if (sentSession) headers["Mcp-Session-Id"] = sentSession;

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
      let result: McpResult = { result: null };
      if (!notification) {
        const text = await whileActive(response.text());
        if (text === STOPPED) return invalidated();
        const bodyFence = fenceError(epoch);
        if (bodyFence) return bodyFence;
        result = parseScopedMcpResponse(text, id!);
        if (result.error) return result;
      }
      // An older concurrent response cannot overwrite a newer session header.
      const nextSession = response.headers.get("mcp-session-id");
      if (nextSession && sessionId === sentSession) sessionId = nextSession;
      return result;
    } catch (error) {
      const failureFence = fenceError(epoch);
      if (failureFence) return failureFence;
      return { error: { code: -1, message: error instanceof Error ? error.message : "MCP transport failed" } };
    }
  }

  function ensureInitialized(): Promise<McpResult | null> {
    if (!active) return Promise.resolve(invalidated());
    if (initialized) return Promise.resolve(null);
    if (initializing) return initializing;
    // Publish the promise before injected functions can synchronously reenter.
    const work = Promise.resolve().then(async () => {
      const init = await send("initialize", {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "kubernaut-console", version: "1.0.0" },
      });
      if (!active) return invalidated();
      if (init.error) { sessionId = undefined; return init; }
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
      if (sessionId === capture.sessionAtDispatch && isExpiredSession(result.error)) {
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
