# Running the live E2E suite against a fleet-enabled cluster (release/v1.6)

Quick-reference runbook: how to preflight, set up fixtures, and trigger the
12-scenario suite against the hub/spoke SNO clusters. For the full narrative
of how this environment was stood up, every issue found along the way, and
current status, see
[`README-v16-fleet-openshift.md`](./README-v16-fleet-openshift.md) — that
file is a running log, not a runbook; this page is the runbook.

## 1. Point at the right cluster

```bash
export KUBECONFIG=/path/to/hub-kubeconfig
oc whoami   # sanity check
```

Fixtures for fleet scenarios span two clusters: target resources (the
things being investigated/remediated) live on **spoke**, in the
`kubernaut-workflows` namespace's ServiceAccount/RBAC scope; the
`RemediationWorkflow`/`ActionType` catalog lives on **hub** (`kubernaut-system`),
since that's where the control plane and console/AF run. You'll need
kubeconfigs for both — see the "spoke cluster access" note in
`README-v16-fleet-openshift.md` for how to reach it via `helios08`.

Steps 4 and 4b below need `KUBECONFIG` pointed at **spoke** (that's where the
fixtures and their runner RBAC actually live); switch back to **hub** before
steps 2, 3, and 5 (AF/console/Keycloak all run there).

## 1b. Two modes, same suite

This runbook and every script below serve **both** the v1.5 single-cluster
suite and the v1.6 fleet suite — same spec files, same `helpers.ts`, same
`playwright.live-v15.config.ts`. The only difference is whether
`LIVE_E2E_FLEET_CLUSTER_ID` is set:

| | v1.5 mode | v1.6 fleet mode |
|---|---|---|
| Fixtures live on | same cluster as AF/console | a registered remote cluster (e.g. `spoke`) |
| `LIVE_E2E_FLEET_CLUSTER_ID` | unset | `spoke` (or whichever cluster ID the fixtures target) |
| Runner RBAC provisioning (step 4b) | not needed | required |
| `KUBECONFIG` for fixture steps | same as everything else | must point at the fixture's actual cluster |

Leaving `LIVE_E2E_FLEET_CLUSTER_ID` unset reproduces v1.5 behavior exactly —
`helpers.ts`'s investigate-message builders append nothing, so a fleet-capable
backend still only searches the local/loopback cluster, same as v1.5. Setting
it appends `(fleet cluster ID: <id>)` to every investigate message, which is
required for AF/KA to even look on a remote cluster — see
`README-v16-fleet-openshift.md`'s 2026-08-27 section for why, including the
current blocker this surfaced.

## 1c. Seed environment prerequisites (workflow catalog + Rego policies)

```bash
export KUBECONFIG=/path/to/hub-kubeconfig   # catalog + policy ConfigMaps live on hub
e2e/live/scripts/seed-fresh-install-prerequisites.sh
```

Distinct from fixtures (step 4): this seeds cluster-wide state the *entire*
`kubernaut-system` deployment needs, not per-test resources — the
`ActionType`/`RemediationWorkflow` catalog (empty on a fresh operator
install) and the `SignalProcessing`/`AIAnalysis` Rego policy ConfigMaps
(`spec.signalProcessing.policy.configMapName` /
`spec.aiAnalysis.policy.configMapName` are pure references — the operator
never generates their content; it's a documented user-provided prerequisite,
confirmed against `kubernaut-operator`'s own lifecycle tests). Idempotent —
safe to run every time, fresh install or not; skips seeding if the catalog is
already populated, and only *reports* policy content drift rather than
silently overwriting an intentional on-cluster customization (re-run with
`FORCE_CANONICAL_POLICY=1` to force canonical content).

**Don't skip this either.** A missing/wrong Rego policy produces a
`no_matching_workflows`-shaped failure (SignalProcessing) or a silent
always-`ApprovalRequired` fallback (AIAnalysis, BR-AI-014's graceful
degradation) that looks like a product bug or LLM non-determinism, not a
missing prerequisite — see `README-v16-fleet-openshift.md`'s setup-sequence
table for a live recurrence of exactly this.

## 2. Preflight

```bash
export KUBECONFIG=/path/to/hub-kubeconfig
export LIVE_E2E_FLEET_CLUSTER_KUBECONFIG=/path/to/spoke-kubeconfig   # fleet mode only
e2e/live/scripts/preflight-fleet.sh
```

Read-only, makes no changes. Checks the CR's console/AF/gateway/fleet flags,
core pod health, the fleet MCP Gateway stack (`kube-mcp-server`,
`mcp-gateway`, `MCPServerRegistration`/`MCPGatewayExtension` readiness, and a
log-recency check that catches a silently-wedged `kube-mcp-server` — see the
script's header comment for the incident that motivated it), the workflow
catalog, the `console-e2e-keycloak-creds` Secret, and — only when
`LIVE_E2E_FLEET_CLUSTER_KUBECONFIG` is set — that the fixture cluster actually
has enough workflow-runner ServiceAccounts provisioned (step 4b); this is the
one check that would have caught today's "Job stuck 9+ minutes,
`serviceaccount ... not found`" failure before it ever reached a test run.

**Don't skip this.** Every "mystery" test failure so far this project traced
back to something this script now checks directly — expired credentials, an
empty workflow catalog, missing RBAC bindings, a hung MCP broker — costing
significant live-debugging time that a 20-second read-only script avoids.

Fix every `[FAIL]` line before proceeding. `[WARN]` lines are worth reading
but don't block a run.

## 3. Fetch test-identity credentials

```bash
source e2e/live/scripts/fetch-creds.sh
```

Caches `LIVE_E2E_KEYCLOAK_CLIENT_SECRET` / `LIVE_E2E_KEYCLOAK_PASSWORD` under
`~/.config/kubernaut-console-e2e/` (never in the repo). Re-run with the cache
file removed if the Secret rotates.

## 4. Set up fixtures

```bash
export KUBECONFIG=/path/to/spoke-kubeconfig   # fleet mode only — see step 1b
e2e/live/scripts/setup-fixtures.sh
```

Provisions every scenario's target resources from `kubernaut-demo-scenarios`
manifests (crashloop, memory-eater, etc.) under a fresh random namespace
suffix, and prints the env file to `source`. Cluster-agnostic — acts on
whatever `KUBECONFIG` currently points at, no fleet-specific flags needed.
Always source scenarios from `kubernaut-demo-scenarios` rather than
hand-rolling new ones — they're validated with a documented expected outcome
(golden transcript), so a test failure means something regressed, not "we're
not sure what should happen."

```bash
source ~/.config/kubernaut-console-e2e/fixtures.env
```

Tear down when done:

```bash
e2e/live/scripts/teardown-fixtures.sh
```

## 4b. Provision runner RBAC (fleet mode only)

```bash
export KUBECONFIG=/path/to/spoke-kubeconfig
e2e/live/scripts/provision-fleet-workflow-rbac.sh
```

Every `RemediationWorkflow` bundles its own runner ServiceAccount/ClusterRole/
ClusterRoleBinding, needed on whichever cluster `WorkflowExecution`'s Job
actually dispatches to — the fixture's own cluster in fleet mode, not
necessarily hub. Idempotent; safe to re-run. Skip entirely in v1.5 mode
(fixtures share AF's cluster, which already has this from the catalog seed).

## 5. Run the suite

```bash
export KUBECONFIG=/path/to/hub-kubeconfig   # back to hub — AF/console run here
export LIVE_E2E_CONSOLE_URL=https://kubernaut-console-kubernaut-system.apps.hub.redhat-internal.com
export LIVE_E2E_KEYCLOAK_URL=https://keycloak-keycloak.apps.hub.redhat-internal.com
export LIVE_E2E_KEYCLOAK_REALM=kubernaut-fleet
export LIVE_E2E_FLEET_CLUSTER_ID=spoke   # fleet mode only — omit entirely for v1.5 mode
npx playwright test --config=playwright.live-v15.config.ts
```

Sequential by design (`fullyParallel: false, workers: 1`) — the 12 scenarios
share cluster state (RemediationOrchestrator's per-target safety mechanisms,
Vertex AI rate limits), and running them concurrently produces cross-test
interference that looks like product bugs. Once a sequential baseline is
green, `playwright.live-v15-parallel.config.ts` /
`playwright.live-v15-parallel2.config.ts` exist for load-oriented parallel
runs (see `README-v16-fleet-openshift.md` for when that's appropriate).

## 6. Validate outcomes, not just "did it finish"

A passing test must confirm the actual expected outcome from the scenario's
golden transcript — the right workflow was selected, the right decision was
reached, the right approval gate fired — not merely that the run completed
without hanging or throwing. Extract golden transcripts for comparison with
`kubernaut-demo-scenarios`' own script:

```bash
e2e/live/scripts/extract-golden-transcript.sh <scenario>
```

## Troubleshooting

See `README-v16-fleet-openshift.md`'s own troubleshooting notes for
environment-specific gaps found so far, and
`kubernaut-operator/docs/installation/03-deploy.md` for OIDC/RBAC issues that
apply to any fresh console+AF+Keycloak install, not just this cluster.

**Resolved (fleet mode only, fixed 2026-08-27)**: every investigate/remediate
request targeting a fleet-remote fixture used to fail with a misleading "not
managed by Kubernaut, add the label" message regardless of actual labels — a
gap in AF's fleet scope-checker wiring, not a fixture or test bug. Filed as
[kubernaut#2303](https://github.com/jordigilh/kubernaut/issues/2303), fixed in
[kubernaut-operator#464](https://github.com/jordigilh/kubernaut-operator/issues/464).

**Resolved (fleet mode only, fixed 2026-08-28)**: fleet RCA investigations
didn't suppress local-only `kubectl_*` tools with no remote counterpart, so
KA could silently query the hub cluster instead of the fleet target and
misreport "not found" — burning a secondary-LLM summarization call on a
100k-char unfiltered hub namespace dump in the worst observed case. Filed as
[kubernaut#2306](https://github.com/jordigilh/kubernaut/issues/2306), fixed in
[kubernaut#2307](https://github.com/jordigilh/kubernaut/pull/2307).

**Known transient failure mode (fleet mode, observed 2026-08-28, not yet
root-caused)**: the `mcp-gateway` pod (`mcp-system` namespace) occasionally
fails its own readiness probe (`GET /readyz` → 503, 3 consecutive failures)
and gets replaced by the Deployment controller. Requests that land during the
flap (typically SignalProcessing's remote enrichment) get "connection closed
... rejected by transport: standalone SSE stream: Internal Server Error" and
fall back to degraded mode — `environment: Unknown` on the `SignalProcessing`
CR is the visible symptom, easy to mistake for a missing
`kubernaut.ai/environment` namespace label (it isn't — verify with
`oc get ns <fixture-ns> -o jsonpath='{.metadata.labels}'` before assuming a
fixture problem). The old pod is garbage-collected quickly, so its crash logs
are usually gone by the time this is noticed — if you catch it recurring,
capture `oc describe pod` and `oc logs` on the *previous* pod before it's
collected. Mitigation: confirm the current `mcp-gateway` pod's `AGE` and
`READY` (`oc get pods -n mcp-system`) and both `MCPServerRegistration`s'
`Ready` status before retrying — a pod that's been stable/Ready for a few
minutes means the flap has already passed.
