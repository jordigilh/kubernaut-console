import { test, expect } from "@playwright/test";

test.describe("Authenticated Console logout", () => {
  test("shows identity and requires a fresh IdP login after logout", async ({ page }) => {
    const previousText = "issue-139-private-transcript";
    const expectedIdentity =
      process.env.LIVE_E2E_EXPECTED_IDENTITY ?? "sre-user (sre-user@kubernaut.ai)";

    await page.addInitScript(({ previousText }) => {
      if (location.origin !== "https://kubernaut-console.local:8843") return;
      sessionStorage.setItem("kubernaut-console-messages", JSON.stringify([
        { id: "issue-139-private", role: "user", text: previousText, timestamp: 1 },
      ]));
      sessionStorage.setItem("kubernaut-console-context", "issue-139-old-context");
    }, { previousText });

    await page.goto("/");
    await expect(page.getByText(previousText)).toBeVisible();

    const profile = page.locator(".kn-header-avatar");
    await expect(profile).toHaveAttribute("title", expectedIdentity);
    await profile.click();

    await expect(page).toHaveURL(/\/protocol\/openid-connect\/auth/, { timeout: 60_000 });
    await expect(page.locator("#username")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(".kn-chat")).not.toBeVisible();
    await expect(page.getByText(previousText)).not.toBeVisible();
  });
});
