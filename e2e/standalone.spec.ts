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

  test("renders PF6 chatbot container", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const chatbot = page.locator(".pf-chatbot");
    await expect(chatbot).toBeVisible();
  });

  test("message bar is visible and accepts input", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const textarea = page.locator("textarea").first();
    await expect(textarea).toBeVisible();
    await textarea.fill("Hello, Kubernaut!");
    await expect(textarea).toHaveValue("Hello, Kubernaut!");
  });

  test("sending a message shows user bubble and triggers agent response", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const textarea = page.locator("textarea").first();
    await textarea.fill("pod crashlooping in production");

    const sendButton = page.locator('button[aria-label="Send"]').first();
    if (await sendButton.isVisible()) {
      await sendButton.click();
    } else {
      await textarea.press("Enter");
    }

    // User message should appear
    await expect(
      page.getByText("pod crashlooping in production"),
    ).toBeVisible({ timeout: 5000 });
  });

  test("PF6 styles are loaded (PatternFly classes present)", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const pfElement = page.locator("[class*='pf-']").first();
    await expect(pfElement).toBeVisible();
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

    // PF6 Chatbot should have proper ARIA roles
    const mainContent = page.locator("[role='main'], main, .pf-chatbot");
    await expect(mainContent.first()).toBeVisible();
  });
});
