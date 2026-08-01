import { test, expect } from "@playwright/test";
import {
  openConsole,
  sendChatMessage,
  waitForInvestigationSummary,
  REAL_INVESTIGATION_TIMEOUT_MS,
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
 * Trigger scenario: kubernaut's mock-llm `crashloopScenario`
 * (test/services/mock-llm/scenarios/scenario_crashloop.go) matches any
 * investigation whose signal contains "crashloop", returning a
 * deterministic, high-confidence (0.95) investigation of
 * Deployment/worker in the `staging` namespace, recommending
 * `crashloop-config-fix-v1` over the `generic-restart-v1` alternative.
 * Verified against jordigilh/kubernaut@origin/main on 2026-08-01 — if
 * upstream's scenario config changes, update the expected values below,
 * not the assertions' shape.
 */
test.describe("Contract compliance — integration-guide.md checklist", () => {
  test.beforeEach(async ({ page }) => {
    await openConsole(page);
  });

  test("[checklist] SSE streaming endpoint at /a2a/ + status events with type metadata", async ({ page }) => {
    const sseResponse = page.waitForResponse(
      (res) => res.url().includes("/a2a/") && res.status() === 200,
      { timeout: REAL_INVESTIGATION_TIMEOUT_MS },
    );
    await sendChatMessage(page, "The worker Deployment in staging is stuck in CrashLoopBackOff, please investigate.");
    const res = await sseResponse;
    expect(res.headers()["content-type"]).toContain("text/event-stream");

    // Reasoning/tool-call entries only ever reach the DOM via status-update
    // events carrying a `type` metadata field (ThinkingPanel) — their
    // presence is itself proof the contract's `type` field is populated.
    await expect(page.getByTestId("thinking-body")).toBeVisible({ timeout: REAL_INVESTIGATION_TIMEOUT_MS });
  });

  test("[checklist] RR context metadata on status events populates the investigation banner", async ({ page }) => {
    await sendChatMessage(page, "The worker Deployment in staging is stuck in CrashLoopBackOff, please investigate.");
    await waitForInvestigationSummary(page);

    const context = page.getByTestId("investigation-context");
    await expect(context).toBeVisible();
    // rr_id is opaque/generated per-run; namespace/resource are the fixed,
    // deterministic values crashloopScenario always returns.
    await expect(context.getByLabel(/^Namespace:/i)).toContainText("staging");
    await expect(context.getByLabel(/^Resource:/i)).toContainText("Deployment/worker");
  });

  test("[checklist] investigation_summary artifact carries RCA + real workflow options", async ({ page }) => {
    await sendChatMessage(page, "The worker Deployment in staging is stuck in CrashLoopBackOff, please investigate.");
    await waitForInvestigationSummary(page);

    await expect(page.getByText(/95%/)).toBeVisible();
    await expect(page.getByTestId("causal-chain")).toBeVisible();

    // Recommended + one ruled-out alternative, both real, registered
    // workflow catalog entries (not console-invented fixtures).
    await expect(page.getByTestId(/^workflow-card-/).first()).toBeVisible();
    await expect(page.getByText("crashloop-config-fix-v1")).toBeVisible();
    await expect(page.getByText("generic-restart-v1")).toBeVisible();
  });

  test("[checklist] audit telemetry sink at /a2a/telemetry/audit accepts real user actions", async ({ page }) => {
    const auditRequest = page.waitForRequest(
      (req) => req.url().includes("/a2a/telemetry/audit") && req.method() === "POST",
      { timeout: REAL_INVESTIGATION_TIMEOUT_MS },
    );
    await sendChatMessage(page, "The worker Deployment in staging is stuck in CrashLoopBackOff, please investigate.");
    await waitForInvestigationSummary(page);

    // Any of approve/decline/dismiss/escalate/execute_workflow fires an
    // audit POST — clearing history is the one available unconditionally,
    // regardless of which decision path this run took.
    await page.locator("button[aria-label='New conversation']").click();
    const req = await auditRequest;
    const res = await req.response();
    expect(res?.status()).toBe(204);
  });
});
