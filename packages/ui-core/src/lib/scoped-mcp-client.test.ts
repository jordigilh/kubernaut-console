import { _resetSession } from "./mcp-client";
import { createScopedMcpClient } from "./scoped-mcp-client";

type CapturedRequest = { url: string; body: { id?: number; method: string; params?: unknown }; headers: Record<string, string>; signal: AbortSignal };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => { resolve = finish; });
  return { promise, resolve };
}

function success(session?: string, result: unknown = { value: "ok" }, id = 1) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), {
    status: 200,
    headers: session ? { "mcp-session-id": session } : {},
  });
}

function capture(input: RequestInfo | URL, init?: RequestInit): CapturedRequest {
  return {
    url: String(input),
    body: JSON.parse(String(init?.body)),
    headers: init?.headers as Record<string, string>,
    signal: init?.signal as AbortSignal,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  _resetSession();
});

afterEach(() => {
  _resetSession();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("UT-CONSOLE-170-MCP-001: concurrent clients capture distinct transport inputs and session headers", async () => {
  const initA = deferred<Response>();
  const aRequests: CapturedRequest[] = [];
  const bRequests: CapturedRequest[] = [];
  const fetchA = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const request = capture(input, init);
    aRequests.push(request);
    return request.body.method === "initialize" ? initA.promise : Promise.resolve(success(undefined, undefined, request.body.id));
  });
  const fetchB = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const request = capture(input, init);
    bRequests.push(request);
    return Promise.resolve(success(request.body.method === "initialize" ? "session-b" : undefined, undefined, request.body.id));
  });
  // The legacy baseline uses global fetch; the new clients must use captured transports.
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
    String(input).startsWith("https://a.invalid") ? fetchA(input, init) : fetchB(input, init)));
  const optionsA = { authMode: "bearer" as const, baseUrl: "https://a.invalid", getToken: async () => "token-a", fetchFn: fetchA };
  const a = createScopedMcpClient(optionsA);
  const b = createScopedMcpClient({ authMode: "bearer", baseUrl: "https://b.invalid", getToken: async () => "token-b", fetchFn: fetchB });
  optionsA.baseUrl = "https://changed.invalid";
  optionsA.getToken = async () => "changed-token";
  optionsA.fetchFn = fetchB;

  const callA = a.call("read_a", { rr_id: "a" });
  const callB = b.call("read_b", { rr_id: "b" });
  await vi.advanceTimersByTimeAsync(0);
  initA.resolve(success("session-a"));
  await vi.runAllTimersAsync();
  const [resultA, resultB] = await Promise.all([callA, callB]);

  expect(resultA.result).toEqual({ value: "ok" });
  expect(resultB.result).toEqual({ value: "ok" });
  expect(aRequests.map((request) => request.body.method)).toEqual(["initialize", "notifications/initialized", "tools/call"]);
  expect(bRequests.map((request) => request.body.method)).toEqual(["initialize", "notifications/initialized", "tools/call"]);
  expect(aRequests.every((request) => request.url === "https://a.invalid/mcp" && request.headers.Authorization === "Bearer token-a")).toBe(true);
  expect(bRequests.every((request) => request.url === "https://b.invalid/mcp" && request.headers.Authorization === "Bearer token-b")).toBe(true);
  expect(aRequests[2].headers["Mcp-Session-Id"]).toBe("session-a");
  expect(bRequests[2].headers["Mcp-Session-Id"]).toBe("session-b");
});

it("UT-CONSOLE-170-MCP-002: one client's simultaneous calls share only its own handshake", async () => {
  const initialization = deferred<Response>();
  const requests: CapturedRequest[] = [];
  const fetchFn = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const request = capture(input, init);
    requests.push(request);
    return request.body.method === "initialize" ? initialization.promise : Promise.resolve(success(undefined, undefined, request.body.id));
  });
  vi.stubGlobal("fetch", fetchFn);
  const client = createScopedMcpClient({ authMode: "proxy", fetchFn });
  const first = client.call("one", { id: "1" });
  const second = client.call("two", { id: "2" });
  await vi.advanceTimersByTimeAsync(0);
  initialization.resolve(success("one-session"));
  await vi.runAllTimersAsync();
  const results = await Promise.all([first, second]);
  expect(results.every((result) => !result.error)).toBe(true);
  expect(requests.map((request) => request.body.method)).toEqual(["initialize", "notifications/initialized", "tools/call", "tools/call"]);
  expect(requests.slice(1).every((request) => request.headers["Mcp-Session-Id"] === "one-session")).toBe(true);
});

it("UT-CONSOLE-170-MCP-003: invalidation fences delayed initialization and cannot affect a successor", async () => {
  const oldInitialization = deferred<Response>();
  const requests: CapturedRequest[] = [];
  const fetchFn = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const request = capture(input, init);
    requests.push(request);
    if (request.url.startsWith("https://old.invalid") && request.body.method === "initialize") return oldInitialization.promise;
    return Promise.resolve(success(request.body.method === "initialize" ? "new-session" : undefined, undefined, request.body.id));
  });
  vi.stubGlobal("fetch", fetchFn);
  const old = createScopedMcpClient({ authMode: "bearer", baseUrl: "https://old.invalid", getToken: async () => "fixture-token", fetchFn });
  const newClient = createScopedMcpClient({ authMode: "bearer", baseUrl: "https://new.invalid", getToken: async () => "fixture-token", fetchFn });
  const oldCall = old.call("mutate_old", {});
  await vi.advanceTimersByTimeAsync(0);
  old.invalidate();
  const newCall = newClient.call("read_new", {});
  oldInitialization.resolve(success("old-session"));
  await vi.runAllTimersAsync();
  const [oldResult, newResult] = await Promise.all([oldCall, newCall]);

  expect(oldResult.error?.message).toMatch(/invalidated/i);
  expect(newResult.result).toEqual({ value: "ok" });
  expect(requests.filter((request) => request.url.startsWith("https://old.invalid")).map((request) => request.body.method)).toEqual(["initialize"]);
  const successorTool = requests.find((request) => request.url.startsWith("https://new.invalid") && request.body.method === "tools/call");
  expect(successorTool?.headers["Mcp-Session-Id"]).toBe("new-session");
  expect(requests[0].signal.aborted).toBe(true);
  expect((await old.call("after_invalidation", {})).error?.message).toMatch(/invalidated/i);
});

it("UT-CONSOLE-170-MCP-004: invalidating a pending token prevents any network dispatch", async () => {
  const token = deferred<string>();
  const fetchFn = vi.fn(() => Promise.resolve(success()));
  vi.stubGlobal("fetch", fetchFn);
  const client = createScopedMcpClient({ authMode: "bearer", getToken: () => token.promise, fetchFn });
  const call = client.call("mutating_action", {});
  await vi.advanceTimersByTimeAsync(0);
  client.invalidate();
  token.resolve("late-token");
  await vi.runAllTimersAsync();
  expect((await call).error?.message).toMatch(/invalidated/i);
  expect(fetchFn).not.toHaveBeenCalled();
});

it.each([
  { label: "HTTP 404", response: (_id?: number) => new Response("expired", { status: 404 }) },
  { label: "session initialization error", response: (id?: number) => new Response(JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32600, message: "invalid during session initialization" } }), { status: 200 }) },
])("UT-CONSOLE-170-MCP-005: $label never replays a mutating tool", async ({ response }) => {
  const requests: CapturedRequest[] = [];
  const fetchFn = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const request = capture(input, init);
    requests.push(request);
    return Promise.resolve(request.body.method === "tools/call" ? response(request.body.id) : success("fixture-session", undefined, request.body.id));
  });
  vi.stubGlobal("fetch", fetchFn);
  const client = createScopedMcpClient({ authMode: "proxy", fetchFn });
  const action = client.call("kubernaut_approve", { rr_id: "synthetic-rr" });
  await vi.runAllTimersAsync();
  const result = await action;
  expect(result.error).toBeDefined();
  expect(requests.map((request) => request.body.method)).toEqual(["initialize", "notifications/initialized", "tools/call"]);
});
