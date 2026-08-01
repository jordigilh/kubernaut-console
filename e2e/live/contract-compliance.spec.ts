import { test, expect } from "@playwright/test";
import {
  openConsole,
  sendChatMessage,
  waitForInvestigationSummaryOrKnownRace,
  REAL_INVESTIGATION_TIMEOUT_MS,
  OOMKILL_TARGET,
  OOMKILL_WORKFLOW,
  OOMKILL_ALTERNATIVE_WORKFLOW,
} from "./helpers";

/**
 * ADR-009 / docs/integration-guide.md "Minimal Implementation Checklist".
 *
 * Each test below asserts one checklist line item against the real,
 * running API Frontend in the preserved `fullpipeline` cluster — the
 * mocked suite (e2e/standalone.spec.ts) asserts the console's *reaction* to
 * a fabricated payload; this suite asserts the *real* payload actually
 * matches the contract those fabrications assume.
 *
 * Trigger scenario: kubernaut-system/memory-eater, a Deployment kept
 * permanently OOMKilled by kubernaut's own `fullpipeline` bootstrap (see
 * helpers.ts's `OOMKILL_TARGET`) — a real, always-on broken resource, not a
 * fixture this suite has to create. mock-llm's `oomkilledScenario`
 * (test/services/mock-llm/scenarios/scenario_oomkilled.go) returns a
 * deterministic, high-confidence (0.95) investigation recommending
 * `oomkill-increase-memory-v1` over the `generic-restart-v1` alternative.
 * Verified against jordigilh/kubernaut@origin/main on 2026-08-02 — if
 * upstream's scenario config changes, update the expected values below,
 * not the assertions' shape.
 *
 * Current status: this suite's single chat message is the console's real,
 * only investigation entry point (there is no multi-turn text protocol in
 * the actual product — see helpers.ts's `waitForInvestigationSummaryOrKnownRace`),
 * and it reliably hits kubernaut#1818 against this cluster: KA's fast
 * investigation completion races AF's interactive-session upgrade, so AF
 * falls back to an RCA-less placeholder and emits a malformed TextPart
 * instead of the documented investigation_summary DataPart. Every test
 * below that calls `waitForInvestigationSummaryOrKnownRace` is expected to
 * fail with a #1818-attributed error until that's fixed upstream — this is
 * a real backend defect the suite correctly surfaces, not a console bug.
 */
const INVESTIGATE_MESSAGE =
  `The ${OOMKILL_TARGET.name} ${OOMKILL_TARGET.kind} in ${OOMKILL_TARGET.namespace} is OOMKilled and CrashLoopBackOff, please investigate.`;

test.describe("Contract compliance — integration-guide.md checklist", () => {
  test.beforeEach(async ({ page }) => {
    await openConsole(page);
  });

  test("[checklist] SSE streaming endpoint at /a2a/ + status events with type metadata", async ({ page }) => {
    const sseResponse = page.waitForResponse(
      (res) => res.url().includes("/a2a/") && res.status() === 200,
      { timeout: REAL_INVESTIGATION_TIMEOUT_MS },
    );
    await sendChatMessage(page, INVESTIGATE_MESSAGE);
    const res = await sseResponse;
    expect(res.headers()["content-type"]).toContain("text/event-stream");

    // Reasoning/tool-call entries only ever reach the DOM via status-update
    // events carrying a `type` metadata field (ThinkingPanel) — their
    // presence is itself proof the contract's `type` field is populated.
    // Unlike the tests below, this only needs the stream to carry *some*
    // status content, not a well-formed investigation_summary — so it is
    // not blocked by kubernaut#1818.
    await expect(page.getByTestId("thinking-body")).toBeVisible({ timeout: REAL_INVESTIGATION_TIMEOUT_MS });
  });

  test("[checklist] RR context metadata on status events populates the investigation banner", async ({ page }) => {
    await sendChatMessage(page, INVESTIGATE_MESSAGE);
    await waitForInvestigationSummaryOrKnownRace(page);

    const context = page.getByTestId("investigation-context");
    await expect(context).toBeVisible();
    // rr_id is opaque/generated per-run; namespace/resource are the fixed,
    // always-on real target this suite always drives against.
    await expect(context.getByLabel(/^Namespace:/i)).toContainText(OOMKILL_TARGET.namespace);
    await expect(context.getByLabel(/^Resource:/i)).toContainText(`${OOMKILL_TARGET.kind}/${OOMKILL_TARGET.name}`);
  });

  test("[checklist] investigation_summary artifact carries RCA + real workflow options", async ({ page }) => {
    await sendChatMessage(page, INVESTIGATE_MESSAGE);
    await waitForInvestigationSummaryOrKnownRace(page);

    // oomkilledConfig() in kubernaut's mock-llm: Confidence: 0.95.
    await expect(page.getByText(/95%/)).toBeVisible();
    await expect(page.getByTestId("causal-chain")).toBeVisible();

    // Recommended + one ruled-out alternative, both real, registered
    // workflow catalog entries (not console-invented fixtures).
    await expect(page.getByTestId(/^workflow-card-/).first()).toBeVisible();
    await expect(page.getByText(OOMKILL_WORKFLOW)).toBeVisible();
    await expect(page.getByText(OOMKILL_ALTERNATIVE_WORKFLOW)).toBeVisible();
  });

  test("[checklist] audit telemetry sink at /a2a/telemetry/audit accepts real user actions", async ({ page }) => {
    const auditRequest = page.waitForRequest(
      (req) => req.url().includes("/a2a/telemetry/audit") && req.method() === "POST",
      { timeout: REAL_INVESTIGATION_TIMEOUT_MS },
    );
    await sendChatMessage(page, INVESTIGATE_MESSAGE);
    await waitForInvestigationSummaryOrKnownRace(page);

    // Any of approve/decline/dismiss/escalate/execute_workflow fires an
    // audit POST — clearing history is the one available unconditionally,
    // regardless of which decision path this run took.
    await page.locator("button[aria-label='New conversation']").click();
    const req = await auditRequest;
    const res = await req.response();
    expect(res?.status()).toBe(204);
  });
});
