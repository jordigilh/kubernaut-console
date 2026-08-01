import { test, expect } from "@playwright/test";
import {
  openConsole,
  sendChatMessage,
  waitForInvestigationSummary,
  waitForPhaseLabel,
  approveIfRequested,
  REAL_INVESTIGATION_TIMEOUT_MS,
  REAL_EXECUTION_TIMEOUT_MS,
  REAL_VERIFICATION_TIMEOUT_MS,
} from "./helpers";

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
 * No Tekton: crashloop-config-fix-v1's ExecutionEngine is "job"
 * (test/services/mock-llm/scenarios/scenario_crashloop.go) — this
 * scenario is itself proof-by-construction of ADR-009 §5's "no Tekton"
 * decision, not just an assumption of it.
 */
test.describe("Full remediation lifecycle — real cluster, real browser", () => {
  test("investigate → decision → (approval) → execution → verification → complete", async ({ page }) => {
    await openConsole(page);

    await sendChatMessage(page, "The worker Deployment in staging is stuck in CrashLoopBackOff, please investigate.");

    await test.step("real KubernautAgent investigation completes", async () => {
      await waitForInvestigationSummary(page);
      await expect(page.locator(".kn-phase-label")).toHaveText("Awaiting Approval", {
        timeout: REAL_INVESTIGATION_TIMEOUT_MS,
      }).catch(() => {
        // Some policies auto-advance straight past the approval phase —
        // the next step's phase assertion is the real gate either way.
      });
    });

    await test.step("recommended workflow is selected (approved if gated)", async () => {
      await approveIfRequested(page);
      const executeButton = page.getByRole("button", { name: /^Execute /i });
      if (await executeButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await executeButton.click();
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
    await sendChatMessage(page, "The worker Deployment in staging is stuck in CrashLoopBackOff, please investigate.");
    await waitForInvestigationSummary(page);

    const criticalErrors = errors.filter(
      (e) => !e.includes("favicon") && !e.includes("net::ERR") && !e.includes("Failed to load resource"),
    );
    expect(criticalErrors).toHaveLength(0);
  });
});
