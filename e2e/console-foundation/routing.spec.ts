import { expect, test } from "@playwright/test";

test("fixture sections navigate, preserve browser history, and do not call services", async ({ page }) => {
  const unexpected: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.hostname !== "127.0.0.1" || /^\/(api|a2a|mcp)(\/|$)/.test(url.pathname)) unexpected.push(request.url());
  });
  await page.goto("/e2e/console-foundation/fixture.html?view=routing#fixture/approvals");
  await expect(page.getByText("Fixture-only preview", { exact: false })).toBeVisible();
  await page.getByRole("link", { name: "Investigations" }).click();
  await expect(page.getByRole("heading", { name: "Recorded investigations" })).toBeVisible();
  await page.getByRole("link", { name: "Workflows" }).click();
  await expect(page.getByRole("heading", { name: "Workflow catalog" })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Recorded investigations" })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole("heading", { name: "Workflow catalog" })).toBeVisible();
  await page.goto("/e2e/console-foundation/fixture.html?view=routing#fixture/not-real");
  await expect(page.getByRole("heading", { name: "Fixture route not found" })).toBeVisible();
  expect(unexpected).toEqual([]);
});

test("mobile navigation exposes fixture screens without mounting a second shell", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/e2e/console-foundation/fixture.html?view=routing#fixture/approvals");
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("link", { name: "Administration" }).click();
  await expect(page.getByRole("heading", { name: "Administration", exact: true })).toBeVisible();
  await expect(page.locator('[aria-label="Fixture section"]')).toBeFocused();
  await expect(page.getByRole("navigation", { name: "Console navigation" })).toHaveCount(1);
  await expect(page.getByRole("button", { name: /More, current section: Administration/ })).toHaveAttribute("aria-expanded", "false");
});

test("administration theme preview updates the shell and survives section changes", async ({ page }) => {
  await page.goto("/e2e/console-foundation/fixture.html?view=routing&theme=dark#fixture/administration");
  const shell = page.locator(".kn-foundation");
  await page.getByRole("button", { name: "Open console settings" }).click();
  await expect(page.getByText("Theme preview: dark")).toBeVisible();
  await page.getByRole("button", { name: "Preview light theme" }).click();
  await expect(shell).toHaveAttribute("data-theme", "light");
  await page.getByRole("link", { name: "Workflows" }).click();
  await expect(shell).toHaveAttribute("data-theme", "light");
  await page.getByRole("link", { name: "Administration" }).click();
  await page.getByRole("button", { name: "Open console settings" }).click();
  await page.getByRole("button", { name: "Preview dark theme" }).click();
  await expect(shell).toHaveAttribute("data-theme", "dark");
});
