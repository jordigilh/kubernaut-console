import { test, expect } from "@playwright/test";
import {
  openConsole,
  sendChatMessage,
  waitForInvestigationSummaryOrKnownRace,
  isApprovalRequested,
  isApprovalDenied,
  clickExecuteWorkflow,
  REAL_EXECUTION_TIMEOUT_MS,
  oomkillTarget,
  oomkillInvestigateMessage,
  parseMcpResponseBody,
} from "./helpers";

/**
 * Distinguishes the two reasons `isApprovalRequested()` can read false after
 * `clickExecuteWorkflow()`: (a) this run's policy auto-approved — nothing to
 * test, a legitimate skip — vs (b) RO *did* require approval and created a
 * real RAR, but the console's `kubernaut_get_approval_request` fetch was
 * denied (the `sre` persona RBAC gap — jordigilh/kubernaut-operator#278,
 * jordigilh/kubernaut#1869). Skipping silently in case (b) would hide a real,
 * tracked upstream bug behind a misleading "auto-approved" message.
 */
async function assertApprovalGateReachable(page: import("@playwright/test").Page): Promise<boolean> {
  const requested = await isApprovalRequested(page, 30_000);
  if (requested) return true;
  if (await isApprovalDenied(page, 2_000)) {
    throw new Error(
      "RemediationOrchestrator required approval and created a real RAR, but the console's " +
        "kubernaut_get_approval_request call was denied for the sre persona — this is the known, " +
        "already-filed RBAC gap (jordigilh/kubernaut-operator#278 for v1.5/the operator, " +
        "jordigilh/kubernaut#1869 for v1.6/the Helm chart), not a console bug: ChatContainer.tsx's " +
        "graceful-degradation card (`.kn-approval-denied`) rendered exactly as designed. Re-run once " +
        "either issue lands `kubernaut_get_approval_request` on the sre persona's ACL.",
    );
  }
  return false;
}

// One dedicated target per test (see helpers.ts's `oomkillTarget` doc
// comment) — the "approve" test actually executes a real remediation
// workflow against its target, so sharing one across approve/decline/dismiss
// would leave later tests investigating a resource whose state a prior test
// already mutated, on top of the session/dedup collision risk.
//
// approve/decline's namespaces are additionally labeled
// `kubernaut.ai/environment: production` (kubectl label namespace
// console-e2e-approval[-2] kubernaut.ai/environment=production) — this
// cluster's deployed OPA policy (aianalysis-policies ConfigMap,
// package aianalysis.approval) only sets `require_approval` when
// `input.environment == "production"`; input.environment itself is sourced
// straight from `namespace.labels["kubernaut.ai/environment"]"]`
// (signalprocessing-policy ConfigMap). Without this label, confidence and
// namespace name alone are irrelevant to this deployed policy variant — it
// has no confidence-threshold branch at all, unlike the richer
// pkg/aianalysis/testdata fixture used by upstream's own unit tests. Labeling
// the fixture namespace, not editing the deployed policy, keeps this
// surgical: only these two namespaces gain an approval gate, every other
// test in this suite keeps auto-approving. dismiss's namespace is
// deliberately left unlabeled since it never reaches workflow selection.
const TARGETS: Record<string, ReturnType<typeof oomkillTarget>> = {
  approve: oomkillTarget("console-e2e-approval"),
  decline: oomkillTarget("console-e2e-approval-2"),
  dismiss: oomkillTarget("console-e2e-approval-3"),
};

function targetForTest(title: string) {
  if (title.startsWith("approve path")) return TARGETS.approve;
  if (title.startsWith("decline path")) return TARGETS.decline;
  if (title.startsWith("dismiss path")) return TARGETS.dismiss;
  throw new Error(`No dedicated E2E target mapped for test title: "${title}" — add one to TARGETS above.`);
}

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
 * Confirmed RBAC gap (2026-08-02, via live reproduction on this cluster —
 * not just a values.yaml read): charts/kubernaut/values.yaml's (and the
 * operator's internal/resources/rbac.go's) `rbac.personas.sre` /
 * `tool-sre` list — the persona our test Dex user (sre@kubernaut.ai)
 * authenticates as — has kubernaut_approve and kubernaut_complete, but is
 * missing both kubernaut_complete_no_action (the tool ChatContainer.tsx
 * calls for Dismiss/Escalate — see "dismiss path" below) and
 * kubernaut_get_approval_request (the tool ChatContainer.tsx calls to fetch
 * full RAR details once `/a2a/status` reports `AwaitingApproval` — see
 * "approve path"/"decline path" below and `assertApprovalGateReachable`).
 * Filed upstream as jordigilh/kubernaut-operator#278 (v1.5, the operator —
 * the only supported production deployment path for 1.5) and
 * jordigilh/kubernaut#1869 (v1.6, the Helm chart, which only becomes a
 * supported production option in 1.6); both supersede the "don't yet know if
 * intentional" framing in jordigilh/kubernaut#1827 with a confirmed
 * reproduction. The console's own handling of both gaps is intentionally
 * graceful (a friendly denied message, not a silent hang or crash) — these
 * tests assert that shipped behavior and fail loudly with the issue numbers
 * above if the underlying ACL gap is still open, rather than silently
 * skipping it.
 *
 * Current status (2026-08-02): kubernaut#1853 (mock-llm test-fixture gap —
 * see waitForInvestigationSummaryOrKnownRace's doc comment in helpers.ts) is
 * worked around on this cluster via a hand-patched mock-llm-scenarios
 * ConfigMap, so the beforeEach's investigate message reliably produces a
 * renderable investigation_summary again.
 */
test.describe("Approval gate — real MCP calls", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await openConsole(page);
    await sendChatMessage(page, oomkillInvestigateMessage(targetForTest(testInfo.title)));
    await waitForInvestigationSummaryOrKnownRace(page);
  });

  test("approve path: real kubernaut_approve transitions RR to Executing", async ({ page }) => {
    // See TARGETS' doc comment: this triggers the real kubernaut_select_workflow
    // call, which is what actually makes RO evaluate ApprovalRequired and
    // (given this target's production label) create the RAR in the first
    // place. Confirmed empirically (2026-08-02): RO's reconcile loop takes
    // ~15s after the MCP call to create the RAR (kubectl timestamps: MCP call
    // completed :36.189Z, RAR created :20:50Z) before AF's watch surfaces the
    // approval_request SSE event to console — the default 5s isApprovalRequested
    // timeout reads false here purely from checking too early, not from policy.
    await clickExecuteWorkflow(page);
    test.skip(!(await assertApprovalGateReachable(page)), "This run's policy auto-approved — no approval gate to exercise.");

    const mcpToolCall = page.waitForResponse(
      (res) => res.url().endsWith("/mcp") && res.request().postData()?.includes("kubernaut_approve") === true,
    );
    await page.getByRole("button", { name: "Approve" }).click();
    const mcpRes = await mcpToolCall;
    const mcpBody = await parseMcpResponseBody(await mcpRes.text());
    expect(mcpBody.error, `kubernaut_approve should succeed for the sre persona: ${JSON.stringify(mcpBody.error)}`).toBeUndefined();

    await expect(page.locator(".kn-phase-label")).toHaveText(/Executing|Verifying|Complete/, {
      timeout: REAL_EXECUTION_TIMEOUT_MS,
    });
  });

  test("decline path: real kubernaut_approve(Rejected) reaches a terminal state", async ({ page }) => {
    // See approve path's comment: RO's RAR creation is ~15s async after this click.
    await clickExecuteWorkflow(page);
    test.skip(!(await assertApprovalGateReachable(page)), "This run's policy auto-approved — no approval gate to exercise.");

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
    const mcpBody = await parseMcpResponseBody(await mcpRes.text());

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
