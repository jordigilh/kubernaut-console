import { expect, test, type Page } from "@playwright/test";

const legacy: Record<string, string> = {
  "kubernaut-console-messages": JSON.stringify([{ id: "old", role: "user", text: "Legacy fixture content", timestamp: 1 }]),
  "kubernaut-console-context": "legacy-fixture-context",
  "kubernaut-pending-context": JSON.stringify(["legacy fixture pending"]),
  "kubernaut-console-phase": "complete",
  "kubernaut-console-workflow-resolved": JSON.stringify(["fixture/rr-1"]),
};

async function denyUnexpectedRequests(page: Page) {
  const unexpected: string[] = [];
  const fixtureOrigin = `http://127.0.0.1:${Number(process.env.CONSOLE_FOUNDATION_PORT || 43871)}`;
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin === fixtureOrigin && !/^\/(api|a2a|mcp)(\/|$)/.test(url.pathname)) return route.continue();
    unexpected.push(route.request().url());
    return route.abort();
  });
  return unexpected;
}

test("E2E-CONSOLE-170-001: page memory ignores legacy state and reload never replays", async ({ page }) => {
  const unexpected = await denyUnexpectedRequests(page);
  await page.goto("/e2e/console-foundation/chat-memory.html");
  await page.waitForFunction(() => !!window.chatMemoryFixture);
  await page.evaluate((values) => {
    for (const [key, value] of Object.entries(values)) sessionStorage.setItem(key, value);
    localStorage.setItem("kubernaut-console-show-raw-thinking", "true");
    window.chatMemoryFixture.render(true);
  }, legacy);
  const input = page.getByRole("textbox", { name: /type your message/i });
  await expect(input).toBeVisible();
  await expect(page.getByText("Legacy fixture content")).toHaveCount(0);
  expect(await page.evaluate(() => window.chatMemoryFixture.requests.length)).toBe(0);

  await input.fill("Synthetic explicit send");
  await input.press("Enter");
  await expect.poll(() => page.evaluate(() => window.chatMemoryFixture.requests.length)).toBe(1);
  const request = await page.evaluate(() => window.chatMemoryFixture.requests[0] as { params: { message: { contextId: string; parts: Array<{ text: string }> } } });
  expect(request.params.message.contextId).toBeTruthy();
  expect(request.params.message.contextId).not.toBe("legacy-fixture-context");
  expect(request.params.message.parts[0].text).toBe("Synthetic explicit send");
  await input.fill("Unsent fixture draft");
  await page.evaluate(() => window.chatMemoryFixture.render(false));
  await expect(input).toHaveCount(0);
  await page.evaluate(() => window.chatMemoryFixture.render(true));
  await expect(input).toHaveValue("Unsent fixture draft");
  expect(await page.evaluate(() => window.chatMemoryFixture.requests.length)).toBe(1);

  await page.reload();
  await page.waitForFunction(() => !!window.chatMemoryFixture);
  await page.evaluate(() => window.chatMemoryFixture.render(true));
  await expect(input).toHaveValue("");
  await expect(page.getByText("Synthetic explicit send")).toHaveCount(0);
  expect(await page.evaluate(() => window.chatMemoryFixture.requests.length)).toBe(0);
  const stored = await page.evaluate((keys) => Object.fromEntries(keys.map((key) => [key, sessionStorage.getItem(key)])), Object.keys(legacy));
  expect(stored).toEqual(legacy);
  expect(await page.evaluate(() => localStorage.getItem("kubernaut-console-show-raw-thinking"))).toBe("true");
  expect(unexpected).toEqual([]);
});

test("E2E-CONSOLE-170-002: denied browser storage does not widen the owner", async ({ page }) => {
  const unexpected = await denyUnexpectedRequests(page);
  await page.goto("/e2e/console-foundation/chat-memory.html");
  await page.waitForFunction(() => !!window.chatMemoryFixture);
  await page.evaluate(() => {
    for (const key of ["sessionStorage", "localStorage"]) {
      Object.defineProperty(window, key, { configurable: true, get() { throw new DOMException("denied", "SecurityError"); } });
    }
    window.chatMemoryFixture.render(true);
  });
  const input = page.getByRole("textbox", { name: /type your message/i });
  await input.fill("Synthetic denied-storage send");
  await input.press("Enter");
  await expect.poll(() => page.evaluate(() => window.chatMemoryFixture.requests.length)).toBe(1);
  expect(unexpected).toEqual([]);
});

test("E2E-CONSOLE-170-003: a failed context reset retains the draft until an explicit retry", async ({ page }) => {
  const unexpected = await denyUnexpectedRequests(page);
  await page.goto("/e2e/console-foundation/chat-memory.html");
  await page.waitForFunction(() => !!window.chatMemoryFixture);
  await page.evaluate(() => window.chatMemoryFixture.render(true));
  const input = page.getByRole("textbox", { name: /type your message/i });
  await expect(input).toBeVisible();
  await page.evaluate(() => { Object.defineProperty(crypto, "randomUUID", { configurable: true, value: () => "" }); });
  await page.getByRole("button", { name: "New conversation" }).click();
  await expect(page.getByRole("alert")).toContainText(/context/i);
  await input.fill("Retain this draft");
  await input.press("Enter");
  await expect(input).toHaveValue("Retain this draft");
  expect(await page.evaluate(() => window.chatMemoryFixture.requests.length)).toBe(0);
  await page.evaluate(() => { Object.defineProperty(crypto, "randomUUID", { configurable: true, value: () => "33333333-3333-4333-8333-333333333333" }); });
  await page.getByRole("button", { name: "New conversation" }).click();
  await expect(input).toHaveValue("Retain this draft");
  expect(await page.evaluate(() => window.chatMemoryFixture.requests.length)).toBe(0);
  await input.press("Enter");
  await expect.poll(() => page.evaluate(() => window.chatMemoryFixture.requests.length)).toBe(1);
  expect(unexpected).toEqual([]);
});
