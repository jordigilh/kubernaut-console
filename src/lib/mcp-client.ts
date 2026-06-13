export interface McpResult {
  result?: unknown;
  error?: { code: number; message: string };
}

let requestId = 0;

export async function callMcpTool(
  toolName: string,
  args: Record<string, string>
): Promise<McpResult> {
  requestId++;

  let response: Response;
  try {
    response = await fetch("/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: requestId,
        method: "tools/call",
        params: {
          name: toolName,
          arguments: args,
        },
      }),
    });
  } catch (err) {
    return { error: { code: -1, message: (err as Error).message } };
  }

  if (!response.ok) {
    return { error: { code: response.status, message: `HTTP ${response.status}: ${response.statusText}` } };
  }

  let body: { error?: { code: number; message: string }; result?: unknown };
  try {
    body = await response.json();
  } catch {
    return { error: { code: -1, message: "Invalid JSON response from MCP endpoint" } };
  }

  if (body.error) {
    return { error: body.error };
  }

  return { result: body.result };
}
