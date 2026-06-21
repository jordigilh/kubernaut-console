export interface McpResult {
  result?: unknown;
  error?: { code: number; message: string };
}

export interface McpClientOptions {
  baseUrl?: string;
  getToken?: () => Promise<string>;
}

let requestId = 0;
let sessionInitialized = false;
let initializingPromise: Promise<McpResult | null> | null = null;
let mcpSessionId: string | null = null;

export function _resetSession() {
  sessionInitialized = false;
  initializingPromise = null;
  mcpSessionId = null;
  requestId = 0;
}

function nextId(): number {
  return ++requestId;
}

function parseSSEResponse(text: string): unknown {
  const lines = text.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("data:")) {
      const jsonStr = trimmed.slice(5).trim();
      if (jsonStr) {
        return JSON.parse(jsonStr);
      }
    }
  }
  return JSON.parse(text);
}

async function sendMcpRequest(
  method: string,
  params?: Record<string, unknown>,
  options?: McpClientOptions
): Promise<McpResult> {
  const id = nextId();
  const url = `${options?.baseUrl || ""}/mcp`;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (mcpSessionId) {
    headers["Mcp-Session-Id"] = mcpSessionId;
  }
  if (options?.getToken) {
    try {
      headers["Authorization"] = `Bearer ${await options.getToken()}`;
    } catch { /* fall through without auth */ }
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id,
        method,
        ...(params ? { params } : {}),
      }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    return { error: { code: -1, message: (err as Error).message } };
  }

  if (!response.ok) {
    return { error: { code: response.status, message: `HTTP ${response.status}: ${response.statusText}` } };
  }

  const sessionHeader = response.headers.get("mcp-session-id");
  if (sessionHeader) {
    mcpSessionId = sessionHeader;
  }

  const text = await response.text();
  let body: { error?: { code: number; message: string }; result?: unknown };
  try {
    body = parseSSEResponse(text) as typeof body;
  } catch {
    return { error: { code: -1, message: text ? `MCP response: ${text.slice(0, 200)}` : "Invalid JSON response from MCP endpoint" } };
  }

  if (body.error) {
    return { error: body.error };
  }

  return { result: body.result };
}

async function sendMcpNotification(method: string, options?: McpClientOptions): Promise<McpResult> {
  const url = `${options?.baseUrl || ""}/mcp`;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (mcpSessionId) {
    headers["Mcp-Session-Id"] = mcpSessionId;
  }
  if (options?.getToken) {
    try {
      headers["Authorization"] = `Bearer ${await options.getToken()}`;
    } catch { /* fall through without auth */ }
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        method,
      }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    return { error: { code: -1, message: (err as Error).message } };
  }

  if (!response.ok) {
    return { error: { code: response.status, message: `HTTP ${response.status}: ${response.statusText}` } };
  }

  const sessionHeader = response.headers.get("mcp-session-id");
  if (sessionHeader) {
    mcpSessionId = sessionHeader;
  }

  return { result: null };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureInitialized(options?: McpClientOptions): Promise<McpResult | null> {
  if (sessionInitialized) return null;

  if (initializingPromise) return initializingPromise;

  initializingPromise = (async () => {
    const initResult = await sendMcpRequest("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "kubernaut-console", version: "1.0.0" },
    }, options);

    if (initResult.error) {
      initializingPromise = null;
      return initResult;
    }

    const notifyResult = await sendMcpNotification("notifications/initialized", options);
    if (notifyResult.error) {
      initializingPromise = null;
      return notifyResult;
    }

    await delay(300);

    sessionInitialized = true;
    initializingPromise = null;
    return null;
  })();

  return initializingPromise;
}

export async function callMcpTool(
  toolName: string,
  args: Record<string, string>,
  options?: McpClientOptions
): Promise<McpResult> {
  const initError = await ensureInitialized(options);
  if (initError) return initError;

  const result = await sendMcpRequest("tools/call", {
    name: toolName,
    arguments: args,
  }, options);

  const shouldRetry =
    result.error?.message?.includes("invalid during session initialization") ||
    result.error?.code === 404;

  if (shouldRetry) {
    sessionInitialized = false;
    initializingPromise = null;
    mcpSessionId = null;
    await delay(300);
    const reInitError = await ensureInitialized(options);
    if (reInitError) return reInitError;
    return sendMcpRequest("tools/call", {
      name: toolName,
      arguments: args,
    }, options);
  }

  return result;
}
