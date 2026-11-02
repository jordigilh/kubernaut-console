import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const fixture = "/e2e/console-foundation/fixture.html";

async function noOverflow(page: Page) {
  const sizes = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(sizes.scroll).toBeLessThanOrEqual(sizes.width);
}

for (const theme of ["light", "dark"] as const) {
  for (const width of [320, 360, 390, 620, 699, 700, 1024]) {
    test(`${theme} ${width}px: priority navigation and viewport`, async ({ page }) => {
      await page.setViewportSize({ width, height: 568 });
      await page.goto(`${fixture}?theme=${theme}`);
      await expect(page.getByRole("heading", { name: "Fixture screen" })).toBeVisible();
      await noOverflow(page);
      const nav = page.getByRole("navigation", { name: "Console navigation" });
      const more = nav.getByRole("button", { name: "More" });
      await expect(nav.getByRole("link", { name: "Approvals" })).toHaveAttribute("aria-current", "page");
      if (width <= 699) {
        await expect(more).toBeVisible();
        await expect(more).toHaveAttribute("aria-expanded", "false");
        await expect(nav.getByText("Overview")).toBeHidden();
        const priority = await nav.locator(".kn-foundation-priority").boundingBox();
        const button = await more.boundingBox();
        expect(priority && button && Math.abs(priority.y - button.y)).toBeLessThan(20);
        await more.click();
        await expect(nav.getByText("Overview")).toBeVisible();
        await noOverflow(page);
        const explore = await nav.getByRole("heading", { name: "Explore" }).boundingBox();
        const manage = await nav.getByRole("heading", { name: "Manage" }).boundingBox();
        if (!explore || !manage) throw new Error("Expected both secondary groups");
        if (width < 360) expect(manage.y).toBeGreaterThan(explore.y);
        else expect(Math.abs(manage.y - explore.y)).toBeLessThan(2);
        await page.keyboard.press("Escape");
        await expect(more).toBeFocused();
        await expect(more).toHaveAttribute("aria-expanded", "false");
      } else {
        await expect(more).toBeHidden();
        await expect(nav.getByText("Overview")).toBeVisible();
      }
      await expect(nav.getByText("Investigations")).not.toHaveAttribute("href");
    });
  }
}

test("phone keyboard focus and outside click close More without trapping focus", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 568 });
  await page.goto(fixture);
  const approvals = page.getByRole("link", { name: "Approvals" });
  const more = page.getByRole("button", { name: "More" });
  await page.keyboard.press("Tab");
  await expect(approvals).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(more).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(approvals).toBeFocused();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Space");
  await expect(more).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("button", { name: "Outside navigation" }).click();
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("button", { name: "Outside navigation" })).toBeFocused();
});

test("focus transfers when More disappears at the desktop breakpoint", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 568 });
  await page.goto(fixture);
  await page.getByRole("button", { name: "More" }).focus();
  await page.setViewportSize({ width: 700, height: 568 });
  await expect(page.getByRole("link", { name: "Approvals" })).toBeFocused();
});

test("focus remains outside navigation across a breakpoint change", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 568 });
  await page.goto(fixture);
  const more = page.getByRole("button", { name: "More" });
  await more.focus();
  await page.getByRole("button", { name: "Outside navigation" }).focus();
  await page.setViewportSize({ width: 700, height: 568 });
  await expect(page.getByRole("button", { name: "Outside navigation" })).toBeFocused();
});

test("Enter toggles More and Tab leaves it without stealing focus", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 568 });
  await page.goto(fixture);
  const more = page.getByRole("button", { name: "More" });
  await more.focus();
  await page.keyboard.press("Enter");
  await expect(more).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Outside navigation" })).toBeFocused();
  await expect(more).toHaveAttribute("aria-expanded", "false");
});

test("secondary current section and topology stay explicit", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 568 });
  await page.goto(`${fixture}?current=overview&topology=unknown`);
  const more = page.getByRole("button", { name: "More, current section: Overview" });
  await expect(more).not.toHaveAttribute("aria-current");
  await more.click();
  await expect(page.getByText("Topology unavailable")).toBeVisible();
  await page.goto(`${fixture}?topology=local`);
  await page.getByRole("button", { name: "More" }).click();
  await expect(page.getByText("Clusters")).toHaveCount(0);
  await page.goto(`${fixture}?topology=fleet`);
  await page.getByRole("button", { name: "More" }).click();
  await expect(page.getByText("Clusters")).toBeVisible();
});

test("fixture approvals open a review without backend requests", async ({ page }) => {
  const unexpected: string[] = [];
  const origin = new URL(test.info().project.use.baseURL!).origin;
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin !== origin || /^\/(api|a2a|mcp)(\/|$)/.test(url.pathname)) unexpected.push(request.url());
  });
  await page.setViewportSize({ width: 390, height: 568 });
  await page.goto(`${fixture}?view=approvals`);
  await expect(page.getByText("Fixture preview — no live decision is submitted")).toBeVisible();
  await page.getByRole("button", { name: "Review rar-demo-02" }).click();
  await expect(page.getByText("Deployment/demo-operator", { exact: true })).toBeVisible();
  await noOverflow(page);
  expect(unexpected).toEqual([]);
});

for (const theme of ["light", "dark"]) {
  test(`${theme} fixture shell has no serious or critical automated accessibility violations`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 568 });
    await page.goto(`${fixture}?theme=${theme}`);
    await page.getByRole("button", { name: "More" }).click();
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(results.violations.filter((item) => item.impact === "serious" || item.impact === "critical")).toEqual([]);
  });
}
