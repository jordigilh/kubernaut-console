export interface McpResult {
  result?: unknown;
  error?: { code: number; message: string };
}

const SESSION_HEADER = "Mcp-Session-Id";

let requestId = 0;
let sessionInitialized = false;
let initializingPromise: Promise<McpResult | null> | null = null;
let mcpSessionId: string | null = null;

export function _resetSession() {
  sessionInitialized = false;
  initializingPromise = null;
  requestId = 0;
  mcpSessionId = null;
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

function mcpHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream",
  };
  if (mcpSessionId) {
    headers[SESSION_HEADER] = mcpSessionId;
  }
  return headers;
}

async function sendMcpRequest(
  method: string,
  params?: Record<string, unknown>
): Promise<McpResult> {
  const id = nextId();

  let response: Response;
  try {
    response = await fetch("/mcp", {
      method: "POST",
      headers: mcpHeaders(),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id,
        method,
        ...(params ? { params } : {}),
      }),
    });
  } catch (err) {
    return { error: { code: -1, message: (err as Error).message } };
  }

  if (response.status === 404 && mcpSessionId) {
    // Session expired on the server — clear and signal re-init needed
    mcpSessionId = null;
    sessionInitialized = false;
    return { error: { code: 404, message: "MCP session expired" } };
  }

  if (!response.ok) {
    return { error: { code: response.status, message: `HTTP ${response.status}: ${response.statusText}` } };
  }

  // Capture session ID from initialize response
  const sid = response.headers.get(SESSION_HEADER);
  if (sid) {
    mcpSessionId = sid;
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

async function sendMcpNotification(method: string): Promise<McpResult> {
  let response: Response;
  try {
    response = await fetch("/mcp", {
      method: "POST",
      headers: mcpHeaders(),
      body: JSON.stringify({
        jsonrpc: "2.0",
        method,
      }),
    });
  } catch (err) {
    return { error: { code: -1, message: (err as Error).message } };
  }

  if (!response.ok) {
    return { error: { code: response.status, message: `HTTP ${response.status}: ${response.statusText}` } };
  }

  return { result: null };
}

async function ensureInitialized(): Promise<McpResult | null> {
  if (sessionInitialized) return null;

  if (initializingPromise) return initializingPromise;

  initializingPromise = (async () => {
    const initResult = await sendMcpRequest("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "kubernaut-console", version: "1.0.0" },
    });

    if (initResult.error) {
      initializingPromise = null;
      return initResult;
    }

    const notifyResult = await sendMcpNotification("notifications/initialized");
    if (notifyResult.error) {
      initializingPromise = null;
      return notifyResult;
    }

    sessionInitialized = true;
    initializingPromise = null;
    return null;
  })();

  return initializingPromise;
}

export async function callMcpTool(
  toolName: string,
  args: Record<string, string>
): Promise<McpResult> {
  const initError = await ensureInitialized();
  if (initError) return initError;

  const result = await sendMcpRequest("tools/call", {
    name: toolName,
    arguments: args,
  });

  // If session expired or server lost state, re-initialize and retry once
  if (
    result.error?.message?.includes("invalid during session initialization") ||
    result.error?.message === "MCP session expired"
  ) {
    sessionInitialized = false;
    mcpSessionId = null;
    const reInitError = await ensureInitialized();
    if (reInitError) return reInitError;
    return sendMcpRequest("tools/call", {
      name: toolName,
      arguments: args,
    });
  }

  return result;
}
