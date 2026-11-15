import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createScopedMcpClient } from "./scoped-mcp-client";

// Opt-in: the binary is built from docs/tests/170/fixtures/af-mcp-handler.go.
// The fixture is an unauthenticated loopback-only AF handler with stub tools.
const binary = process.env.CONSOLE_170_AF_HANDLER;
const describeLocalHandler = binary ? describe : describe.skip;

describeLocalHandler("IT-CONSOLE-170-MCP-003: local AF MCP handler", () => {
  let server: ChildProcessWithoutNullStreams;
  let endpoint: string;

  beforeAll(async () => {
    server = spawn(binary!, [], { stdio: "pipe" });
    endpoint = await new Promise<string>((resolve, reject) => {
      let output = "";
      let errors = "";
      server.stdout.on("data", (chunk: Buffer) => {
        output += chunk.toString();
        if (output.includes("\n")) resolve(output.split("\n")[0]);
      });
      server.stderr.on("data", (chunk: Buffer) => { errors += chunk.toString(); });
      server.once("error", reject);
      server.once("exit", (code) => reject(new Error(`AF fixture exited ${code}: ${errors}`)));
    });
    const url = new URL(endpoint);
    if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !url.port || url.pathname !== "/") {
      throw new Error("AF fixture did not bind to an isolated loopback port");
    }
  }, 20_000);

  afterAll(() => { server?.kill(); });

  it("uses actual SSE, notification and session behavior without replaying after expiry", async () => {
    const requests: Array<{ method: string; sent?: string; received?: string; status: number; contentType: string | null }> = [];
    const fetchFn: typeof fetch = async (input, init) => {
      if (String(input) !== `${endpoint}/mcp`) throw new Error("Unexpected AF fixture target");
      const body = JSON.parse(String(init?.body)) as { method: string };
      const response = await fetch(input, init);
      requests.push({
        method: body.method,
        sent: new Headers(init?.headers).get("mcp-session-id") ?? undefined,
        received: response.headers.get("mcp-session-id") ?? undefined,
        status: response.status,
        contentType: response.headers.get("content-type"),
      });
      return response;
    };
    const client = createScopedMcpClient({ authMode: "bearer", baseUrl: endpoint, getToken: async () => "synthetic-token", fetchFn });
    const first = await client.call("synthetic_read", {});
    expect(first.error).toBeUndefined();
    expect(first.result).toEqual({ content: [{ type: "text", text: 'tool "synthetic_read": not yet wired to backend' }] });
    expect(requests.map((request) => request.method)).toEqual(["initialize", "notifications/initialized", "tools/call"]);
    const firstSession = requests[0].received;
    expect(firstSession).toBeTruthy();
    expect(requests[0].contentType).toContain("text/event-stream");
    expect(requests[1]).toMatchObject({ status: 202, sent: firstSession });
    expect(requests[2]).toMatchObject({ status: 200, sent: firstSession });
    expect(requests[2].contentType).toContain("text/event-stream");

    const closed = await fetch(`${endpoint}/mcp`, { method: "DELETE", headers: { "Mcp-Session-Id": firstSession! } });
    expect(closed.ok).toBe(true);
    const expired = await client.call("synthetic_read", {});
    expect(expired.error?.code).toBe(404);
    expect(requests.map((request) => request.method)).toEqual(["initialize", "notifications/initialized", "tools/call", "tools/call"]);

    const explicit = await client.call("synthetic_read", {});
    expect(explicit.error).toBeUndefined();
    expect(requests.map((request) => request.method)).toEqual(["initialize", "notifications/initialized", "tools/call", "tools/call", "initialize", "notifications/initialized", "tools/call"]);
    expect(requests[4].received).toBeTruthy();
    expect(requests[4].received).not.toBe(firstSession);
    client.invalidate();
  }, 20_000);

  it("keeps proxy and bearer clients on separate handler sessions", async () => {
    const sessions: Record<string, string[]> = { proxy: [], bearer: [] };
    const makeFetch = (mode: "proxy" | "bearer"): typeof fetch => async (input, init) => {
      const expected = mode === "proxy" ? "/mcp" : `${endpoint}/mcp`;
      if (String(input) !== expected) throw new Error("Unexpected AF fixture target");
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBe(mode === "bearer" ? "Bearer synthetic-token" : null);
      expect(init?.credentials).toBe(mode === "bearer" ? "omit" : "same-origin");
      const response = await fetch(`${endpoint}/mcp`, init);
      const session = response.headers.get("mcp-session-id");
      if (session) sessions[mode].push(session);
      return response;
    };
    // The injected proxy is only a loopback test adapter; no proxy or cookies are tested.
    const proxy = createScopedMcpClient({ authMode: "proxy", fetchFn: makeFetch("proxy") });
    const bearer = createScopedMcpClient({ authMode: "bearer", baseUrl: endpoint, getToken: async () => "synthetic-token", fetchFn: makeFetch("bearer") });
    const results = await Promise.all([proxy.call("synthetic_read", {}), bearer.call("synthetic_read", {})]);
    expect(results.every((result) => !result.error)).toBe(true);
    expect(sessions.proxy).toHaveLength(1);
    expect(sessions.bearer).toHaveLength(1);
    expect(sessions.proxy[0]).not.toBe(sessions.bearer[0]);
    proxy.invalidate();
    bearer.invalidate();
  }, 20_000);
});
