import { test, expect } from "@playwright/test";
import {
  openConsole,
  sendChatMessage,
  waitForInvestigationSummaryOrKnownRace,
  REAL_INVESTIGATION_TIMEOUT_MS,
  oomkillTarget,
  oomkillInvestigateMessage,
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
 * Trigger scenario: a dedicated, per-test `memory-eater` Deployment kept
 * permanently OOMKilled/CrashLoopBackOff in its own `console-e2e-contract[-N]`
 * namespace (see helpers.ts's `oomkillTarget` for why each test gets its own
 * target instead of sharing kubernaut-system/memory-eater). mock-llm's
 * `oomkilledScenario` (test/services/mock-llm/scenarios/scenario_oomkilled.go)
 * returns a deterministic, high-confidence (0.95) investigation recommending
 * `oomkill-increase-memory-v1` over the `generic-restart-v1` alternative.
 * Verified against jordigilh/kubernaut@origin/main on 2026-08-02 — if
 * upstream's scenario config changes, update the expected values below,
 * not the assertions' shape.
 *
 * Current status (2026-08-02): kubernaut#1853's real upstream fix
 * (jordigilh/kubernaut#1859, N-deep NextToolCall chaining in mock-llm) is
 * deployed on this cluster and the ConfigMap-based scenario workaround was
 * rewritten to use the native chain instead of the old two-scenario/
 * repeat_tool_call hack that was the likely source of an earlier
 * cross-session cross-talk failure on this exact test (see ADR-009 §13).
 * See helpers.ts's `waitForInvestigationSummaryOrKnownRace` for the full
 * history.
 */
const TARGETS = {
  sse: oomkillTarget("console-e2e-contract"),
  rrContext: oomkillTarget("console-e2e-contract-2"),
  summary: oomkillTarget("console-e2e-contract-3"),
};

test.describe("Contract compliance — integration-guide.md checklist", () => {
  test.beforeEach(async ({ page }) => {
    await openConsole(page);
  });

  test("[checklist] SSE streaming endpoint at /a2a/ + status events with type metadata", async ({ page }) => {
    const sseResponse = page.waitForResponse(
      (res) => res.url().includes("/a2a/") && res.status() === 200,
      { timeout: REAL_INVESTIGATION_TIMEOUT_MS },
    );
    await sendChatMessage(page, oomkillInvestigateMessage(TARGETS.sse));
    const res = await sseResponse;
    expect(res.headers()["content-type"]).toContain("text/event-stream");

    // Reasoning/tool-call entries only ever reach the DOM via status-update
    // events carrying a `type` metadata field (ThinkingPanel) — their
    // presence is itself proof the contract's `type` field is populated.
    // Unlike the tests below, this only needs the stream to carry *some*
    // status content, not a well-formed investigation_summary — so it is
    // not blocked by kubernaut#1853.
    await expect(page.getByTestId("thinking-body")).toBeVisible({ timeout: REAL_INVESTIGATION_TIMEOUT_MS });
  });

  test("[checklist] RR context metadata on status events populates the investigation banner", async ({ page }) => {
    await sendChatMessage(page, oomkillInvestigateMessage(TARGETS.rrContext));
    await waitForInvestigationSummaryOrKnownRace(page);

    const context = page.getByTestId("investigation-context");
    await expect(context).toBeVisible();
    // rr_id is opaque/generated per-run; namespace/resource are this test's
    // own dedicated, always-on real target (see TARGETS above).
    await expect(context.getByLabel(/^Namespace:/i)).toContainText(TARGETS.rrContext.namespace);
    await expect(context.getByLabel(/^Resource:/i)).toContainText(`${TARGETS.rrContext.kind}/${TARGETS.rrContext.name}`);
  });

  test("[checklist] investigation_summary artifact carries RCA + real workflow options", async ({ page }) => {
    await sendChatMessage(page, oomkillInvestigateMessage(TARGETS.summary));
    await waitForInvestigationSummaryOrKnownRace(page);

    // oomkilledConfig() in kubernaut's mock-llm: Confidence: 0.95. RCACard.tsx
    // renders the raw decimal ("Confidence: 0.95"), never a formatted percentage.
    await expect(page.getByText(/Confidence: 0\.95/)).toBeVisible();
    await expect(page.getByTestId("causal-chain")).toBeVisible();

    // Recommended + one ruled-out alternative, both real, registered
    // workflow catalog entries (not console-invented fixtures). Scoped to
    // the workflow-card testid rather than a bare page.getByText: the
    // causal-chain list above already renders the same workflow name in
    // its own "<name> (confidence: NN%)" bullet, so an unscoped text
    // locator matches twice and trips Playwright's strict mode.
    const workflowCards = page.getByTestId(/^workflow-card-/);
    await expect(workflowCards.first()).toBeVisible();
    await expect(workflowCards.getByText(OOMKILL_WORKFLOW)).toBeVisible();
    await expect(workflowCards.getByText(OOMKILL_ALTERNATIVE_WORKFLOW)).toBeVisible();
  });

  // No audit telemetry test: the console used to emit a client-side
  // /a2a/telemetry/audit beacon (emitAuditEvent(), removed 2026-08-02).
  // Running this suite against a real AF surfaced that the endpoint was
  // never implemented upstream (a real 404) — and closer inspection showed
  // the beacon was redundant for every MCP-backed decision anyway: approve/
  // decline/escalate/dismiss/execute_workflow already go through a real,
  // authenticated MCP call (kubernaut_approve, kubernaut_select_workflow,
  // etc.) that a compatible backend's own audit emitter should capture with
  // better provenance than a client-asserted beacon (see AF's
  // EventUserDecision/EventToolExecuted catalog for a reference). See
  // docs/integration-guide.md's "Audit Trail" section for the current
  // (server-side-only) contract.
});
