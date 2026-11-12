import { expect, test } from "@playwright/test";
import {
  oomkillInvestigateMessage,
  openConsole,
  sendChatMessage,
  startPeriodicScreenshots,
  waitForInvestigationSummary,
} from "./helpers";
import { nativeFullPipelineTarget } from "./native-fullpipeline-target";

test("native FullPipeline investigates the upstream stable memory-eater target read-only", async ({ page }) => {
  const target = nativeFullPipelineTarget();
  const stopScreenshots = startPeriodicScreenshots(page, "native-fullpipeline");

  try {
    await openConsole(page);
    await sendChatMessage(page, oomkillInvestigateMessage(target));
    await waitForInvestigationSummary(page);

    await expect(page.getByTestId("severity-accent")).toBeVisible();
    await expect(page.locator(".kn-chat")).toContainText(target.name);
    await expect(page.locator(".kn-chat")).toContainText(target.namespace);
  } finally {
    stopScreenshots();
  }
});
