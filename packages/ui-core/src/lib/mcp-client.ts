import { isValidBackendIncarnation } from "./backend-contract";

export interface McpResult {
  result?: unknown;
  error?: { code: number; message: string };
  stale?: boolean;
}

// AF's checkRBAC (pkg/apifrontend/handler/mcp_bridge.go) prefixes every
// RBAC/authorization denial with this exact string — the only wire-level
// signal that distinguishes "not allowed" from other tool-call failures
// (validation errors, timeouts, etc.), which all share the same generic
// isError/-32000 shape. See kubernaut-console#57.
const PERMISSION_DENIED_PREFIX = "permission denied";
const STALE_MESSAGE = "MCP request belongs to an inactive console lifecycle";

export function isPermissionDeniedError(error: McpResult["error"] | undefined): boolean {
  return error?.message?.startsWith(PERMISSION_DENIED_PREFIX) ?? false;
}

export function isStaleMcpResult(result: McpResult): boolean {
  return result.stale === true;
}

export interface McpLifecycle {
  generation: number;
  isCurrent(): boolean;
}

export interface McpClientOptions {
  baseUrl?: string;
  getToken?: () => Promise<string>;
  fetchFn?: (url: string, init?: RequestInit) => Promise<Response>;
  lifecycle?: McpLifecycle;
  client?: McpClient;
  requireBackendIncarnation?: boolean;
  onBackendIncarnation?: (incarnation: string | null) => void;
}

function staleResult(): McpResult {
  return { stale: true, error: { code: -2, message: STALE_MESSAGE } };
}

function parseSSEResponse(text: string): unknown {
  const lines = text.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("data:")) {
      const jsonStr = trimmed.slice(5).trim();
      if (jsonStr) return JSON.parse(jsonStr);
    }
  }
  return JSON.parse(text);
}

interface RequestSignal {
  signal: AbortSignal;
  cleanup(): void;
}

export class McpClient {
  private requestId = 0;
  private sessionInitialized = false;
  private initializingPromise: Promise<McpResult | null> | null = null;
  private mcpSessionId: string | null = null;
  private backendIncarnation: string | undefined;
  private disposed = false;
  private readonly lifecycleAbort = new AbortController();

  constructor(private readonly options: McpClientOptions = {}) {}

  private isCurrent(): boolean {
    return !this.disposed && (this.options.lifecycle?.isCurrent() ?? true);
  }

  private nextId(): number {
    return ++this.requestId;
  }

  private makeRequestSignal(): RequestSignal {
    const controller = new AbortController();
    const abort = () => controller.abort();
    const timeout = setTimeout(abort, 30_000);
    this.lifecycleAbort.signal.addEventListener("abort", abort, { once: true });
    return {
      signal: controller.signal,
      cleanup: () => {
        clearTimeout(timeout);
        this.lifecycleAbort.signal.removeEventListener("abort", abort);
      },
    };
  }

  private async headers(): Promise<Record<string, string> | null> {
    if (!this.isCurrent()) return null;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.options.getToken) {
      try {
        const token = await this.options.getToken();
        if (!this.isCurrent()) return null;
        // ProxyAuthProvider deliberately returns an empty token. Never emit
        // an empty or browser-held bearer credential in that mode.
        if (token) headers.Authorization = `Bearer ${token}`;
      } catch {
        // The server-owned cookie path remains usable without a browser token.
      }
    }
    if (this.mcpSessionId) headers["Mcp-Session-Id"] = this.mcpSessionId;
    return headers;
  }

  private observeResponse(response: Response): boolean {
    if (!this.isCurrent()) return false;
    const incarnation = response.headers.get("x-kubernaut-backend-incarnation");
    if (this.options.requireBackendIncarnation && (!incarnation || !isValidBackendIncarnation(incarnation))) {
      this.options.onBackendIncarnation?.(null);
      return false;
    }
    if (incarnation && isValidBackendIncarnation(incarnation)) {
      if (this.backendIncarnation && this.backendIncarnation !== incarnation) {
        this.options.onBackendIncarnation?.(incarnation);
        return false;
      }
      this.backendIncarnation = incarnation;
      this.options.onBackendIncarnation?.(incarnation);
    }
    const sessionHeader = response.headers.get("mcp-session-id");
    if (sessionHeader) this.mcpSessionId = sessionHeader;
    return true;
  }

  private async sendMcpRequest(method: string, params?: Record<string, unknown>): Promise<McpResult> {
    if (!this.isCurrent()) return staleResult();
    const id = this.nextId();
    const headers = await this.headers();
    if (!headers || !this.isCurrent()) return staleResult();
    const requestSignal = this.makeRequestSignal();
    let response: Response;
    try {
      response = await (this.options.fetchFn ?? fetch)(`${this.options.baseUrl || ""}/mcp`, {
        method: "POST",
        headers,
        body: JSON.stringify({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) }),
        signal: requestSignal.signal,
      });
    } catch (err) {
      requestSignal.cleanup();
      if (!this.isCurrent()) return staleResult();
      return { error: { code: -1, message: (err as Error).message } };
    }
    requestSignal.cleanup();
    if (!this.isCurrent()) return staleResult();
    if (!this.observeResponse(response)) return staleResult();
    if (!response.ok) {
      return { error: { code: response.status, message: `HTTP ${response.status}: ${response.statusText}` } };
    }
    let text: string;
    try {
      text = await response.text();
    } catch (err) {
      if (!this.isCurrent()) return staleResult();
      return { error: { code: -1, message: (err as Error).message } };
    }
    if (!this.isCurrent()) return staleResult();
    let body: { error?: { code: number; message: string }; result?: unknown };
    try {
      body = parseSSEResponse(text) as typeof body;
    } catch {
      return { error: { code: -1, message: text ? `MCP response: ${text.slice(0, 200)}` : "Invalid JSON response from MCP endpoint" } };
    }
    if (body.error) return { error: body.error };
    if (body.result && typeof body.result === "object" && (body.result as Record<string, unknown>).isError) {
      const content = (body.result as { content?: Array<{ text?: string }> }).content;
      const msg = content?.map(c => c.text).filter(Boolean).join("; ") || "Tool call failed";
      return { error: { code: -32000, message: msg } };
    }
    return { result: body.result };
  }

  private async sendMcpNotification(method: string): Promise<McpResult> {
    if (!this.isCurrent()) return staleResult();
    const headers = await this.headers();
    if (!headers || !this.isCurrent()) return staleResult();
    const requestSignal = this.makeRequestSignal();
    let response: Response;
    try {
      response = await (this.options.fetchFn ?? fetch)(`${this.options.baseUrl || ""}/mcp`, {
        method: "POST",
        headers,
        body: JSON.stringify({ jsonrpc: "2.0", method }),
        signal: requestSignal.signal,
      });
    } catch (err) {
      requestSignal.cleanup();
      if (!this.isCurrent()) return staleResult();
      return { error: { code: -1, message: (err as Error).message } };
    }
    requestSignal.cleanup();
    if (!this.isCurrent()) return staleResult();
    if (!this.observeResponse(response)) return staleResult();
    if (!response.ok) {
      return { error: { code: response.status, message: `HTTP ${response.status}: ${response.statusText}` } };
    }
    return { result: null };
  }

  private async ensureInitialized(): Promise<McpResult | null> {
    if (!this.isCurrent()) return staleResult();
    if (this.sessionInitialized) return null;
    if (this.initializingPromise) return this.initializingPromise;
    this.initializingPromise = (async () => {
      const initResult = await this.sendMcpRequest("initialize", {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "kubernaut-console", version: "1.0.0" },
      });
      if (initResult.error || initResult.stale) {
        this.initializingPromise = null;
        return initResult;
      }
      const notifyResult = await this.sendMcpNotification("notifications/initialized");
      if (notifyResult.error || notifyResult.stale) {
        this.initializingPromise = null;
        return notifyResult;
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
      if (!this.isCurrent()) {
        this.initializingPromise = null;
        return staleResult();
      }
      this.sessionInitialized = true;
      this.initializingPromise = null;
      return null;
    })();
    return this.initializingPromise;
  }

  async callTool(toolName: string, args: Record<string, string>): Promise<McpResult> {
    const initError = await this.ensureInitialized();
    if (initError) return initError;
    const result = await this.sendMcpRequest("tools/call", { name: toolName, arguments: args });
    // An expired/invalid session is observable to the caller. Clear only this
    // lifecycle's local session; never reinitialize and replay the tool call.
    if (result.error?.message?.includes("invalid during session initialization") || result.error?.code === 404) {
      this.sessionInitialized = false;
      this.initializingPromise = null;
      this.mcpSessionId = null;
    }
    return result;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.lifecycleAbort.abort();
    this.sessionInitialized = false;
    this.initializingPromise = null;
    this.mcpSessionId = null;
    this.backendIncarnation = undefined;
  }
}

/**
 * Compatibility entry point for callers that do not need a persistent MCP
 * session. Production chat code passes an explicit client in options; this
 * function never creates or mutates module-global session state.
 */
export function callMcpTool(
  toolName: string,
  args: Record<string, string>,
  options: McpClientOptions = {},
): Promise<McpResult> {
  return (options.client ?? new McpClient(options)).callTool(toolName, args);
}

/** @deprecated module-global reset is intentionally gone; dispose the client instance instead. */
export function _resetSession(): void {
  // Kept as a source-compatible no-op for older test harnesses. There is no
  // shared session to reset.
}
