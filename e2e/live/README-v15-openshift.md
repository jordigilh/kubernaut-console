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
   (used by `setup-fixtures.sh` for the `crashloop` scenario's manifests, and
   by `scripts/seed-action-types.sh` / `scripts/seed-workflows.sh` — see
   "Full setup sequence" below).
   Defaults to `$HOME/go/src/github.com/jordigilh/kubernaut-demo-scenarios`;
   override with `KUBERNAUT_DEMO_SCENARIOS_DIR` if yours lives elsewhere.
3. `openssl` (optional — used only to generate a random fixture-namespace
   suffix; falls back to `$RANDOM` if absent).
4. Access to the `console-e2e-keycloak-creds` Secret in the cluster's
   `kubernaut-system` namespace (a dedicated, non-privileged test identity —
   see "Credentials" below).

## Full setup sequence — run in this order, every time

**Every step below is required before trusting a test failure as a real
regression.** Skipping steps 1/1b on a fresh deploy is a confirmed footgun
(2026-08-16: an operator `v1.5.11-rc1` fresh install — new `kubernaut-system`
namespace, empty Postgres — hit both gaps below on the very first run).

| # | Step | When needed | Command |
|---|---|---|---|
| 1 | **Seed fresh-install prerequisites** (catalogs + policy ConfigMaps) | Only after a *fresh* operator install / DB wipe — **not** needed for a routine image bump on an already-running cluster, since Postgres data persists across pod restarts. Idempotent (self-checks first) — safe to run every time regardless. | `e2e/live/scripts/seed-fresh-install-prerequisites.sh` |
| 2 | **Verify the catalog is actually populated** | Every run, cheap sanity check, ~instant | `oc exec -n kubernaut-system deploy/postgresql -- bash -c 'PGPASSWORD="$POSTGRESQL_PASSWORD" psql -U "$POSTGRESQL_USER" -d "$POSTGRESQL_DATABASE" -c "select count(*) from remediation_workflow_catalog;"'` — expect **32** (2 of the 34 upstream workflow YAMLs are skipped for a missing `gitea-repo-creds` secret unrelated to this suite's fixtures) <!-- pre-commit:allow-sensitive --> |
| 3 | **Provision fixtures** | Every run | `e2e/live/scripts/setup-fixtures.sh` |
| 4 | **Fetch credentials** | Every run (cached after first fetch) | `source e2e/live/scripts/fetch-creds.sh` |
| 5 | **Preflight** | Every run, before trusting results | Confirm: all target namespaces have a `firing` alert in Thanos, all `kubernaut-system` pods are `Running` with `0` restarts on the expected image digests, no stale `RemediationRequest`s reference the fixture namespaces (check `SignalProcessing`/`RemediationRequest` phase too, not just Playwright's own retry — a real investigation attempt against a broken policy will burn through RO's 3-strike `ConsecutiveFailures` circuit breaker on that target within ~15 minutes even before any test assertion runs) |
| 6 | **Run** | — | `npx playwright test --config=playwright.live-v15.config.ts` |

`seed-fresh-install-prerequisites.sh` (2026-08-16) seeds two things, neither
owned by `kubernaut-operator` — confirmed via
`kubernaut-operator/internal/controller/kubernaut_lifecycle_test.go`'s own
test ("verifying operator does NOT create signalprocessing-policy
(user-provided prerequisite)", asserting `errors.IsNotFound` on both this
and `aianalysis-policy`'s live ConfigMap name). The `Kubernaut` CR's
`spec.signalProcessing.policy.configMapName` /
`spec.aiAnalysis.policy.configMapName` fields are pure references — the
operator only mounts whatever ConfigMap already has that name and never
generates content for either:

1. **`ActionType` + `RemediationWorkflow` catalogs** — via
   `kubernaut-demo-scenarios`' own `scripts/seed-action-types.sh` +
   `scripts/seed-workflows.sh`, run in that order (workflows reference
   `ActionType`s by name; the admission webhook validates the reference
   exists).
2. **`signalprocessing-policy` / `aianalysis-policies` Rego ConfigMaps** —
   applies `kubernaut-demo-scenarios/deploy/defaults/{signalprocessing-policy,approval-policy}.rego`
   verbatim, reading the actual ConfigMap names from the live CR rather than
   hardcoding them.

**If step 1 is skipped or done too late** on a fresh install: every real
investigation attempt fails at `SignalProcessing`
(`environment classification failed: ... environment policy returned no
results - add a 'default' rule`), which looks superficially like
`no_matching_workflows` non-determinism
([kubernaut-console#54](https://github.com/jordigilh/kubernaut-console/issues/54))
but is a completely different, 100%-reproducible root cause one layer
earlier in the pipeline. Worse, each failed attempt counts toward RO's
`ConsecutiveFailures` breaker (3 strikes -> 1h block) on that specific
target — if you fix the policy *after* a target already tripped the
breaker, re-provision that fixture under a fresh namespace suffix rather
than reusing it, since the breaker is keyed on target identity
(namespace+resource), not fixture type. A second, silent failure mode also
exists on the `aianalysis-policies` side: unlike SignalProcessing's
evaluator, AIAnalysis's evaluator (`pkg/aianalysis/rego/evaluator.go`,
BR-AI-014) *gracefully degrades* an undefined policy result to
`ApprovalRequired: true` with no visible error — a broken policy there
silently replaces real approval logic with "always require approval,"
which can pass unnoticed if your fixtures happen to expect approval anyway.

Filed upstream for `kubernaut-demo-scenarios` to own a durable fix (it has
`seed-action-types.sh`/`seed-workflows.sh` for the catalogs already, but
nothing equivalent for these two policy ConfigMaps, and no documented path
for operator-based — as opposed to Helm — installs):
[kubernaut-demo-scenarios#403](https://github.com/jordigilh/kubernaut-demo-scenarios/issues/403)
(v1.5) /
[#404](https://github.com/jordigilh/kubernaut-demo-scenarios/issues/404)
(v1.6). `seed-fresh-install-prerequisites.sh` is our own stopgap until that
lands.

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

## Current status: v1.5.6 (and v1.5.7 re-release) shipped — all tracked blockers closed

Two parallel status updates were in flight on 2026-08-10 while iterating
toward the `v1.5.6` release gate; both sets of blockers they tracked are now
**closed**, and `v1.5.6` has since GA'd upstream (2026-08-06) with a
content-identical `v1.5.7` re-release cut on 2026-08-16 so the operator team
could bundle a matching version number. Kept here for history:

**First blocker set** (found 2026-08-10 triaging a `decline`-path failure
where KA's workflow catalog matched zero entries for a correctly-faulted,
correctly-labeled target) — both closed 2026-08-12:

- [kubernaut#2061](https://github.com/jordigilh/kubernaut/issues/2061) —
  `list_available_actions`'s `component` filter fell back to a bare
  lowercase resource kind (e.g. `deployment`) whenever `ResourceAPIVersion`
  was empty, instead of the full GVK the workflow catalog is actually keyed
  on — silently matched zero entries.
- [kubernaut#2064](https://github.com/jordigilh/kubernaut/issues/2064) —
  the deeper root cause found while triaging #2061: the `AIAnalysis`→KA
  `IncidentRequest` wire contract had no field to carry `apiVersion` at all,
  so `ResourceAPIVersion` started empty for *every* investigation
  (autonomous included), not just the narrower case #2061's own fix
  addressed.

**Second blocker set** (found in a full suite run against `v1.5.6-rc2` base
+ [jordigilh/kubernaut#2072](https://github.com/jordigilh/kubernaut/pull/2072)'s
images, Sonnet 5, sequential, fresh fixtures — 10 passed, 2 failed) — both
closed 2026-08-10/12:

- **approve path** (`approval-gate.spec.ts:139`) blocked by
  [kubernaut#2073](https://github.com/jordigilh/kubernaut/issues/2073) —
  `kubernaut_present_decision`'s `rca` schema required `tool_calls_count`/
  `llm_turns`, but the LLM was never told these fields exist (missing
  `omitempty` + not mentioned in `prompt.txt`) — 100% failure whenever the
  tool was called.
- **dismiss path** (`approval-gate.spec.ts:209`) blocked by
  [kubernaut#2075](https://github.com/jordigilh/kubernaut/issues/2075) — KA
  released the interactive session the instant workflow discovery concluded
  `no_matching_workflows`, so the console's Dismiss button subsequently
  failed with "no active interactive session for rr_id".

**Also resolved and confirmed fixed** during the same release-gate push, all
found live against this suite and closed under milestone `v1.5.6`:

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

**New coverage added** during the same push, validated live with zero
regressions found:

- `autonomous-fix.spec.ts`
  ([kubernaut-console#77](https://github.com/jordigilh/kubernaut-console/issues/77),
  [PR #78](https://github.com/jordigilh/kubernaut-console/pull/78)) — the
  console's chat-driven "Fix ..." (`kubernaut_remediate`) fire-and-forget
  path had zero live coverage despite being one of only two top-level modes
  on the welcome screen. Two clean end-to-end passes (2026-08-10) confirmed
  `rr_id` tracking from the tool-call confirmation reply alone, the
  session-less `/a2a/status` `AwaitingApproval` fallback rendering a real
  `ApprovalCard`, and real execution/verification all working correctly,
  with no `InvestigationSession` ever created.

### Full-suite confirmation runs (chronological)

The following full-suite runs (Playwright pass/fail **and** journey-level
CR spot-checks, not just green checkmarks) were recorded after the blockers
above closed, superseding the older "no full-suite confirmation run"
concern from an earlier draft of this section:

#### 2026-08-12: 0 blockers, 12/12 passing on v1.5.6-rc5

Full suite run against `v1.5.6-rc5` (all 10 `kubernaut` service images +
`kubernaut-console` digest-verified against the Quay.io manifests before the
run), Sonnet 5, sequential (`workers: 1`), fresh fixtures: **12 passed, 0
failed** (36.9m). Journey-level outcomes (not just Playwright pass/fail) were
spot-checked directly against `RemediationRequest`/`WorkflowExecution` CRs:

- `approve`/`fullLifecycle`/`autonomous-fix` (all `crashloopTarget`):
  `crashloop-rollback-job` workflow correctly discovered and executed,
  `WorkflowExecution` reached `Completed` — matches the golden-transcript
  expectation every time, no `no_matching_workflows` outcomes.
- `decline`: no `WorkflowExecution` created (correct — rejected), RR reached
  terminal `Failed` (the correct terminal state for a declined remediation,
  not a system error).
- `dismiss`: no `WorkflowExecution` created (correct — no action needed), RR
  reached `Completed`.
- `noConsoleErrors` (`oomkillTarget`/memory-eater): `no_matching_workflows` —
  expected per kubernaut-console#54 above (memory-eater has no clean
  completable workflow by design); this test only asserts on browser console
  cleanliness, not workflow outcome.
- Checklist-only tests (`contract-compliance.spec.ts`'s artifact/discovery
  assertions): RR remains in `Analyzing` after the test's own assertions
  pass, since these tests never drive a terminal tool call
  (approve/decline/dismiss) — expected, not a hang.

This closes out the release-blocking regression chain that started with rc4:
[jordigilh/kubernaut#2110](https://github.com/jordigilh/kubernaut/issues/2110)
(`gob: type not registered for interface: tools.RCAData` — every grounded
`present_decision` call crashed on rc4, 4/4 relevant tests failing) is fixed
in rc5 and confirmed with zero recurrences across two full runs (a 2-worker
concurrent run and this 12/12 sequential run).

**One new, non-blocking finding** surfaced only now that rc5 unblocked
artifact rendering (likely pre-existing, just invisible while #2110 crashed
every render):
[jordigilh/kubernaut#2118](https://github.com/jordigilh/kubernaut/issues/2118)
(v1.5.6) / [#2119](https://github.com/jordigilh/kubernaut/issues/2119) (v1.6)
— KA's `same-kind validation gate` retry (`retryForSameKind`) can silently
drop RCA `confidence` to `0` when the LLM's retry response doesn't
meaningfully restate it (non-deterministic — reproduced once in a 2-worker
run's `contract-compliance.spec.ts` artifact-shape assertion, did not
recur in this 12/12 sequential run). Does not crash or hang anything; a data
correctness issue in one specific gate-retry path. Not release-blocking for
v1.5.6.

#### Update (2026-08-12): v1.5.6-rc6 confirmed — #2118 fixed, 12/12 passing

Upstream cut `v1.5.6-rc6` same-day with three fixes landed on `release/v1.5`
since rc5 ([jordigilh/kubernaut#2122](https://github.com/jordigilh/kubernaut/pull/2122)):
`EmitArtifact` gob-safety hardening (follow-up to #2110), the #2118 same-kind
gate retry confidence fix, and a gate-retry/audit-persistence fix
(#2120/#2124). All 10 service images digest-verified against the rc6
manifests both before and after the operator's rollout. Full sequential
12-test suite (fresh fixtures, `workers: 1`): **12 passed, 0 failed**
(38.4m). Journey-level spot-check confirmed real, non-zero confidence values
(0.93-0.95) on every executed `WorkflowExecution`, including a detailed
LLM-authored rationale citing `crashloop-rollback-v1`'s suitability for the
fixture's specific failure mode — no recurrence of #2118's `confidence: 0`
anywhere in this run.

Note: the rc6 GitHub Actions release run initially failed outright (`gateway
(arm64)`'s image push hit a transient Quay.io `502 Bad Gateway`, which
cascaded into skipping multi-arch manifest creation and the GitHub release
for the *entire* run, even though all 10 services we depend on built
successfully on both architectures). Re-running only the failed job
(`gh run rerun <id> --failed`) succeeded immediately — worth knowing this
failure mode isn't necessarily a code issue before re-triggering a full
rebuild.

Release readiness: **v1.5.6-rc6 is a clean release candidate** — no known
open blockers.

#### Update (2026-08-16): `kubernaut-operator v1.5.11-rc1` confirmed — 12/12 passing

First validation run against a genuinely *fresh* operator install (new
`kubernaut-system` namespace, empty Postgres) rather than a reused/upgraded
cluster — surfaced two fresh-install-only gaps now automated by
`e2e/live/scripts/seed-fresh-install-prerequisites.sh` (see "Full setup
sequence" above): an empty workflow catalog, and broken user-provided
`signalprocessing-policy`/`aianalysis-policies` ConfigMaps (wrong Rego
package names, missing rules — filed upstream as
[kubernaut-demo-scenarios#403](https://github.com/jordigilh/kubernaut-demo-scenarios/issues/403)/[#404](https://github.com/jordigilh/kubernaut-demo-scenarios/issues/404)).
Neither is a `kubernaut`, `kubernaut-operator`, or `kubernaut-console` bug —
both are prerequisites this suite must self-supply on a fresh install, now
automated so they aren't missed again. After seeding both, full sequential
12-test suite
(fresh fixtures, `workers: 1`): **12 passed, 0 failed** (40.3m). Journey-level
spot-check (not just Playwright pass/fail) confirmed for all three
completion-required scenarios (`approve`, `autonomous-fix`,
`full-remediation-lifecycle`): RR `outcome: Remediated`, `WorkflowExecution`
`Completed`, a genuinely new Deployment rollout revision landed (real
rollback executed against the live cluster, not merely selected/approved),
and zero pods left in `CrashLoopBackOff`. Image digests for all 11 deployed
services (`gateway` intentionally absent — disabled on this cluster) and
`kubernaut-console` verified against the operator's pinned manifests
(`kubernaut v1.5.7-rc2` + `kubernaut-console v1.5.6`) before the run.
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
| `autonomous-fix.spec.ts` | Autonomous fire-and-forget fix (`kubernaut_remediate`, kubernaut-console#77): "Fix ..." request -> zero-pause autonomous investigation/selection -> (approval) -> real execution -> real verification -> complete |
