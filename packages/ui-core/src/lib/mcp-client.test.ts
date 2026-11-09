import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { McpClient, isPermissionDeniedError } from "./mcp-client";

function mockSuccessResponse(result: unknown = { content: [{ type: "text", text: "ok" }] }) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function mockFetchSuccess() {
  return vi.fn().mockImplementation(() => Promise.resolve(mockSuccessResponse()));
}

function mockResponseWithSessionHeader(sessionId: string, result: unknown = { content: [{ type: "text", text: "ok" }] }) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), {
    status: 200,
    headers: { "Content-Type": "application/json", "mcp-session-id": sessionId },
  });
}

describe("callMcpTool", () => {
  const originalFetch = globalThis.fetch;
  let client: McpClient;

  const callTool = (toolName: string, args: Record<string, string>) => client.callTool(toolName, args);

  beforeEach(() => {
    client = new McpClient();
    globalThis.fetch = mockFetchSuccess();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("Console #168: does not repeat a state-changing tool after a session error", async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(mockSuccessResponse())
      .mockResolvedValueOnce(mockSuccessResponse())
      .mockResolvedValueOnce(new Response("not found", { status: 404 }))
      .mockImplementation(() => Promise.resolve(mockSuccessResponse()));
    const result = await callTool("kubernaut_cancel", { rr_id: "rr-168" });
    const methods = vi.mocked(globalThis.fetch).mock.calls.map((call) => JSON.parse(call[1]?.body as string).method);
    expect(methods.filter((method) => method === "tools/call")).toHaveLength(1);
    expect(result.error?.code).toBe(404);
  });

  // SI-10: Structural separation — builds correct JSON-RPC payload
  it("UT-CONSOLE-MCP-001: sends initialize then tools/call on first invocation", async () => {
    await callTool("kubernaut_approve", { rar_name: "rar-test-001", decision: "Approved", reason: "Approved by admin" });

    const calls = vi.mocked(globalThis.fetch).mock.calls;
    expect(calls.length).toBe(3);

    const initBody = JSON.parse(calls[0][1]?.body as string);
    expect(initBody.method).toBe("initialize");
    expect(initBody.params.protocolVersion).toBe("2025-03-26");
    expect(initBody.id).toBeDefined();

    const notifyBody = JSON.parse(calls[1][1]?.body as string);
    expect(notifyBody.method).toBe("notifications/initialized");
    expect(notifyBody.id).toBeUndefined();

    const toolBody = JSON.parse(calls[2][1]?.body as string);
    expect(toolBody.method).toBe("tools/call");
    expect(toolBody.params).toEqual({
      name: "kubernaut_approve",
      arguments: { rar_name: "rar-test-001", decision: "Approved", reason: "Approved by admin" },
    });
  });

  // AC-12 / ASVS V7.2.1: cancellation uses the backend interactive-session
  // contract rather than only aborting the browser-side stream.
  it("UT-CONSOLE-MCP-026: sends the interactive cancellation action with the RR ID", async () => {
    await callTool("kubernaut_cancel", { rr_id: "rr-cancel-026" });

    const calls = vi.mocked(globalThis.fetch).mock.calls;
    const toolBody = JSON.parse(calls[2][1]?.body as string);
    expect(toolBody.params).toEqual({
      name: "kubernaut_cancel",
      arguments: { rr_id: "rr-cancel-026" },
    });
  });

  // SI-10: No silent pass-through on HTTP failure
  it("UT-CONSOLE-MCP-002: returns error on HTTP failure", async () => {
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response("Internal Server Error", { status: 500, statusText: "Internal Server Error" }))
    );

    const result = await callTool("kubernaut_approve", { rar_name: "rar-test", decision: "Approved", reason: "test" });

    expect(result.error).toBeDefined();
    expect(result.error!.message).toContain("500");
    expect(result.result).toBeUndefined();
  });

  it.each([401, 403])("IT-CONSOLE-168-032: fences an active HTTP %s MCP auth rejection without replay", async (status) => {
    const onAuthenticationRequired = vi.fn();
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(mockSuccessResponse())
      .mockResolvedValueOnce(mockSuccessResponse())
      .mockResolvedValueOnce(new Response("rejected", { status, statusText: status === 401 ? "Unauthorized" : "Forbidden" }))
      .mockResolvedValueOnce(mockSuccessResponse());
    client = new McpClient({ onAuthenticationRequired });

    const result = await callTool("kubernaut_complete_no_action", { rr_id: "rr-168", reason: "dismiss" });

    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(3);
    expect(onAuthenticationRequired).toHaveBeenCalledOnce();
    expect(result.authenticationRequired).toBe(true);
    expect(result.error?.code).toBe(status);
  });

  it("IT-CONSOLE-168-033: fences an equivalent MCP authentication rejection", async () => {
    const onAuthenticationRequired = vi.fn();
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(mockSuccessResponse())
      .mockResolvedValueOnce(mockSuccessResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        error: { code: -32002, message: "access_denied" },
      }), { status: 200 }));
    client = new McpClient({ onAuthenticationRequired });

    const result = await callTool("kubernaut_complete_no_action", { rr_id: "rr-168", reason: "dismiss" });

    expect(onAuthenticationRequired).toHaveBeenCalledOnce();
    expect(result.authenticationRequired).toBe(true);
  });

  // SI-10: No silent pass-through on JSON-RPC error
  it("UT-CONSOLE-MCP-003: returns error on JSON-RPC error response", async () => {
    // First two calls succeed (initialize + notify), third fails with JSON-RPC error
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(mockSuccessResponse())
      .mockResolvedValueOnce(mockSuccessResponse())
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          jsonrpc: "2.0",
          id: 3,
          error: { code: -32603, message: "SAR check failed: user lacks remediation-approver role" },
        }), { status: 200, headers: { "Content-Type": "application/json" } })
      );

    const result = await callTool("kubernaut_approve", { rar_name: "rar-test", decision: "Approved", reason: "test" });

    expect(result.error).toEqual({ code: -32603, message: "SAR check failed: user lacks remediation-approver role" });
    expect(result.result).toBeUndefined();
  });

  // AC-6: Successful approval returns result
  it("UT-CONSOLE-MCP-004: returns result on successful MCP call", async () => {
    const mcpResult = { content: [{ type: "text", text: "RAR rar-test approved successfully" }] };
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(mockSuccessResponse())
      .mockResolvedValueOnce(mockSuccessResponse())
      .mockResolvedValueOnce(mockSuccessResponse(mcpResult));

    const result = await callTool("kubernaut_approve", { rar_name: "rar-test", decision: "Approved", reason: "test" });

    expect(result.result).toEqual(mcpResult);
    expect(result.error).toBeUndefined();
  });

  // SI-10: Network error handled
  it("UT-CONSOLE-MCP-005: returns error on network failure", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

    const result = await callTool("kubernaut_approve", { rar_name: "rar-test", decision: "Approved", reason: "test" });

    expect(result.error).toBeDefined();
    expect(result.error!.message).toContain("Failed to fetch");
  });

  it("UT-CONSOLE-MCP-006: skips initialization on subsequent calls", async () => {
    await callTool("kubernaut_approve", { rar_name: "rar-1", decision: "Approved", reason: "first" });
    globalThis.fetch = mockFetchSuccess();

    await callTool("kubernaut_approve", { rar_name: "rar-2", decision: "Approved", reason: "second" });

    const calls = vi.mocked(globalThis.fetch).mock.calls;
    expect(calls.length).toBe(1);
    const body = JSON.parse(calls[0][1]?.body as string);
    expect(body.method).toBe("tools/call");
  });

  it("UT-CONSOLE-MCP-007: parses SSE response format", async () => {
    const sseResponse = `event: message\ndata: {"jsonrpc":"2.0","id":3,"result":{"content":[{"type":"text","text":"done"}]}}`;
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(mockSuccessResponse())
      .mockResolvedValueOnce(mockSuccessResponse())
      .mockResolvedValueOnce(new Response(sseResponse, { status: 200 }));

    const result = await callTool("kubernaut_complete_no_action", { rr_id: "rr-123", reason: "test" });

    expect(result.result).toEqual({ content: [{ type: "text", text: "done" }] });
  });

  it("UT-CONSOLE-MCP-008: does not replay a tool when backend reports an expired session", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    // First call succeeds (establishes session)
    await callTool("kubernaut_approve", { rar_name: "rar-1", decision: "Approved", reason: "first" });

    // Second call: backend session expired — tools/call returns init error
    const expiredError = JSON.stringify({
      jsonrpc: "2.0",
      id: 4,
      error: { code: -32600, message: "method \"tools/call\" is invalid during session initialization" },
    });

    globalThis.fetch = vi.fn()
      // 1st: tools/call fails (session expired)
      .mockResolvedValueOnce(new Response(expiredError, { status: 200 }))
      // 2nd: re-initialize succeeds
      .mockResolvedValueOnce(mockSuccessResponse())
      // 3rd: notifications/initialized succeeds
      .mockResolvedValueOnce(new Response("", { status: 202 }))
      // 4th: retry tools/call succeeds
      .mockResolvedValueOnce(mockSuccessResponse({ content: [{ type: "text", text: "recovered" }] }));

    const result = await callTool("kubernaut_approve", { rar_name: "rar-2", decision: "Approved", reason: "retry" });

    expect(result.error?.message).toContain("invalid during session initialization");

    const calls = vi.mocked(globalThis.fetch).mock.calls;
    expect(calls.length).toBe(1);
    expect(JSON.parse(calls[0][1]?.body as string).method).toBe("tools/call");

    vi.useRealTimers();
  });

  // SI-10: Tool-level error (result.isError = true) must be detected
  it("UT-CONSOLE-MCP-009 [SI-10]: returns error when result.isError is true", async () => {
    const toolErrorResult = {
      isError: true,
      content: [{ type: "text", text: "RR timed out" }],
    };
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(mockSuccessResponse())
      .mockResolvedValueOnce(mockSuccessResponse())
      .mockResolvedValueOnce(mockSuccessResponse(toolErrorResult));

    const result = await callTool("kubernaut_complete_no_action", { rr_id: "rr-timed-out", reason: "dismiss" });

    expect(result.error).toEqual({ code: -32000, message: "RR timed out" });
    expect(result.result).toBeUndefined();
  });

  // SI-10: Error text extracted from multiple content entries
  it("UT-CONSOLE-MCP-010 [SI-10]: extracts error text from result.content array", async () => {
    const toolErrorResult = {
      isError: true,
      content: [
        { type: "text", text: "err1" },
        { type: "text", text: "err2" },
      ],
    };
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(mockSuccessResponse())
      .mockResolvedValueOnce(mockSuccessResponse())
      .mockResolvedValueOnce(mockSuccessResponse(toolErrorResult));

    const result = await callTool("kubernaut_complete_no_action", { rr_id: "rr-timed-out", reason: "dismiss" });

    expect(result.error).toEqual({ code: -32000, message: "err1; err2" });
    expect(result.result).toBeUndefined();
  });

  // SI-10: result without isError is still treated as success
  it("UT-CONSOLE-MCP-011 [SI-10]: returns success when result.isError is absent", async () => {
    const successResult = { content: [{ type: "text", text: "success" }] };
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(mockSuccessResponse())
      .mockResolvedValueOnce(mockSuccessResponse())
      .mockResolvedValueOnce(mockSuccessResponse(successResult));

    const result = await callTool("kubernaut_complete_no_action", { rr_id: "rr-ok", reason: "dismiss" });

    expect(result.result).toEqual(successResult);
    expect(result.error).toBeUndefined();
  });

  // kubernaut-console#96 (F-07): session-id/getToken/malformed-response
  // branches in mcp-client.ts had zero test coverage despite being real
  // SI-10-relevant error/edge paths in the module that parses all
  // server-originated MCP data.
  it("UT-CONSOLE-MCP-015: reuses mcp-session-id header once the server assigns one", async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(mockResponseWithSessionHeader("sess-abc"))
      .mockResolvedValueOnce(mockSuccessResponse())
      .mockResolvedValueOnce(mockSuccessResponse());

    await callTool("kubernaut_approve", { rar_name: "rar-1", decision: "Approved", reason: "test" });

    const calls = vi.mocked(globalThis.fetch).mock.calls;
    expect(calls.length).toBe(3);
    // initialize's own request (1st call) precedes the server assigning the
    // header, so it must not carry one yet.
    expect((calls[0][1]?.headers as Record<string, string>)["Mcp-Session-Id"]).toBeUndefined();
    // notifications/initialized (2nd) and tools/call (3rd) both fire after
    // initialize's response assigned the session id.
    expect((calls[1][1]?.headers as Record<string, string>)["Mcp-Session-Id"]).toBe("sess-abc");
    expect((calls[2][1]?.headers as Record<string, string>)["Mcp-Session-Id"]).toBe("sess-abc");
  });

  it("UT-CONSOLE-MCP-016: passes Authorization header from options.getToken on every request", async () => {
    globalThis.fetch = mockFetchSuccess();
    const getToken = vi.fn().mockResolvedValue("my-jwt");
    client = new McpClient({ getToken });

    await callTool("kubernaut_approve", { rar_name: "rar-1", decision: "Approved", reason: "test" });

    const calls = vi.mocked(globalThis.fetch).mock.calls;
    expect(calls.length).toBe(3);
    for (const call of calls) {
      expect((call[1]?.headers as Record<string, string>)["Authorization"]).toBe("Bearer my-jwt");
    }
  });

  it("UT-CONSOLE-MCP-017: returns a truncated-snippet error when the response body is non-JSON, non-empty text", async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(mockSuccessResponse())
      .mockResolvedValueOnce(mockSuccessResponse())
      .mockResolvedValueOnce(new Response("<html>Gateway Timeout</html>", { status: 200 }));

    const result = await callTool("kubernaut_approve", { rar_name: "rar-1", decision: "Approved", reason: "test" });

    expect(result.error).toBeDefined();
    expect(result.error!.message).toContain("MCP response:");
    expect(result.error!.message).toContain("<html>Gateway Timeout</html>");
    expect(result.result).toBeUndefined();
  });

  it("UT-CONSOLE-MCP-018: returns a generic error when the response body is empty", async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(mockSuccessResponse())
      .mockResolvedValueOnce(mockSuccessResponse())
      .mockResolvedValueOnce(new Response("", { status: 200 }));

    const result = await callTool("kubernaut_approve", { rar_name: "rar-1", decision: "Approved", reason: "test" });

    expect(result.error).toEqual({ code: -1, message: "Invalid JSON response from MCP endpoint" });
  });

  it("UT-CONSOLE-MCP-019: parses the first non-empty data: line, skipping an earlier empty one", async () => {
    const sseWithEmptyFirstLine = 'data: \ndata: {"jsonrpc":"2.0","id":3,"result":{"content":[{"type":"text","text":"done"}]}}\n';
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(mockSuccessResponse())
      .mockResolvedValueOnce(mockSuccessResponse())
      .mockResolvedValueOnce(new Response(sseWithEmptyFirstLine, { status: 200 }));

    const result = await callTool("kubernaut_approve", { rar_name: "rar-1", decision: "Approved", reason: "test" });

    expect(result.error).toBeUndefined();
    expect(result.result).toEqual({ content: [{ type: "text", text: "done" }] });
  });

  it("UT-CONSOLE-MCP-020: falls back to a generic message when isError is true with no content field", async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(mockSuccessResponse())
      .mockResolvedValueOnce(mockSuccessResponse())
      .mockResolvedValueOnce(mockSuccessResponse({ isError: true }));

    const result = await callTool("kubernaut_complete_no_action", { rr_id: "rr-1", reason: "dismiss" });

    expect(result.error).toEqual({ code: -32000, message: "Tool call failed" });
  });

  it("UT-CONSOLE-MCP-021: propagates a network error from notifications/initialized and resets init state for retry", async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(mockSuccessResponse()) // initialize succeeds
      .mockRejectedValueOnce(new TypeError("Failed to fetch")); // notify throws

    const result = await callTool("kubernaut_approve", { rar_name: "rar-1", decision: "Approved", reason: "test" });

    expect(result.error).toBeDefined();
    expect(result.error!.message).toContain("Failed to fetch");

    // Init state was reset (not left "half-initialized") -- the next call
    // re-attempts the full initialize+notify handshake.
    globalThis.fetch = mockFetchSuccess();
    await callTool("kubernaut_approve", { rar_name: "rar-2", decision: "Approved", reason: "test" });
    expect(vi.mocked(globalThis.fetch).mock.calls.length).toBe(3);
  });

  it("UT-CONSOLE-MCP-022: propagates an HTTP error from notifications/initialized", async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(mockSuccessResponse()) // initialize succeeds
      .mockResolvedValueOnce(new Response("Internal Server Error", { status: 500, statusText: "Internal Server Error" })); // notify fails

    const result = await callTool("kubernaut_approve", { rar_name: "rar-1", decision: "Approved", reason: "test" });

    expect(result.error).toBeDefined();
    expect(result.error!.message).toContain("500");
  });

  it("UT-CONSOLE-MCP-023: captures mcp-session-id from notifications/initialized's response when initialize's response had none", async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(mockSuccessResponse()) // initialize: no session header
      .mockResolvedValueOnce(mockResponseWithSessionHeader("sess-from-notify")) // notify: sets it
      .mockResolvedValueOnce(mockSuccessResponse()); // tools/call

    await callTool("kubernaut_approve", { rar_name: "rar-1", decision: "Approved", reason: "test" });

    const calls = vi.mocked(globalThis.fetch).mock.calls;
    expect((calls[2][1]?.headers as Record<string, string>)["Mcp-Session-Id"]).toBe("sess-from-notify");
  });

  it("UT-CONSOLE-MCP-024: concurrent calls before initialization completes share a single init+notify round-trip", async () => {
    let resolveInit!: (r: Response) => void;
    globalThis.fetch = vi.fn()
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveInit = resolve; }))
      .mockResolvedValueOnce(mockSuccessResponse()) // notify
      .mockResolvedValueOnce(mockSuccessResponse({ content: [{ type: "text", text: "first" }] })) // tools/call #1
      .mockResolvedValueOnce(mockSuccessResponse({ content: [{ type: "text", text: "second" }] })); // tools/call #2

    const call1 = callTool("kubernaut_approve", { rar_name: "rar-1", decision: "Approved", reason: "one" });
    const call2 = callTool("kubernaut_approve", { rar_name: "rar-2", decision: "Approved", reason: "two" });

    // Let both callers reach ensureInitialized() and observe the in-flight promise.
    await Promise.resolve();
    await Promise.resolve();
    resolveInit(mockSuccessResponse());

    const [result1, result2] = await Promise.all([call1, call2]);

    expect(result1.error).toBeUndefined();
    expect(result2.error).toBeUndefined();
    // Exactly one initialize + one notify, regardless of two concurrent callers.
    const calls = vi.mocked(globalThis.fetch).mock.calls;
    const initCalls = calls.filter((c) => JSON.parse(c[1]?.body as string).method === "initialize");
    const notifyCalls = calls.filter((c) => JSON.parse(c[1]?.body as string).method === "notifications/initialized");
    expect(initCalls.length).toBe(1);
    expect(notifyCalls.length).toBe(1);
  });

  it("UT-CONSOLE-MCP-025: returns the original session error without automatic reinitialization", async () => {
    await callTool("kubernaut_approve", { rar_name: "rar-1", decision: "Approved", reason: "first" }); // establishes session

    const expiredError = JSON.stringify({
      jsonrpc: "2.0", id: 4,
      error: { code: -32600, message: "method \"tools/call\" is invalid during session initialization" },
    });
    globalThis.fetch = vi.fn()
      // 1st: tools/call fails (session expired)
      .mockResolvedValueOnce(new Response(expiredError, { status: 200 }))
      // 2nd: re-initialize itself fails
      .mockResolvedValueOnce(new Response("Internal Server Error", { status: 500, statusText: "Internal Server Error" }));

    const result = await callTool("kubernaut_approve", { rar_name: "rar-2", decision: "Approved", reason: "retry" });

    expect(result.error).toBeDefined();
    expect(result.error!.message).toContain("invalid during session initialization");
    expect(vi.mocked(globalThis.fetch).mock.calls.length).toBe(1);
  });

  it("IT-CONSOLE-168-006: isolates session headers and initialization between client instances", async () => {
    const fetchA = vi.fn()
      .mockResolvedValueOnce(mockResponseWithSessionHeader("session-a"))
      .mockResolvedValueOnce(mockSuccessResponse())
      .mockResolvedValueOnce(mockSuccessResponse());
    const fetchB = vi.fn()
      .mockResolvedValueOnce(mockResponseWithSessionHeader("session-b"))
      .mockResolvedValueOnce(mockSuccessResponse())
      .mockResolvedValueOnce(mockSuccessResponse());

    const clientA = new McpClient({ fetchFn: fetchA });
    const clientB = new McpClient({ fetchFn: fetchB });
    await clientA.callTool("kubernaut_approve", { rar_name: "rar-a", decision: "Approved", reason: "a" });
    await clientB.callTool("kubernaut_approve", { rar_name: "rar-b", decision: "Approved", reason: "b" });

    expect((fetchA.mock.calls[1][1]?.headers as Record<string, string>)["Mcp-Session-Id"]).toBe("session-a");
    expect((fetchB.mock.calls[0][1]?.headers as Record<string, string>)["Mcp-Session-Id"]).toBeUndefined();
    expect((fetchB.mock.calls[1][1]?.headers as Record<string, string>)["Mcp-Session-Id"]).toBe("session-b");
    clientA.dispose();
    clientB.dispose();
  });

  it("IT-CONSOLE-168-007: fences a late response after lifecycle disposal", async () => {
    let resolveInit!: (response: Response) => void;
    const fetchMock = vi.fn().mockImplementationOnce(() => new Promise<Response>((resolve) => {
      resolveInit = resolve;
    }));
    const client = new McpClient({ fetchFn: fetchMock });
    const pending = client.callTool("kubernaut_cancel", { rr_id: "rr-stale" });

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    client.dispose();
    resolveInit(mockSuccessResponse());

    await expect(pending).resolves.toMatchObject({ stale: true });
    await expect(client.callTool("kubernaut_cancel", { rr_id: "rr-stale" })).resolves.toMatchObject({ stale: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("IT-CONSOLE-168-008: requires a valid backend incarnation before MCP work", async () => {
    const observed = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(mockSuccessResponse());
    const client = new McpClient({
      fetchFn: fetchMock,
      requireBackendIncarnation: true,
      onBackendIncarnation: observed,
    });

    await expect(client.callTool("kubernaut_cancel", { rr_id: "rr-contract" })).resolves.toMatchObject({ stale: true });
    expect(observed).toHaveBeenCalledWith(null);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    client.dispose();
  });

  it("IT-CONSOLE-168-009: fences a changed backend incarnation without replay", async () => {
    const observed = vi.fn();
    const responseWithIncarnation = (incarnation: string, result: unknown = {}) => new Response(JSON.stringify({ jsonrpc: "2.0", id: 3, result }), {
      status: 200,
      headers: { "Content-Type": "application/json", "x-kubernaut-backend-incarnation": incarnation },
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: {} }), {
        status: 200,
        headers: { "Content-Type": "application/json", "mcp-session-id": "session-contract", "x-kubernaut-backend-incarnation": "incarnation-one" },
      }))
      .mockResolvedValueOnce(responseWithIncarnation("incarnation-one"))
      .mockResolvedValueOnce(responseWithIncarnation("incarnation-one"));
    const client = new McpClient({
      fetchFn: fetchMock,
      requireBackendIncarnation: true,
      onBackendIncarnation: observed,
    });

    await expect(client.callTool("kubernaut_cancel", { rr_id: "rr-contract" })).resolves.toMatchObject({ result: {} });
    expect(observed).toHaveBeenLastCalledWith("incarnation-one");

    fetchMock.mockResolvedValueOnce(responseWithIncarnation("incarnation-two"));
    await expect(client.callTool("kubernaut_cancel", { rr_id: "rr-contract-2" })).resolves.toMatchObject({ stale: true });
    expect(observed).toHaveBeenLastCalledWith("incarnation-two");
    expect(fetchMock).toHaveBeenCalledTimes(4);
    client.dispose();
  });
});

describe("isPermissionDeniedError", () => {
  // console#57: distinguish AF's RBAC-denial prefix from other tool-call
  // failures (validation errors, timeouts, etc.) that share the same
  // generic isError/-32000 wire shape.
  it("UT-CONSOLE-MCP-012 [console#57]: returns true for AF's permission-denied prefix", () => {
    expect(isPermissionDeniedError({ code: -32000, message: "permission denied: role lacks access to kubernaut_get_approval_request" })).toBe(true);
  });

  it("UT-CONSOLE-MCP-013 [console#57]: returns false for a validation/bad-request error", () => {
    expect(isPermissionDeniedError({ code: -32000, message: "invalid resource_id format \"rar-x\": expected namespace/name" })).toBe(false);
  });

  it("UT-CONSOLE-MCP-014 [console#57]: returns false when error is undefined", () => {
    expect(isPermissionDeniedError(undefined)).toBe(false);
  });
});
