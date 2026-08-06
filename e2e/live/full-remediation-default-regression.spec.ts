import { test, expect } from "@playwright/test";
import {
  openConsole,
  sendChatMessage,
  waitForInvestigationSummaryOrKnownRace,
  oomkillTarget,
  oomkillInvestigateMessage,
  fixtureNamespace,
} from "./helpers";

/**
 * Regression coverage for kubernaut#1915 (FIXED, PR #1920, deployed &
 * verified on this cluster 2026-08-04; v1.6 backport tracked by
 * kubernaut#1917), found during the same 2026-08-04 release/v1.5 live
 * validation session as #1912 (ADR-009 §15).
 *
 * Root cause: `prompt.txt` never told the model that
 * `interaction_mode: "full_remediation"` exists, so a plain "investigate X"
 * request (no "and fix"/"remediate" wording) always omitted the field,
 * resolving to the fail-safe `interactive` (RCA-only) default — which the
 * DD-AF-011 harness correctly removes `kubernaut_discover_workflows` from
 * the model's tool list for. The prompt's own "CRITICAL — Phase 1 to Phase
 * 2" section then unconditionally said "proceed to Phase 2" regardless,
 * contradicting the harness it was running against — the model, unable to
 * find the tool it was told to call, incorrectly concluded "no matching
 * workflows" instead of correctly pausing after RCA. Live-reproduced
 * against the `demo-crashloop` scenario (`crashloop-rollback-v1` workflow
 * confirmed Active in the catalog, alert correctly triaged, but
 * `kubernaut_discover_workflows` never called per `kubectl logs
 * deploy/kubernaut-agent`).
 *
 * Fix (prompt-content only, no harness/code changes — the underlying
 * `full_remediation` mechanism was already correct and covered by
 * `IT-AF-1899-002b/003/005b`): `full_remediation` (auto-discover, still
 * pause before execute) is now the prompt-declared default for a plain
 * investigate request. Bare RCA-only `interactive` mode remains reachable
 * only via an explicit opt-out phrase ("just investigate", "investigate
 * only", "don't suggest fixes").
 *
 * This test uses the same `oomkillInvestigateMessage` helper as the
 * consent-gate suite deliberately: that message is phrased as a plain
 * "please investigate" with no "and fix" wording (see helpers.ts), which is
 * exactly the phrasing #1915's bug affected — before the fix, this exact
 * message would RCA successfully but never discover a matching workflow.
 * Uses its own dedicated console-e2e-full-remediation-3 namespace/target
 * (not shared with the consent-gate suite's namespaces). Bumped twice during
 * this test's own development, each time to dodge KA's per-target
 * `session_active` dedup masking a real result (see helpers.ts's
 * `oomkillTarget` doc comment for the general mechanism):
 *   - `-1` (original `console-e2e-full-remediation`): an earlier failed run
 *     left its RR non-terminal, so a retry against the same target got the
 *     dedup's early_rca fallback instead of a fresh investigation.
 *   - `-2`: even freshly created, a *second*, unrelated `kubernaut_investigate`
 *     call landed on this same target ~79s into this suite's own investigate
 *     call (confirmed via KA/AF logs: two separate `session_active`-colliding
 *     calls to the same target, ~79s apart, both authenticated as the
 *     `console-e2e-test` identity this suite's Keycloak credentials also use)
 *     — traced via this run's own Playwright trace.zip that *this test*
 *     issued exactly one `/a2a/invoke` POST, so the interference came from
 *     some other concurrent process sharing that identity, not a bug in this
 *     suite or in `a2a-client.ts`'s retry logic. Root actor unidentified;
 *     moved to `-3` to eliminate the shared-fixture collision rather than
 *     chase it further. If this recurs on `-3`, treat it as a real signal
 *     worth its own investigation rather than bumping the suffix again.
 *
 * Separately, kubernaut#1922 / kubernaut-console#50 (filed 2026-08-04) cover
 * a real, confirmed bug encountered while diagnosing the `-1`/`-2` failures
 * above: the `session_active` dedup's own fallback response is emitted with
 * no `causal_chain`/`tool_calls_count`, which the console's `AgentBubble`
 * `hasRCAData` guard then renders as literally nothing (not even a status
 * message) — so a dedup collision away from this test looks identical to a
 * hung investigation. That bug is real and worth fixing regardless of what
 * causes the underlying collision; it just isn't #1915's bug.
 *
 * The real, catalog-registered workflow this target matches is
 * `increase-memory-limits-v1` (kubernaut-system), not the `helpers.ts`
 * `OOMKILL_WORKFLOW` constant's `oomkill-increase-memory-v1` — that constant
 * does not correspond to any workflow actually registered on this cluster;
 * do not rely on it here. `increase-memory-limits-v1` requires (per its
 * `RemediationWorkflow.spec.labels`) `component: apps/v1/Deployment` (✓,
 * memory-eater is a Deployment), `severity: [critical, high]` (✓, the
 * `KubePodCrashLooping` alert this fixture triggers fires `critical`), and
 * `environment: [production, staging]` — the target namespace MUST carry a
 * `kubernaut.ai/environment: production` (or `staging`) label, or KA's
 * `RunWorkflowDiscoveryFromRCA` will log `true_label_count: 0` and correctly
 * resolve to `no_matching_workflows` regardless of whether the #1915 fix is
 * working (confirmed directly via `kubectl logs deploy/kubernaut-agent`
 * during this test's own development — a namespace missing that label is a
 * test-fixture defect, not evidence against the fix).
 */

// fixtureNamespace() appends LIVE_E2E_NS_SUFFIX (scripts/setup-fixtures.sh) —
// see its doc comment in helpers.ts.
const TARGET = oomkillTarget(fixtureNamespace("console-e2e-full-remediation-3"));

test.describe("Full-remediation default — workflow auto-discovery regressions", () => {
  test("a plain 'investigate' request (no explicit 'and fix') still auto-discovers matching workflows (regression: kubernaut#1915)", async ({ page }) => {
    test.setTimeout(REAL_INVESTIGATION_TIMEOUT_MS_BUFFER());

    await openConsole(page);

    await test.step("send a plain investigate request (no 'and fix'/'remediate' wording)", async () => {
      await sendChatMessage(page, oomkillInvestigateMessage(TARGET));
      await waitForInvestigationSummaryOrKnownRace(page);
    });

    await test.step("assert workflow options were auto-discovered and presented without a separate 'fix it' follow-up", async () => {
      await expect(
        page.getByTestId(/^workflow-card-/).first(),
        "a matching workflow (increase-memory-limits-v1) should render automatically after RCA " +
          "for a plain investigate request under full_remediation default mode — if this is not " +
          "visible, kubernaut_discover_workflows was likely never called (regression: kubernaut#1915)",
      ).toBeVisible({ timeout: 30_000 });

      const chatText = await page.locator(".kn-chat").innerText();
      expect(
        chatText,
        "the harness must not fall back to the 'workflow discovery not available' text — " +
          "seeing it means Phase 2 was blocked while the prompt still told the model to call it",
      ).not.toContain("Workflow discovery for remediation options is not available");
      expect(
        chatText,
        "a real, catalog-matching workflow exists for this fixture — seeing a 'no workflows found' " +
          "style message means discovery was skipped entirely, not that it legitimately found nothing",
      ).not.toContain("No workflows in the catalog match");
    });
  });
});

// Real investigation (up to REAL_INVESTIGATION_TIMEOUT_MS, itself configurable
// via LIVE_E2E_INVESTIGATION_TIMEOUT_MS) plus a comfortable margin for the
// post-RCA discovery round-trip and assertions.
function REAL_INVESTIGATION_TIMEOUT_MS_BUFFER(): number {
  const base = Number(process.env.LIVE_E2E_INVESTIGATION_TIMEOUT_MS) || 90_000;
  return base + 120_000;
}
