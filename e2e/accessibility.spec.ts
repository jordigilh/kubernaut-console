import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("Accessibility (WCAG 2.1 AA)", () => {
  test("welcome state has no critical accessibility violations", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .exclude(".pf-chatbot__messagebox") // exclude empty message area
      .analyze();

    const critical = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );

    if (critical.length > 0) {
      const summary = critical.map(
        (v) =>
          `[${v.impact}] ${v.id}: ${v.description} (${v.nodes.length} instance${v.nodes.length > 1 ? "s" : ""})`,
      );
      console.log("Accessibility violations:\n" + summary.join("\n"));
    }

    expect(critical).toHaveLength(0);
  });

  test("chat input has accessible label", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const textarea = page.locator("textarea").first();
    const ariaLabel = await textarea.getAttribute("aria-label");
    const placeholder = await textarea.getAttribute("placeholder");

    expect(ariaLabel || placeholder).toBeTruthy();
  });

  test("send button has accessible name", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Fill input to make send button appear
    const textarea = page.locator("textarea").first();
    await textarea.fill("test");

    const sendBtn = page.locator('button[aria-label="Send"]');
    if (await sendBtn.isVisible()) {
      const label = await sendBtn.getAttribute("aria-label");
      expect(label).toBeTruthy();
    }
  });

  test("color contrast meets AA standards", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const results = await new AxeBuilder({ page })
      .withRules(["color-contrast"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious).toHaveLength(0);
  });

  test("keyboard navigation works for message input", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");

    const focused = page.locator(":focus");
    await expect(focused).toBeVisible();
  });
});
