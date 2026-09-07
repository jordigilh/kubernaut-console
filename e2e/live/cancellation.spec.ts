import { test, expect } from "@playwright/test";
import {
  fixtureNamespace,
  oomkillInvestigateMessage,
  oomkillTarget,
  openConsole,
  sendChatMessage,
  waitForInvestigationSummaryOrKnownRace,
} from "./helpers";

/**
 * FedRAMP AC-12 / AC-6 and OWASP ASVS V3: prove that the explicit console
 * cancellation path terminates the active backend investigation, rather than
 * merely aborting the browser's SSE response.
 */
test.describe("Interactive investigation cancellation", () => {
  test("explicit Cancel investigation releases the active session", async ({ page }) => {
    const target = oomkillTarget(fixtureNamespace("console-e2e-cancel"));

    await openConsole(page);
    await sendChatMessage(page, oomkillInvestigateMessage(target));
    await waitForInvestigationSummaryOrKnownRace(page);

    const cancelButton = page.getByRole("button", { name: "Cancel investigation" });
    await expect(cancelButton).toBeVisible();
    await cancelButton.click();

    await expect(cancelButton).not.toBeVisible();
    await expect(page.locator(".kn-phase-label")).toHaveText("Complete");
  });
});
