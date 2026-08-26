# Live E2E Suite — release/v1.6 fleet management on the shared OpenShift dev cluster

**Status: living doc, in progress.** Fleet management (`kubernaut` v1.6.0-rc5) has not
yet been deployed by the operator team on this cluster as of this writing — everything
below reflects infrastructure prep and topology discovery done *ahead of* that
deployment, per [README-v15-openshift.md](./README-v15-openshift.md)'s companion
pattern. Sections marked **TBD** will be filled in once v1.6.0-rc5 is live and a real
suite run can validate them.

This document is **distinct** from [README-v15-openshift.md](./README-v15-openshift.md):
that one validates `kubernaut-console` against a real, single-cluster `release/v1.5`
stack. This one validates the same console against `kubernaut` v1.6's **fleet
management** feature — multi-cluster/loopback investigation via an MCP Gateway +
`kube-mcp-server`, replacing AF/KA's direct client-go calls with MCP tool calls.

### This is explicitly the "Phase 2" ADR-009 deferred — not new scope invention

Confirmed via `hindsight-docs` recall of this repo's own `ADR-009-live-e2e-real-cluster-strategy`:
Phase 1 (the work `README-v15-openshift.md` validates) **explicitly rejected** fleet/
multi-cluster scope to avoid over-scoping the first iteration, deferring it until the
single-cluster remediation flow was proven — with the intent to "revisit for phase 2 if
fleet benefits from multi-cluster scenario content." Phase 1's own CI harness
(`test/e2e/fullpipeline`) is invoked with `fleetProvisioner=nil`, deliberately excluding
EAIGW/Kuadrant MCP Gateway, `kube-mcp-server`, the fleet Keycloak realm, and
`fleetmetadatacache`. **This document is that deferred Phase 2** — not a new,
un-blessed testing initiative. Worth an explicit ADR-009 addendum (or a small
ADR-010) once this phase actually starts producing results, so the "Phase 1 only"
scope statement in ADR-009 itself doesn't go stale.

## STATUS UPDATE (2026-08-25, v1.6.0-rc7): fleet MCP tool routing has never actually been exercised

**Critical finding, confirmed live on this cluster:** despite `fleet.enabled: true`
on the `Kubernaut` CR and healthy `mcp-gateway`/`kube-mcp-server` pods in `mcp-system`
(the `loopback-cluster` `MCPServerRegistration` is `Ready: True`, 19 tools), every
`kubernaut-agent` investigation run in this validation session — including everything
reported as "no major regression from the fleet enhancement" further down this doc —
has silently used KA's own **built-in v1.5-style K8s tools** (client-go direct API
calls), not the fleet MCP Gateway → `kube-mcp-server` path. The two have never
actually been compared; only the fallback path has been tested.

Root cause: a path-hyphenation mismatch between `kubernaut-operator` (mounts KA's
`fleet-oauth2-creds` Secret at non-hyphenated `/etc/kubernautagent/`) and `kubernaut`
itself (KA's `toolregistry.go` looks for it at hyphenated `/etc/kubernaut-agent/`,
changed while fixing #1729's *Helm* parity gap, which flipped a previously-latent
mismatch into a live one for operator-deployed KA). KA logs
`"fleet tool overlay resolution failed; investigation proceeds without remote-cluster
tools"` on every single investigation as a result — a **silent, fail-open** fallback,
which is why nothing user-visible ever flagged it.

**Resolution (same day):** decided this is a live deployment config mismatch on this
cluster, not something worth a separate upstream-tracked issue — closed without
filing (initially filed as
[kubernaut#2295](https://github.com/jordigilh/kubernaut/issues/2295), then closed
per that decision). Fixed directly by patching the live `kubernaut-agent` Deployment
to add a second volume mount at the hyphenated path KA's code actually reads
(`/etc/kubernaut-agent/fleet-oauth2-creds`, same underlying `fleet-oauth2-creds`
Secret), alongside the operator's existing non-hyphenated mount. Confirmed fixed
after rollout: KA now logs `"MCP Gateway connection established"` and
`"Fleet readiness gate started","ready":true` at startup, same as every other
fleet-aware service. **Caveat: not durable** — this is a manual patch of a
Deployment the operator reconciles; it may get reverted on the next operator
reconcile (CR update, upgrade, resync) and would need reapplying. No CRD field
exists to express this durably (`kubernautAgent` has no `extraVolumes`/
`extraVolumeMounts` escape hatch as of v1.6.0-rc7).

**Preflight of every other fleet-aware component (2026-08-25), to check whether the
same class of mismatch existed elsewhere:** KA was the *only* outlier. Every other
fleet-aware service's own hardcoded credential path already matched exactly what
`kubernaut-operator`'s `deployments.go` mounts, and all show a successful
`"MCP Gateway connection established"` + `"Fleet readiness gate started","ready":true`
in their logs:

| Component | Own code's OAuth2 path | Operator mount | Status |
|---|---|---|---|
| `kubernaut-agent` | `/etc/kubernaut-agent/` | `/etc/kubernautagent/` (mismatch) | fixed via live patch above |
| `remediationorchestrator-controller` | `/etc/remediationorchestrator/` | matches | ✅ connected |
| `signalprocessing-controller` | `/etc/signalprocessing/` | matches | ✅ connected |
| `apifrontend` | `/etc/apifrontend/` | matches | ✅ connected |
| `effectivenessmonitor-controller` | `/etc/effectivenessmonitor/` | matches | ✅ connected |
| `workflowexecution-controller` | `/etc/workflowexecution/` | matches | ✅ connected |
| `fleetmetadatacache` | config-driven `CredentialsDir` (operator sets both ends consistently) | matches | ✅ connected |
| `gateway` (webhook ingress component) | n/a | not deployed on this cluster (`spec.gateway.enabled: false` — AF is the ingress) | N/A |
| `aianalysis-controller`, `notification-controller`, `data-storage`, `authwebhook` | n/a | not fleet-aware | N/A (expected, no MCP Gateway wiring needed) |

**Implication for everything recorded below before 2026-08-25 19:10 UTC:** every
"passed"/"no regression" result recorded below (topology discovery, workflow
catalog, fixture runs, etc.) validated KA operating in its legacy built-in-tool mode
for K8s access specifically — every *other* service was already correctly
fleet-routed the whole time. Golden-transcript extraction for "k8s-mcp-server vs KA
builtin" MCP-call comparison can now proceed for fresh runs (KA's fleet path is
live as of the patch above), but anything captured before the patch should not be
used for that comparison.

## What's different about fleet mode

In non-fleet (v1.5) mode, AF/KA call the Kubernetes API directly via client-go. In
fleet mode, K8s reads/writes for the *target* cluster go through:

```
AF/KA -> MCP Gateway (Kuadrant broker or Envoy AI Gateway) -> kube-mcp-server -> K8s API
```

The console/UI layer, A2A protocol, and MCP tool contract exposed to the *browser*
(`kubernaut_approve`, `kubernaut_select_workflow`, etc.) are unchanged — fleet mode is
an AF/KA-internal backend change, not a console API change. This means:

- The **same 6 spec files / 12 test cases** documented in
  [README-v15-openshift.md](./README-v15-openshift.md#suite-layout) are expected to be
  reusable as-is against a fleet-enabled deployment — **TBD, not yet confirmed** with a
  real run.
- The **same fixture scripts** (`setup-fixtures.sh`/`teardown-fixtures.sh`,
  crashloop/memory-eater targets) should still work: fixtures are just real broken K8s
  resources in real namespaces; only the *mechanism* AF/KA use to discover/read/act on
  them changes (MCP tool call vs. direct client-go).

## Topology found on this cluster (discovered 2026-08-22/23, pre-existing — not something this suite provisions)

The OCP dev cluster (`dev-redhat-internal-com`, OCP **4.18.44**, internal hostname
`helios08`) already has the MCP Gateway + `kube-mcp-server` stack running, provisioned
by the platform/operator team ahead of the v1.6.0-rc5 deployment:

| Component | Namespace | Age (as of 2026-08-22) | Notes |
|---|---|---|---|
| `kube-mcp-server` | `mcp-system` | 5-6d | Deployment `kube-mcp-server`, 1/1 Running |
| `mcp-gateway` (Kuadrant broker) | `mcp-system` | 5-6d | Deployment `mcp-gateway` |
| `mcp-gateway-controller` | `mcp-system` | 5-6d | Kuadrant MCP Gateway CRD controller |
| `mcp-gateway-istio` (data plane) | `gateway-system` | 59d | Istio Gateway backing the `mcp-gateway` `Gateway` object |
| `MCPServerRegistration` `loopback-cluster` | `mcp-system` | 5d4h at discovery | `prefix: loopback_cluster_`, `state: Enabled`, `Ready: True`, **19 tools discovered** |
| Route | `gateway-system` | 59d | `mcp-gateway-gateway-system.apps.dev.redhat-internal.com` (edge/Redirect TLS termination) |

This is the **"loopback" pattern**: `kube-mcp-server` manages the *same* cluster it
runs on (no genuinely separate remote/workload cluster here), registered under cluster
ID `loopback-cluster`. Confirmed via direct inspection: `oc get mcpserverregistration -A`,
`oc get pods -n mcp-system`, `oc get pods -n gateway-system`.

### Auth mode: simpler than the documented local-dev setup — read this before assuming RFC 8693 token exchange

`docs/development/getting-started/fleet-mcp-gateway-keycloak-local-setup.md` (upstream
`kubernaut` repo) describes a **passthrough + RFC 8693 Standard Token Exchange**
setup against a dedicated `kubernaut-fleet` Keycloak realm. **This cluster does not use
that.** Confirmed by direct inspection of the live `kube-mcp-server-config` ConfigMap:

```toml
cluster_auth_mode = "kubeconfig"
```

Not `"passthrough"`. This means `kube-mcp-server` always acts using its own in-cluster
ServiceAccount (bound to the `view` ClusterRole per the getting-started doc's general
pattern) for every K8s API call, regardless of caller identity — there is **no
per-caller token exchange, no `kubernaut-fleet` Keycloak realm, no OAuth2 audience
checks on `kube-mcp-server` itself** in this deployment. Confirmed:

- `oc get realms` on this cluster's Keycloak (`keycloak` namespace) shows only `master`
  and `kagenti` — no `kubernaut-fleet` realm exists here. (`kagenti` is the *console's
  own* OIDC realm, used for `kubernaut-console`/AF auth, unrelated to fleet MCP tool
  calls.)
- The broker's own registration config (`mcp-gateway-config` Secret, `mcp-system`) has
  no credential reference at all for the `loopback-cluster` upstream connection — just
  a bare URL (`http://kube-mcp-server.mcp-system.svc.cluster.local:8080/mcp`).

**Implication for the `Kubernaut` CR once the operator deploys it**: the CRD schema
(`kubernaut-operator`'s `kubernaut.ai_kubernauts.yaml`, `spec.fleet.oauth2`) has an
admission-time CEL validation rule requiring `oauth2.enabled: true` whenever
`spec.fleet.mcpGatewayEndpoint` is set — **regardless of whether the underlying gateway
actually enforces it**. Some `spec.fleet.oauth2` values (a `credentialsSecretRef` at
minimum) will likely need to be populated just to satisfy CR admission, even though
`kube-mcp-server`'s `kubeconfig` auth mode means the token's actual content doesn't
matter for authorization on this cluster. **TBD**: confirm exact values needed once the
operator's `v1.6.0-rc5` `Kubernaut` CR manifest/values are available.

### Fleet-related `Kubernaut` CRD fields (from `kubernaut-operator` main, pre-rc5)

Found in `kubernaut-operator/config/crd/bases/kubernaut.ai_kubernauts.yaml`
(`spec.fleet`):

| Field | Type | Notes |
|---|---|---|
| `spec.fleet.enabled` | bool, default `false` | Master switch |
| `spec.fleet.backend` | enum `fleetmetadatacache` \| `acm` | Scope-check backend for Gateway/RO |
| `spec.fleet.endpoint` | string | Backend HTTP(S) endpoint, required when enabled |
| `spec.fleet.mcpGatewayEndpoint` | string | Fleet-wide MCP Gateway SSE endpoint — required (admission-enforced) when enabled |
| `spec.fleet.mcpGatewayType` | enum `eaigw` \| `kuadrant` | Required (admission-enforced) when enabled. This cluster uses **Kuadrant** (confirmed: `mcp-gateway-controller`/`mcp-gateway` Deployments + `MCPServerRegistration` CRD present, not `Backend`/`MCPRoute`) |
| `spec.fleet.mcpGatewayNamespace` | string | Restricts MCP Gateway CRD watch scope; empty = cluster-wide |
| `spec.fleet.oauth2.{enabled,credentialsSecretRef,scopes,tokenURL}` | object | Required (CEL-enforced) whenever `mcpGatewayEndpoint` is set — see auth-mode note above |
| `spec.fleet.tokenSecretName` | string | Only relevant for `backend: acm` |
| `spec.fleetMetadataCache.enabled` | bool, default `false` | Whether operator deploys its own FMC; not needed if `backend: acm` points at an existing RHACM Search install |

**TBD**: this cluster's actual `backend` choice (`fleetmetadatacache` vs `acm`) —
no FMC or ACM Search deployment was found during this investigation (checked
`oc get namespace`/`oc get pods -A` for `fleetmetadatacache`/`acm`-related workloads,
found none as of 2026-08-22). Likely FMC will be deployed alongside the v1.6.0-rc5
`Kubernaut` CR itself, not pre-provisioned like the MCP Gateway/`kube-mcp-server`
pieces were.

`gatewayType` has no default — an empty value means fleet is disabled outright (no
implicit "off" vs. explicit "off" ambiguity to worry about at CR-read time).

### Likely blocker: `WorkflowExecution` v1alpha1 may not carry Fleet/OAuth2 fields yet

Recalled from a prior session's direct code inspection (`hindsight`, 2026-08-07/11,
re-confirmed unchanged as of 2026-08-11): on `kubernaut-operator` main,
`WorkflowExecutionSpec` in the **`v1alpha1`** API group — the version actually served
today — does **not** have `Fleet`/`OAuth2` fields; those exist only on the not-yet-served
**`v1alpha2`** type. If `v1.6.0-rc5` still serves `v1alpha1` as the storage/served
version for `WorkflowExecution`, this would mean the fleet target-cluster identity
can't be threaded down to the actual workflow-execution step, only through the earlier
SignalProcessing → AIAnalysis → KA discovery chain (per BR-FLEET-003, confirmed
working via the `cluster` label fix above). **TBD, high-priority check once rc5 is
available**: `oc get crd workflowexecutions.kubernaut.ai -o jsonpath='{.spec.versions[*].name}'`
and whether `v1alpha2` is present/served — if not, execution-time fleet propagation may
still be an open upstream gap worth confirming with the operator/kubernaut teams before
assuming full fleet coverage end-to-end.

### `kubernaut` CRD/CR: not yet installed

As of this writing, `kubernaut-system` namespace and the `kubernauts.kubernaut.ai` CRD
do not exist on this cluster (`oc get crd kubernauts.kubernaut.ai` → `NotFound`). The
prior `v1.5.12` spot-check deployment (see README-v15-openshift.md) was fully torn down
at some point between then and 2026-08-22. **Blocked on the operator team deploying
v1.6.0-rc5.**

## Workflow catalog storage: CRD-native in v1.6, not Postgres-materialized

**Correction (2026-08-23, user-confirmed)**: unlike v1.5's `remediation_workflow_catalog`
Postgres table (see README-v15-openshift.md step 2's `psql` sanity check),
**v1.6's workflow catalog reads live `RemediationWorkflow`/`ActionType` CRDs directly
from etcd** — there is no Postgres materialization step to verify. The v1.5 sanity
check:

```bash
# v1.5 only — do NOT use this for v1.6 fleet validation
oc exec -n kubernaut-system deploy/postgresql -- ... select count(*) from remediation_workflow_catalog;
```

is replaced for v1.6 by a direct CRD count:

```bash
oc get remediationworkflows -n kubernaut-system --no-headers | wc -l
oc get actiontypes -n kubernaut-system --no-headers | wc -l
```

**TBD**: confirm the expected count once `seed-workflows.sh`/`seed-action-types.sh` are
re-run against the v1.6.0-rc5 deployment (v1.5's expected count was 32 of 34 upstream
manifests; the demo-scenarios catalog itself hasn't shrunk, so 32/34 is the working
assumption pending confirmation).

## Known blocker found and fixed ahead of time: workflow `cluster` label gap

**Fixed upstream before v1.6.0-rc5 testing could even start** — filed and resolved
2026-08-22:

- BR-FLEET-003 (`kubernaut#1511`) adds an optional `spec.labels.cluster []string` field
  to `RemediationWorkflow`, alongside the existing `severity`/`environment`/`component`/
  `priority` label dimensions. Matching semantics: once fleet mode is enabled *and*
  SignalProcessing resolves a concrete `ClusterClassification` for a signal, DataStorage
  requires `labels.cluster` to contain that classification value **or the literal
  wildcard `"*"`** — a workflow with **no `cluster` entry at all is excluded outright**.
- None of `kubernaut-demo-scenarios`' 34 `RemediationWorkflow` manifests declared a
  `cluster` label as of 2026-08-22 — every one of them would have become undiscoverable
  the moment fleet mode resolved a cluster classification, producing
  `no_matching_workflows` across the board with no obvious root cause.
- Filed as [kubernaut-demo-scenarios#411](https://github.com/jordigilh/kubernaut-demo-scenarios/issues/411)
  (milestone v1.6), fixed same-day by
  [kubernaut-demo-scenarios#412](https://github.com/jordigilh/kubernaut-demo-scenarios/pull/412)
  (merged 2026-08-22T23:38:32Z): adds `cluster: ["*"]` to all 34 manifests' `labels:`
  blocks, mirroring the existing `priority: "*"` wildcard convention already used in the
  same files. Verified locally: 34/34 manifests now have `cluster: ["*"]`, all YAML
  parses cleanly (`yaml.safe_load_all`).

No further action needed here — this is resolved at the source, `seed-workflows.sh`
will pick up the fix automatically on the next run (it applies manifests verbatim, no
label transformation of its own).

### Migration note (customer-facing, not a testing blocker for this suite)

Since all 34 `kubernaut-demo-scenarios` manifests now carry `cluster: ["*"]`, **this
suite's own fixtures are unaffected by fleet mode either way** — the wildcard matches
regardless of whether a `ClusterClassification` is resolved, so the same fixtures work
identically with fleet on or off. This is purely a testing-path non-issue.

The product-level migration story is separate and matters for real customers: existing
(pre-v1.6) `RemediationWorkflow` CRs authored without a `cluster` label will silently
stop being discoverable the moment an upgraded install enables fleet mode and starts
resolving `ClusterClassification` for signals — there's no error, just
`no_matching_workflows` for workflows that used to match fine. Per this conversation,
the expected support story is: **v1.6 fleet-enabled deployments are expected to be
fresh installs, or customers upgrading in place must add `cluster: ["*"]` (or explicit
cluster IDs) to their existing custom workflows before enabling fleet.** This isn't
something this suite can validate (no real customer workflows to test against), but
it's worth confirming this expectation is actually written down somewhere customer-facing
(v1.6 upgrade guide / release notes) rather than living only in this conversation —
worth asking upstream whether that's already covered or needs a new doc/issue.

## Fixture cleanup note (2026-08-22)

24 stale `console-e2e-*` namespaces from two prior v1.5 validation runs (suffixes
`dfc2e9`, `fea434`, plus two single-suffix stragglers `0d36cb`/`5cace6`) were found
still `Active` 5-6+ days after their runs completed — never torn down. Deleted via
direct `oc delete namespace ... --wait=false` (the standard `teardown-fixtures.sh` only
handles the *most recent* suffix via its state file, not historical ones). **Lesson**:
always run `teardown-fixtures.sh` at the end of a validation session, and periodically
`oc get namespace | grep console-e2e-` to catch anything that slipped through.

## Full setup sequence — once v1.6.0-rc5 is deployed (TBD, not yet executed)

Provisional, adapted from README-v15-openshift.md's sequence pending a real run:

| # | Step | Command | Status |
|---|---|---|---|
| 1 | Confirm cluster context | `oc whoami && oc config current-context` | Ready to run |
| 2 | Wait for operator to deploy `v1.6.0-rc5` `Kubernaut` CR (fleet-enabled) | — | **Blocked, waiting on operator team** |
| 3 | Verify fleet wiring is healthy | `oc get kubernaut -n kubernaut-system -o yaml` — check `spec.fleet.enabled: true`, `status` conditions; `oc get mcpserverregistration -n mcp-system` still `Ready: True` | TBD |
| 4 | Seed workflow/action-type catalogs | `kubernaut-demo-scenarios/scripts/seed-action-types.sh` + `seed-workflows.sh` (now includes the `cluster: ["*"]` fix) | Ready to run once CRD exists |
| 5 | Verify catalog populated (CRD-native, see above) | `oc get remediationworkflows -n kubernaut-system --no-headers \| wc -l` (expect ~32) | Ready to run |
| 6 | Seed/verify policy ConfigMaps | `e2e/live/scripts/seed-fresh-install-prerequisites.sh` (same script as v1.5 — policy ConfigMap gap is orthogonal to fleet mode) | Ready to run |
| 7 | Provision fixtures | `e2e/live/scripts/setup-fixtures.sh` (same script as v1.5 — TBD confirm fixtures are correctly discoverable via `loopback_cluster_`-prefixed MCP tools rather than direct client-go) | TBD |
| 8 | Fetch credentials | `source e2e/live/scripts/fetch-creds.sh` (same Keycloak `kagenti` realm / `console-e2e-test` identity as v1.5 — unrelated to fleet's own auth) | Ready to run |
| 9 | Preflight | Same checks as v1.5, plus: confirm `MCPServerRegistration` `Ready: True` and tool count matches expectations | TBD |
| 10 | Run | `npx playwright test --config=playwright.live-v15.config.ts` (TBD whether a separate `playwright.live-v16-fleet.config.ts` is needed, or the same config works unmodified) | TBD |

## Open questions / TBD once v1.6.0-rc5 lands

- Does the same 6-spec-file / 12-test suite pass unmodified against a fleet-enabled
  backend, or are there fleet-specific behavioral differences the console needs to
  handle (e.g. cluster-identity display, multi-cluster investigation context)? Given
  ADR-009 never exercised this combination, treat "unmodified" as the null hypothesis
  to disprove, not a default expectation.
- What `spec.fleet.backend` (`fleetmetadatacache` vs `acm`) does this deployment
  actually use, and does FMC get deployed as part of the `v1.6.0-rc5` rollout?
- What exact `spec.fleet.oauth2` values satisfy CR admission on this cluster, given
  `kube-mcp-server`'s `kubeconfig` auth mode makes the token content itself irrelevant
  for authorization?
- Does `WorkflowExecution`'s served CRD version on rc5 include `Fleet`/`OAuth2` fields
  (`v1alpha2`), or is fleet identity still `v1alpha1`-only up through discovery and
  absent at execution time? (see blocker note above)
- Are fixture namespaces (crashloop/memory-eater) correctly discoverable through the
  `loopback_cluster_`-prefixed MCP tools without any changes to `setup-fixtures.sh`?
- **Answered, needs live confirmation**: `SI-4` correlation already has a defined
  console contract, not an open design question — `IT-CONSOLE-CTX-002` (per
  `docs/tests/35/TEST_PLAN.md`) asserts that an `investigation_summary` SSE artifact
  carrying `cluster_id: "cluster-fleet-a"` renders a `Cluster` field in the
  investigation-context banner. **TBD**: does AF actually populate `cluster_id` on
  this artifact in this loopback (`loopback-cluster`) topology, and does the banner
  render it correctly end-to-end against a live (not just unit-tested) backend?
- Console tests exercise AF's **interactive chat** investigation path, where cluster
  selection is LLM-driven by design (per `kubernaut#1768`) — unlike KA's autonomous RCA
  path, which is prescoped to exactly one known cluster (`DD-FLEET-004`'s
  `prescopeFleetOverlay`). In a single-registered-cluster (loopback) topology there's
  only one valid choice, so this distinction may not be observable here — worth noting
  so a "the LLM picked the right cluster" assertion isn't over-interpreted as fleet
  cluster-selection coverage when there was never more than one cluster to choose from.
- Upstream's own `kubernaut#1768` independently confirms the same gap from AF's side:
  AF's interactive path has E2E coverage only for single-cluster/hub-local cases
  (`E2E-FP-1189-002/003`), with zero mentions of fleet or `cluster_id` — so neither side
  of the AF↔console contract has been exercised together against a real fleet backend
  before now.

## References

- [README-v15-openshift.md](./README-v15-openshift.md) — the v1.5 companion this doc
  extends the pattern from
- [ADR-068: Fleet Federation Architecture](https://github.com/jordigilh/kubernaut/blob/main/docs/architecture/decisions/ADR-068-fleet-federation-architecture.md)
- [BR-FLEET-003: Cluster-Scoped Workflow Targeting](https://github.com/jordigilh/kubernaut/blob/main/docs/requirements/BR-FLEET-003-cluster-scoped-workflow-targeting.md)
- [Fleet MCP Gateway + kube-mcp-server + Keycloak local dev setup](https://github.com/jordigilh/kubernaut/blob/main/docs/development/getting-started/fleet-mcp-gateway-keycloak-local-setup.md) — describes the *documented* local-dev topology; this cluster's actual setup deviates (see auth-mode note above)
- [kubernaut-demo-scenarios#411](https://github.com/jordigilh/kubernaut-demo-scenarios/issues/411) / [#412](https://github.com/jordigilh/kubernaut-demo-scenarios/pull/412) — workflow `cluster` label fix
- [kubernaut#54: Fleet Management](https://github.com/jordigilh/kubernaut/issues/54)
- [kubernaut#1768](https://github.com/jordigilh/kubernaut/issues/1768) — upstream's own AF/KA fleet cluster-selection design + E2E coverage gap, corroborating this doc's scope
- [kubernaut#1511 / DD-FLEET-002](https://github.com/jordigilh/kubernaut/pull/1540) — cluster-scoped workflow targeting implementation (BR-FLEET-003 origin)
- `docs/tests/35/TEST_PLAN.md` (this repo) — `IT-CONSOLE-CTX-002`, the existing console-side contract test for fleet `cluster_id` banner rendering
- This repo's `docs/adr/009-live-e2e-real-cluster-strategy.md` — Phase 1/Phase 2 scope decision this document fulfills
