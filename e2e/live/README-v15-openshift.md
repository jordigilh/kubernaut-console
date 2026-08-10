# Live E2E Suite — release/v1.5 on the shared OpenShift dev cluster

Validates `kubernaut-console`'s `main` branch against a **real, already-deployed
`kubernaut` `release/v1.5` stack** on a shared OpenShift dev cluster: real
Keycloak-issued OIDC tokens through a real `oauth2-proxy`, a real unscripted
LLM (Claude Sonnet 5 or 4.6, no mock-llm), real `kubectl`/Prometheus tool
calls, real `RemediationRequest`/`AIAnalysis`/`WorkflowExecution` CRs.

This is **distinct** from [`README.md`](./README.md) / `playwright.live.config.ts`,
which targets a local, disposable Kind `fullpipeline` cluster with mock-llm's
scripted responses. Config file: `playwright.live-v15.config.ts` (repo root).
See [ADR-009](../../docs/adr/009-live-e2e-real-cluster-strategy.md) for the
original strategy this suite extends (as of this writing, ADR-009 itself
covers up through the Kind-cluster suite's §13; this document and the
per-file/per-helper doc comments in `e2e/live/*.spec.ts` and `helpers.ts` are
the authoritative record of everything found since, pending an ADR-009
update).

## Prerequisites

1. `oc` CLI authenticated against the shared OpenShift dev cluster
   (`KUBECONFIG` pointed at it — do **not** assume the default
   `~/.kube/config` context is already correct; check with `oc whoami`
   and `oc config current-context` first).
2. A local checkout of
   [`kubernaut-demo-scenarios`](https://github.com/jordigilh/kubernaut-demo-scenarios)
   (used by `setup-fixtures.sh` for the `crashloop` scenario's manifests).
   Defaults to `$HOME/go/src/github.com/jordigilh/kubernaut-demo-scenarios`;
   override with `KUBERNAUT_DEMO_SCENARIOS_DIR` if yours lives elsewhere.
3. `openssl` (optional — used only to generate a random fixture-namespace
   suffix; falls back to `$RANDOM` if absent).
4. Access to the `console-e2e-keycloak-creds` Secret in the cluster's
   `kubernaut-system` namespace (a dedicated, non-privileged test identity —
   see "Credentials" below).

## Credentials: always `$HOME`-based, never in this repo

**No credential value is ever hardcoded or written into this workspace.**
`scripts/keycloak-token.mjs` requires `LIVE_E2E_KEYCLOAK_CLIENT_SECRET` /
`LIVE_E2E_KEYCLOAK_PASSWORD` as plain environment variables and throws if
they're unset — there is no fallback default to a real secret anywhere in
the source.

To populate them without ever touching the repo, `source` the fetch script
(note: `source`, not execute — the exports need to land in your current
shell):

```bash
source e2e/live/scripts/fetch-creds.sh
```

This fetches the `console-e2e-test` identity's credentials from the
cluster's `console-e2e-keycloak-creds` Secret and **caches them under
`$HOME`** (`~/.config/kubernaut-console-e2e/creds.env`, mode `600`) —
outside the workspace directory, so they can never be `git add`ed,
`git grep`ed, or accidentally referenced by a workspace-relative path in any
script. Re-run it any time to reuse the cache; delete the cache file first
to force a refetch (e.g. after the Secret rotates).

If you're writing new automation for this suite, follow the same rule: any
local credential cache must live under `$HOME` (or `KUBERNAUT_E2E_STATE_DIR`,
which itself must point outside the workspace), never under a path relative
to the repo checkout.

## Fixture provisioning: random namespaces per run

Every test needs its own real, broken Kubernetes resource to investigate —
either a `crashloop` scenario (from `kubernaut-demo-scenarios`, a real
`worker` Deployment faulted with a bad-release command override) or a
synthetic `memory-eater` Deployment (a throttled OOM loop). See
`helpers.ts`'s `crashloopTarget`/`oomkillTarget` doc comments for why each
test needs a *dedicated* target at all (KubernautAgent's per-target
`session_active` dedup, AF's `SessionInterceptor` reattach window).

**Why the namespace name itself must be fresh on every run**
(`fixtureNamespace`'s doc comment in `helpers.ts` has the full detail):
RemediationOrchestrator has three independent safety mechanisms keyed off
the *target resource identity*, not the test name, and any one of them can
turn a healthy fixture into a permanently-blocked one after a few runs:

| Mechanism | Reference | Default |
|---|---|---|
| `ConsecutiveFailures` | BR-ORCH-042 | 3 consecutive Failed/Blocked RRs on the same target -> blocks new RRs for **1h** |
| `RecentlyRemediated` | DD-WE-001 | Re-running the *same* workflow on the same target within **5m** of a prior success is blocked |
| `IneffectiveChain` | issue #214, BR-ORCH-042.5 | 3 consecutive ineffective (hash-chain-match) remediations within a **4h** window escalates to manual review |

(Exact values confirmed from `internal/config/remediationorchestrator/config.go`'s
`DefaultConfig()` in the `kubernaut` repo, 2026-08-05.) Before this script
existed, hitting one of these mid-development meant manually bumping a
namespace's numeric suffix by hand (`console-e2e-lifecycle` ->
`-2` -> `-3` — see `full-remediation-lifecycle.spec.ts`'s `TARGETS` comment
for that history). `setup-fixtures.sh` does the equivalent automatically, on
every run, while still calling the namespace what it's testing (e.g.
`console-e2e-approval-a1b2c3`, not an unrelated random name) — the scenario's
*purpose* stays legible, only the disambiguating suffix is random.

### Running it

```bash
e2e/live/scripts/setup-fixtures.sh
source ~/.config/kubernaut-console-e2e/fixtures.env
source e2e/live/scripts/fetch-creds.sh
npx playwright test --config=playwright.live-v15.config.ts
```

`setup-fixtures.sh` provisions every namespace listed in `scripts/fixtures.list`
(the single source of truth shared with `teardown-fixtures.sh` — update both
if you add a new per-test target) under one shared random suffix, then
writes that suffix to `~/.config/kubernaut-console-e2e/fixtures.env`
(namespace names only, no credentials). Every spec file reads
`LIVE_E2E_NS_SUFFIX` transparently via `helpers.ts`'s `fixtureNamespace()` —
no test code needs to change. Takes roughly 3-5 minutes end to end (mostly
waiting for `crashloop`'s two-replica rollout to become Ready per namespace).

Omitting `setup-fixtures.sh` / `LIVE_E2E_NS_SUFFIX` entirely still works —
every spec file falls back to its original hardcoded namespace literal — but
re-running the *same* fixture within an hour risks the RO circuit breakers
above.

### Tearing down

```bash
e2e/live/scripts/teardown-fixtures.sh
```

Deletes every namespace from the most recent `setup-fixtures.sh` run (read
from its state file, not guessed) and removes the state file. Namespace
deletion is fire-and-forget (`--wait=false`); OpenShift finishes it
asynchronously.

## Other known cluster-level fixtures (already in place, no action needed)

- **`console-e2e-alerts` `PrometheusRule`** (`openshift-monitoring`
  namespace): fires `KubePodCrashLooping` for *any* namespace matching
  `console-e2e-.*` — this regex already covers randomly-suffixed namespaces
  with no changes needed. Required for AF's severity triage to resolve
  anything other than `ErrSeverityUndetermined` on these fixtures.
- **`dev-worker-1` node avoidance**: both fixture types' pod specs carry a
  `nodeAffinity` `NotIn` rule against `dev-worker-1.redhat-internal.com` —
  that node has a persistent CRI-O `CreateContainerError`/"broken pipe"
  issue unrelated to kubernaut, confirmed by direct reproduction
  (2026-08-02). Don't remove this affinity rule without re-verifying the
  node has been fixed or replaced.
- **Gateway is disabled** on this cluster by default — this suite is
  entirely chat/A2A/MCP-driven (interactive investigations), never
  webhook-ingestion-driven, so Gateway's absence doesn't block anything
  here. A separate, manual smoke test validated the autonomous/Gateway path
  once (2026-08-05: enabled Gateway, pointed AlertManager's webhook at
  `gateway-service.kubernaut-system.svc.cluster.local:8443`, confirmed the
  full RR -> AIAnalysis -> RAR -> WorkflowExecution -> EffectivenessAssessment
  pipeline, then reverted both changes) — not part of this automated suite,
  and not yet scripted the way the fixtures above are.

## Known, pre-existing test-suite gaps (not Sonnet 5/4.6 regressions)

Confirmed via parallel full-suite runs against both models producing
*identical* failures (2026-08-05) — these are test design/fixture gaps, not
LLM behavior differences:

- [kubernaut-console#54](https://github.com/jordigilh/kubernaut-console/issues/54):
  `memory-eater`'s synthetic "grow memory forever" shape has no plausible
  real-world root cause, so a real LLM sometimes declines to recommend any
  workflow instead of confidently selecting one — non-deterministic outcomes
  on `approval-gate.spec.ts`'s approve/dismiss paths and
  `full-remediation-lifecycle.spec.ts`'s full flow. Mitigated for
  `approve`/`decline`/`fullLifecycle` by switching those three specifically
  to `crashloopTarget` (a real `kubernaut-demo-scenarios` scenario, confirmed
  deterministic across independent runs); `dismiss` and the lifecycle
  suite's `noConsoleErrors` test intentionally stay on `oomkillTarget` since
  they don't depend on workflow selection.
- [kubernaut-console#55](https://github.com/jordigilh/kubernaut-console/issues/55):
  `contract-compliance.spec.ts`'s `investigation_summary artifact` test
  originally hardcoded mock-llm-specific values (e.g. `confidence: 0.95`
  exactly) that don't hold against a real, unscripted LLM.
  `contract-compliance.spec.ts` now asserts shape/catalog-membership instead
  (see its own header comment).
- [kubernaut-console#56](https://github.com/jordigilh/kubernaut-console/issues/56):
  `playwright.live-v15.config.ts`'s `extraHTTPHeaders` attaches the
  Authorization Bearer token to *every* request, including third-party font
  requests (`fonts.gstatic.com`) — causes a CORS preflight failure and a
  console error `full-remediation-lifecycle.spec.ts`'s "no console errors"
  test correctly flags. Harness config gap, not a console bug.

## Also known: `workflow_discovery` can hang indefinitely (upstream, tracked)

[jordigilh/kubernaut#1949](https://github.com/jordigilh/kubernaut/issues/1949)
(v1.5) / [#1950](https://github.com/jordigilh/kubernaut/issues/1950) (v1.6):
found live 2026-08-05 — reproduced **twice in one suite run** — a real,
structural gap where a single tool call inside the `workflow_discovery`
phase can hang forever with zero timeout protection anywhere in KA's
tool-execution path (confirmed by code inspection: no `context.WithTimeout`
wraps tool dispatch in either the RCA or workflow_discovery phase, only a
count-based `MaxTotalToolCalls` budget that can't catch a call that never
returns). The session silently sits until KA's own ~10-minute inactivity
timer tears it down — which is decoupled from the actual stuck goroutine, so
the goroutine leaks and the RR/AIAnalysis CR just goes `TimedOut`/`Failed`
with no diagnosable error. This is the most likely explanation if
`full-remediation-lifecycle.spec.ts`'s full-flow test times out waiting for
a workflow card despite the crashloop fixture being correctly faulted and
labeled — check `oc get aianalysis -n kubernaut-system` for a `phase:
Investigating` entry stuck for 5+ minutes with a high `pollCount` before
assuming it's a fixture problem.

## Previously known: `sre` persona RBAC gap (upstream, now fixed)

`approval-gate.spec.ts`'s approve/decline paths and
`full-remediation-lifecycle.spec.ts`'s full flow used to deterministically
hit a known RBAC gap: the `sre` persona's ACL had `kubernaut_approve` but
not `kubernaut_get_approval_request`, so the console correctly rendered a
graceful-degradation "Contact a team member with the approver role" card
instead of a real Approve/Decline gate. See `helpers.ts`'s
`assertApprovalGateReachable` doc comment and
[jordigilh/kubernaut-operator#278](https://github.com/jordigilh/kubernaut-operator/issues/278)
(v1.5) / [jordigilh/kubernaut#1869](https://github.com/jordigilh/kubernaut/issues/1869)
(v1.6) — **both closed/shipped** (operator `v1.5.8-rc1`), confirmed live on
the shared dev cluster via direct `ClusterRole` inspection (2026-08-08,
[kubernaut-console#71](https://github.com/jordigilh/kubernaut-console/issues/71)).
These tests no longer hit this gap; if you see the denied-message error,
re-verify live RBAC state before re-attributing to #278/#1869.

The workflow-discovery session-release bug that was blocking these tests
next ([jordigilh/kubernaut#1995](https://github.com/jordigilh/kubernaut/issues/1995),
[#2003](https://github.com/jordigilh/kubernaut/issues/2003),
[#2019](https://github.com/jordigilh/kubernaut/issues/2019)) is also fixed
and confirmed live (2026-08-08, clean fresh-fixture re-run: RR reached
`Completed`/`Remediated`, `WorkflowExecution Completed`, real rollout
revision created). What remained after that were three `e2e/live`-local test
bugs (verification timeout budget, decline's hardcoded revision baseline,
and `getRemediationRequestForTarget` querying the wrong RR field) — now
fixed in this suite, not upstream issues.

## Current status: iterating toward a clean v1.5.6 — blocked on kubernaut#2061 / kubernaut#2064

The release gate for cutting `v1.5.6` upstream (and the operator's
`v1.5.8`) is a full run of this suite with zero known regressions. Progress
so far, most recent first:

**Blocking another full run** (both open, found 2026-08-10 while triaging a
`decline`-path failure where KA's workflow catalog matched zero entries for
a correctly-faulted, correctly-labeled target):

- [kubernaut#2061](https://github.com/jordigilh/kubernaut/issues/2061)
  (milestone `v1.5`) — `list_available_actions`'s `component` filter falls
  back to a bare lowercase resource kind (e.g. `deployment`) whenever
  `ResourceAPIVersion` is empty, instead of the full GVK the workflow
  catalog is actually keyed on — silently matching zero entries. No fix PR
  yet.
- [kubernaut#2064](https://github.com/jordigilh/kubernaut/issues/2064)
  (milestone `v1.5.6`) — found while triaging #2061: a deeper, more
  systemic root cause. The `AIAnalysis`→KA `IncidentRequest` wire contract
  has no field to carry `apiVersion` at all, so `ResourceAPIVersion` starts
  empty for *every* investigation (autonomous included), not just the
  narrower case #2061's own fix (cloned for `v1.6` as #2063) addresses. No
  fix PR yet.

Holding off on the next full-suite run — including the Sonnet 4.6
regression baseline in the section below — until both land and are
redeployed; re-running against the same known-broken filter logic would
only reproduce the same failure without new information.

**Resolved and confirmed fixed**, all found live against this suite and
closed under milestone `v1.5.6`:

- [kubernaut#2018](https://github.com/jordigilh/kubernaut/issues/2018) /
  [#2027](https://github.com/jordigilh/kubernaut/issues/2027) — an RR
  investigated an unrelated, pre-existing cluster-scoped alert
  (`CDIDefaultStorageClassDegraded`) instead of its own triggering signal
  (`KubePodCrashLooping`); recurred once after #2018's first fix, then
  root-caused and fixed again as #2027.
- [kubernaut#2022](https://github.com/jordigilh/kubernaut/issues/2022) —
  `kubernaut_investigate_alert` created an RR/KA session for unmanaged
  resources before RO's block on unmanaged targets ever fired.
- [kubernaut#2023](https://github.com/jordigilh/kubernaut/issues/2023) —
  the apifrontend agent fabricated an RCA/audit-trail narrative when the
  investigation session had zero real content to summarize.
- [kubernaut#2029](https://github.com/jordigilh/kubernaut/issues/2029) —
  reconnecting ("takeover") to a timed-out interactive session desynced
  `AIAnalysis` from the new KA session, leaving the RR permanently stuck in
  `Analyzing` with no backing `WorkflowExecution`.

**New coverage added**, validated live with zero regressions found:

- `autonomous-fix.spec.ts`
  ([kubernaut-console#77](https://github.com/jordigilh/kubernaut-console/issues/77),
  [PR #78](https://github.com/jordigilh/kubernaut-console/pull/78)) — the
  console's chat-driven "Fix ..." (`kubernaut_remediate`) fire-and-forget
  path had zero live coverage despite being one of only two top-level modes
  on the welcome screen. Two clean end-to-end passes (2026-08-10) confirm
  `rr_id` tracking from the tool-call confirmation reply alone, the
  session-less `/a2a/status` `AwaitingApproval` fallback rendering a real
  `ApprovalCard`, and real execution/verification all working correctly,
  with no `InvestigationSession` ever created.

Also tracked, but not itself a reproducing defect against this suite:
[kubernaut#1995](https://github.com/jordigilh/kubernaut/issues/1995) is
being kept open by upstream as a QE sign-off placeholder for the whole
`v1.5.6` regression effort (not specific to this suite), expected to close
only once `v1.5.6` GA ships.

This section will be updated after every run until the goal is met: a full
run with zero known regressions, at which point `v1.5.6` gets cut upstream
and this file should read clean of open bugs.

## Switching LLM models (Sonnet 5 <-> Sonnet 4.6)

```bash
oc patch kubernaut <cr-name> -n kubernaut-system --type=merge \
  -p '{"spec":{"kubernautAgent":{"llm":{"model":"claude-sonnet-4-6"}}}}'
```

**Gotcha**: a *broader* patch to the `Kubernaut` CR (e.g. one that touches
`spec.image` at all) can cause the operator to silently reset
`spec.image.overrides` to old, hardcoded defaults, undoing any manually
pinned image tags. The narrow `spec.kubernautAgent.llm.model`-only patch
above was verified (2026-08-05) to *not* trigger this — prefer the narrowest
possible JSON merge patch for any CR change on this cluster, and re-check
`spec.image.overrides` afterward if in doubt.

## Suite layout

| File | Covers |
|---|---|
| `contract-compliance.spec.ts` | `docs/integration-guide.md`'s Minimal Implementation Checklist, asserted against real payloads |
| `approval-gate.spec.ts` | Real `kubernaut_approve`/`kubernaut_complete_no_action` MCP calls, real per-persona SAR authorization |
| `full-remediation-lifecycle.spec.ts` | End-to-end: real investigation -> decision -> (approval) -> real Job execution -> real verification -> complete |
| `consent-gate-regression.spec.ts` | Regression coverage for kubernaut#1899/#1912 (unsolicited investigations) |
| `full-remediation-default-regression.spec.ts` | Regression coverage for kubernaut#1915 (workflow auto-discovery on plain "investigate") |
