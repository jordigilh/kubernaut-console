import { test, expect } from "@playwright/test";
import {
  openConsole,
  sendChatMessage,
  waitForInvestigationSummaryOrKnownRace,
  isApprovalRequested,
  REAL_EXECUTION_TIMEOUT_MS,
  OOMKILL_TARGET,
} from "./helpers";

const INVESTIGATE_MESSAGE =
  `The ${OOMKILL_TARGET.name} ${OOMKILL_TARGET.kind} in ${OOMKILL_TARGET.namespace} is OOMKilled and CrashLoopBackOff, please investigate.`;

/**
 * MCP tool calls (docs/integration-guide.md's kubernaut_approve /
 * kubernaut_complete_no_action) against the real AF, real Dex-issued JWT,
 * real per-persona SAR authorization.
 *
 * Scope note (2026-08-02): AF has its own `/mcp` endpoint
 * (pkg/apifrontend/handler/mcp.go) with its own Authorizer and Bridge to
 * KA — architecturally distinct from KA's `/api/v1/mcp` (port :8088),
 * which is what every existing upstream MCP E2E test
 * (test/e2e/fullpipeline/05_mcp_interactive_lifecycle_test.go) exercises,
 * always via a K8s ServiceAccount token, never a Dex-issued persona JWT.
 * This suite is the only place either repo tests AF's own MCP surface with
 * the auth model a real interactive client (the console, per
 * docs/integration-guide.md) actually uses — deep protocol/session-lifecycle
 * correctness (takeover contention, disconnect recovery, etc.) is upstream's
 * job and is already covered there; this suite stays narrowly scoped to "does
 * our production UI correctly drive AF's real MCP endpoint for the actions
 * our UI exposes." Filed the coverage gap itself upstream as
 * jordigilh/kubernaut#1827 rather than building it out here.
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
 * than silently skipping it. Flagged as an example in jordigilh/kubernaut#1827.
 *
 * Current status: every test below is blocked on kubernaut#1818 — the
 * beforeEach's single investigate message (the console's real, only
 * investigation entry point) reliably fails to produce a renderable
 * investigation_summary against this cluster, so none of the decision UI
 * (Approve/Decline/Dismiss/Execute) ever appears. See
 * waitForInvestigationSummaryOrKnownRace's doc comment in helpers.ts.
 */
test.describe("Approval gate — real MCP calls", () => {
  test.beforeEach(async ({ page }) => {
    await openConsole(page);
    await sendChatMessage(page, INVESTIGATE_MESSAGE);
    await waitForInvestigationSummaryOrKnownRace(page);
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
