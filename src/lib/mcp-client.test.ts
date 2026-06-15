import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { callMcpTool, _resetSession } from "./mcp-client";

function mockSuccessResponse(result: unknown = { content: [{ type: "text", text: "ok" }] }) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function mockFetchSuccess() {
  return vi.fn().mockImplementation(() => Promise.resolve(mockSuccessResponse()));
}

describe("callMcpTool", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    _resetSession();
    globalThis.fetch = mockFetchSuccess();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // SI-10: Structural separation — builds correct JSON-RPC payload
  it("UT-CONSOLE-MCP-001: sends initialize then tools/call on first invocation", async () => {
    await callMcpTool("kubernaut_approve", { rar_name: "rar-test-001", decision: "Approved", reason: "Approved by admin" });

    const calls = vi.mocked(globalThis.fetch).mock.calls;
    expect(calls.length).toBe(3);

    const initBody = JSON.parse(calls[0][1]?.body as string);
    expect(initBody.method).toBe("initialize");
    expect(initBody.params.protocolVersion).toBe("2025-03-26");

    const notifyBody = JSON.parse(calls[1][1]?.body as string);
    expect(notifyBody.method).toBe("notifications/initialized");

    const toolBody = JSON.parse(calls[2][1]?.body as string);
    expect(toolBody.method).toBe("tools/call");
    expect(toolBody.params).toEqual({
      name: "kubernaut_approve",
      arguments: { rar_name: "rar-test-001", decision: "Approved", reason: "Approved by admin" },
    });
  });

  // SI-10: No silent pass-through on HTTP failure
  it("UT-CONSOLE-MCP-002: returns error on HTTP failure", async () => {
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response("Internal Server Error", { status: 500, statusText: "Internal Server Error" }))
    );

    const result = await callMcpTool("kubernaut_approve", { rar_name: "rar-test", decision: "Approved", reason: "test" });

    expect(result.error).toBeDefined();
    expect(result.error!.message).toContain("500");
    expect(result.result).toBeUndefined();
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

    const result = await callMcpTool("kubernaut_approve", { rar_name: "rar-test", decision: "Approved", reason: "test" });

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

    const result = await callMcpTool("kubernaut_approve", { rar_name: "rar-test", decision: "Approved", reason: "test" });

    expect(result.result).toEqual(mcpResult);
    expect(result.error).toBeUndefined();
  });

  // SI-10: Network error handled
  it("UT-CONSOLE-MCP-005: returns error on network failure", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

    const result = await callMcpTool("kubernaut_approve", { rar_name: "rar-test", decision: "Approved", reason: "test" });

    expect(result.error).toBeDefined();
    expect(result.error!.message).toContain("Failed to fetch");
  });

  it("UT-CONSOLE-MCP-006: skips initialization on subsequent calls", async () => {
    await callMcpTool("kubernaut_approve", { rar_name: "rar-1", decision: "Approved", reason: "first" });
    globalThis.fetch = mockFetchSuccess();

    await callMcpTool("kubernaut_approve", { rar_name: "rar-2", decision: "Approved", reason: "second" });

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

    const result = await callMcpTool("kubernaut_complete_no_action", { rr_id: "rr-123", reason: "test" });

    expect(result.result).toEqual({ content: [{ type: "text", text: "done" }] });
  });
});
