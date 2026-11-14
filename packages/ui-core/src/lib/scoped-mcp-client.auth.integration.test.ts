import { createScopedMcpClient } from "./scoped-mcp-client";

it("IT-CONSOLE-170-MCP-002: explicit proxy and bearer transports keep synthetic sessions separate", async () => {
  vi.useFakeTimers();
  try {
    const requests: Array<{ mode: string; method: string; session?: string; credentials?: RequestCredentials }> = [];
    const fetchFn = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      const headers = init?.headers as Record<string, string>;
      const mode = headers.Authorization === "Bearer synthetic-token" ? "bearer" : "proxy";
      const session = headers["Mcp-Session-Id"];
      requests.push({ mode, method: body.method, session, credentials: init?.credentials });
      const accepted = (headers.Accept ?? "").split(",").map((value) => value.trim());
      if (!accepted.includes("application/json") || !accepted.includes("text/event-stream")) return Promise.resolve(new Response("unacceptable", { status: 400 }));
      if (mode === "proxy" && (headers.Authorization || init?.credentials !== "same-origin")) return Promise.resolve(new Response("denied", { status: 401 }));
      if (mode === "bearer" && init?.credentials !== "omit") return Promise.resolve(new Response("denied", { status: 401 }));
      if (body.method !== "initialize" && session !== `synthetic-${mode}`) return Promise.resolve(new Response("wrong session", { status: 403 }));
      if (body.method === "notifications/initialized") return Promise.resolve(new Response(null, { status: 202 }));
      const message = JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { mode } });
      return Promise.resolve(new Response(`event: message\ndata: ${message}\n\n`, {
        headers: { "content-type": "text/event-stream", ...(body.method === "initialize" ? { "mcp-session-id": `synthetic-${mode}` } : {}) },
      }));
    });
    const proxyToken = vi.fn(async () => "");
    const bearerToken = vi.fn(async () => "synthetic-token");
    const proxy = createScopedMcpClient({ authMode: "proxy", getToken: proxyToken, fetchFn });
    const bearer = createScopedMcpClient({ authMode: "bearer", getToken: bearerToken, fetchFn });
    const proxyCall = proxy.call("proxy_action", {});
    const bearerCall = bearer.call("bearer_action", {});
    await vi.runAllTimersAsync();
    expect((await proxyCall).result).toEqual({ mode: "proxy" });
    expect((await bearerCall).result).toEqual({ mode: "bearer" });
    expect(proxyToken).not.toHaveBeenCalled();
    expect(bearerToken).toHaveBeenCalledTimes(3);
    expect(requests.filter((entry) => entry.mode === "bearer").every((entry) => entry.credentials === "omit")).toBe(true);
    for (const mode of ["proxy", "bearer"]) {
      expect(requests.filter((entry) => entry.mode === mode).map((entry) => entry.method)).toEqual(["initialize", "notifications/initialized", "tools/call"]);
      expect(requests.filter((entry) => entry.mode === mode && entry.method !== "initialize").every((entry) => entry.session === `synthetic-${mode}`)).toBe(true);
    }
  } finally {
    vi.useRealTimers();
  }
});
