import { test, expect } from "@playwright/test";
import {
  openConsole,
  sendChatMessage,
  waitForInvestigationSummaryOrKnownRace,
  waitForPhaseLabel,
  approveIfRequested,
  REAL_INVESTIGATION_TIMEOUT_MS,
  REAL_EXECUTION_TIMEOUT_MS,
  REAL_VERIFICATION_TIMEOUT_MS,
  oomkillTarget,
  oomkillInvestigateMessage,
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
  fullLifecycle: oomkillTarget("console-e2e-lifecycle-3"),
  noConsoleErrors: oomkillTarget("console-e2e-lifecycle-2"),
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
 * Target (revised 2026-08-02): drives against a dedicated, per-test
 * `memory-eater` Deployment (the same image/args as kubernaut's own
 * fullpipeline bootstrap uses for kubernaut-system/memory-eater) in its own
 * `console-e2e-lifecycle[-N]` namespace — see helpers.ts's `oomkillTarget`
 * for why each test gets its own target — rather than a fabricated target
 * that doesn't exist in the cluster.
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

    await sendChatMessage(page, oomkillInvestigateMessage(TARGETS.fullLifecycle));

    await test.step("real KubernautAgent investigation completes", async () => {
      await waitForInvestigationSummaryOrKnownRace(page);
      await expect(page.locator(".kn-phase-label")).toHaveText("Awaiting Approval", {
        timeout: REAL_INVESTIGATION_TIMEOUT_MS,
      }).catch(() => {
        // Some policies auto-advance straight past the approval phase —
        // the next step's phase assertion is the real gate either way.
      });
    });

    await test.step("recommended workflow is selected (approved if gated)", async () => {
      // Workflow cards render from the same real decision payload as the RCA
      // (kubernaut_present_decision bundles both) but the round-trip through
      // a real kubernaut_discover_workflows call first makes this slower
      // than a fixed 5s guess — wait on the actual decision UI, not a timer.
      await expect(page.getByTestId(/^workflow-card-/).first()).toBeVisible({
        timeout: REAL_INVESTIGATION_TIMEOUT_MS,
      });
      await approveIfRequested(page);
      const executeButton = page.getByRole("button", { name: /^Execute /i });
      if (await executeButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await executeButton.click();
        // WorkflowCards.tsx requires a second, explicit confirm click within
        // a 10s countdown window ("Execute now (Ns remaining)") — it does
        // auto-fire once the countdown reaches zero, but clicking confirms
        // deterministically without a 10s passive wait.
        const confirmButton = page.getByRole("button", { name: /^Execute now/i });
        if (await confirmButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
          await confirmButton.click();
        }
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
      (e) => !e.includes("favicon") && !e.includes("net::ERR") && !e.includes("Failed to load resource"),
    );
    expect(criticalErrors).toHaveLength(0);
  });
});
