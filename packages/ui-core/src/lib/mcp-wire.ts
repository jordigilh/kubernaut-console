import type { McpResult } from "./mcp-client";

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

/** Shared legacy-compatible JSON-RPC/SSE decoding; does not own client state. */
export function parseMcpResponse(text: string): McpResult {
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

/** Decode JSON or SSE framing without deciding which response is authoritative. */
export function readScopedMessages(text: string): unknown[] {
  if (!/^(?:data:|event:|:)/m.test(text)) {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [parsed];
  }
  const messages: unknown[] = [];
  let data: string[] = [];
  const flush = () => {
    const payload = data.join("\n");
    if (payload.trim()) {
      const parsed = JSON.parse(payload);
      if (Array.isArray(parsed)) messages.push(...parsed);
      else messages.push(parsed);
    }
    data = [];
  };
  for (const line of text.split(/\r\n|\r|\n/)) {
    if (!line) flush();
    else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
  }
  flush();
  return messages;
}

export type ScopedMcpServerRequest = {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: unknown;
};

type ScopedMcpMessage =
  | { kind: "notification"; envelope: Record<string, unknown> }
  | { kind: "request"; envelope: ScopedMcpServerRequest }
  | { kind: "response"; envelope: Record<string, unknown> };

function isRpcId(value: unknown): value is string | number {
  return (typeof value === "string" && value.length > 0) || (typeof value === "number" && Number.isFinite(value));
}

/** Classify one validated JSON-RPC message from the scoped transport. */
export function parseScopedMcpMessage(message: unknown): ScopedMcpMessage | undefined {
  if (!message || typeof message !== "object" || Array.isArray(message)) return undefined;
  const envelope = message as Record<string, unknown>;
  if (envelope.jsonrpc !== "2.0") return undefined;

  const hasMethod = typeof envelope.method === "string" && envelope.method.length > 0;
  const hasId = Object.prototype.hasOwnProperty.call(envelope, "id");
  const hasResult = Object.prototype.hasOwnProperty.call(envelope, "result");
  const hasError = Object.prototype.hasOwnProperty.call(envelope, "error");

  if (hasMethod && !hasResult && !hasError) {
    if (!hasId) return { kind: "notification", envelope };
    if (!isRpcId(envelope.id)) return undefined;
    return { kind: "request", envelope: envelope as ScopedMcpServerRequest };
  }

  if (!hasId || hasMethod || hasResult === hasError || !isRpcId(envelope.id)) return undefined;
  if (hasError) {
    const error = envelope.error;
    if (!error || typeof error !== "object" || typeof (error as { code?: unknown }).code !== "number" ||
      typeof (error as { message?: unknown }).message !== "string") return undefined;
  }
  return { kind: "response", envelope };
}

/** The isolated client accepts only one correlated JSON-RPC response. */
export function parseScopedMcpResponse(text: string, expectedId: number): McpResult {
  const invalid = (): McpResult => ({ error: { code: -1, message: "Invalid or uncorrelated MCP response" } });
  try {
    let match: Record<string, unknown> | undefined;
    for (const message of readScopedMessages(text)) {
      const parsed = parseScopedMcpMessage(message);
      if (!parsed) return invalid();
      if (parsed.kind === "notification") continue;
      if (parsed.kind !== "response" || parsed.envelope.id !== expectedId || match) return invalid();
      match = parsed.envelope;
    }
    return match ? parseMcpResponse(JSON.stringify(match)) : invalid();
  } catch {
    return invalid();
  }
}
