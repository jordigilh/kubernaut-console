import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
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
// 60s was too tight for a real cluster: the post-approve path is
// kubernaut_approve -> WorkflowExecution (Executing, ~10s) -> Verifying
// (EffectivenessAssessment stabilization window + assessment, not scripted)
// -> Completed. Measured end-to-end on the shared dev cluster (2026-08-08,
// kubernaut-console#64 follow-up "are the test outcomes validated?" repro):
// kubernaut_approve succeeded at 19:43:58Z, RR reached Completed at
// 19:46:29Z — 2m31s, well past the old 60s budget, while the backend had
// already fully succeeded (WorkflowExecution Completed, pods healthy, new
// rollout revision created). The test was failing on its own timeout, not
// on a real product hang.
export const REAL_VERIFICATION_TIMEOUT_MS = 240_000;

/**
 * Budget for the autonomous `kubernaut_remediate` path (kubernaut-console#77)
 * between sending the "Fix ..." message and knowing whether an approval gate
 * exists at all. Unlike the interactive path — where RCA is bounded by
 * `REAL_INVESTIGATION_TIMEOUT_MS` and workflow discovery+selection then
 * happen synchronously within `clickExecuteWorkflow`'s own call, so approval
 * (if any) already exists by the time that function returns —
 * `kubernaut_remediate` has no such synchronous trigger point: RCA,
 * discovery, and selection all run autonomously on RO/KA's own schedule
 * after the chat turn already ended. Measured live (2026-08-10,
 * `console-e2e-autonomous-fix`, claude-sonnet-5): AIAnalysis went
 * Investigating -> Completed and RO created a real RAR in 3m6s
 * (11:46:13Z -> 11:49:19Z). 300s gives headroom above that single data point
 * without being unbounded.
 */
export const REAL_AUTONOMOUS_DECISION_TIMEOUT_MS = 300_000;

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
/**
 * Snapshots `page` to `test-results/screenshots/<label>/NNN.png` on a fixed
 * interval, for manually reviewing a long real-cluster run's visual progress
 * without waiting for the test to finish — Playwright's own
 * `screenshot`/`video`/`trace` config in playwright.live-v15.config.ts is all
 * `on-failure`/`retain-on-failure`, so nothing is captured at all for a run
 * that *passes*, which is exactly the case where a first-ever run of a new
 * spec still benefits from a human being able to sanity-check what actually
 * rendered at each stage (kubernaut-console#77's autonomous-fix.spec.ts, its
 * first live confirmation run). `test-results/` is already gitignored.
 *
 * Returns a stop function; callers must call it (e.g. in a `finally`) once
 * the run is done, or the interval leaks past the test's own lifetime.
 * Screenshot failures (page mid-navigation, closed, etc.) are swallowed —
 * this is a best-effort observability aid, never a source of test flakiness.
 */
export function startPeriodicScreenshots(page: Page, label: string, intervalMs = 15_000): () => void {
  const dir = join("test-results", "screenshots", label);
  mkdirSync(dir, { recursive: true });
  let stopped = false;
  let n = 0;

  const tick = async () => {
    if (stopped) return;
    n += 1;
    const seq = String(n).padStart(3, "0");
    try {
      await page.screenshot({ path: join(dir, `${seq}.png`) });
    } catch {
      // best-effort only — see doc comment
    }
  };

  const handle = setInterval(() => {
    void tick();
  }, intervalMs);

  return () => {
    stopped = true;
    clearInterval(handle);
  };
}

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
 * Distinguishes the two reasons `isApprovalRequested()` can read false after
 * `clickExecuteWorkflow()`: (a) this run's policy auto-approved — nothing to
 * test, a legitimate skip — vs (b) RO *did* require approval and created a
 * real RAR, but the console's `kubernaut_get_approval_request` fetch was
 * denied. Skipping silently in case (b) would hide a real bug behind a
 * misleading "auto-approved" message. Shared by approval-gate.spec.ts and
 * full-remediation-lifecycle.spec.ts (kubernaut-console#54): any
 * `crashloopTarget` in a `kubernaut.ai/environment=production` namespace
 * reaches this same gate, since the OPA policy requires approval
 * unconditionally for production regardless of which test triggered it.
 *
 * Historical note (2026-08-08): this used to fire routinely on the `sre`
 * persona RBAC gap (jordigilh/kubernaut-operator#278, jordigilh/kubernaut#1869
 * — both now closed/shipped, confirmed live on the shared dev cluster via
 * direct ClusterRole inspection, kubernaut-console#71). If this throws again,
 * it's a genuine regression, not the old known gap — don't re-attribute to
 * #278/#1869 without re-verifying live RBAC state first.
 *
 * `timeout` (kubernaut-console#77, added 2026-08-10): defaults to 30s, which
 * is correct for callers where the click that triggers RO's approval
 * evaluation (e.g. `clickExecuteWorkflow`) has *already* happened
 * synchronously — approval, if required, exists by the time this runs. The
 * autonomous `kubernaut_remediate` path has no such synchronous trigger
 * point: RCA + workflow discovery + selection all happen on RO/KA's own
 * schedule *after* this function could first be called, so a caller with no
 * earlier explicit wait for "past investigating" must pass a timeout long
 * enough to cover that whole autonomous sequence (e.g.
 * `REAL_INVESTIGATION_TIMEOUT_MS`), or this reads `requested: false` purely
 * because the RAR did not exist *yet* — confirmed live: a first pass of
 * `autonomous-fix.spec.ts` with the old hardcoded 30s window read `false`
 * while `oc get remediationapprovalrequest` showed one created ~2m31s later.
 */
export async function assertApprovalGateReachable(page: Page, timeout = 30_000): Promise<boolean> {
  const requested = await isApprovalRequested(page, timeout);
  if (requested) return true;
  if (await isApprovalDenied(page, 2_000)) {
    throw new Error(
      "RemediationOrchestrator required approval and created a real RAR, but the console's " +
        "kubernaut_get_approval_request call was denied for the sre persona. The known RBAC gap " +
        "(jordigilh/kubernaut-operator#278, jordigilh/kubernaut#1869) is closed and confirmed live " +
        "on the shared dev cluster as of 2026-08-08 — this is NOT that gap recurring without fresh " +
        "evidence. Re-verify live RBAC state (`oc get clusterrole kubernaut-system-tool-sre -o " +
        "jsonpath='{.rules[*].resourceNames}'`) before re-filing against #278/#1869.",
    );
  }
  return false;
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
 *
 * `expectedWorkflowName` (kubernaut-console#64, revised 2026-08-07): the
 * caller must state the specific catalog workflow name it expects — sourced
 * from a `kubernaut-demo-scenarios` scenario's own documentation/golden
 * transcript, not guessed or left open-ended. This asserts the *recommended*
 * card's rendered name matches exactly, not merely "some workflow card
 * appeared." The original version of this fix only handled the
 * `no_matching_workflows` outcome explicitly (racing it against "any
 * workflow card") — that's not strict enough: a test that accepts *any*
 * selected workflow as a pass would silently miss a real workflow-selection
 * regression (the model picking the wrong catalog entry) just as easily as
 * it missed `no_matching_workflows` before this fix existed at all. Fixture
 * non-determinism landing on either the wrong outcome or the wrong workflow
 * is exactly the kind of thing this needs to catch loudly, not tolerate.
 */
export async function clickExecuteWorkflow(page: Page, expectedWorkflowName: string): Promise<void> {
  const firstWorkflowCard = page.getByTestId(/^workflow-card-/).first();
  const noMatchingWorkflowsEscapeHatch = page.getByRole("button", { name: "No action needed" });

  // Found 2026-08-07 (first real-workflow run after the workflow catalog was
  // reseeded — every prior run had hit no_matching_workflows due to an empty
  // catalog, so this path was never exercised): WorkflowCards renders "No
  // action needed"/"Escalate to team" unconditionally whenever a workflow
  // decision is offered at all (AgentBubble wires onDismiss/onEscalate into
  // the *same* WorkflowCards instance used for a real recommended-workflow
  // decision, not only the no-match escape-hatch-only branch) -- a human can
  // dismiss/escalate a legitimate recommendation too, not just an empty one.
  // So firstWorkflowCard and noMatchingWorkflowsEscapeHatch can both be
  // visible simultaneously once a real workflow is found, which made the
  // original `firstWorkflowCard.or(noMatchingWorkflowsEscapeHatch)` union
  // resolve to 2 elements and fail Playwright's strict-mode toBeVisible().
  // `.first()` on the *union* (DOM order) fixed the strict-mode violation,
  // but introduced a *different*, worse bug (kubernaut-console#73,
  // 2026-08-08): against a real claude-sonnet-5 backend, this combined
  // `.or(...).first()` locator's own `toBeVisible()` intermittently never
  // resolved even though its target element was genuinely present and
  // visible in the DOM well before the timeout — confirmed twice in
  // independent runs (once for the workflow card, once for the escape hatch
  // button), each burning the full REAL_INVESTIGATION_TIMEOUT_MS and then
  // the outer test timeout with `Received: undefined`, despite the final
  // error-context.md snapshot showing the element rendered correctly minutes
  // earlier. A live standalone repro against the same backend, polling each
  // locator's `.count()` independently instead of trusting a single combined
  // locator's actionability/stability checks, detected the identical
  // elements reliably — most likely because Sonnet 5's SSE re-render cadence
  // produces enough DOM churn to keep defeating `.or()`'s re-resolution or
  // `toBeVisible()`'s frame-to-frame stability check. `expect(...).toPass()`
  // around plain `.count()` reads sidesteps that entirely: `.count()` is a
  // point-in-time query with no actionability/stability semantics of its own.
  //
  // Found 2026-08-24 (kubernaut#2273 live pprof repro, confirmed via two
  // goroutine dumps + full KA log trail — root-caused as a console/test-side
  // gap, not a KA hang): for an interactive (BR-INTERACTIVE-010) session,
  // RCA returns *early* and renders as its own agent message before the
  // separate, later `discover_workflows` call even starts. AgentBubble used
  // to render the "No action needed"/"Escalate to team" escape hatch
  // unconditionally the instant that RCA-only message existed
  // (`showEscapeHatches = hasRCAData && !hasWorkflows`) — a real,
  // ~seconds-to-tens-of-seconds-wide transient state on the happy path, not
  // evidence of no_matching_workflows — and this function's old "stop
  // polling as soon as EITHER is visible" loop threw its no_matching_workflows
  // error *before* discover_workflows had even been called on the backend,
  // ~26s before it went on to correctly select and validate a real workflow.
  // The console-side half is now fixed in AgentBubble.tsx: the escape hatch
  // also requires discovery to have completed (workflowOptions !== undefined,
  // even when empty), so a still-in-flight discovery shows the RCA card
  // alone with no decision buttons. This polling shape is kept regardless:
  // poll for firstWorkflowCard alone as the only success condition for the
  // full timeout, and only report no_matching_workflows once that full wait
  // is exhausted with the escape hatch (and no card) still showing — trading
  // fast-fail on a genuine no-match for not misreporting a legitimate,
  // still-in-flight recommendation.
  let timedOutWaitingForCard: unknown;
  try {
    await expect(async () => {
      expect(await firstWorkflowCard.count()).toBeGreaterThan(0);
    }).toPass({ timeout: REAL_INVESTIGATION_TIMEOUT_MS, intervals: [1_000] });
  } catch (err) {
    timedOutWaitingForCard = err;
  }

  if (timedOutWaitingForCard) {
    const noActionVisible = await noMatchingWorkflowsEscapeHatch.isVisible().catch(() => false);
    if (noActionVisible) {
      throw new Error(
        `Investigation concluded no_matching_workflows, but the documented expectation for this fixture ` +
          `(kubernaut-demo-scenarios' own scenario README/golden transcript) is "${expectedWorkflowName}". ` +
          "The console correctly rendered the 'No action needed'/'Escalate to team' escape hatch — this is " +
          "not a console bug — but it diverges from the known-good expected outcome. See kubernaut-console#64 " +
          "for this fixture's documented non-determinism data points and next steps.",
      );
    }
    throw timedOutWaitingForCard;
  }

  await expect(
    firstWorkflowCard,
    `Investigation selected a workflow other than the documented expectation "${expectedWorkflowName}" ` +
      "(kubernaut-demo-scenarios' scenario README/golden transcript for this fixture) — treat this as a " +
      "potential real workflow-selection regression, not something to accept because *a* workflow rendered. " +
      "See kubernaut-console#64.",
  ).toContainText(expectedWorkflowName);

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

/**
 * Appends the current run's random namespace suffix (generated by
 * `e2e/live/scripts/setup-fixtures.sh`, exported as `LIVE_E2E_NS_SUFFIX`) to
 * a base fixture name, e.g. `"console-e2e-approval"` ->
 * `"console-e2e-approval-a1b2c3"`. Falls back to the bare literal when unset
 * — e.g. a one-off local run against namespaces provisioned by hand — so
 * every existing hardcoded namespace name in this suite keeps working
 * without the script.
 *
 * Why (2026-08-05): RemediationOrchestrator's own safety mechanisms make a
 * *fixed* namespace name actively hostile to repeated test/fixture
 * development runs, independent of KubernautAgent's session_active dedup
 * (which `oomkillTarget`'s per-test-namespace scheme above already solves):
 *   - `ConsecutiveFailures` (BR-ORCH-042): 3 consecutive Failed/Blocked RRs
 *     for the same signal-target fingerprint block *all* new RRs on it for
 *     1h (`consecutiveFailureCooldown`).
 *   - `RecentlyRemediated` (DD-WE-001): blocks re-running the *same*
 *     workflow on the same target within 5m of a prior success
 *     (`recentlyRemediatedCooldown`).
 *   - `IneffectiveChain` (issue #214, BR-ORCH-042.5): 3 consecutive
 *     ineffective remediations (hash-chain match) within a 4h lookback
 *     escalates to manual review instead of retrying
 *     (`ineffectiveChainThreshold` / `ineffectiveTimeWindow`).
 * All three key off the target resource identity, not the test file/name,
 * so a fixed `console-e2e-approval` namespace that's been remediated (or
 * failed to remediate) a few times earlier the same day silently produces
 * `Blocked`/escalated RRs on the *next* run — a false "regression" that's
 * actually RO correctly doing its job. A fresh per-run namespace sidesteps
 * this the same way per-test namespaces sidestep KA's dedup. Preserves the
 * scenario's identity (still literally "console-e2e-approval", just with a
 * disambiguating suffix) per the fixture's actual purpose, rather than
 * inventing an unrelated name.
 */
export function fixtureNamespace(base: string): string {
  const suffix = process.env.LIVE_E2E_NS_SUFFIX;
  return suffix ? `${base}-${suffix}` : base;
}

/**
 * Fleet cluster ID suffix for investigate messages (2026-08-27, see
 * e2e/live/RUNNING-FLEET-SUITE.md §1b): this suite's fixtures live on whichever cluster
 * `LIVE_E2E_FLEET_CLUSTER_ID` names (see e2e/live/README-v16-fleet-openshift.md),
 * not necessarily the same cluster AF/KA run on. KA has no cross-cluster
 * resource auto-discovery — a target with no cluster hint is only looked up
 * on the local/loopback cluster, and a genuinely fleet-hosted target with no
 * hint gets a correct-but-blocking clarifying question ("local cluster or
 * fleet cluster — if fleet, which cluster ID?") instead of an investigation.
 * Empty when unset, matching pre-fleet (single-cluster) suite runs where no
 * disambiguation is needed.
 */
function fleetClusterSuffix(): string {
  const clusterId = process.env.LIVE_E2E_FLEET_CLUSTER_ID;
  return clusterId ? ` (fleet cluster ID: ${clusterId})` : "";
}

export function oomkillInvestigateMessage(target: { kind: string; namespace: string; name: string }): string {
  return `The ${target.name} ${target.kind} in ${target.namespace} is OOMKilled and CrashLoopBackOff, please investigate.${fleetClusterSuffix()}`;
}

/**
 * Real-LLM-realistic alternative to `oomkillTarget` (kubernaut-console#54):
 * a real model (unlike mock-llm's scripted responses) can tell the
 * difference between a genuine incident and a synthetic "grow memory
 * forever" fixture with no plausible root cause — and on `memory-eater`, a
 * real Sonnet 5/4.6 investigation sometimes concludes there's nothing
 * actionable to recommend, or escalates instead of selecting a workflow
 * (see kubernaut-console#54 for both models' transcripts). This target
 * mirrors `kubernaut-demo-scenarios/scenarios/crashloop` instead: a `worker`
 * Deployment whose pod-template command was patched to a deliberate
 * `exit 1`, i.e. an actual bad-release/bad-config-change shape a real model
 * recognizes and reliably diagnoses. Confirmed deterministic across three
 * independent real-LLM runs — kubernaut-demo-scenarios' own golden
 * transcript (Sonnet 4.6, `golden-transcripts/crashloop-kubepodcrashlooping.json`)
 * plus two live Sonnet 5 runs this session (before and after kubernaut#1935's
 * confidence-propagation fix) — all three selected `crashloop-rollback-v1`
 * over the two catalog alternatives.
 *
 * Fixture bootstrap (manually applied to the preserved cluster, same
 * documented "no test calls kubectl" exception as `oomkillTarget` — see
 * e2e/live/README.md):
 *
 *   # ConfigMap + Deployment (2 healthy replicas) — see
 *   # kubernaut-demo-scenarios/scenarios/crashloop/manifests/{configmap,deployment}.yaml,
 *   # applied here with `metadata.namespace` retargeted per test.
 *   oc apply -f <worker-config ConfigMap + worker Deployment, per-namespace>
 *
 *   # Then inject the fault (kubernaut-demo-scenarios/scenarios/crashloop/inject-bad-release.sh,
 *   # namespace substituted):
 *   oc patch deployment worker -n <namespace> --type=json \
 *     -p '[{"op":"add","path":"/spec/template/spec/containers/0/command",
 *          "value":["sh","-c","echo fatal: bad release 1.1.0 -- aborting && exit 1"]}]'
 *
 * No new PrometheusRule needed: the existing `console-e2e-alerts` rule (see
 * `oomkillTarget`'s bootstrap) already matches `namespace=~"console-e2e-.*"`
 * generically, independent of which Deployment/pod is crashlooping.
 *
 * Unlike `memory-eater`'s indefinite OOM loop, a *successful* real
 * remediation (rollback) permanently heals this target — it will not
 * re-fault on its own. Any test that actually executes the recommended
 * workflow (rather than only observing the RCA/decision, as
 * contract-compliance's read-only assertions do) must have the fault
 * re-injected (the `oc patch` above) before each run.
 */
export function crashloopTarget(namespace: string) {
  return { kind: "Deployment", namespace, name: "worker" } as const;
}

export function crashloopInvestigateMessage(target: { kind: string; namespace: string; name: string }): string {
  return `The ${target.name} ${target.kind} in ${target.namespace} is in CrashLoopBackOff after a bad release, please investigate.${fleetClusterSuffix()}`;
}

/**
 * Triggers the autonomous "fire-and-forget fix" path (kubernaut-console#77):
 * `pkg/apifrontend/agent/prompt.txt`'s "Autonomous mode" section routes
 * "fix"/"remediate"/"address"/"resolve"/"heal" + a target, combined with an
 * explicit "no further interaction expected" signal, to `kubernaut_remediate`
 * instead of `kubernaut_investigate` — a materially different backend path
 * (no InvestigationSession at all; RemediationOrchestrator/AIAnalysis/KA run
 * investigation, workflow discovery, and selection entirely autonomously,
 * with zero pause for a workflow-selection card). Unlike
 * `crashloopInvestigateMessage`, this must avoid "investigate"/"please
 * investigate" wording entirely and state plainly that no follow-up
 * interaction is wanted, so a real model doesn't fall back to the default
 * `full_remediation` (pause-for-selection) interactive mode.
 */
export function crashloopFixMessage(target: { kind: string; namespace: string; name: string }): string {
  return `Fix the ${target.name} ${target.kind} in ${target.namespace} — it's in CrashLoopBackOff after a bad release. Just fix it autonomously, I don't need to review or select anything.${fleetClusterSuffix()}`;
}

// crashloop-rollback-v1 is the only catalog workflow purpose-built for this
// exact shape (CrashLoopBackOff from a pod-spec/command override on a
// Deployment, not OOMKilled) — see its `whenToUse`/`whenNotToUse` in
// list_workflows' response, captured verbatim in the golden transcript.
// rollback-deployment-v1 and crashloop-rollback-risk-v1 are both valid,
// real, lower-confidence alternatives the model may cite; which one it picks
// as "the" alternative is not itself deterministic, so assertions should
// accept either rather than pinning one.
export const CRASHLOOP_WORKFLOW = "crashloop-rollback-v1";
export const CRASHLOOP_ALTERNATIVE_WORKFLOWS = ["rollback-deployment-v1", "crashloop-rollback-risk-v1"] as const;

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

// ── Backend-state (not just UI) outcome validation ──────────────────────────
//
// Found (2026-08-07): this suite's real-execution tests (approval-gate.spec.ts's
// "approve path", full-remediation-lifecycle.spec.ts) only ever asserted a UI
// phase-label regex — some as loose as /Executing|Verifying|Complete/, or
// /Complete|Failed/ — which can pass even if the workflow never actually
// executed against the cluster, or genuinely failed to fix the target.
// kubernaut-demo-scenarios' own scenarios/*/validate.sh takes a stricter
// approach: it treats the real RemediationRequest/WorkflowExecution CRDs and
// live cluster state (rollout history, pod status) as ground truth rather
// than trusting a UI's rendering of that same state. The helpers below
// reproduce that same ground-truth check from the browser-driven side, using
// the exact field paths validation-helper.sh uses (`_find_rr_name`,
// `get_rr_phase`, `get_rr_outcome`, `get_wfe_phase`) — confirmed by reading
// that script directly rather than guessed. `oc` is already a hard
// prerequisite of this whole suite (see scripts/setup-fixtures.sh).
const PLATFORM_NS = "kubernaut-system";

function execOc(args: string[]): string {
  return execFileSync("oc", args, { encoding: "utf-8" });
}

interface RemediationRequestSummary {
  name: string;
  phase: string;
  outcome: string;
}

/**
 * Mirrors validation-helper.sh's `_find_rr_name` priority order: prefer a
 * Completed+Remediated RR, then any Completed RR, then the oldest active
 * one — so a stale RR from an earlier retry against the same reused fixture
 * namespace (see fixtureNamespace's doc comment) doesn't shadow the current
 * run's real outcome.
 *
 * Queries spec.targetResource.namespace, not spec.signalLabels.namespace:
 * this suite's investigations are all chat-driven (kubernaut_investigate_alert,
 * signalSource: a2a-agent), whose signalLabels only ever carries
 * {severity_alert_name, severity_source} — never a namespace key. Only
 * genuine Alertmanager-webhook-triggered RRs (a different signal source this
 * suite doesn't use) carry the full Prometheus label set, including
 * namespace, inside signalLabels. spec.targetResource.namespace is present
 * on every RR regardless of signal source and is the actual source of truth
 * for what was investigated. Confirmed empirically (2026-08-08,
 * kubernaut-console#64 follow-up): this query previously always returned
 * zero rows for this suite's own chat-triggered RRs, silently failing
 * assertCrashloopWasRemediated's ground-truth check on every run.
 */
export function getRemediationRequestForTarget(namespace: string): RemediationRequestSummary | null {
  const raw = execOc([
    "get",
    "remediationrequests",
    "-n",
    PLATFORM_NS,
    "-o",
    'jsonpath={range .items[*]}{.metadata.name}{"\\t"}{.spec.targetResource.namespace}{"\\t"}{.status.overallPhase}{"\\t"}{.status.outcome}{"\\n"}{end}',
  ]);
  const rows = raw
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [name, ns, phase, outcome] = line.split("\t");
      return { name, ns, phase: phase ?? "", outcome: outcome ?? "" };
    })
    .filter((r) => r.ns === namespace);

  if (rows.length === 0) return null;

  const completedRemediated = rows.find((r) => r.phase === "Completed" && r.outcome === "Remediated");
  const anyCompleted = rows.find((r) => r.phase === "Completed");
  const chosen = completedRemediated ?? anyCompleted ?? rows[0];
  return { name: chosen.name, phase: chosen.phase, outcome: chosen.outcome };
}

/**
 * True if any InvestigationSession CRD references this RR
 * (`spec.remediationRequestRef.name`). Used to confirm `kubernaut_remediate`
 * (kubernaut-console#77) genuinely took the session-less autonomous path —
 * `HandleRemediate` (`pkg/apifrontend/tools/ka_remediate.go`) documents
 * itself as "creates RR without InvestigationSession", unlike every
 * `kubernaut_investigate`-driven flow this suite's other specs exercise.
 */
export function hasInvestigationSessionForRR(rrName: string): boolean {
  const raw = execOc([
    "get",
    "investigationsessions",
    "-n",
    PLATFORM_NS,
    "-o",
    'jsonpath={range .items[*]}{.spec.remediationRequestRef.name}{"\\n"}{end}',
  ]);
  return raw
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(rrName);
}

export function getWorkflowExecutionPhase(rrName: string): string | null {
  try {
    const phase = execOc(["get", "workflowexecutions", `we-${rrName}`, "-n", PLATFORM_NS, "-o", "jsonpath={.status.phase}"]);
    return phase || null;
  } catch {
    return null;
  }
}

/** Counts revisions in `kubectl rollout history` — a new one means a real rollback/patch actually landed. */
export function getDeploymentRolloutRevisionCount(namespace: string, deploymentName: string): number {
  try {
    const out = execOc(["rollout", "history", `deployment/${deploymentName}`, "-n", namespace]);
    return out
      .split("\n")
      .filter((line) => /^\d+/.test(line.trim())).length;
  } catch {
    return 0;
  }
}

export function getPodHealthCounts(namespace: string): { healthy: number; crashing: number } {
  interface PodStatus {
    status?: {
      phase?: string;
      containerStatuses?: Array<{ state?: { waiting?: { reason?: string } } }>;
    };
  }
  const raw = execOc(["get", "pods", "-n", namespace, "-o", "json"]);
  const { items } = JSON.parse(raw) as { items: PodStatus[] };
  let healthy = 0;
  let crashing = 0;
  for (const pod of items) {
    const waitingReasons = (pod.status?.containerStatuses ?? []).map((c) => c.state?.waiting?.reason).filter(Boolean);
    if (waitingReasons.includes("CrashLoopBackOff")) crashing++;
    else if (pod.status?.phase === "Running") healthy++;
  }
  return { healthy, crashing };
}

/**
 * Asserts the crashloop fixture was genuinely remediated on the real
 * cluster — not merely that the console UI rendered a terminal-looking
 * phase label. Mirrors kubernaut-demo-scenarios' scenarios/crashloop/validate.sh
 * assertions: RR phase=Completed/outcome=Remediated, WorkflowExecution
 * phase=Completed, deployment gained a new rollout revision (the rollback
 * actually executed, not just got selected), and no pod is left in
 * CrashLoopBackOff. Call this *in addition to* — not instead of — the UI's
 * own terminal-phase assertion, since this suite's whole point (ADR-009) is
 * that the UI correctly reflects real backend/cluster state, not merely that
 * the backend eventually got there on its own.
 */
export function assertCrashloopWasRemediated(namespace: string, deploymentName = "worker"): void {
  const rr = getRemediationRequestForTarget(namespace);
  if (!rr) {
    throw new Error(`No RemediationRequest found with spec.signalLabels.namespace=${namespace} in ${PLATFORM_NS}.`);
  }
  if (rr.phase !== "Completed" || rr.outcome !== "Remediated") {
    throw new Error(
      `RemediationRequest ${rr.name} did not reach a successful terminal state: phase="${rr.phase}", outcome="${rr.outcome}" ` +
        `(expected phase="Completed", outcome="Remediated" — same assertion as kubernaut-demo-scenarios' validate.sh).`,
    );
  }

  const wfePhase = getWorkflowExecutionPhase(rr.name);
  if (wfePhase !== "Completed") {
    throw new Error(`WorkflowExecution we-${rr.name} did not complete: phase="${wfePhase ?? "<not found>"}".`);
  }

  const revisions = getDeploymentRolloutRevisionCount(namespace, deploymentName);
  if (revisions <= 1) {
    throw new Error(
      `deployment/${deploymentName} in ${namespace} has only ${revisions} rollout revision(s) — a real rollback ` +
        "should have created a new one. The workflow may have been selected/approved but never actually " +
        "executed against the live cluster.",
    );
  }

  const { healthy, crashing } = getPodHealthCounts(namespace);
  if (crashing > 0) {
    throw new Error(`${crashing} pod(s) in ${namespace} are still in CrashLoopBackOff — the remediation did not fix the underlying issue.`);
  }
  if (healthy === 0) {
    throw new Error(`No healthy Running pod found in ${namespace} after remediation.`);
  }
}
