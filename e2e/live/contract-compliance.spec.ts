import { test, expect } from "@playwright/test";
import {
  openConsole,
  sendChatMessage,
  waitForInvestigationSummaryOrKnownRace,
  REAL_INVESTIGATION_TIMEOUT_MS,
  oomkillTarget,
  oomkillInvestigateMessage,
  crashloopTarget,
  crashloopInvestigateMessage,
  CRASHLOOP_WORKFLOW,
  CRASHLOOP_ALTERNATIVE_WORKFLOWS,
  fixtureNamespace,
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
 * Trigger scenario: `sse`/`rrContext` use a dedicated, per-test
 * `memory-eater` Deployment kept permanently OOMKilled/CrashLoopBackOff in
 * its own `console-e2e-contract[-N]` namespace (see helpers.ts's
 * `oomkillTarget` for why each test gets its own target instead of sharing
 * kubernaut-system/memory-eater) — those two tests only need *some*
 * investigation to start, not a specific RCA/workflow shape.
 *
 * `summary` instead uses `crashloopTarget` (kubernaut-console#54): this test
 * asserts on the *actual* RCA/workflow-selection content, which a real LLM
 * against the synthetic memory-eater fixture answers non-deterministically
 * (sometimes declining to recommend any workflow at all). See
 * `crashloopTarget`'s doc comment in helpers.ts for why this real,
 * `kubernaut-demo-scenarios`-derived scenario is deterministic instead.
 *
 * Historical note: this suite originally ran against `fullpipeline`'s
 * mock-llm (scripted `oomkilledScenario`, confidence pinned to exactly
 * 0.95) — since replaced by a real, unscripted LLM against `release/v1.5`
 * (playwright.live-v15.config.ts), so assertions below check shape/
 * real-catalog-membership rather than mock-llm's exact scripted values.
 */
// fixtureNamespace() appends LIVE_E2E_NS_SUFFIX (set by
// scripts/setup-fixtures.sh) — see its doc comment in helpers.ts for why a
// fixed namespace name fights RemediationOrchestrator's own circuit breakers
// across repeated runs.
const TARGETS = {
  sse: oomkillTarget(fixtureNamespace("console-e2e-contract")),
  rrContext: oomkillTarget(fixtureNamespace("console-e2e-contract-2")),
  summary: crashloopTarget(fixtureNamespace("console-e2e-contract-3")),
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
    await sendChatMessage(page, crashloopInvestigateMessage(TARGETS.summary));
    await waitForInvestigationSummaryOrKnownRace(page);

    // A real LLM's exact confidence value is not pinned (observed 0.75-0.97
    // for this identical scenario across runs — see kubernaut#1935/#1939) —
    // assert the shape (RCACard.tsx renders the raw decimal, e.g.
    // "Confidence: 0.92", never a formatted percentage) rather than a value.
    // Found (2026-08-07): the real LLM's own causal-chain array can itself
    // contain an entry whose text incidentally reads "Confidence: 0.95,
    // severity: critical" — an unscoped page.getByText(/Confidence: .../)
    // then matches both that entry and RCACard's own metadata footer,
    // tripping Playwright's strict mode. Scope to the metadata footer's
    // stable testid instead of relying on the causal chain's LLM-authored
    // (and therefore non-deterministic) text staying disjoint from this
    // pattern.
    await expect(page.getByTestId("rca-metadata")).toContainText(/Confidence: 0\.\d+/);
    await expect(page.getByTestId("causal-chain")).toBeVisible();

    // Recommended workflow is deterministic (crashloop-rollback-v1 is the
    // only catalog entry purpose-built for this exact fault shape — see
    // CRASHLOOP_WORKFLOW's doc comment); the cited alternative is not, so
    // accept either real catalog alternative. Scoped to the workflow-card
    // testid rather than a bare page.getByText: the causal-chain list above
    // already renders the same workflow name in its own
    // "<name> (confidence: NN%)" bullet, so an unscoped text locator matches
    // twice and trips Playwright's strict mode.
    //
    // The recommended card is specifically `.first()` (WorkflowCards.tsx
    // renders `recommended` before the ruled-out `alternatives.map(...)`):
    // a ruled-out alternative's own rationale text can legitimately mention
    // "crashloop-rollback-v1" by name (e.g. "less specific than
    // crashloop-rollback-v1"), so the unscoped `workflowCards.getByText(...)`
    // resolves to 2 elements and trips strict mode (confirmed live,
    // 2026-08-05). Same reasoning for `.first()` on the alternatives check —
    // we only need to confirm *some* real alternative rendered, not count
    // every mention.
    const workflowCards = page.getByTestId(/^workflow-card-/);
    await expect(workflowCards.first()).toBeVisible();
    await expect(workflowCards.first().getByText(CRASHLOOP_WORKFLOW)).toBeVisible();
    await expect(
      workflowCards.getByText(new RegExp(CRASHLOOP_ALTERNATIVE_WORKFLOWS.join("|"))).first(),
    ).toBeVisible();

    // Cleanup (kubernaut-console#54, found live 2026-08-05): this test only
    // asserts on the artifact shape, so it never clicks Execute — left as-is,
    // the investigation stays decision-pending indefinitely on this shared
    // `console-e2e-contract-3` target. KA's interactive-session dedup
    // (session/manager.go, ~10min inactivity TTL, independent of the
    // RR/AIAnalysis CRs' own terminal phase) then makes the *next* run of
    // this same test reconnect to the stale pending session and get the
    // lightweight session_active/early_rca fallback instead of a fresh
    // investigation — confirmed live by re-running this test twice in a row.
    // "No action needed" (kubernaut_complete_no_action) is available
    // regardless of whether a workflow was found, and cleanly terminates the
    // session so the next run starts fresh instead of relying on the passive
    // TTL to expire.
    await page.getByRole("button", { name: "No action needed" }).click();
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
