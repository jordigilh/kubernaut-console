import { type Page, expect } from "@playwright/test";

/**
 * Real-cluster timing is not mocked-suite instant: KubernautAgent performs
 * real tool calls (kubectl reads, workflow discovery) through a real AF
 * before mock-llm's scripted response even starts streaming back.
 */
export const REAL_INVESTIGATION_TIMEOUT_MS = 90_000;
export const REAL_EXECUTION_TIMEOUT_MS = 60_000;
export const REAL_VERIFICATION_TIMEOUT_MS = 60_000;

export async function openConsole(page: Page): Promise<void> {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(page.locator(".kn-chat")).toBeVisible();
}

export async function sendChatMessage(page: Page, text: string): Promise<void> {
  const input = page.locator("textarea[aria-label='Type your message']");
  await expect(input).toBeVisible();
  await input.fill(text);
  await page.locator("button[aria-label='Send message']").click();
}

/**
 * Waits for the real investigation_summary artifact to arrive (RCACard
 * rendered) — i.e. a real KubernautAgent finished real tool calls and
 * mock-llm's scripted RCA/workflow-options response streamed back.
 */
export async function waitForInvestigationSummary(page: Page): Promise<void> {
  await expect(page.getByTestId("severity-accent")).toBeVisible({
    timeout: REAL_INVESTIGATION_TIMEOUT_MS,
  });
}

export async function waitForPhaseLabel(
  page: Page,
  label: string,
  timeout = REAL_EXECUTION_TIMEOUT_MS,
): Promise<void> {
  await expect(page.locator(".kn-phase-label")).toHaveText(label, { timeout });
}

/** True once an ApprovalCard is rendered (workflow requires human sign-off). */
export async function isApprovalRequested(page: Page, timeout = 5_000): Promise<boolean> {
  try {
    await expect(page.getByRole("button", { name: "Approve" })).toBeVisible({ timeout });
    return true;
  } catch {
    return false;
  }
}

export async function approveIfRequested(page: Page): Promise<void> {
  if (await isApprovalRequested(page)) {
    await page.getByRole("button", { name: "Approve" }).click();
  }
}

/**
 * The suite's investigation target: kubernaut-system/memory-eater, a
 * Deployment kept permanently OOMKilled/CrashLoopBackOff by kubernaut's own
 * `fullpipeline` bootstrap (test/e2e/fullpipeline's SynchronizedBeforeSuite)
 * for its own AF E2E tests to investigate. Verified alive against
 * `jordigilh/kubernaut@origin/main` on 2026-08-02: the pod's real
 * `lastState.terminated` is `OOMKilled` (exit 137), with a real kubelet
 * `BackOff` event — a genuine, always-there broken resource, not a fixture
 * this suite has to create itself (this suite has no kubectl access by
 * design — see ADR-009 §5's "pure console-driven, no privileged setup").
 *
 * mock-llm's `oomkilledScenario` keys off `ctx.SignalName`, which
 * KubernautAgent populates from the *real* K8s event reason its tool calls
 * discover, not from our chat text — so this suite's chat message describes
 * this real condition rather than a fabricated one, for both honesty and
 * the best chance of a deterministic scripted-scenario match once
 * kubernaut#1853 (below) no longer intervenes.
 */
export const OOMKILL_TARGET = {
  kind: "Deployment",
  namespace: "kubernaut-system",
  name: "memory-eater",
} as const;

export const OOMKILL_WORKFLOW = "oomkill-increase-memory-v1";
export const OOMKILL_ALTERNATIVE_WORKFLOW = "generic-restart-v1";

/**
 * Same wait as `waitForInvestigationSummary`, but fails with a message
 * naming kubernaut#1853 instead of a bare "element not found" timeout when
 * it doesn't show up.
 *
 * History: originally attributed to kubernaut#1818 (orphaned RCA on an
 * autonomous/interactive session race). #1818 was fixed and merged
 * upstream (jordigilh/kubernaut#1844, 2026-08-02) — re-validated directly:
 * built arm64 images from the fix commit, ran
 * `test/e2e/fullpipeline/15_af_a2a_interactive_streaming_test.go`
 * (`--label-filter=issue-1189`) against a fresh cluster, 4/4 passed
 * including the exact #1818 regression case. This suite still failed
 * identically afterward, which traced to a **different, still-open**
 * defect: kubernaut#1853.
 *
 * #1853's mechanism: a single free-form investigate message — the
 * console's actual, only, and intended usage pattern (there is no console
 * UI concept of a scripted multi-turn "create/discover/select" text
 * protocol; approve/decline/dismiss/execute are direct MCP tool calls from
 * button clicks, never chat text — see ChatContainer.tsx's
 * handleApprove/handleExecuteWorkflow) — contains the keyword
 * "investigate" but not "remediation", so the `fullpipeline` E2E harness's
 * mock-llm fixture (`test/infrastructure/shared_e2e.go`'s afKeywordYAML)
 * matches its `af_investigate` scenario directly, skipping
 * `kubernaut_remediate` entirely. That scenario's `rr_id` argument is a
 * `$from_tool:kubernaut_remediate:rr_id` template with no prior
 * `kubernaut_remediate` response to resolve from, so AF calls
 * `kubernaut_investigate` with the literal, unresolved placeholder string,
 * which fails K8s name validation and falls back to a text-only reply
 * after 3 retries — the malformed TextPart this helper's timeout catches.
 * Confirmed via `kubectl logs deploy/apifrontend`: no `kubernaut_remediate`
 * tool call is ever attempted for this request. This is a **mock-llm
 * test-fixture scripting gap**, not an AF/KA production defect — a real
 * LLM would presumably sequence remediate-then-investigate on its own; the
 * scripted double can only replay its author's exact expected phrase
 * sequence.
 *
 * This is not a rare flake here — it reproduced on effectively every run
 * against this cluster. Tests using this helper are effectively blocked
 * until #1853 lands upstream; do not "fix" that by inventing a synthetic
 * multi-turn text protocol the console doesn't actually implement, which
 * would silently mask this real gap instead of catching it.
 */
export async function waitForInvestigationSummaryOrKnownRace(page: Page): Promise<void> {
  try {
    await waitForInvestigationSummary(page);
  } catch (err) {
    throw new Error(
      "investigation_summary never rendered (no severity-accent). This is most likely " +
        "kubernaut#1853 (fullpipeline mock-llm fixture has no scenario for a single " +
        "combined-intent message, so kubernaut_investigate gets called with an unresolved " +
        "$from_tool template), not a console-side bug — see this function's doc comment for " +
        "the full mechanism and e2e/live/README.md for current status.",
      { cause: err },
    );
  }
}
