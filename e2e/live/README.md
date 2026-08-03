# Live E2E Suite (ADR-009)

Validates the console against a **real, running Kubernaut backend** — real
KubernautAgent investigation (via mock-llm's deterministic scenarios), real
AF, real Dex-issued JWTs, real Job-based workflow execution, real Postgres/
Redis. See [ADR-009](../../docs/adr/009-live-e2e-real-cluster-strategy.md)
and [issue #39](https://github.com/jordigilh/kubernaut-console/issues/39)
for the full design and status.

This is **not** part of `playwright.config.ts` / `.github/workflows/e2e.yml`
(the mocked suite, `VITE_MOCK_A2A=true`). It runs against
`playwright.live.config.ts`, nightly + `workflow_dispatch`, once the CI
harness (issue #39's remaining implementation work — matrix image build +
`load-ci-images` reuse + `PRESERVE_E2E_CLUSTER=true make
test-e2e-fullpipeline`) lands.

## Prerequisites

1. A preserved kubernaut `fullpipeline` Kind cluster (see ADR-009 §3):
   ```bash
   # From a kubernaut checkout, at the SHA the CI harness resolved:
   PRESERVE_E2E_CLUSTER=true make test-e2e-fullpipeline
   ```
2. Its NodePorts reachable at `localhost`: DataStorage `:30081`, API
   Frontend `:30443` (self-signed TLS), Dex `:30556` (self-signed TLS) —
   **not** `:5556`, which is only Dex's in-cluster Service port (see
   `e2e/live/scripts/dex-token.mjs`'s header comment for why this matters).
   Gateway (`:30080`) is deployed by `fullpipeline` today but is **not**
   required by this suite — every scenario here is chat/A2A/MCP-driven and
   never exercises Gateway's webhook-ingestion path (confirmed by the
   maintainer; see ADR-009 §5). It can be excluded from the deploy to
   shrink the cluster's footprint once the CI harness supports it.

## Running locally

```bash
pnpm test:e2e:live
```

This starts the console's own dev server (via
`e2e/live/scripts/start-console-with-token.mjs`) pointed at the real AF,
after first fetching a real Dex token — see that script and
`packages/standalone/src/LiveE2EAuthProvider.ts` for how auth is wired
(no oauth2-proxy in this harness; a real Dex ROPC token is attached
client-side, the same way kubernaut's own Go E2E suites authenticate to AF
directly).

Override any of these if your cluster's ports/credentials differ from the
`fullpipeline` defaults:

| Env var | Default |
|---|---|
| `LIVE_E2E_CONSOLE_URL` | `http://localhost:5174` |
| `LIVE_E2E_AF_URL` | `https://localhost:30443` |
| `LIVE_E2E_DEX_URL` | `https://localhost:30556/dex` |

## Suite layout

| File | Covers |
|---|---|
| `contract-compliance.spec.ts` | `docs/integration-guide.md`'s Minimal Implementation Checklist, asserted against real payloads |
| `approval-gate.spec.ts` | Real `kubernaut_approve` / `kubernaut_complete_no_action` MCP calls, real per-persona SAR authorization |
| `full-remediation-lifecycle.spec.ts` | End-to-end: real investigation → decision → (approval) → real Job execution → real verification → complete |

## Current status: blocked on kubernaut#1853

The suite's first run against a real cluster (2026-08-02) found that AF
returns a malformed `investigation_summary` (a bare `TextPart` instead of
the documented `DataPart`) for the console's single free-form investigate
message — its real, only investigation entry point. This was originally
attributed to [kubernaut#1818](https://github.com/jordigilh/kubernaut/issues/1818)
(orphaned RCA on an autonomous/interactive session race).

**#1818 is now fixed and merged upstream**
([jordigilh/kubernaut#1844](https://github.com/jordigilh/kubernaut/pull/1844)) —
re-validated directly the same day: built arm64 images from the fix
commit, ran `test/e2e/fullpipeline/15_af_a2a_interactive_streaming_test.go`
against a fresh cluster, 4/4 passed including the exact #1818 regression
case. **This suite still failed identically afterward.** Tracing it
further (AF pod logs + a direct curl repro against the fixed cluster)
found a second, distinct, still-open defect:
[kubernaut#1853](https://github.com/jordigilh/kubernaut/issues/1853).

#1853 is a **mock-llm test-fixture scripting gap**, not an AF/KA
production defect: the `fullpipeline` E2E harness's mock-llm scenarios
(`test/infrastructure/shared_e2e.go`) only recognize the exact multi-turn
phrase sequence upstream's own Go tests use across *separate* messages.
The console's single message contains "investigate" but not "remediation",
so mock-llm jumps straight to its `af_investigate` scenario — skipping
`kubernaut_remediate` entirely — whose `rr_id` argument is a
`$from_tool:kubernaut_remediate:rr_id` template with nothing to resolve
from. AF calls `kubernaut_investigate` with that literal unresolved
placeholder, fails K8s name validation, and falls back to a text-only
reply. **This is not a console bug** — the console correctly declines to
render the malformed fallback as a valid investigation. Every test that
calls `waitForInvestigationSummaryOrKnownRace` is expected to fail with a
message naming #1853 until it's fixed upstream; see ADR-009 §9 for the
full writeup, including why a multi-turn scripted-text workaround
(mirroring kubernaut's own Go E2E test) was tried and rejected — the
console's real UI has no such protocol (decisions are direct MCP calls
from button clicks, never chat text), so that would have masked the
underlying gap behind an unrealistic test shape instead of catching it.

## Scope: what this suite covers vs. upstream's job

`approval-gate.spec.ts`'s real-MCP-call tests hit **AF's own** `/mcp`
endpoint (`pkg/apifrontend/handler/mcp.go`, Dex-JWT + persona `Authorizer`)
— architecturally distinct from KA's `/api/v1/mcp` (port `:8088`,
ServiceAccount-token auth), which is what every existing upstream MCP E2E
test exercises. Tracing this found AF's own MCP surface — the one
`docs/integration-guide.md` documents for clients like this console — has
no upstream E2E coverage at all. Filed as
[kubernaut#1827](https://github.com/jordigilh/kubernaut/issues/1827) rather
than building deep protocol/authorization coverage out here: verifying AF's
own MCP dispatch/authorization/bridge-to-KA correctness is upstream's job.
This suite stays narrowly scoped to proving the console's own production UI
code correctly drives that real endpoint for the actions it exposes.

## Current status: #1853's fix validated manually; two more issues found and resolved

Upstream patched the shared cluster's `mock-llm-scenarios` ConfigMap directly
(not yet in a merged PR) to add the combined-intent scenario #1853 needed —
confirmed this unblocks `investigation_summary` rendering. Repeatedly running
the full suite against it surfaced two more issues, both now resolved:

1. **A real console bug**
   ([kubernaut-console#43](https://github.com/jordigilh/kubernaut-console/issues/43),
   fixed, backported to `release/v1.5` as
   [#44](https://github.com/jordigilh/kubernaut-console/issues/44)): the "New
   conversation" button didn't guarantee a fresh backend session — AF's
   `SessionInterceptor` could silently reattach it to a stale, still-active
   session. See ADR-009 §11.
2. **A test-isolation gap in this suite**: KubernautAgent's own per-target
   `session_active` dedup causes the same "no `investigation_summary`"
   symptom when back-to-back tests share one investigation target. Fixed by
   giving every test its own dedicated `memory-eater` target — see
   `helpers.ts`'s `oomkillTarget` and ADR-009 §11 for the full mechanism and
   the current namespace layout (`console-e2e-contract[-2..4]`,
   `console-e2e-approval[-2..3]`, `console-e2e-lifecycle[-2]`).

## Current status: `sre` persona RBAC gap confirmed — blocks `approval-gate.spec.ts`'s approve/decline paths

With #1853 worked around and per-test isolation in place (previous section),
`approval-gate.spec.ts`'s "approve"/"decline" tests were updated to click
"Execute" (the real `kubernaut_select_workflow` call that makes
RemediationOrchestrator actually evaluate `ApprovalRequired` and create the
`RemediationApprovalRequest`) before checking for an approval gate, with a
30s timeout for RO's async reconcile. Even with that fixed, and with
`kubectl` confirming the RAR *was* being created correctly
(`reason: "Production environment requires manual approval"`), the console
never rendered an Approve/Decline card.

Root cause, confirmed via live reproduction (2026-08-02), not just a
values.yaml/rbac.go read: `charts/kubernaut/values.yaml`'s (and the
operator's `internal/resources/rbac.go`'s) `sre` persona ACL has
`kubernaut_approve`/`kubernaut_watch` but is missing
`kubernaut_get_approval_request` — the tool `ChatContainer.tsx` already
correctly calls (pre-existing product code, not something this
investigation added) to fetch full RAR details once `/a2a/status` reports
`AwaitingApproval`. The console's own handling of the denial is already
correct (a friendly `.kn-approval-denied` card, "Contact a team member with
the approver role" — not a crash or silent hang). This upgrades the
`kubernaut_complete_no_action` finding below from "open question" to a
confirmed pattern: the `sre` persona's *read* tools don't match its *write*
tools. Filed as
[jordigilh/kubernaut-operator#278](https://github.com/jordigilh/kubernaut-operator/issues/278)
(v1.5 — the operator is the only supported production deployment path for
v1.5) and
[jordigilh/kubernaut#1869](https://github.com/jordigilh/kubernaut/issues/1869)
(v1.6 only — Helm isn't a supported production path until v1.6). See
ADR-009 §12 for the full investigation, including two ruled-out false leads
(OPA policy config, RAR-creation timing) and why extending the mock-llm
scenario to call `kubernaut_watch` would **not** have fixed this (that's an
unrelated, independent path).

`approval-gate.spec.ts`'s "approve"/"decline" tests now use an
`assertApprovalGateReachable` helper that distinguishes "this run's policy
auto-approved, nothing to test" (still a legitimate skip) from "RO required
approval but the console was denied the details" (throws, citing both
issues above) — re-run against the live cluster confirms both tests now
fail loudly with the expected, attributed message instead of silently
skipping. Expected to go green once either issue's RBAC fix lands.

## Known, confirmed RBAC gap: `kubernaut_complete_no_action`

`charts/kubernaut/values.yaml`'s and the operator's `sre` persona ACL also
lists `kubernaut_approve`/`kubernaut_complete` but not
`kubernaut_complete_no_action` — the exact tool the console's
Dismiss/Escalate buttons call. `approval-gate.spec.ts`'s dismiss test
asserts the real MCP response directly and fails with a clear message
identifying this as the same confirmed ACL-gap pattern as above (both
issues linked in the previous section cover this tool too), rather than
skip or guess.

On this scratch cluster only, `kubernaut-tool-sre` was manually
`kubectl patch clusterrole`d to add both missing permissions so the suite
could be validated end-to-end while
[kubernaut-operator#278](https://github.com/jordigilh/kubernaut-operator/issues/278)/[kubernaut#1869](https://github.com/jordigilh/kubernaut/issues/1869)
are open — **not** a committed change, and not a substitute for the real
RBAC fix landing upstream.

## Current status: full suite green (8/8)

With the ACL patched above, a full run found 2 remaining failures — both
root-caused to same-day test-repeatability artifacts, not product bugs, and
both now resolved:

- **`contract-compliance`'s "RR context metadata"**: picked up
  [kubernaut#1859](https://github.com/jordigilh/kubernaut/pull/1859), #1853's
  *real* upstream fix (N-deep `NextToolCall` chaining in mock-llm, merged to
  `main` hours before this cluster's mock-llm image was built from an
  earlier commit). Rebuilt mock-llm from current `main`, rewrote the
  hand-patched ConfigMap to use a single native 3-deep chain per target
  instead of the old two-scenario/`repeat_tool_call` workaround (the
  suspected source of an intermittent cross-session cross-talk failure).
- **`full-remediation-lifecycle`'s "full flow"**: two genuine
  RemediationOrchestrator safety mechanisms (`IneffectiveChain`, then
  `RecentlyRemediated`) correctly tripped by repeatedly re-running this test
  against the same fixed `memory-eater` fixture within the same day/cooldown
  window — confirmed via a direct `action_history.audit_events` query, not
  inferred. Fixed for this cluster with a fresh, never-remediated target
  (`console-e2e-lifecycle-3`); not expected to recur in real CI, where every
  run starts from a fresh cluster with empty history.

See ADR-009 §13 for the full investigation of both.
