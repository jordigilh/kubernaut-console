import { _resetSession } from "./mcp-client";
import { createScopedMcpClient } from "./scoped-mcp-client";

it("IT-CONSOLE-170-MCP-001: a delayed old action cannot publish into a separate synthetic consumer", async () => {
  vi.useFakeTimers();
  _resetSession();
  try {
    let releaseOld!: (response: Response) => void;
    let oldToolId: number | undefined;
    const delayedOld = new Promise<Response>((resolve) => { releaseOld = resolve; });
    const sent: Array<{ token: string | undefined; session: string | undefined; method: string; action?: string }> = [];
    const respond = (body: object, session?: string, id?: number) => new Response(JSON.stringify({ jsonrpc: "2.0", id, ...body }), {
      headers: session ? { "mcp-session-id": session } : {},
    });
    const fetchFn = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string>;
      const body = JSON.parse(String(init?.body));
      const token = headers.Authorization;
      const session = headers["Mcp-Session-Id"];
      sent.push({ token, session, method: body.method, action: body.params?.name });
      const expected = token === "Bearer old-fixture" ? "old-session" : "new-session";
      if (body.method === "initialize") return Promise.resolve(respond({ result: {} }, expected, body.id));
      if (session !== expected) return Promise.resolve(new Response("mismatched session", { status: 403 }));
      if (body.method === "tools/call" && token === "Bearer old-fixture") { oldToolId = body.id; return delayedOld; }
      return Promise.resolve(respond({ result: { owner: "new" } }, undefined, body.id));
    });
    vi.stubGlobal("fetch", fetchFn);
    const old = createScopedMcpClient({ authMode: "bearer", baseUrl: "https://fixture.invalid", getToken: async () => "old-fixture", fetchFn });
    const successor = createScopedMcpClient({ authMode: "bearer", baseUrl: "https://fixture.invalid", getToken: async () => "new-fixture", fetchFn });
    let generation = 1;
    const displayed: string[] = [];
    const publish = async (client: typeof old, action: string, rr: string) => {
      const captured = generation;
      const result = await client.call(action, { rr_id: rr });
      // This test-only consumer fences its own state; the client cannot do that for it.
      if (captured === generation && result.result) displayed.push((result.result as { owner: string }).owner);
      return result;
    };
    const oldAction = publish(old, "explicit_old_action", "fixture-old");
    await vi.runAllTimersAsync();
    expect(sent.some((entry) => entry.action === "explicit_old_action")).toBe(true);
    generation++;
    old.invalidate();
    const successorRead = publish(successor, "read_new", "fixture-new");
    await vi.runAllTimersAsync();
    const [oldResult, newResult] = await Promise.all([oldAction, successorRead]);
    releaseOld(respond({ result: { owner: "old" } }, undefined, oldToolId));
    await vi.runAllTimersAsync();

    expect(oldResult.error?.message).toMatch(/invalidated/i);
    expect(newResult.result).toEqual({ owner: "new" });
    expect(displayed).toEqual(["new"]);
    expect(sent.filter((entry) => entry.action === "explicit_old_action")).toHaveLength(1);
    expect(sent.filter((entry) => entry.token === "Bearer new-fixture" && entry.method !== "initialize")
      .every((entry) => entry.session === "new-session")).toBe(true);
    const next = successor.call("read_new_again", {});
    await vi.runAllTimersAsync();
    expect((await next).result).toEqual({ owner: "new" });
  } finally {
    _resetSession();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  }
});
