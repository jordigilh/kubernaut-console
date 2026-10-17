import { test, expect, type Page } from "@playwright/test";
import {
  openConsole,
  sendChatMessage,
  waitForPhaseLabel,
  assertApprovalGateReachable,
  startPeriodicScreenshots,
  REAL_EXECUTION_TIMEOUT_MS,
  REAL_VERIFICATION_TIMEOUT_MS,
  REAL_AUTONOMOUS_DECISION_TIMEOUT_MS,
  statefulsetPvcFailureTarget,
  statefulsetPvcFailureFixMessage,
  fixtureNamespace,
  assertStatefulSetPvcFailureWasRemediated,
  getRemediationRequestForTarget,
  hasInvestigationSessionForRR,
} from "./helpers";

// fixtureNamespace() appends LIVE_E2E_NS_SUFFIX (scripts/setup-fixtures.sh) —
// see its doc comment in helpers.ts. scripts/fixtures.list provisions this
// namespace as a `statefulset-pvc-failure` fixture (kv-store StatefulSet,
// broken PVC fault), using the upstream scenario's golden transcript, so the
// RCA/workflow-selection outcome (fix-statefulset-pvc-v1) is the same
// golden-transcript-backed one, not a newly invented scenario. The `-3` base
// name preserves this test's existing dedicated-target convention; the random
// run suffix from fixtureNamespace() prevents RO cooldowns from making a
// repeated live run look like a policy failure.
const TARGET = statefulsetPvcFailureTarget(fixtureNamespace("console-e2e-autonomous-fix-3"));

/**
 * Coverage for kubernaut-console#77: the console's chat-driven "fire-and-forget
 * fix" path (`WelcomeState.tsx`'s "Fix ..." mode hint), which the backend
 * routes to `kubernaut_remediate` (`pkg/apifrontend/agent/prompt.txt`'s
 * "Autonomous mode" section) instead of `kubernaut_investigate`. This is a
 * materially different, higher-blast-radius path: `HandleRemediate`
 * (`pkg/apifrontend/tools/ka_remediate.go`) creates the RemediationRequest
 * directly with no InvestigationSession — RemediationOrchestrator, AIAnalysis,
 * and KubernautAgent then run investigation, workflow discovery, and workflow
 * selection entirely autonomously, with zero pause for a workflow-selection
 * card, unlike every other spec in this suite (which all use "investigate"
 * phrasing and drive the interactive `full_remediation`/
 * `full_remediation_autonomous` modes).
 *
 * The one open question this test resolves empirically: since
 * `kubernaut_remediate`'s chat turn ends immediately after RR creation (the
 * model replies with a bare confirmation, no further tool calls), does the
 * console's phase/approval tracking — which for every other spec's flows
 * rides the *same* open chat message-stream connection — still work at all?
 * Traced directly in ChatContainer.tsx/useRRStatus.ts (2026-08-10): yes. The
 * RR context (`launcher.SetRRContextSafe`) gets merged into that turn's final
 * `EmitOutput` event, so `rrId` is picked up from the confirmation reply
 * alone; that alone is enough for `useRRStatus` to open its own independent
 * `/a2a/status` RR-watch subscription (keyed purely by rr_id, decoupled from
 * the now-closed chat turn), including the `AwaitingApproval` fallback path
 * (ChatContainer.tsx lines ~123-199) that proactively calls
 * `kubernaut_get_approval_request` itself and renders a real ApprovalCard.
 *
 * Under the canonical policy, the target is a sensitive StatefulSet, so
 * approval is required regardless of the selected workflow's confidence or
 * namespace environment. The upstream scenario's golden transcript documents
 * the expected `fix-statefulset-pvc-v1` selection and approval outcome. The
 * autonomous path still needs the longer wait below because RCA, discovery,
 * and selection happen on RO/KA's schedule after `kubernaut_remediate` returns;
 * see `REAL_AUTONOMOUS_DECISION_TIMEOUT_MS`'s doc comment in helpers.ts.
 *
 * Can be run independently of kubernaut#2061 (found via the *interactive*
 * `list_available_actions`/`list_workflows` path) — see kubernaut-console#77
 * for the three possible informative outcomes if this shares that bug's root
 * cause. The fixture's expected workflow is documented by the upstream
 * statefulset-pvc-failure golden transcript.
 *
 * `startPeriodicScreenshots` (2026-08-10, added after the `-2` run above
 * already passed before it existed): this spec's own on-failure-only
 * screenshot/video/trace config means a *passing* run of a brand-new,
 * previously-never-exercised UI path leaves no visual artifact to sanity
 * -check against, unlike a failing one. See its doc comment in helpers.ts.
 */
test.describe("Autonomous fire-and-forget fix — kubernaut_remediate, real cluster", () => {
  test("'Fix ...' request executes and verifies with zero pause for user interaction", async ({ page }) => {
    await openConsole(page);

    // This suite's own screenshot/video/trace config is all on-failure only
    // (playwright.live-v15.config.ts), so a passing run of this brand-new
    // spec would otherwise leave zero visual record to sanity-check against.
    // See startPeriodicScreenshots' doc comment.
    const stopScreenshots = startPeriodicScreenshots(page, "autonomous-fix");
    try {
      await runAutonomousFix(page);
    } finally {
      stopScreenshots();
    }
  });
});

async function runAutonomousFix(page: Page): Promise<void> {
  await sendChatMessage(page, statefulsetPvcFailureFixMessage(TARGET));

  await test.step("console picks up rr_id from the confirmation reply and starts tracking real backend phase", async () => {
    // No investigation_summary/decision card is expected here (that's the
    // interactive full_remediation flow's shape) — the only initial signal
    // is the chat's own confirmation text plus the phase label picking up
    // the standalone /a2a/status subscription once rr_id is known. Give it
    // the same budget as a real investigation, since the autonomous
    // pipeline's RCA step is the same real KA investigation under the hood.
    await expect(page.locator(".kn-phase-label")).toBeVisible({ timeout: REAL_EXECUTION_TIMEOUT_MS });
  });

  await test.step("no workflow-selection UI ever appears (autonomous selection, not interactive)", async () => {
    // Unlike full-remediation-lifecycle.spec.ts, there must be no
    // workflow-card/"Execute" click here at all -- kubernaut_remediate's
    // whole point is that selection happens without a pause. This must
    // genuinely fail (not swallow) if a workflow card renders, since that
    // would mean the backend incorrectly treated this as an interactive
    // session.
    await expect(
      page.getByTestId(/^workflow-card-/).first(),
      "a workflow-selection card rendered for a kubernaut_remediate-triggered fix — the backend " +
        "appears to have routed this to the interactive full_remediation path instead of the " +
        "autonomous one, or the console rendered a stray card from an unrelated session.",
    ).not.toBeVisible({ timeout: 3_000 });
  });

  await test.step("approval gate — sensitive StatefulSet always requires it, regardless of confidence", async () => {
    // Not a race against a synchronous trigger (unlike
    // full-remediation-lifecycle.spec.ts's clickExecuteWorkflow, which
    // *causes* RO's approval evaluation as part of its own call): this
    // must wait out the entire autonomous RCA + discovery + selection
    // sequence, since only after AIAnalysis reaches Completed does RO
    // evaluate ApprovalRequired and create the RAR at all. See
    // REAL_AUTONOMOUS_DECISION_TIMEOUT_MS's doc comment in helpers.ts —
    // confirmed too short at 30s live on this test's first run.
    const requested = await assertApprovalGateReachable(page, REAL_AUTONOMOUS_DECISION_TIMEOUT_MS);
    expect(
      requested,
      "no approval card appeared for this StatefulSet target within " +
        `${REAL_AUTONOMOUS_DECISION_TIMEOUT_MS}ms. The canonical policy classifies StatefulSet as a ` +
        "sensitive resource and requires approval regardless of confidence or environment — an " +
        "auto-approval here would be a policy-evaluation regression, not a silent pass.",
    ).toBe(true);
    await page.getByRole("button", { name: "Approve" }).click();
  });

  await test.step("real Job-based execution reaches Verifying", async () => {
    await waitForPhaseLabel(page, "Verifying", REAL_EXECUTION_TIMEOUT_MS);
  });

  await test.step("real stabilization window completes with a successful terminal phase, verified against real backend/cluster state", async () => {
    await expect(page.locator(".kn-phase-label")).toHaveText("Complete", {
      timeout: REAL_VERIFICATION_TIMEOUT_MS,
    });
    assertStatefulSetPvcFailureWasRemediated(TARGET.namespace);
  });

  await test.step("the RR was created without an InvestigationSession (confirms the autonomous, session-less path was actually exercised, not just a fast interactive one)", async () => {
    const rr = getRemediationRequestForTarget(TARGET.namespace);
    expect(rr, `No RemediationRequest found for ${TARGET.namespace} — the fix request may never have reached kubernaut_remediate.`).not.toBeNull();
    expect(
      hasInvestigationSessionForRR(rr!.name),
      `RemediationRequest ${rr!.name} has an InvestigationSession — this means the "Fix ..." request was routed ` +
        "through kubernaut_investigate (interactive path), not kubernaut_remediate (autonomous, session-less path) " +
        "as intended by this test's phrasing.",
    ).toBe(false);
  });
}
