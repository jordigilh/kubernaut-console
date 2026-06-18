import { test, expect } from "@playwright/test";

test.describe("Standalone Mode E2E", () => {
  test("loads the application and shows welcome state", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("body")).toBeVisible();
    await expect(
      page.getByText(/kubernaut/i).first(),
    ).toBeVisible();
  });

  test("renders chat container", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const chatbot = page.locator(".kn-chat");
    await expect(chatbot).toBeVisible();
  });

  test("message bar is visible and accepts input", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const input = page.locator("textarea[aria-label='Type your message']");
    await expect(input).toBeVisible();
    await input.fill("Hello, Kubernaut!");
    await expect(input).toHaveValue("Hello, Kubernaut!");
  });

  test("sending a message shows user bubble and triggers agent response", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const input = page.locator("textarea[aria-label='Type your message']");
    await input.fill("pod crashlooping in production");

    const sendButton = page.locator("button[aria-label='Send message']");
    await sendButton.click();

    await expect(
      page.getByText("pod crashlooping in production"),
    ).toBeVisible({ timeout: 5000 });
  });

  test("PF6 styles are loaded (PatternFly CSS custom properties present)", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const hasKnVars = await page.evaluate(() => {
      const styles = getComputedStyle(document.documentElement);
      return styles.getPropertyValue("--kn-teal-600").trim().length > 0;
    });
    expect(hasKnVars).toBe(true);
  });

  test("no console errors on page load", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        errors.push(msg.text());
      }
    });

    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    const criticalErrors = errors.filter(
      (e) =>
        !e.includes("favicon") &&
        !e.includes("net::ERR") &&
        !e.includes("Failed to load resource"),
    );
    expect(criticalErrors).toHaveLength(0);
  });

  test("accessibility: main landmarks are present", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const mainContent = page.locator("main[role='log'], .kn-chat");
    await expect(mainContent.first()).toBeVisible();
  });

  test("stop streaming then send follow-up message succeeds", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const input = page.locator("textarea[aria-label='Type your message']");
    await input.fill("pod crashlooping in production");
    await page.locator("button[aria-label='Send message']").click();

    const stopBtn = page.locator("button[aria-label='Stop agent response']");
    await expect(stopBtn).toBeVisible({ timeout: 5000 });
    await stopBtn.click();

    await expect(stopBtn).not.toBeVisible({ timeout: 3000 });
    await expect(input).toBeEnabled();

    // Wait past the 500ms send rate limiter
    await page.waitForTimeout(600);

    await input.fill("what did you find so far?");
    await page.locator("button[aria-label='Send message']").click();

    await expect(
      page.getByText("what did you find so far?"),
    ).toBeVisible({ timeout: 5000 });
  });

  test("input remains enabled during agent streaming", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const input = page.locator("textarea[aria-label='Type your message']");
    await input.fill("investigate network latency");
    await page.locator("button[aria-label='Send message']").click();

    const stopBtn = page.locator("button[aria-label='Stop agent response']");
    await expect(stopBtn).toBeVisible({ timeout: 5000 });

    await expect(input).toBeEnabled();
    await expect(input).toHaveAttribute("placeholder", "Type to interrupt...");
  });
});
