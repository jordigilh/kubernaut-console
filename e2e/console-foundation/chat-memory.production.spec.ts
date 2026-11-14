import { expect, test } from "@playwright/test";

const LEGACY_MESSAGES = JSON.stringify([{ id: "legacy", role: "user", text: "legacy transcript", timestamp: 1 }]);

test("E2E-CONSOLE-170-PROD-001: standalone mounts page-memory chat without transcript persistence", async ({ page }) => {
  const origin = `http://127.0.0.1:${Number(process.env.CONSOLE_PRODUCTION_PORT || 43873)}`;
  const unexpected: string[] = [];

  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue();
    if (url.origin === "https://fonts.googleapis.com" || url.origin === "https://fonts.gstatic.com") return route.abort();
    unexpected.push(route.request().url());
    return route.abort();
  });

  await page.addInitScript(({ messages }) => {
    sessionStorage.setItem("kubernaut-console-messages", messages);
    sessionStorage.setItem("kubernaut-console-context", "legacy-context");
    sessionStorage.setItem("kubernaut-pending-context", JSON.stringify(["legacy pending"]));
  }, { messages: LEGACY_MESSAGES });

  await page.goto("/");
  const input = page.getByRole("textbox", { name: /type your message/i });
  await expect(input).toBeVisible();
  await expect(page.getByText("legacy transcript", { exact: true })).not.toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("kubernaut-console-messages"))).toBeNull();

  await input.fill("production owner prompt");
  await input.press("Enter");
  await expect(page.getByText("production owner prompt", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("kubernaut-console-messages"))).toBeNull();

  await page.reload();
  await expect(input).toBeVisible();
  await expect(page.getByText("production owner prompt", { exact: true })).not.toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("kubernaut-console-messages"))).toBeNull();
  expect(unexpected).toEqual([]);
});
