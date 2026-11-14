import { createScopedMcpClient } from "./scoped-mcp-client";
import type { McpResult } from "./mcp-client";

type RpcRequest = { id?: number; method: string; params?: { name: string } };
type Captured = { body: RpcRequest; headers: Record<string, string>; redirect: RequestRedirect | undefined };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => { resolve = finish; });
  return { promise, resolve };
}

function read(init?: RequestInit): Captured {
  return { body: JSON.parse(String(init?.body)), headers: init?.headers as Record<string, string>, redirect: init?.redirect };
}

function success(id?: number, session?: string, result: unknown = { ok: true }) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), { headers: session ? { "mcp-session-id": session } : {} });
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

it("UT-CONSOLE-170-MCP-021: SSE progress preceding an action error cannot be interpreted as success", async () => {
  const fetchFn = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    const { body } = read(init);
    if (body.method !== "tools/call") return Promise.resolve(success(body.id));
    const notification = { jsonrpc: "2.0", method: "notifications/progress", params: { progress: 1 } };
    const failure = { jsonrpc: "2.0", id: body.id, error: { code: -32000, message: "synthetic action rejected" } };
    return Promise.resolve(new Response(`data: ${JSON.stringify(notification)}\n\ndata: ${JSON.stringify(failure)}\n\n`, { headers: { "Content-Type": "text/event-stream" } }));
  });
  const action = createScopedMcpClient({ authMode: "proxy", fetchFn }).call("action", {});
  await vi.runAllTimersAsync();
  expect((await action).error).toEqual({ code: -32000, message: "synthetic action rejected" });
});

it("UT-CONSOLE-170-MCP-036: a correlated response in a batched SSE event is accepted", async () => {
  const fetchFn = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    const current = read(init).body;
    if (current.method !== "tools/call") return Promise.resolve(success(current.id));
    const response = [{ jsonrpc: "2.0", id: current.id, result: { batched: true } }];
    return Promise.resolve(new Response(`data: ${JSON.stringify(response)}\n\n`, { headers: { "Content-Type": "text/event-stream" } }));
  });
  const pending = createScopedMcpClient({ authMode: "proxy", fetchFn }).call("action", {});
  await vi.runAllTimersAsync();
  expect((await pending).result).toEqual({ batched: true });
});

it.each([
  { label: "wrong id", make: (id: number) => ({ jsonrpc: "2.0", id: id + 1, result: { ok: true } }) },
  { label: "missing id", make: () => ({ jsonrpc: "2.0", result: { ok: true } }) },
  { label: "wrong protocol", make: (id: number) => ({ jsonrpc: "1.0", id, result: { ok: true } }) },
])("UT-CONSOLE-170-MCP-022: a response with $label fails closed", async ({ make }) => {
  const fetchFn = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    const { body } = read(init);
    if (body.method !== "tools/call") return Promise.resolve(success(body.id));
    return Promise.resolve(new Response(JSON.stringify(make(body.id!))));
  });
  const action = createScopedMcpClient({ authMode: "proxy", fetchFn }).call("action", {});
  await vi.runAllTimersAsync();
  expect((await action).error).toBeDefined();
});

it("UT-CONSOLE-170-MCP-023: the transport rejects redirects instead of following a mutation", async () => {
  const requests: Captured[] = [];
  const fetchFn = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    const current = read(init);
    requests.push(current);
    return Promise.resolve(success(current.body.id));
  });
  const action = createScopedMcpClient({ authMode: "proxy", fetchFn }).call("action", {});
  await vi.runAllTimersAsync();
  expect((await action).error).toBeUndefined();
  expect(requests.every((entry) => entry.redirect === "error")).toBe(true);
});

it("UT-CONSOLE-170-MCP-024: an expired session reinitializes only for the next explicit action", async () => {
  const requests: Captured[] = [];
  let initialization = 0;
  const fetchFn = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    const current = read(init);
    requests.push(current);
    if (current.body.method === "initialize") {
      initialization++;
      return Promise.resolve(success(current.body.id, initialization === 1 ? "old-session" : "new-session"));
    }
    if (current.body.method === "tools/call" && current.body.params?.name === "first_action") return Promise.resolve(new Response("expired", { status: 404 }));
    return Promise.resolve(success(current.body.id));
  });
  const client = createScopedMcpClient({ authMode: "proxy", fetchFn });
  const first = client.call("first_action", {});
  await vi.runAllTimersAsync();
  expect((await first).error?.code).toBe(404);
  expect(requests.filter((entry) => entry.body.method === "tools/call")).toHaveLength(1);
  const next = client.call("different_explicit_action", {});
  await vi.runAllTimersAsync();
  expect((await next).result).toEqual({ ok: true });
  expect(requests.map((entry) => entry.body.method)).toEqual(["initialize", "notifications/initialized", "tools/call", "initialize", "notifications/initialized", "tools/call"]);
  expect(requests[3].headers["Mcp-Session-Id"]).toBeUndefined();
  expect(requests[5].headers["Mcp-Session-Id"]).toBe("new-session");
});

it("UT-CONSOLE-170-MCP-025: late expiry from an old session cannot reset its successor", async () => {
  const first = deferred<Response>();
  const late = deferred<Response>();
  const requests: Captured[] = [];
  let initializations = 0;
  const fetchFn = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    const current = read(init);
    requests.push(current);
    if (current.body.method === "initialize") return Promise.resolve(success(current.body.id, ++initializations === 1 ? "old-session" : "new-session"));
    if (current.body.params?.name === "old_first") return first.promise;
    if (current.body.params?.name === "old_late") return late.promise;
    return Promise.resolve(success(current.body.id));
  });
  const client = createScopedMcpClient({ authMode: "proxy", fetchFn });
  const firstCall = client.call("old_first", {});
  const lateCall = client.call("old_late", {});
  await vi.runAllTimersAsync();
  first.resolve(new Response("expired", { status: 404 }));
  expect((await firstCall).error?.code).toBe(404);
  const next = client.call("new_action", {});
  await vi.runAllTimersAsync();
  expect((await next).result).toEqual({ ok: true });
  late.resolve(new Response("expired", { status: 404 }));
  expect((await lateCall).error).toBeDefined();
  const after = client.call("after_late_failure", {});
  await vi.runAllTimersAsync();
  expect((await after).result).toEqual({ ok: true });
  expect(initializations).toBe(2);
  expect(requests.at(-1)?.headers["Mcp-Session-Id"]).toBe("new-session");
});

it("UT-CONSOLE-170-MCP-026: a synchronously reentrant transport joins one handshake", async () => {
  const requests: Captured[] = [];
  let inner: Promise<unknown> | undefined;
  let reentered = false;
  const fetchFn = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    const current = read(init);
    requests.push(current);
    if (current.body.method === "initialize" && !reentered) { reentered = true; inner = client.call("inner", {}); }
    return Promise.resolve(success(current.body.id));
  });
  const client = createScopedMcpClient({ authMode: "proxy", fetchFn });
  const outer = client.call("outer", {});
  await vi.runAllTimersAsync();
  await Promise.all([outer, inner]);
  expect(requests.map((entry) => entry.body.method)).toEqual(["initialize", "notifications/initialized", "tools/call", "tools/call"]);
});

it.each([
  { label: "notifications only", body: (id: number) => `data: ${JSON.stringify({ jsonrpc: "2.0", method: "notifications/progress", params: { id } })}\n\n` },
  { label: "duplicate responses", body: (id: number) => `data: ${JSON.stringify({ jsonrpc: "2.0", id, result: {} })}\n\ndata: ${JSON.stringify({ jsonrpc: "2.0", id, result: {} })}\n\n` },
  { label: "malformed error", body: (id: number) => JSON.stringify({ jsonrpc: "2.0", id, error: { code: "bad", message: "failure" } }) },
  { label: "ambiguous envelope", body: (id: number) => JSON.stringify({ jsonrpc: "2.0", id, error: { code: -1, message: "failure" }, result: {} }) },
  { label: "non-object JSON", body: () => "null" },
  { label: "invalid JSON", body: () => "not-json" },
])("UT-CONSOLE-170-MCP-031: $label cannot masquerade as a successful result", async ({ body }) => {
  const fetchFn = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    const current = read(init).body;
    if (current.method !== "tools/call") return Promise.resolve(success(current.id));
    return Promise.resolve(new Response(body(current.id!)));
  });
  const pending = createScopedMcpClient({ authMode: "proxy", fetchFn }).call("action", {});
  await vi.runAllTimersAsync();
  expect((await pending).error?.message).toMatch(/invalid or uncorrelated/i);
});

it("UT-CONSOLE-170-MCP-032: a multi-line SSE result after progress is correlated to its action", async () => {
  const fetchFn = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    const current = read(init).body;
    if (current.method !== "tools/call") return Promise.resolve(success(current.id));
    const progress = JSON.stringify({ jsonrpc: "2.0", method: "notifications/progress" });
    const payload = `: heartbeat\r\ndata: \r\n\r\nevent: message\r\ndata: ${progress}\r\n\r\ndata: {"jsonrpc":"2.0",\r\ndata: "id":${current.id},"result":{"ok":true}}\r\n\r\n`;
    return Promise.resolve(new Response(payload, { headers: { "Content-Type": "text/event-stream" } }));
  });
  const pending = createScopedMcpClient({ authMode: "proxy", fetchFn }).call("action", {});
  await vi.runAllTimersAsync();
  expect((await pending).result).toEqual({ ok: true });
});

it("UT-CONSOLE-170-MCP-033: a late 404 for an older session header cannot evict a newer header", async () => {
  const old = deferred<Response>();
  const replacement = deferred<Response>();
  const requests: Captured[] = [];
  const fetchFn = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    const current = read(init);
    requests.push(current);
    if (current.body.method === "initialize") return Promise.resolve(success(current.body.id, "old-session"));
    if (current.body.params?.name === "old_request") return old.promise;
    if (current.body.params?.name === "replacement_header") return replacement.promise;
    return Promise.resolve(success(current.body.id));
  });
  const client = createScopedMcpClient({ authMode: "proxy", fetchFn });
  const oldCall = client.call("old_request", {});
  const replacementCall = client.call("replacement_header", {});
  await vi.runAllTimersAsync();
  const id = requests.find((entry) => entry.body.params?.name === "replacement_header")!.body.id;
  replacement.resolve(success(id, "new-session"));
  expect((await replacementCall).result).toEqual({ ok: true });
  old.resolve(new Response("expired", { status: 404 }));
  expect((await oldCall).error?.code).toBe(404);
  const next = client.call("next", {});
  await vi.runAllTimersAsync();
  expect((await next).error).toBeUndefined();
  expect(requests.filter((entry) => entry.body.method === "initialize")).toHaveLength(1);
  expect(requests.at(-1)?.headers["Mcp-Session-Id"]).toBe("new-session");
});

it("UT-CONSOLE-170-MCP-034: reentrant abort callbacks cannot dispatch another action", async () => {
  const requests: Captured[] = [];
  let reentrant: Promise<McpResult> | undefined;
  const fetchFn = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    const current = read(init);
    requests.push(current);
    if (current.body.method === "tools/call") {
      (init?.signal as AbortSignal).addEventListener("abort", () => {
        reentrant = client.call("after_invalidation", {});
      }, { once: true });
      return new Promise<Response>(() => {});
    }
    return Promise.resolve(success(current.body.id, current.body.method === "initialize" ? "fixture-session" : undefined));
  });
  const client = createScopedMcpClient({ authMode: "proxy", fetchFn });
  const pending = client.call("explicit_action", {});
  await vi.runAllTimersAsync();
  expect(requests.at(-1)?.body.method).toBe("tools/call");
  client.invalidate();
  expect((await pending).error?.message).toMatch(/invalidated/i);
  expect(reentrant).toBeDefined();
  expect((await reentrant)?.error?.message).toMatch(/invalidated/i);
  expect(requests.filter((entry) => entry.body.method === "tools/call")).toHaveLength(1);
});

it("UT-CONSOLE-170-MCP-035: SSE tool errors remain errors without replay", async () => {
  const requests: Captured[] = [];
  const fetchFn = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    const current = read(init);
    requests.push(current);
    if (current.body.method !== "tools/call") return Promise.resolve(success(current.body.id));
    const event = { jsonrpc: "2.0", id: current.body.id, result: { isError: true, content: [{ text: "permission denied: fixture" }, { text: "action rejected" }] } };
    return Promise.resolve(new Response(`data: ${JSON.stringify(event)}\n\n`, { headers: { "Content-Type": "text/event-stream" } }));
  });
  const pending = createScopedMcpClient({ authMode: "proxy", fetchFn }).call("explicit_action", {});
  await vi.runAllTimersAsync();
  expect((await pending).error).toEqual({ code: -32000, message: "permission denied: fixture; action rejected" });
  expect(requests.filter((entry) => entry.body.method === "tools/call")).toHaveLength(1);
});
