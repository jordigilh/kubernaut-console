import { createScopedMcpClient, type ScopedMcpClientOptions } from "./scoped-mcp-client";

type Request = { method: string; id?: number; headers: Record<string, string>; credentials?: RequestCredentials };

function capture(init?: RequestInit): Request {
  const body = JSON.parse(String(init?.body));
  return { method: body.method, id: body.id, headers: init?.headers as Record<string, string>, credentials: init?.credentials };
}

function ok(id?: number) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, result: { ok: true } }), { status: 200 });
}

// Exercise invalid runtime input that TypeScript callers would normally reject.
function create(options: Record<string, unknown>) {
  return createScopedMcpClient(options as unknown as ScopedMcpClientOptions);
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

it.each(["proxy", "bearer"] as const)("UT-CONSOLE-170-MCP-043: %s requests advertise both MCP response types", async (authMode) => {
  const requests: Request[] = [];
  const fetchFn = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    const request = capture(init);
    requests.push(request);
    return Promise.resolve(ok(request.id));
  });
  const pending = create({ authMode, getToken: async () => "synthetic-token", fetchFn }).call("action", {});
  await vi.runAllTimersAsync();
  expect((await pending).error).toBeUndefined();
  expect(requests.map((request) => request.method)).toEqual(["initialize", "notifications/initialized", "tools/call"]);
  for (const request of requests) {
    expect(request.headers.Accept).toBe("application/json, text/event-stream");
  }
});

it.each([
  { name: "empty", provider: () => Promise.resolve("") },
  { name: "throwing", provider: () => { throw new Error("unused synthetic token provider"); } },
])("UT-CONSOLE-170-MCP-036: explicit proxy mode does not use the $name browser token provider", async ({ provider }) => {
  const getToken = vi.fn(provider);
  const requests: Request[] = [];
  const fetchFn = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    const current = capture(init);
    requests.push(current);
    return Promise.resolve(ok(current.id));
  });
  const client = create({ authMode: "proxy", getToken, fetchFn });
  const pending = client.call("explicit_action", {});
  await vi.runAllTimersAsync();
  expect((await pending).result).toEqual({ ok: true });
  expect(getToken).not.toHaveBeenCalled();
  expect(requests.map((entry) => entry.method)).toEqual(["initialize", "notifications/initialized", "tools/call"]);
  expect(requests.every((entry) => entry.credentials === "same-origin" && !entry.headers.Authorization)).toBe(true);
});

it.each([
  { name: "missing mode", options: {} },
  { name: "missing mode despite a token provider", options: { getToken: async () => "synthetic-token" } },
  { name: "unknown mode", options: { authMode: "unknown" } },
  { name: "bearer mode without a token provider", options: { authMode: "bearer" } },
  { name: "bearer mode with an invalid token provider", options: { authMode: "bearer", getToken: "invalid" } },
])("UT-CONSOLE-170-MCP-037: $name never dispatches an unauthenticated request", async ({ options }) => {
  const fetchFn = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => Promise.resolve(ok(capture(init).id)));
  const pending = create({ ...options, fetchFn }).call("action", {});
  await vi.runAllTimersAsync();
  expect((await pending).error?.message).toMatch(/authorization unavailable/i);
  expect(fetchFn).not.toHaveBeenCalled();
});

it.each([
  "https://foreign.invalid",
  "//foreign.invalid",
  "http://[",
  `blob:${globalThis.location.origin}/synthetic`,
])("UT-CONSOLE-170-MCP-038: proxy mode rejects an unqualified target %s", async (baseUrl) => {
  const fetchFn = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => Promise.resolve(ok(capture(init).id)));
  const pending = create({ authMode: "proxy", baseUrl, fetchFn }).call("action", {});
  await vi.runAllTimersAsync();
  expect((await pending).error?.message).toMatch(/proxy.*origin/i);
  expect(fetchFn).not.toHaveBeenCalled();
});

it("UT-CONSOLE-170-MCP-039: a proxy denial is returned without retrying or falling back to a token", async () => {
  const getToken = vi.fn(async () => "synthetic-token");
  const fetchFn = vi.fn(() => Promise.resolve(new Response("denied", { status: 401 })));
  const pending = create({ authMode: "proxy", getToken, fetchFn }).call("action", {});
  await vi.runAllTimersAsync();
  expect((await pending).error?.code).toBe(401);
  expect(getToken).not.toHaveBeenCalled();
  expect(fetchFn).toHaveBeenCalledOnce();
});

it("UT-CONSOLE-170-MCP-040: auth mode is captured at construction rather than inferred later", async () => {
  const getToken = vi.fn(async () => "synthetic-token");
  const requests: Request[] = [];
  const fetchFn = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    const current = capture(init);
    requests.push(current);
    return Promise.resolve(ok(current.id));
  });
  const options = { authMode: "proxy", getToken, fetchFn };
  const client = create(options);
  options.authMode = "bearer";
  const pending = client.call("action", {});
  await vi.runAllTimersAsync();
  expect((await pending).error).toBeUndefined();
  expect(getToken).not.toHaveBeenCalled();
  expect(requests.every((entry) => entry.credentials === "same-origin" && !entry.headers.Authorization)).toBe(true);
});

it.each(["", "/synthetic-proxy", globalThis.location.origin])("UT-CONSOLE-170-MCP-041: explicit proxy mode accepts a same-origin base %s", async (baseUrl) => {
  const requests: Request[] = [];
  const fetchFn = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    const current = capture(init);
    requests.push(current);
    return Promise.resolve(ok(current.id));
  });
  const pending = create({ authMode: "proxy", baseUrl, fetchFn }).call("action", {});
  await vi.runAllTimersAsync();
  expect((await pending).error).toBeUndefined();
  expect(requests.every((entry) => entry.credentials === "same-origin" && !entry.headers.Authorization)).toBe(true);
});

it("UT-CONSOLE-170-MCP-042: bearer mode does not mix its token with browser cookies", async () => {
  const requests: Request[] = [];
  const fetchFn = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    const current = capture(init);
    requests.push(current);
    return Promise.resolve(ok(current.id));
  });
  const pending = create({ authMode: "bearer", getToken: async () => "synthetic-token", fetchFn }).call("action", {});
  await vi.runAllTimersAsync();
  expect((await pending).error).toBeUndefined();
  expect(requests).toHaveLength(3);
  expect(requests.every((entry) => entry.credentials === "omit" && entry.headers.Authorization === "Bearer synthetic-token")).toBe(true);
});
