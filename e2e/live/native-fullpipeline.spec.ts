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

    const summary = page.getByTestId("severity-accent");
    await expect(summary).toBeVisible();
    await expect(summary).toContainText(target.name);
    await expect(summary).toContainText(target.namespace);
  } finally {
    stopScreenshots();
  }
});
