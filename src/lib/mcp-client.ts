export interface McpResult {
  result?: unknown;
  error?: { code: number; message: string };
}

let requestId = 0;
let sessionInitialized = false;
let initializingPromise: Promise<McpResult | null> | null = null;

export function _resetSession() {
  sessionInitialized = false;
  initializingPromise = null;
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
  params?: Record<string, unknown>
): Promise<McpResult> {
  const id = nextId();

  let response: Response;
  try {
    response = await fetch("/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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

  if (!response.ok) {
    return { error: { code: response.status, message: `HTTP ${response.status}: ${response.statusText}` } };
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
      headers: { "Content-Type": "application/json" },
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

    // Per MCP spec, notifications/initialized is a JSON-RPC notification
    // (no id field). Backend returns 202 Accepted (async processing), so
    // we must wait briefly for the server to transition out of init state.
    const notifyResult = await sendMcpNotification("notifications/initialized");
    if (notifyResult.error) {
      initializingPromise = null;
      return notifyResult;
    }

    // Backend processes the notification asynchronously (202). Wait for
    // the state transition to complete before sending tools/call.
    await delay(300);

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

  // Retry once if the server is still transitioning from init state
  // (202 async processing may take longer than our initial delay)
  if (result.error?.message?.includes("invalid during session initialization")) {
    await delay(500);
    return sendMcpRequest("tools/call", {
      name: toolName,
      arguments: args,
    });
  }

  return result;
}
