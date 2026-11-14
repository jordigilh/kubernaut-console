import { createScopedMcpClient } from "./scoped-mcp-client";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((finish, fail) => { resolve = finish; reject = fail; });
  return { promise, resolve, reject };
}

function response(result: unknown = {}, session?: string, id = 1) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), {
    status: 200, headers: session ? { "mcp-session-id": session } : {},
  });
}

type Request = { id?: number; method: string; headers: Record<string, string>; signal: AbortSignal; args?: Record<string, string> };
function request(init?: RequestInit): Request {
  const body = JSON.parse(String(init?.body));
  return { id: body.id, method: body.method, headers: init?.headers as Record<string, string>, signal: init?.signal as AbortSignal, args: body.params?.arguments };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it.each([
  { label: "throws", getToken: () => { throw new Error("synthetic secret should not be returned"); } },
  { label: "rejects", getToken: () => Promise.reject(new Error("synthetic secret should not be returned")) },
  { label: "is empty", getToken: () => Promise.resolve("   ") },
])("UT-CONSOLE-170-MCP-006: configured token provider $label without an unauthenticated request", async ({ getToken }) => {
  const fetchFn = vi.fn(() => Promise.resolve(response()));
  const client = createScopedMcpClient({ authMode: "bearer", getToken, fetchFn });
  const result = await client.call("read", {});
  expect(result.error?.message).toBe("MCP authorization unavailable");
  expect(fetchFn).not.toHaveBeenCalled();
});

it.each(["initialize", "notifications/initialized"])("UT-CONSOLE-170-MCP-007: failed %s requires a new explicit call and never reuses its partial session", async (failedMethod) => {
  let fail = true;
  const requests: Request[] = [];
  const fetchFn = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    const current = request(init);
    requests.push(current);
    if (current.method === failedMethod && fail) {
      fail = false;
      return Promise.resolve(new Response("unavailable", { status: 503 }));
    }
    return Promise.resolve(response({ ok: true }, current.method === "initialize" ? "fresh-session" : undefined, current.id));
  });
  const client = createScopedMcpClient({ authMode: "proxy", fetchFn });
  const first = client.call("first_action", {});
  await vi.runAllTimersAsync();
  expect((await first).error?.code).toBe(503);
  expect(requests.some((entry) => entry.method === "tools/call")).toBe(false);
  const retry = client.call("second_explicit_action", {});
  await vi.runAllTimersAsync();
  expect((await retry).result).toEqual({ ok: true });
  const initializations = requests.filter((entry) => entry.method === "initialize");
  expect(initializations).toHaveLength(2);
  expect(initializations[1].headers["Mcp-Session-Id"]).toBeUndefined();
  expect(requests.filter((entry) => entry.method === "tools/call")).toHaveLength(1);
});

it("UT-CONSOLE-170-MCP-008: invalidation resolves an uncooperative token provider without waiting for it", async () => {
  const token = deferred<string>();
  const fetchFn = vi.fn(() => Promise.resolve(response()));
  const client = createScopedMcpClient({ authMode: "bearer", getToken: () => token.promise, fetchFn });
  const pending = client.call("action", {});
  await vi.advanceTimersByTimeAsync(0);
  client.invalidate();
  expect((await pending).error?.message).toMatch(/invalidated/i);
  expect(fetchFn).not.toHaveBeenCalled();
  token.resolve("late-fixture-token");
  await vi.runAllTimersAsync();
  expect(fetchFn).not.toHaveBeenCalled();
  client.invalidate();
  expect((await client.call("another_action", {})).error?.message).toMatch(/invalidated/i);
});

it.each(["initialize", "notifications/initialized", "tools/call"])("UT-CONSOLE-170-MCP-009: invalidation aborts and fences a delayed %s response", async (delayedMethod) => {
  const delayed = deferred<Response>();
  const requests: Request[] = [];
  const fetchFn = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    const current = request(init);
    requests.push(current);
    return current.method === delayedMethod ? delayed.promise : Promise.resolve(response({}, current.method === "initialize" ? "fixture-session" : undefined, current.id));
  });
  const client = createScopedMcpClient({ authMode: "proxy", fetchFn });
  const pending = client.call("explicit_action", {});
  await vi.runAllTimersAsync();
  expect(requests.at(-1)?.method).toBe(delayedMethod);
  client.invalidate();
  expect((await pending).error?.message).toMatch(/invalidated/i);
  expect(requests.at(-1)?.signal.aborted).toBe(true);
  const count = requests.length;
  delayed.resolve(response({ stale: true }, "stale-session"));
  await vi.runAllTimersAsync();
  expect(requests).toHaveLength(count);
  expect((await client.call("after_invalidation", {})).error?.message).toMatch(/invalidated/i);
});

it("UT-CONSOLE-170-MCP-010: invalidation during response-body parsing rejects the late session and result", async () => {
  const body = deferred<string>();
  const requests: Request[] = [];
  const fetchFn = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    requests.push(request(init));
    const slow = response({}, "stale-session");
    Object.defineProperty(slow, "text", { value: () => body.promise });
    return Promise.resolve(slow);
  });
  const client = createScopedMcpClient({ authMode: "proxy", fetchFn });
  const pending = client.call("action", {});
  await vi.advanceTimersByTimeAsync(0);
  client.invalidate();
  expect((await pending).error?.message).toMatch(/invalidated/i);
  body.resolve(JSON.stringify({ result: {} }));
  await vi.runAllTimersAsync();
  expect(requests.map((entry) => entry.method)).toEqual(["initialize"]);
});

it("UT-CONSOLE-170-MCP-011: invalidation during the handshake delay never dispatches a tool", async () => {
  const requests: Request[] = [];
  const fetchFn = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    const current = request(init);
    requests.push(current);
    return Promise.resolve(response({}, "fixture-session", current.id));
  });
  const client = createScopedMcpClient({ authMode: "proxy", fetchFn });
  const pending = client.call("explicit_action", {});
  await vi.advanceTimersByTimeAsync(0);
  expect(requests.map((entry) => entry.method)).toEqual(["initialize", "notifications/initialized"]);
  client.invalidate();
  expect((await pending).error?.message).toMatch(/invalidated/i);
  await vi.runAllTimersAsync();
  expect(requests).toHaveLength(2);
});

it("UT-CONSOLE-170-MCP-012: older concurrent responses cannot replace a newer session", async () => {
  const first = deferred<Response>();
  const second = deferred<Response>();
  const requests: Request[] = [];
  let tools = 0;
  const fetchFn = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    const current = request(init);
    requests.push(current);
    if (current.method === "initialize") return Promise.resolve(response({}, "initial-session", current.id));
    if (current.method !== "tools/call") return Promise.resolve(response({}, undefined, current.id));
    tools += 1;
    if (tools === 1) return first.promise;
    if (tools === 2) return second.promise;
    return Promise.resolve(response({ final: true }, undefined, current.id));
  });
  const client = createScopedMcpClient({ authMode: "proxy", fetchFn });
  const firstCall = client.call("read_one", {});
  const secondCall = client.call("read_two", {});
  await vi.runAllTimersAsync();
  const toolsSent = requests.filter((entry) => entry.method === "tools/call");
  second.resolve(response({ second: true }, "new-session", toolsSent[1].id));
  expect((await secondCall).result).toEqual({ second: true });
  first.resolve(response({ first: true }, "old-session", toolsSent[0].id));
  expect((await firstCall).result).toEqual({ first: true });
  const third = client.call("read_three", {});
  await vi.runAllTimersAsync();
  expect((await third).result).toEqual({ final: true });
  expect(requests.at(-1)?.headers["Mcp-Session-Id"]).toBe("new-session");
});

it("UT-CONSOLE-170-MCP-013: snapshots action arguments before asynchronous initialization", async () => {
  const init = deferred<Response>();
  const requests: Request[] = [];
  const fetchFn = vi.fn((_input: RequestInfo | URL, options?: RequestInit) => {
    const current = request(options);
    requests.push(current);
    return current.method === "initialize" ? init.promise : Promise.resolve(response({ ok: true }, undefined, current.id));
  });
  const client = createScopedMcpClient({ authMode: "proxy", fetchFn });
  const args = { rr_id: "original", action: "cancel" };
  const pending = client.call("explicit_action", args);
  args.rr_id = "changed";
  init.resolve(response());
  await vi.runAllTimersAsync();
  expect((await pending).result).toEqual({ ok: true });
  expect(requests.at(-1)?.args).toEqual({ rr_id: "original", action: "cancel" });
});

it("UT-CONSOLE-170-MCP-014: concurrent failed handshakes do not send tools or implicitly retry", async () => {
  const init = deferred<Response>();
  const requests: Request[] = [];
  const fetchFn = vi.fn((_input: RequestInfo | URL, options?: RequestInit) => {
    requests.push(request(options));
    return init.promise;
  });
  const client = createScopedMcpClient({ authMode: "proxy", fetchFn });
  const first = client.call("action_one", {});
  const second = client.call("action_two", {});
  init.resolve(new Response("unavailable", { status: 503 }));
  const results = await Promise.all([first, second]);
  expect(results.map((result) => result.error?.code)).toEqual([503, 503]);
  expect(requests.map((entry) => entry.method)).toEqual(["initialize"]);
});

it("UT-CONSOLE-170-MCP-015: response-reading failures stop the action without replay", async () => {
  const requests: Request[] = [];
  const fetchFn = vi.fn((_input: RequestInfo | URL, options?: RequestInit) => {
    const current = request(options);
    requests.push(current);
    const reply = response({}, "fixture-session", current.id);
    if (current.method === "tools/call") Object.defineProperty(reply, "text", { value: () => Promise.reject(new Error("synthetic read failure")) });
    return Promise.resolve(reply);
  });
  const client = createScopedMcpClient({ authMode: "proxy", fetchFn });
  const pending = client.call("action", {});
  await vi.runAllTimersAsync();
  expect((await pending).error?.message).toBe("synthetic read failure");
  expect(requests.map((entry) => entry.method)).toEqual(["initialize", "notifications/initialized", "tools/call"]);
});

it("UT-CONSOLE-170-MCP-016: the default fetch is captured at construction rather than changed by a later global replacement", async () => {
  const originalTransport = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => Promise.resolve(response({ owner: "original" }, undefined, request(init).id)));
  const successorTransport = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => Promise.resolve(response({ owner: "successor" }, undefined, request(init).id)));
  vi.stubGlobal("fetch", originalTransport);
  const client = createScopedMcpClient({ authMode: "proxy", baseUrl: "/synthetic" });
  vi.stubGlobal("fetch", successorTransport);
  const result = client.call("read", {});
  await vi.runAllTimersAsync();
  expect((await result).result).toEqual({ owner: "original" });
  expect(originalTransport).toHaveBeenCalledTimes(3);
  expect(successorTransport).not.toHaveBeenCalled();
});

it("UT-CONSOLE-170-MCP-017: a later token failure abandons a partial handshake without using its session", async () => {
  let tokens = 0;
  const getToken = vi.fn(async () => {
    tokens += 1;
    if (tokens === 2) throw new Error("synthetic secret should not be returned");
    return "fixture-token";
  });
  const requests: Request[] = [];
  const fetchFn = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    const current = request(init);
    requests.push(current);
    return Promise.resolve(response({}, "fixture-session", current.id));
  });
  const client = createScopedMcpClient({ authMode: "bearer", getToken, fetchFn });
  const first = client.call("first_action", {});
  await vi.runAllTimersAsync();
  expect((await first).error?.message).toBe("MCP authorization unavailable");
  expect(requests.map((entry) => entry.method)).toEqual(["initialize"]);
  const next = client.call("second_explicit_action", {});
  await vi.runAllTimersAsync();
  expect((await next).error).toBeUndefined();
  expect(requests[1].method).toBe("initialize");
  expect(requests[1].headers["Mcp-Session-Id"]).toBeUndefined();
  expect(requests.filter((entry) => entry.method === "tools/call")).toHaveLength(1);
});

it("UT-CONSOLE-170-MCP-018: an explicit later action is separate from a failed action, never a replay", async () => {
  const requests: Request[] = [];
  let actions = 0;
  const fetchFn = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    const current = request(init);
    requests.push(current);
    if (current.method === "tools/call" && ++actions === 1) return Promise.resolve(new Response("unavailable", { status: 503 }));
    return Promise.resolve(response({ ok: true }, current.method === "initialize" ? "fixture-session" : undefined, current.id));
  });
  const client = createScopedMcpClient({ authMode: "proxy", fetchFn });
  const first = client.call("action_one", { rr_id: "one" });
  await vi.runAllTimersAsync();
  expect((await first).error?.code).toBe(503);
  expect(requests.filter((entry) => entry.method === "tools/call")).toHaveLength(1);
  const second = client.call("action_two", { rr_id: "two" });
  await vi.runAllTimersAsync();
  expect((await second).result).toEqual({ ok: true });
  expect(requests.filter((entry) => entry.method === "tools/call").map((entry) => entry.args?.rr_id)).toEqual(["one", "two"]);
});

it("UT-CONSOLE-170-MCP-019: a timed-out mutation is reported once and never replayed", async () => {
  let latestTimeout: AbortController | undefined;
  vi.spyOn(AbortSignal, "timeout").mockImplementation(() => {
    latestTimeout = new AbortController();
    return latestTimeout.signal;
  });
  const requests: Request[] = [];
  const fetchFn = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    const current = request(init);
    requests.push(current);
    if (current.method !== "tools/call") return Promise.resolve(response({}, undefined, current.id));
    return new Promise<Response>((_resolve, reject) => {
      current.signal.addEventListener("abort", () => reject(new Error("synthetic timeout")), { once: true });
    });
  });
  const client = createScopedMcpClient({ authMode: "proxy", fetchFn });
  const pending = client.call("explicit_action", {});
  await vi.runAllTimersAsync();
  expect(requests.at(-1)?.method).toBe("tools/call");
  latestTimeout!.abort();
  expect((await pending).error?.message).toBe("synthetic timeout");
  expect(requests.filter((entry) => entry.method === "tools/call")).toHaveLength(1);
});

it("UT-CONSOLE-170-MCP-020: synchronous invalidation inside a transport cannot dispatch or expose a late rejection", async () => {
  const fetchFn = vi.fn(() => {
    client.invalidate();
    return Promise.reject(new Error("late synthetic transport rejection"));
  });
  const client = createScopedMcpClient({ authMode: "proxy", fetchFn });
  expect((await client.call("action", {})).error?.message).toMatch(/invalidated/i);
  await vi.runAllTimersAsync();
  expect(fetchFn).toHaveBeenCalledTimes(1);
});

it("UT-CONSOLE-170-MCP-027: immediate invalidation prevents the handshake from starting", async () => {
  const fetchFn = vi.fn(() => Promise.resolve(response()));
  const client = createScopedMcpClient({ authMode: "proxy", fetchFn });
  const pending = client.call("action", {});
  client.invalidate();
  expect((await pending).error?.message).toMatch(/invalidated/i);
  expect(fetchFn).not.toHaveBeenCalled();
});

it.each(["resolve", "reject"] as const)("UT-CONSOLE-170-MCP-028: a token that will %s after session expiry cannot dispatch a stale action", async (outcome) => {
  const token = deferred<string>();
  const expired = deferred<Response>();
  let tokenCount = 0;
  const requests: Array<Request & { name?: string }> = [];
  const getToken = () => ++tokenCount === 5 ? token.promise : Promise.resolve("fixture-token");
  const fetchFn = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    const current = request(init);
    const name = JSON.parse(String(init?.body)).params?.name as string | undefined;
    requests.push({ ...current, name });
    if (name === "expired_action") return expired.promise;
    return Promise.resolve(response({ ok: true }, current.method === "initialize" ? "old-session" : undefined, current.id));
  });
  const client = createScopedMcpClient({ authMode: "bearer", getToken, fetchFn });
  const warm = client.call("warm", {});
  await vi.runAllTimersAsync();
  expect((await warm).error).toBeUndefined();
  const failed = client.call("expired_action", {});
  const waiting = client.call("must_not_dispatch", {});
  await vi.advanceTimersByTimeAsync(0);
  expired.resolve(new Response("expired", { status: 404 }));
  expect((await failed).error?.code).toBe(404);
  if (outcome === "resolve") token.resolve("late-token");
  else token.reject(new Error("late-token-error"));
  expect((await waiting).error?.message).toMatch(/superseded/i);
  expect(requests.some((entry) => entry.name === "must_not_dispatch")).toBe(false);
});

it("UT-CONSOLE-170-MCP-029: an old response body cannot overwrite the replacement session", async () => {
  const expired = deferred<Response>();
  const lateBody = deferred<string>();
  const requests: Array<Request & { name?: string }> = [];
  let initializations = 0;
  const fetchFn = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    const current = request(init);
    const name = JSON.parse(String(init?.body)).params?.name as string | undefined;
    requests.push({ ...current, name });
    if (current.method === "initialize") return Promise.resolve(response({}, ++initializations === 1 ? "old-session" : "new-session", current.id));
    if (name === "expired") return expired.promise;
    if (name === "late") {
      const slow = response({}, "late-session", current.id);
      Object.defineProperty(slow, "text", { value: () => lateBody.promise });
      return Promise.resolve(slow);
    }
    return Promise.resolve(response({ ok: true }, undefined, current.id));
  });
  const client = createScopedMcpClient({ authMode: "proxy", fetchFn });
  const failed = client.call("expired", {});
  const late = client.call("late", {});
  await vi.runAllTimersAsync();
  expired.resolve(new Response("expired", { status: 404 }));
  expect((await failed).error?.code).toBe(404);
  const successor = client.call("successor", {});
  await vi.runAllTimersAsync();
  expect((await successor).result).toEqual({ ok: true });
  lateBody.resolve(JSON.stringify({ jsonrpc: "2.0", id: requests.find((entry) => entry.name === "late")!.id, result: {} }));
  expect((await late).error?.message).toMatch(/superseded/i);
  const after = client.call("after", {});
  await vi.runAllTimersAsync();
  expect((await after).error).toBeUndefined();
  expect(requests.at(-1)?.headers["Mcp-Session-Id"]).toBe("new-session");
});

it("UT-CONSOLE-170-MCP-030: a non-Error transport failure is reported without replay", async () => {
  const fetchFn = vi.fn(() => Promise.reject("synthetic failure"));
  const client = createScopedMcpClient({ authMode: "proxy", fetchFn });
  expect((await client.call("action", {})).error?.message).toBe("MCP transport failed");
  expect(fetchFn).toHaveBeenCalledOnce();
});
