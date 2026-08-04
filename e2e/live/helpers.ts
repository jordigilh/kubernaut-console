import { type Page, expect } from "@playwright/test";

/**
 * Real-cluster timing is not mocked-suite instant: KubernautAgent performs
 * real tool calls (kubectl reads, workflow discovery) through a real AF
 * before mock-llm's scripted response even starts streaming back.
 *
 * Overridable via LIVE_E2E_INVESTIGATION_TIMEOUT_MS: playwright.live-v15.config.ts
 * (real, unscripted claude-sonnet-5 against release/v1.5, no mock-llm) sets this
 * much higher — observed 5+ min for a single real investigation during the
 * 2026-08-03 preflight spike, vs. mock-llm's scripted sub-90s responses on the
 * Kind/fullpipeline suite this default was originally tuned for.
 */
export const REAL_INVESTIGATION_TIMEOUT_MS = Number(process.env.LIVE_E2E_INVESTIGATION_TIMEOUT_MS) || 90_000;
export const REAL_EXECUTION_TIMEOUT_MS = 60_000;
export const REAL_VERIFICATION_TIMEOUT_MS = 60_000;

/**
 * Seeds a fresh, unique `contextId` into sessionStorage before any page
 * script runs (via `addInitScript`, guaranteed to execute ahead of the
 * app's own JS), then navigates.
 *
 * Why: a brand-new Playwright test's *first* message naturally has no
 * locally-stored contextId — the console's own `resetContext()` product fix
 * (kubernaut-console#43) only covers the "New conversation" button, not this
 * case. AF's `SessionInterceptor` (BR-SESS-020) reattaches any message with
 * an empty contextId to that identity's already-active session if one
 * exists within its rolling idle window — confirmed via `kubectl logs
 * deploy/apifrontend` reusing the *same* session_id across unrelated tests
 * spanning 13+ minutes and multiple targets once that session degraded into
 * a stuck text-only-reply loop. Without this, every test after the first
 * inherits whatever broken state the shared identity's session is already
 * in, independent of the per-target isolation `oomkillTarget` provides.
 */
export async function openConsole(page: Page): Promise<void> {
  await page.addInitScript(() => {
    sessionStorage.setItem("kubernaut-console-context", crypto.randomUUID());
  });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(page.locator(".kn-chat")).toBeVisible();
}

/**
 * AF's `/mcp` endpoint is the official MCP Go SDK's Streamable HTTP handler
 * (`mcp.NewStreamableHTTPHandler`, pkg/apifrontend/handler/mcp.go), which
 * legitimately replies `event: message\ndata: {...}` (SSE-framed) rather
 * than bare JSON — this is spec-compliant MCP transport behavior, not a
 * bug. The console's own production client already accounts for this (see
 * `parseSSEResponse` in packages/ui-core/src/lib/mcp-client.ts); tests
 * intercepting a raw `/mcp` `Response` must unwrap it the same way instead
 * of calling `.json()` directly, which throws on the `event: message` line.
 *
 * Also mirrors mcp-client.ts's `result.isError` handling: per the MCP spec,
 * a tool call can succeed at the JSON-RPC envelope level (no top-level
 * `error`) while still failing *as a tool call*, signaled by
 * `result.isError: true` with the actual message in `result.content`. An
 * RBAC denial (e.g. the sre persona's ACL gap on
 * kubernaut_complete_no_action) surfaces exactly this way — checking only
 * the envelope's `error` field misses it entirely.
 */
export async function parseMcpResponseBody(text: string): Promise<{ error?: { code: number; message: string }; result?: unknown }> {
  const dataLine = text.split("\n").find((line) => line.trim().startsWith("data:"));
  const jsonStr = dataLine ? dataLine.trim().slice(5).trim() : text;
  const body = JSON.parse(jsonStr) as { error?: { code: number; message: string }; result?: unknown };

  if (body.result && typeof body.result === "object" && (body.result as Record<string, unknown>).isError) {
    const content = (body.result as { content?: Array<{ text?: string }> }).content;
    const message = content?.map((c) => c.text).filter(Boolean).join("; ") || "Tool call failed";
    return { error: { code: -32000, message } };
  }

  return body;
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
 * True once ChatContainer.tsx's `.kn-approval-denied` fallback card is
 * rendered — i.e. AF's `/a2a/status` correctly reported `AwaitingApproval`
 * with an `approval_request_name`, the console correctly tried to fetch its
 * details via `kubernaut_get_approval_request`, but the call was denied.
 * This is the client-observable symptom of the `sre` persona's RBAC gap
 * (see jordigilh/kubernaut-operator#278 and jordigilh/kubernaut#1869) — the
 * console's own handling is already correct (graceful degradation instead of
 * a silent hang), so seeing this card confirms the gap is server-side, not
 * a console bug.
 */
export async function isApprovalDenied(page: Page, timeout = 5_000): Promise<boolean> {
  try {
    await expect(page.locator(".kn-approval-denied")).toBeVisible({ timeout });
    return true;
  } catch {
    return false;
  }
}

/**
 * Clicks the recommended workflow's "Execute" (+ "Execute now" confirm)
 * button, i.e. triggers the real `kubernaut_select_workflow` MCP call.
 *
 * Load-bearing ordering fact (confirmed 2026-08-02 by reading
 * RemediationOrchestrator's AnalyzingHandler.Handle upstream): RO only
 * evaluates `AIAnalysis.Status.ApprovalRequired` and creates the RAR (the
 * thing that makes an Approve/Decline gate exist at all) once
 * `AIAnalysis.Status.Phase == "Completed"` — for an interactive/console
 * session that phase transition only happens once a workflow is actually
 * selected, i.e. once this function's click lands. Checking
 * `isApprovalRequested()` any earlier (e.g. immediately after the decision
 * renders, before ever calling this) will *always* read false regardless of
 * policy/environment config, because AIAnalysis is still sitting in
 * "Investigating" phase and RO hasn't run the approval check yet — this
 * isn't gated by confidence or namespace labels at that point, it simply
 * hasn't been evaluated yet. Call this first, then check
 * `isApprovalRequested()`/`approveIfRequested()` afterward.
 */
export async function clickExecuteWorkflow(page: Page): Promise<void> {
  await expect(page.getByTestId(/^workflow-card-/).first()).toBeVisible({
    timeout: REAL_INVESTIGATION_TIMEOUT_MS,
  });
  const executeButton = page.getByRole("button", { name: /^Execute /i });
  await executeButton.click();
  // WorkflowCards.tsx requires a second, explicit confirm click within a
  // 10s countdown window ("Execute now (Ns remaining)") — it auto-fires
  // once the countdown reaches zero, but clicking confirms deterministically
  // without a passive 10s wait.
  const confirmButton = page.getByRole("button", { name: /^Execute now/i });
  if (await confirmButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await confirmButton.click();
  }
}

/**
 * Per-test investigation targets: dedicated `memory-eater` Deployments (the
 * same image/args kubernaut's own `fullpipeline` bootstrap uses for
 * `kubernaut-system/memory-eater`), one per **individual test**, each in its
 * own `console-e2e-<file>[-N]` namespace — not the single shared
 * `kubernaut-system/memory-eater` fixture this suite originally targeted.
 *
 * Why: this suite's tests run sequentially against the same real AF/KA, as
 * the same Dex identity, driving real investigations. Two independent
 * collision sources were found sharing one target across tests (2026-08-02):
 *   1. AF's `SessionInterceptor` (BR-SESS-020) reattaches a message with an
 *      empty `contextId` to that identity's already-active session within
 *      its rolling ~10min idle window.
 *   2. KubernautAgent's own per-target `session_active` dedup returns a
 *      lightweight "early_rca" instead of a full investigation if a prior
 *      investigation against the *same* `namespace/kind/name` is still
 *      active — independent of AF's session logic.
 * Giving every test its own target resource identity sidesteps (2)
 * regardless of (1), which is enough in practice (see kubernaut-console#43
 * for the console-side half of this — the "New conversation" button's own
 * session-reset gap, fixed separately).
 *
 * These namespaces/Deployments are manually applied to the preserved cluster
 * (see e2e/live/README.md) — a deliberate, documented exception to ADR-009
 * §5's "pure console-driven, no privileged setup" for the single shared
 * `kubernaut-system/memory-eater` fixture; that principle still holds for
 * everything this suite's *tests* themselves do (no test calls kubectl).
 * Follow-up: give this bootstrap a permanent, reproducible home (either
 * upstream's `fullpipeline` setup or a console CI post-bootstrap step)
 * before this suite runs unattended in CI.
 *
 * mock-llm's `oomkilledScenario` keys off `ctx.SignalName`, which
 * KubernautAgent populates from the *real* K8s event reason its tool calls
 * discover, not from our chat text — so this suite's chat message describes
 * this real condition rather than a fabricated one, for both honesty and
 * the best chance of a deterministic scripted-scenario match once
 * kubernaut#1853 (below) no longer intervenes.
 */
export function oomkillTarget(namespace: string) {
  return { kind: "Deployment", namespace, name: "memory-eater" } as const;
}

export function oomkillInvestigateMessage(target: { kind: string; namespace: string; name: string }): string {
  return `The ${target.name} ${target.kind} in ${target.namespace} is OOMKilled and CrashLoopBackOff, please investigate.`;
}

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
 * Update (2026-08-02): #1853's real fix landed upstream as
 * jordigilh/kubernaut#1859 (N-deep `NextToolCall` chaining +
 * `fallback_arguments` in mock-llm — `test/services/mock-llm/handlers/
 * chain.go`'s `flattenToolCallChain`/`nextChainCallByCount`, resolved
 * per-request via `ctx.CountToolResults()`, i.e. inherently stateless/
 * per-conversation, no cross-session state). This cluster's mock-llm was
 * rebuilt from kubernaut `main` @ `a8b9edd4` (which includes #1859) and the
 * hand-patched `mock-llm-scenarios` ConfigMap was rewritten to use a single
 * native 3-deep chain (`investigate -> discover_workflows ->
 * present_decision`) per target, replacing the old two-scenario workaround
 * (a capped-at-1 `next_tool_call` here plus a separate, broadly-keyword-
 * matched `af_present_decision_after_discovery` scenario relying on AF's
 * reinvocation-loop retry) — see ADR-009 §13 for the full investigation,
 * including a live `action_history.audit_events` query that points to that
 * old design as the likely source of an observed cross-session cross-talk
 * failure. Do not "fix" a recurrence of this by inventing a synthetic
 * multi-turn text protocol the console doesn't actually implement — the
 * real fix belongs in the mock-llm scenario config, not the test or the
 * product.
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
