import { expect, test } from "@playwright/test";

const fixture = "/e2e/console-foundation/fixture.html?view=read-states";

for (const status of ["loading", "empty", "unavailable", "forbidden", "missing"] as const) {
  test(`${status} does not render prior protected content`, async ({ page }) => {
    await page.goto(fixture);
    await expect(page.getByText("Authorized fixture data")).toBeVisible();
    await page.getByLabel("Read state").selectOption(status);
    await expect(page.getByText("Authorized fixture data")).toHaveCount(0);
    await expect(page.locator(`[data-read-state="${status}"]`)).toBeVisible();
    if (status !== "unavailable") await expect(page.getByRole("button", { name: "Retry Records" })).toHaveCount(0);
  });
}

for (const status of ["ready", "partial", "stale"] as const) {
  test(`${status} retains explicitly supplied data and provenance`, async ({ page }) => {
    await page.goto(fixture);
    await page.getByLabel("Read state").selectOption(status);
    await expect(page.getByText("Authorized fixture data")).toBeVisible();
    await expect(page.getByText("Source: Fixture source · Observed: 2026-01-01", { exact: true })).toBeVisible();
    if (status !== "ready") await expect(page.locator(`[data-read-state="${status}"] [role=status]`)).toBeVisible();
  });
}

test("targeted retry is explicit and preserves unrelated draft", async ({ page }) => {
  await page.goto(fixture);
  await page.getByLabel("Unrelated draft").fill("Keep this draft");
  await page.getByLabel("Read state").selectOption("unavailable");
  await expect(page.getByText("Retry count: 0")).toBeVisible();
  await page.getByRole("button", { name: "Retry Records" }).click();
  await expect(page.getByText("Retry count: 1")).toBeVisible();
  await expect(page.getByLabel("Unrelated draft")).toHaveValue("Keep this draft");
  await expect(page.getByText("Authorized fixture data")).toHaveCount(0);
});
