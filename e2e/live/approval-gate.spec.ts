import { test, expect } from "@playwright/test";
import {
  openConsole,
  sendChatMessage,
  waitForInvestigationSummary,
  isApprovalRequested,
  REAL_EXECUTION_TIMEOUT_MS,
} from "./helpers";

/**
 * MCP tool calls (docs/integration-guide.md's kubernaut_approve /
 * kubernaut_complete_no_action) against the real AF, real Dex-issued JWT,
 * real per-persona SAR authorization.
 *
 * Open question this suite exists partly to answer (found 2026-08-01
 * verifying against jordigilh/kubernaut@origin/main while drafting this
 * file): charts/kubernaut/values.yaml's `rbac.personas.sre` list —
 * the persona our test Dex user (sre@kubernaut.ai) authenticates as —
 * includes kubernaut_approve and kubernaut_complete, but does NOT list
 * kubernaut_complete_no_action, the exact tool ChatContainer.tsx calls for
 * Dismiss/Escalate. Whether that is a stale persona-ACL gap or dismiss/
 * escalate is intentionally restricted to a different persona is exactly
 * the kind of contract-drift this ADR-009 suite is meant to surface — the
 * "dismiss" test below asserts the currently-documented, currently-shipped
 * console behavior and will fail loudly (403 surfaced as a friendly error
 * message, per useChat.ts's friendlyError()) if that gap is real, rather
 * than silently skipping it.
 */
test.describe("Approval gate — real MCP calls", () => {
  test.beforeEach(async ({ page }) => {
    await openConsole(page);
    await sendChatMessage(page, "The worker Deployment in staging is stuck in CrashLoopBackOff, please investigate.");
    await waitForInvestigationSummary(page);
  });

  test("approve path: real kubernaut_approve transitions RR to Executing", async ({ page }) => {
    test.skip(!(await isApprovalRequested(page)), "This run's policy auto-approved — no approval gate to exercise.");

    const mcpToolCall = page.waitForResponse(
      (res) => res.url().endsWith("/mcp") && res.request().postData()?.includes("kubernaut_approve") === true,
    );
    await page.getByRole("button", { name: "Approve" }).click();
    const mcpRes = await mcpToolCall;
    const mcpBody = await mcpRes.json();
    expect(mcpBody.error, `kubernaut_approve should succeed for the sre persona: ${JSON.stringify(mcpBody.error)}`).toBeUndefined();

    await expect(page.locator(".kn-phase-label")).toHaveText(/Executing|Verifying|Complete/, {
      timeout: REAL_EXECUTION_TIMEOUT_MS,
    });
  });

  test("decline path: real kubernaut_approve(Rejected) reaches a terminal state", async ({ page }) => {
    test.skip(!(await isApprovalRequested(page)), "This run's policy auto-approved — no approval gate to exercise.");

    await page.getByRole("button", { name: "Decline" }).click();
    await expect(page.getByText(/Declined by|Rejected/i)).toBeVisible({ timeout: 15_000 });
  });

  test("dismiss path: real kubernaut_complete_no_action, no workflow executed", async ({ page }) => {
    const dismissButton = page.getByRole("button", { name: "No action needed" });
    // Only offered while still in the decision phase, before an approval
    // gate is reached (see ChatContainer's isPastDecisionPhase gating).
    test.skip(!(await dismissButton.isVisible().catch(() => false)), "Not in a dismissible phase for this run.");

    // The real MCP round-trip itself (not the parallel, best-effort audit
    // POST) is the actual authorization check this test cares about — see
    // the file-level doc comment on the sre persona's ACL gap.
    const mcpToolCall = page.waitForResponse(
      (res) => res.url().endsWith("/mcp") && res.request().postData()?.includes("kubernaut_complete_no_action") === true,
    );
    await dismissButton.click();
    const mcpRes = await mcpToolCall;
    const mcpBody = await mcpRes.json();

    if (mcpBody.error) {
      // Documents the failure mode precisely rather than a bare assertion
      // failure, so a real denial is self-explanatory in CI output.
      throw new Error(
        `kubernaut_complete_no_action denied for sre persona: ${JSON.stringify(mcpBody.error)}. ` +
          "See charts/kubernaut/values.yaml rbac.personas.sre — confirms the ACL gap flagged in this file's header comment.",
      );
    }

    await expect(page.locator(".kn-error")).not.toBeVisible();
    await expect(page.locator(".kn-phase-label")).toHaveText("Complete", { timeout: 15_000 });
  });
});
