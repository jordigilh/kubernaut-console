import { test, expect } from "@playwright/test";
import {
  openConsole,
  sendChatMessage,
  waitForInvestigationSummaryOrKnownRace,
  crashloopTarget,
  crashloopInvestigateMessage,
  CRASHLOOP_WORKFLOW,
  fixtureNamespace,
  startPeriodicScreenshots,
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
 * This test needs a plain "please investigate" message with no "and fix"
 * wording — exactly the phrasing #1915's bug affected, since before the fix
 * this exact message would RCA successfully but never discover a matching
 * workflow — combined with a deterministic, known-catalog-match target so a
 * missing workflow card can only mean the mode-defaulting regressed, not
 * scenario non-determinism. `crashloopInvestigateMessage` already produces
 * that exact phrasing (no "fix"/"remediate" keyword), and `crashloopTarget`
 * is exactly how #1915 was originally live-reproduced (see this comment's
 * history below) — using them here directly (kubernaut-console#64, revised
 * 2026-08-07) supersedes this test's original `oomkillTarget`/`memory-eater`
 * fixture, which was never the scenario the bug was actually found against
 * and, per `crashloopTarget`'s own doc comment in helpers.ts, is known to
 * make a real LLM's workflow-selection outcome non-deterministic — exactly
 * the kind of scenario-accuracy risk this regression test cannot tolerate.
 *
 * Uses its own dedicated console-e2e-full-remediation-3 namespace/target
 * (not shared with the consent-gate suite's namespaces, nor with any other
 * spec file's crashloopTarget namespace). Bumped twice during this test's
 * original (`memory-eater`-based) development, each time to dodge KA's
 * per-target `session_active` dedup masking a real result (see helpers.ts's
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
 *     (Switching the underlying fixture from `memory-eater` to `worker`
 *     changes the dedup key's resource identity anyway, so `-3` was kept
 *     rather than bumped again for this migration.)
 *
 * Separately, kubernaut#1922 / kubernaut-console#50 (filed 2026-08-04) cover
 * a real, confirmed bug encountered while diagnosing the `-1`/`-2` failures
 * above: the `session_active` dedup's own fallback response is emitted with
 * no `causal_chain`/`tool_calls_count`, which the console's `AgentBubble`
 * `hasRCAData` guard then renders as literally nothing (not even a status
 * message) — so a dedup collision away from this test looks identical to a
 * hung investigation. That bug is real and worth fixing regardless of what
 * causes the underlying collision; it just isn't #1915's bug.
 */

// fixtureNamespace() appends LIVE_E2E_NS_SUFFIX (scripts/setup-fixtures.sh) —
// see its doc comment in helpers.ts. scripts/fixtures.list provisions this
// namespace as a `crashloop`-type fixture (worker Deployment, bad-release
// fault) to match.
const TARGET = crashloopTarget(fixtureNamespace("console-e2e-full-remediation-3"));

test.describe("Full-remediation default — workflow auto-discovery regressions", () => {
  // See startPeriodicScreenshots' doc comment (helpers.ts) — this suite's own
  // screenshot/video/trace config is all on-failure only, so a passing run
  // would otherwise leave zero visual record to sanity-check against.
  let stopScreenshots: () => void = () => {};
  test.beforeEach(async ({ page }, testInfo) => {
    stopScreenshots = startPeriodicScreenshots(page, testInfo.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase());
  });
  test.afterEach(() => {
    stopScreenshots();
  });

  test("a plain 'investigate' request (no explicit 'and fix') still auto-discovers matching workflows (regression: kubernaut#1915)", async ({ page }) => {
    test.setTimeout(REAL_INVESTIGATION_TIMEOUT_MS_BUFFER());

    await openConsole(page);

    await test.step("send a plain investigate request (no 'and fix'/'remediate' wording)", async () => {
      await sendChatMessage(page, crashloopInvestigateMessage(TARGET));
      await waitForInvestigationSummaryOrKnownRace(page);
    });

    await test.step("assert workflow options were auto-discovered and presented without a separate 'fix it' follow-up", async () => {
      const firstWorkflowCard = page.getByTestId(/^workflow-card-/).first();
      await expect(
        firstWorkflowCard,
        `a matching workflow (${CRASHLOOP_WORKFLOW}) should render automatically after RCA ` +
          "for a plain investigate request under full_remediation default mode — if this is not " +
          "visible, kubernaut_discover_workflows was likely never called (regression: kubernaut#1915)",
      ).toBeVisible({ timeout: 30_000 });
      // Not just "a card rendered" — kubernaut-demo-scenarios' crashloop
      // scenario (README + golden transcript) documents this as the specific
      // expected selection, and it's independently confirmed deterministic
      // across three real-LLM runs (see CRASHLOOP_WORKFLOW's doc comment in
      // helpers.ts). A different workflow rendering here would be a real
      // selection regression this test should catch, not silently accept.
      await expect(
        firstWorkflowCard,
        `Investigation selected a workflow other than the documented expectation "${CRASHLOOP_WORKFLOW}"`,
      ).toContainText(CRASHLOOP_WORKFLOW);

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
