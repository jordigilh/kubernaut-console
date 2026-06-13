import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { callMcpTool } from "./mcp-client";

describe("callMcpTool", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // SI-10: Structural separation — builds correct JSON-RPC payload
  it("UT-CONSOLE-MCP-001: sends correct JSON-RPC 2.0 payload to /mcp", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: "ok" }] } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    await callMcpTool("kubernaut_approve", { rar_name: "rar-test-001", decision: "Approved", reason: "Approved by admin" });

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(url).toBe("/mcp");
    expect(opts?.method).toBe("POST");
    expect(opts?.headers).toEqual({ "Content-Type": "application/json" });

    const body = JSON.parse(opts?.body as string);
    expect(body.jsonrpc).toBe("2.0");
    expect(body.id).toBeGreaterThan(0);
    expect(body.method).toBe("tools/call");
    expect(body.params).toEqual({
      name: "kubernaut_approve",
      arguments: { rar_name: "rar-test-001", decision: "Approved", reason: "Approved by admin" },
    });
  });

  // SI-10: No silent pass-through on HTTP failure
  it("UT-CONSOLE-MCP-002: returns error on HTTP failure", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response("Internal Server Error", { status: 500, statusText: "Internal Server Error" })
    );

    const result = await callMcpTool("kubernaut_approve", { rar_name: "rar-test", decision: "Approved", reason: "test" });

    expect(result.error).toBeDefined();
    expect(result.error!.message).toContain("500");
    expect(result.result).toBeUndefined();
  });

  // SI-10: No silent pass-through on JSON-RPC error
  it("UT-CONSOLE-MCP-003: returns error on JSON-RPC error response", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
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
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: mcpResult }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const result = await callMcpTool("kubernaut_approve", { rar_name: "rar-test", decision: "Approved", reason: "test" });

    expect(result.result).toEqual(mcpResult);
    expect(result.error).toBeUndefined();
  });

  // SI-10: Network error handled
  it("UT-CONSOLE-MCP-005: returns error on network failure", async () => {
    vi.mocked(globalThis.fetch).mockRejectedValue(new TypeError("Failed to fetch"));

    const result = await callMcpTool("kubernaut_approve", { rar_name: "rar-test", decision: "Approved", reason: "test" });

    expect(result.error).toBeDefined();
    expect(result.error!.message).toContain("Failed to fetch");
  });
});
