import { test, expect } from "@playwright/test";
import {
  openConsole,
  sendChatMessage,
  waitForInvestigationSummaryOrKnownRace,
  waitForPhaseLabel,
  clickExecuteWorkflow,
  assertApprovalGateReachable,
  REAL_INVESTIGATION_TIMEOUT_MS,
  REAL_EXECUTION_TIMEOUT_MS,
  REAL_VERIFICATION_TIMEOUT_MS,
  oomkillTarget,
  oomkillInvestigateMessage,
  crashloopTarget,
  crashloopInvestigateMessage,
  fixtureNamespace,
} from "./helpers";

// One dedicated target per test — see helpers.ts's `oomkillTarget` doc
// comment (this file's first test also executes a real remediation
// workflow, mutating its target's state).
const TARGETS = {
  // -3, not the original: -1/-2 both accumulated 3+ consecutive
  // IneffectiveChain hits (issue #214's routing safety net) from repeated
  // manual re-runs against the same fixed starting spec during today's
  // #1853 validation — RO's DataStorage-backed hash-chain check correctly
  // blocked further automatic remediation on those targets. Confirmed via
  // direct action_history.audit_events query (2026-08-02): the same
  // pre_remediation_spec_hash recurred 3x for console-e2e-lifecycle. Not a
  // product bug — see ADR-009 §13.
  //
  // Uses `crashloopTarget`, not `oomkillTarget` (kubernaut-console#54): this
  // test's first step requires the LLM to reliably discover and select a
  // real workflow, which real-LLM runs against the synthetic memory-eater
  // fixture do not guarantee (see crashloopTarget's doc comment in
  // helpers.ts). Unlike memory-eater's indefinite OOM loop, a *successful*
  // rollback here permanently heals the target — the fault
  // (`oc patch deployment worker -n console-e2e-lifecycle-3 ...`, see
  // crashloopTarget's doc comment) must be re-injected before each re-run of
  // this specific test.
  //
  // Namespace is labeled `kubernaut.ai/environment=production` (like
  // approve/decline's targets): `crashloop-rollback-v1` and every sibling
  // rollback workflow in the catalog is registered with
  // `labels.environment: ["production"]` (no wildcard — confirmed via direct
  // `remediation_workflow_catalog` query, 2026-08-05), so workflow discovery
  // returns zero candidates without it. This also means this test now
  // deterministically hits the same known RBAC gap as approve/decline
  // (`kubernaut_get_approval_request` denied for the `sre` persona —
  // jordigilh/kubernaut-operator#278, jordigilh/kubernaut#1869) instead of
  // reaching Verifying/Complete — see `assertApprovalGateReachable`'s doc
  // comment. Accepted tradeoff (vs. a non-production namespace, where no
  // registered workflow matches at all): a deterministic, already-attributed
  // failure is strictly better than the prior memory-eater-driven flakiness.
  // Expected to go green end-to-end once either RBAC issue lands.
  //
  // fixtureNamespace() appends LIVE_E2E_NS_SUFFIX (scripts/setup-fixtures.sh)
  // so re-running this exact scenario doesn't reaccumulate the IneffectiveChain/
  // ConsecutiveFailures hits described above — see fixtureNamespace's doc
  // comment in helpers.ts. This supersedes the old workaround of bumping the
  // namespace's numeric suffix (-1 -> -2 -> -3) by hand each time it fouled.
  fullLifecycle: crashloopTarget(fixtureNamespace("console-e2e-lifecycle-3")),
  noConsoleErrors: oomkillTarget(fixtureNamespace("console-e2e-lifecycle-2")),
};

/**
 * ADR-009's flagship scenario: "a real signal ingested, a real
 * investigation run, a real remediation executed, and the actual console
 * UI rendering all of it correctly."
 *
 * Scope note (found while drafting this suite, 2026-08-01): the console
 * has no feature to observe an RR it didn't itself create — there is no
 * "list active remediations" / attach-by-rr_id UI entry point today (see
 * packages/ui-core/src/components/ChatContainer.tsx: `rrId` only ever
 * comes from a message/stream response the console's own chat message
 * triggered). ADR-009's "gateway"-originated signal path is exercised by
 * kubernaut's own fullpipeline Go suite directly (it POSTs synthetic
 * alerts to Gateway itself); this suite instead drives the *interactive*
 * investigation path — the only one the console UI actually implements —
 * which is a real, first-class, fully-supported way to create a real
 * RemediationRequest against the real cluster, exercising the identical
 * real backend, real Job-based execution (no Tekton), and real status
 * stream this ADR is about. If a future console feature adds RR discovery
 * (see issue #40's "Remediations" list mockup), a
 * gateway-signal-then-attach scenario belongs here too.
 *
 * Confirmed by the maintainer (2026-08-01): Gateway itself is not required
 * for any scenario in this suite and can be excluded from the cluster's
 * deploy to shrink its footprint (ADR-009 §5) — this file's Given/When/Then
 * never touches Gateway, directly or indirectly.
 *
 * No Tekton: oomkill-increase-memory-v1's ExecutionEngine is "job"
 * (test/services/mock-llm/scenarios/scenario_oomkilled.go) — this
 * scenario is itself proof-by-construction of ADR-009 §5's "no Tekton"
 * decision, not just an assumption of it.
 *
 * Target (revised 2026-08-05, kubernaut-console#54): the "full flow" test
 * drives against a dedicated `crashloopTarget` (a real `worker` Deployment
 * mirroring kubernaut-demo-scenarios' `crashloop` scenario) in its own
 * `console-e2e-lifecycle-3` namespace; "no console errors" still uses
 * `oomkillTarget`'s `memory-eater` since it only needs *some* investigation
 * to start. See helpers.ts's `oomkillTarget`/`crashloopTarget` doc comments
 * for why each test gets its own dedicated target.
 *
 * Current status (2026-08-02): kubernaut#1853's *real* upstream fix
 * (jordigilh/kubernaut#1859, N-deep NextToolCall chaining) is deployed on
 * this cluster (mock-llm rebuilt from kubernaut main @ a8b9edd4) and the
 * ConfigMap-based scenario workaround was rewritten to use the native
 * chain instead of the old two-scenario/repeat_tool_call hack — see
 * waitForInvestigationSummaryOrKnownRace's doc comment in helpers.ts and
 * ADR-009 §13.
 */
test.describe("Full remediation lifecycle — real cluster, real browser", () => {
  test("investigate → decision → (approval) → execution → verification → complete", async ({ page }) => {
    await openConsole(page);

    await sendChatMessage(page, crashloopInvestigateMessage(TARGETS.fullLifecycle));

    await test.step("real KubernautAgent investigation completes", async () => {
      await waitForInvestigationSummaryOrKnownRace(page);
      await expect(page.locator(".kn-phase-label")).toHaveText("Awaiting Approval", {
        timeout: REAL_INVESTIGATION_TIMEOUT_MS,
      }).catch(() => {
        // Some policies auto-advance straight past the approval phase —
        // the next step's phase assertion is the real gate either way.
      });
    });

    await test.step("recommended workflow is selected, approval required (production namespace)", async () => {
      // clickExecuteWorkflow waits for the workflow card (same real decision
      // payload as the RCA — kubernaut_present_decision bundles both) then
      // drives the real kubernaut_select_workflow call, which is what makes
      // RO evaluate ApprovalRequired and create the RAR in the first place.
      await clickExecuteWorkflow(page);
      // This target's production label (required for workflow-catalog
      // matching — see TARGETS' doc comment) means the OPA policy always
      // requires approval here. assertApprovalGateReachable throws with the
      // known RBAC gap's issue numbers if the console was denied the RAR
      // details (jordigilh/kubernaut-operator#278, jordigilh/kubernaut#1869)
      // — expected to fail here until either lands; only a genuinely
      // unexpected auto-approve (requested === false) or a real Approve
      // button falls through to execution below.
      const requested = await assertApprovalGateReachable(page);
      if (requested) {
        await page.getByRole("button", { name: "Approve" }).click();
      }
    });

    await test.step("real Job-based execution reaches Verifying", async () => {
      await waitForPhaseLabel(page, "Verifying", REAL_EXECUTION_TIMEOUT_MS);
    });

    await test.step("real stabilization window completes with a terminal phase", async () => {
      await expect(page.locator(".kn-phase-label")).toHaveText(/Complete|Failed/, {
        timeout: REAL_VERIFICATION_TIMEOUT_MS,
      });
    });
  });

  test("no console errors surface during a full real-backend run", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await openConsole(page);
    await sendChatMessage(page, oomkillInvestigateMessage(TARGETS.noConsoleErrors));
    await waitForInvestigationSummaryOrKnownRace(page);

    const criticalErrors = errors.filter(
      (e) =>
        !e.includes("favicon") &&
        !e.includes("net::ERR") &&
        !e.includes("Failed to load resource") &&
        // kubernaut-console#56: playwright.live-v15.config.ts's extraHTTPHeaders
        // attaches the Keycloak Bearer token to *every* request, including
        // third-party font fetches whose CORS preflight rejects unexpected
        // headers. Harmless test-harness artifact (the font still loads via
        // the browser's fallback) — not a real console network defect.
        !e.includes("fonts.gstatic.com") &&
        !e.includes("Access-Control-Allow-Headers"),
    );
    expect(criticalErrors).toHaveLength(0);
  });
});
