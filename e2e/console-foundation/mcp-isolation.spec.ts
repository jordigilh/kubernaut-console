import { expect, test } from "@playwright/test";

test("E2E-CONSOLE-170-MCP-001: invalidating an old client cannot dispatch into a successor", async ({ page }) => {
  const unexpected: string[] = [];
  const origin = `http://127.0.0.1:${Number(process.env.CONSOLE_FOUNDATION_PORT || 43871)}`;
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin === origin && !/^\/(api|a2a|mcp)(\/|$)/.test(url.pathname)) return route.continue();
    unexpected.push(route.request().url());
    return route.abort();
  });
  await page.goto("/e2e/console-foundation/mcp-isolation.html");
  await page.waitForFunction(() => !!window.mcpIsolationFixture);
  const { oldError, newValue, requests } = await page.evaluate(() => window.mcpIsolationFixture.run());

  expect(oldError).toMatch(/invalidated/i);
  expect(newValue).toEqual({ owner: "successor" });
  const old = requests.filter((request) => request.url.startsWith("https://old.invalid"));
  const successor = requests.filter((request) => request.url.startsWith("https://new.invalid"));
  expect(old.map((request) => request.method)).toEqual(["initialize"]);
  expect(old[0].aborted).toBe(true);
  expect(successor.map((request) => request.method)).toEqual(["initialize", "notifications/initialized", "tools/call"]);
  expect(successor[2].session).toBe("new-session");
  expect(unexpected).toEqual([]);
});

for (const status of [307, 308] as const) {
  test(`E2E-CONSOLE-170-MCP-002: native fetch rejects a synthetic ${status} mutation redirect`, async ({ page }) => {
    const origin = `http://127.0.0.1:${Number(process.env.CONSOLE_FOUNDATION_PORT || 43871)}`;
    const methods: string[] = [];
    const unexpected: string[] = [];
    const targetRequests: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/mcp-redirect-target") targetRequests.push(request.url());
    });
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) { unexpected.push(url.href); return route.abort(); }
      if (url.pathname === "/mcp") {
        const body = route.request().postDataJSON() as { id?: number; method: string };
        methods.push(body.method);
        if (body.method === "tools/call") {
          return route.fulfill({ status, headers: { location: `${origin}/mcp-redirect-target` }, body: "" });
        }
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ jsonrpc: "2.0", id: body.id, result: {} }) });
      }
      if (url.pathname === "/mcp-redirect-target") {
        return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      }
      if (/^\/(api|a2a)(\/|$)/.test(url.pathname)) { unexpected.push(url.href); return route.abort(); }
      return route.continue();
    });
    await page.goto("/e2e/console-foundation/mcp-isolation.html");
    await page.waitForFunction(() => !!window.mcpIsolationFixture);
    const result = await page.evaluate(() => window.mcpIsolationFixture.runRedirect());
    expect(result.error).toBeDefined();
    expect(methods).toEqual(["initialize", "notifications/initialized", "tools/call"]);
    expect(targetRequests).toEqual([]);
    expect(unexpected).toEqual([]);
  });
}

test("E2E-CONSOLE-170-MCP-003: explicit proxy mode sends a same-origin request without a browser bearer token", async ({ page }) => {
  const origin = `http://127.0.0.1:${Number(process.env.CONSOLE_FOUNDATION_PORT || 43871)}`;
  const methods: string[] = [];
  const unexpected: string[] = [];
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) { unexpected.push(url.href); return route.abort(); }
    if (url.pathname === "/mcp") {
      const body = route.request().postDataJSON() as { id?: number; method: string };
      methods.push(body.method);
      const accepted = (route.request().headers().accept ?? "").split(",").map((value) => value.trim());
      if (!accepted.includes("application/json") || !accepted.includes("text/event-stream")) return route.fulfill({ status: 400, body: "unacceptable" });
      if (route.request().headers().authorization) return route.fulfill({ status: 401, body: "unexpected browser token" });
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { proxy: "synthetic" } }) });
    }
    if (/^\/(api|a2a|mcp)(\/|$)/.test(url.pathname)) { unexpected.push(url.href); return route.abort(); }
    return route.continue();
  });
  await page.goto("/e2e/console-foundation/mcp-isolation.html");
  await page.waitForFunction(() => !!window.mcpIsolationFixture);
  const result = await page.evaluate(() => window.mcpIsolationFixture.runProxy());
  expect(result.result).toEqual({ proxy: "synthetic" });
  expect(result.tokenCalls).toBe(0);
  expect(result.requests.every((entry) => entry.credentials === "same-origin" && !entry.authorization)).toBe(true);
  expect(methods).toEqual(["initialize", "notifications/initialized", "tools/call"]);
  expect(unexpected).toEqual([]);
});
