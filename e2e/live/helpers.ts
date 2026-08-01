import { type Page, expect } from "@playwright/test";

/**
 * Real-cluster timing is not mocked-suite instant: KubernautAgent performs
 * real tool calls (kubectl reads, workflow discovery) through a real AF
 * before mock-llm's scripted response even starts streaming back.
 */
export const REAL_INVESTIGATION_TIMEOUT_MS = 90_000;
export const REAL_EXECUTION_TIMEOUT_MS = 60_000;
export const REAL_VERIFICATION_TIMEOUT_MS = 60_000;

export async function openConsole(page: Page): Promise<void> {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(page.locator(".kn-chat")).toBeVisible();
}

export async function sendChatMessage(page: Page, text: string): Promise<void> {
  const input = page.locator("textarea[aria-label='Type your message']");
  await expect(input).toBeVisible();
  await input.fill(text);
  await page.locator("button[aria-label='Send message']").click();
}

/**
 * Waits for the real investigation_summary artifact to arrive (RCACard
 * rendered) — i.e. a real KubernautAgent finished real tool calls and
 * mock-llm's scripted RCA/workflow-options response streamed back.
 */
export async function waitForInvestigationSummary(page: Page): Promise<void> {
  await expect(page.getByTestId("severity-accent")).toBeVisible({
    timeout: REAL_INVESTIGATION_TIMEOUT_MS,
  });
}

export async function waitForPhaseLabel(
  page: Page,
  label: string,
  timeout = REAL_EXECUTION_TIMEOUT_MS,
): Promise<void> {
  await expect(page.locator(".kn-phase-label")).toHaveText(label, { timeout });
}

/** True once an ApprovalCard is rendered (workflow requires human sign-off). */
export async function isApprovalRequested(page: Page, timeout = 5_000): Promise<boolean> {
  try {
    await expect(page.getByRole("button", { name: "Approve" })).toBeVisible({ timeout });
    return true;
  } catch {
    return false;
  }
}

export async function approveIfRequested(page: Page): Promise<void> {
  if (await isApprovalRequested(page)) {
    await page.getByRole("button", { name: "Approve" }).click();
  }
}
