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
 * Regression coverage for two "unsolicited investigation" defects found
 * during the 2026-08-03 release/v1.5 live validation (ADR-009 §14/§15):
 *
 * - kubernaut#1899 (FIXED, PR #1910, deployed & verified on this cluster): a
 *   bare, read-only "list active alerts" request in a *brand-new* session
 *   escalated into a full `kubernaut_investigate_alert` call with no user
 *   consent. Root cause: `prompt.txt`'s "Alert Prioritization" section
 *   unconditionally told the model to investigate `alerts[selected_index]`
 *   whenever `list_alerts` returned a `prioritized` field, contradicting the
 *   same prompt's own "Observation Mode" consent gate — compounded by
 *   `reinvoking_runner.go` blindly re-invoking the model after any
 *   text-only turn.
 *
 * - kubernaut#1912 (FIXED, PR #1920, deployed & verified on this cluster
 *   2026-08-04; v1.6 backport tracked by kubernaut#1913): the #1910 fix
 *   gated reinvocation on `StateKeyDriverActive`, but that flag was only
 *   ever set to `true` (`phase_guard.go`'s `after` hook, on
 *   `kubernaut_investigate`/`kubernaut_reconnect`) and never cleared on
 *   session termination (`kubernaut_complete` / `kubernaut_complete_no_action`
 *   / `kubernaut_cancel`). Once *any* investigation had run to completion in
 *   a session, the reinvocation gate "failed open" for every subsequent
 *   turn in that same session — a second, wholly unrelated read-only query
 *   could still escalate into an uninvited investigation. Fix: `isTerminal`
 *   in `phase_guard.go` now also clears `af_interactive_driver_active` (and,
 *   for hygiene, `af_active_rr_id`/`af_active_session_id`) alongside the
 *   existing registry clear, independent of whether a registry is
 *   configured.
 *
 * Note on the #1912 test's evidence bar: an *unexpected pass* on this test
 * (i.e. seeing it pass before the `test.fail()` removal below) is NOT by
 * itself sufficient evidence of a fix — reproduction depends on the model's
 * response to the second query happening to be a *text-only* turn (no tool
 * call), since `reinvoking_runner.go` only ever reinvokes after that
 * specific shape. Confirmed by direct reproduction on 2026-08-04 (same
 * unpatched main-2e1f7cb96c15fcb61e5e87cb2cc2d916527a980c build, #1912 still
 * OPEN, no PR yet): the test passed unexpectedly on that run purely because
 * the model called `list_alerts` immediately (tool-call-first) and stopped,
 * giving the defect nothing to piggyback on that particular run — confirmed
 * via `kubectl logs deploy/apifrontend` showing no second
 * `kubernaut_investigate` call and no reinvocation-related log line. The
 * `test.fail()` marker was kept until corroborated by tracker/build
 * evidence: PR #1920 (https://github.com/jordigilh/kubernaut/pull/1920)
 * merged into `release/v1.5` at commit `432f70a6d117a3e804462edf6ab5fe9726ad0263`
 * (all CI green), image built and deployed to this cluster
 * (`ghcr.io/jordigilh/kubernaut/apifrontend:main-432f70a6d117a3e804462edf6ab5fe9726ad0263`),
 * and the diff independently reviewed against #1912's own suggested fix
 * before removing `test.fail()` here.
 */

const TARGETS = {
  // Only the #1912 test needs a real target — it must legitimately establish
  // a driver session first. The #1899 test never sends an investigate-worthy
  // message at all, so it needs no fixture of its own. Dedicated
  // console-e2e-consent-gate[-2] namespaces (not console-e2e-approval-*)
  // per helpers.ts's oomkillTarget doc comment: sharing a target already
  // under investigation elsewhere risks KA's per-target session_active dedup
  // masking the very escalation this test exists to catch.
  // fixtureNamespace() appends LIVE_E2E_NS_SUFFIX (scripts/setup-fixtures.sh)
  // — see its doc comment in helpers.ts.
  firstInvestigation: oomkillTarget(fixtureNamespace("console-e2e-consent-gate")),
  secondNamespace: fixtureNamespace("console-e2e-consent-gate-2"),
};

const REMEDIATION_ID_FIELD = '[aria-label^="Remediation ID:"]';

/**
 * How long to watch for an unsolicited escalation after a read-only
 * message. Empirically (2026-08-03 #1899/#1912 live repros, both captured
 * via the console UI and corroborating `kubectl logs deploy/apifrontend`),
 * the reinvoke-then-escalate sequence completed well within 60s of the
 * triggering message; 90s leaves comfortable margin without materially
 * slowing the suite.
 */
const NO_ESCALATION_WATCH_MS = 90_000;

test.describe("Consent gate — unsolicited investigation regressions", () => {
  test("fresh session: a read-only alert query never auto-investigates (regression: kubernaut#1899)", async ({ page }) => {
    await openConsole(page);
    await sendChatMessage(page, "list active alerts");

    // Give the reinvocation loop its full window to (mis)fire before
    // asserting nothing escalated — checking too early would pass
    // vacuously regardless of whether the fix is actually in place.
    await page.waitForTimeout(NO_ESCALATION_WATCH_MS);

    await expect(
      page.locator(REMEDIATION_ID_FIELD),
      "no RemediationRequest should ever be created for a bare 'list active alerts' query",
    ).not.toBeVisible();
    await expect(
      page.locator(".kn-phase-label"),
      "PhaseIndicator only renders once an investigation is engaged — it must stay unmounted here",
    ).not.toBeVisible();
    await expect(
      page.getByTestId(/^workflow-card-/).first(),
      "no workflow options should render without a real decision from a real investigation",
    ).not.toBeVisible();
  });

  test("same session, second unrelated read-only query after a completed investigation does not auto-investigate (regression: kubernaut#1912)", async ({ page }) => {
    // Real investigation (up to REAL_INVESTIGATION_TIMEOUT_MS=5min) + dismiss
    // + a second full NO_ESCALATION_WATCH_MS window comfortably exceeds the
    // config's default 420s test timeout.
    test.setTimeout(600_000);

    await openConsole(page);

    await test.step("establish a real, explicitly-requested driver session", async () => {
      await sendChatMessage(page, oomkillInvestigateMessage(TARGETS.firstInvestigation));
      await waitForInvestigationSummaryOrKnownRace(page);
    });

    const initialRrId = await test.step("cleanly terminate it (kubernaut_complete_no_action)", async () => {
      const dismissButton = page.getByRole("button", { name: "No action needed" });
      test.skip(
        !(await dismissButton.isVisible().catch(() => false)),
        "Not in a dismissible phase for this run — cannot establish a clean terminal state to test from.",
      );
      await dismissButton.click();
      await expect(page.locator(".kn-phase-label")).toHaveText("Complete", { timeout: 15_000 });
      return page.locator(REMEDIATION_ID_FIELD).getAttribute("aria-label");
    });

    await test.step("send a second, unrelated, read-only query in the same session", async () => {
      await sendChatMessage(page, `What alerts are currently firing in the ${TARGETS.secondNamespace} namespace?`);
      await page.waitForTimeout(NO_ESCALATION_WATCH_MS);
    });

    await test.step("assert no new, unsolicited investigation was started", async () => {
      const laterRrId = await page.locator(REMEDIATION_ID_FIELD).getAttribute("aria-label").catch(() => null);
      expect(
        laterRrId,
        "the Remediation ID banner must still reference the first (dismissed) investigation — " +
          "a changed value means a second, unsolicited RemediationRequest was created",
      ).toBe(initialRrId);
      await expect(
        page.locator(".kn-phase-label"),
        "phase must not flip back to Investigating for an unrelated follow-up query",
      ).not.toHaveText("Investigating");
    });
  });
});
