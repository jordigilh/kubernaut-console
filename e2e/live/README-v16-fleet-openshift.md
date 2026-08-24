# Live E2E Suite — release/v1.6 fleet management on the shared OpenShift dev cluster

**Status: living doc, in progress.** `kubernaut` v1.6.0-rc5 was deployed by the operator
team on 2026-08-23/24 (`Kubernaut` CR `Running`, generation 8). A full preflight was run
2026-08-24 against the live deployment — most **TBD** items below are now confirmed with
real data, and three fresh-install gaps were found and fixed (see "Preflight results,
2026-08-24" below). The full 12-test suite has **not yet been run** against this
deployment; environment is ready to do so.

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
  reusable as-is against a fleet-enabled deployment — environment is now preflighted and
  ready; **not yet confirmed** with a real run.
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

**Confirmed 2026-08-24, live `Kubernaut` CR on v1.6.0-rc5**:

```json
{
  "backend": "fleetmetadatacache",
  "enabled": true,
  "mcpGatewayEndpoint": "https://mcp-gateway-gateway-system.apps.dev.redhat-internal.com/mcp",
  "mcpGatewayNamespace": "mcp-system",
  "mcpGatewayType": "kuadrant",
  "oauth2": {
    "credentialsSecretRef": "fleet-oauth2-creds",
    "enabled": true,
    "tokenURL": "http://keycloak-service.keycloak:8080/realms/kagenti/protocol/openid-connect/token"
  }
}
```

Notably, `oauth2.tokenURL` points at the **same `kagenti` realm** this cluster's console
auth already uses — there is no separate `kubernaut-fleet` realm on this cluster, despite
upstream's getting-started doc describing one. AF/the fleet client still performs a real
OAuth2 client-credentials exchange against `kagenti` (the `fleet-oauth2-creds` Secret
holds a `client-id`/`client-secret` pair scoped to that realm) to obtain *a* token to
present to the MCP Gateway — it's just that `kube-mcp-server`'s `kubeconfig` auth mode
(see above) never inspects that token's claims for authorization, only its presence
satisfies the CR's CEL admission rule and whatever the Kuadrant gateway itself checks at
the transport layer. `status.services` confirms `fleetmetadatacache: {ready: true,
readyReplicas: 1}` — FMC is deployed and healthy as part of this rollout (see backend
question resolved below).

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

**Confirmed 2026-08-24**: `backend: fleetmetadatacache`, and it *was* deployed alongside
the rest of the v1.6.0-rc5 rollout as predicted — `fleetmetadatacache-67687b6576-45t8l`
pod `Running 1/1`, `quay.io/kubernaut-ai/fleetmetadatacache@sha256:f11c6dc9...` image,
listed in `status.services` as `ready: true`. No ACM Search install was needed or used.

`gatewayType` has no default — an empty value means fleet is disabled outright (no
implicit "off" vs. explicit "off" ambiguity to worry about at CR-read time).

### CONFIRMED gap on this build, but already tracked upstream: `WorkflowExecution` only serves v1alpha1 on rc5 — no Fleet/OAuth2 fields at execution time

**Confirmed via direct CRD inspection, 2026-08-24**:

```bash
$ oc get crd workflowexecutions.kubernaut.ai -o jsonpath='{range .spec.versions[*]}{.name}{" served="}{.served}{" storage="}{.storage}{"\n"}{end}'
v1alpha1 served=true storage=true
```

`v1alpha2` doesn't exist at all as a version on this CRD. **Triaged via `hindsight-docs`/
`hindsight-issues` recall, 2026-08-24 — this is NOT a novel gap, it's a known,
already-tracked, in-progress upstream item, not something to file fresh:**

- `kubernaut-operator#235` (opened 2026-07-25): WE is the *only* fleet-integration
  component that calls MCP **write** tools (`resources_create_or_update`/`resources_delete`,
  `pkg/fleet/mcpclient/writer.go`) rather than read-only ones, so it needs its own
  write-scoped OAuth2 credential (`WorkflowExecutionFleetSpec`, no fallback to the shared
  read-only `spec.fleet.oauth2.credentialsSecretRef`, for least-privilege) — BR-FLEET-054 /
  ADR-068 / DD-235.
- Retargeted 2026-08-06 from the v1.6 milestone to a dedicated **v1alpha2** milestone,
  specifically *because* it's a CRD-schema change: per the project's v1alpha2 redesign
  initiative (tracking issue `kubernaut-operator#297`), CRD-schema-touching work is
  designed directly against the new `kubernaut.ai/v1alpha2` shape rather than patched into
  `v1alpha1` first, to avoid building fields that would be immediately restructured.
- `kubernaut-operator` PR #363 (merged 2026-08-17) already implemented the `WorkflowExecutionFleetSpec`
  type in `api/v1alpha2/kubernaut_types.go` upstream — but that's the Go type existing in
  the codebase, not the same thing as `v1alpha2` being cut over as an actual *served* CRD
  API version. This cluster's rc5 build confirms it isn't served yet: consistent with
  #235/#297 being explicitly gated on sign-off of the full v1alpha2 migration ADR before
  the new version goes live, a separate/later step from merging the Go types.

Practical implication for this suite: fleet target-cluster identity threads through
SignalProcessing → AIAnalysis → KA discovery (BR-FLEET-003, confirmed working via the
`cluster` label fix) but genuinely cannot reach `WorkflowExecution`'s write path yet on
this build. In this cluster's loopback topology (exactly one registered cluster) that's
unobservable in this suite's results — there's only one valid target either way — so a
clean suite run here doesn't validate genuine multi-cluster write-path routing. No new
issue needed; just tracking that this suite's coverage has that known limit until
`kubernaut-operator#235`/`#297` ship.

### `kubernaut` CRD/CR: installed and Running

**Resolved 2026-08-23/24**: the operator team deployed v1.6.0-rc5. `Kubernaut` CR
`kubernaut` in `kubernaut-system`, `phase: Running`, all 10 `status.conditions` `True`
(`CRDsInstalled`, `MigrationComplete`, `BYOValidated`, `ToolRBACBound`, `AnsibleReady`,
`AlertManagerAuthConfigured` [gateway disabled, expected], `RBACProvisioned`,
`WebhooksConfigured`, `RouteReady`, `ServicesDeployed`). All 11 `status.services`
entries (`data-storage`, `aianalysis`, `signalprocessing`, `remediationorchestrator`,
`workflowexecution`, `effectivenessmonitor`, `notification`, `kubernaut-agent`,
`authwebhook`, `apifrontend`, `fleetmetadatacache`) report `ready: true`. All 15 pods in
`kubernaut-system` `Running`. `kubernaut-operator-controller-manager` image explicitly
tagged `1.6.0-rc5`; every service image is digest-pinned (`quay.io/kubernaut-ai/*@sha256:...`)
as expected of operator-managed pinning.

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

**Confirmed 2026-08-24**: fresh v1.6.0-rc5 install started with an empty catalog (0
`RemediationWorkflow`, 0 `ActionType` — expected for a fresh install, same class of gap
as v1.5's, see next section). After running
`e2e/live/scripts/seed-fresh-install-prerequisites.sh`: **32 `RemediationWorkflow`, 35
`ActionType`** (2 workflows skipped by `seed-workflows.sh --continue-on-error`, same
32/34 pattern as v1.5's runs — not a new gap). Verified the `cluster: ["*"]` label from
`kubernaut-demo-scenarios#412` is present end-to-end on the live CRD, e.g.
`crashloop-rollback-v1`'s `spec.labels` includes `"cluster":["*"]` alongside the existing
`component`/`environment`/`priority`/`severity` dimensions.

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

## Preflight results, 2026-08-24 (v1.6.0-rc5 live)

Ran a full preflight against the newly-deployed v1.6.0-rc5 `Kubernaut` CR before the
first suite run. Three fresh-install gaps found, all fixed:

| # | Gap found | Evidence | Fix |
|---|---|---|---|
| 1 | `RemediationWorkflow`/`ActionType` catalog empty (0/0) | `oc get remediationworkflows/actiontypes -n kubernaut-system` — 0 items | Ran `e2e/live/scripts/seed-fresh-install-prerequisites.sh` → 32/35. Same class of gap as v1.5's fresh-install experience (this is a documented user-provided-prerequisite, not an operator bug) |
| 2 | `signalprocessing-policy` and `aianalysis-policy` ConfigMaps present but with **wrong Rego package names** (`package kubernaut.signalprocessing` / `package kubernaut.aianalysis` instead of the `data.signalprocessing.*` / `data.aianalysis.approval` paths the evaluators actually query — confirmed against `kubernaut` main source, `pkg/signalprocessing/evaluator/evaluator.go:44-52` and `pkg/aianalysis/rego/evaluator.go:261,416`) | Direct `oc get configmap ... -o jsonpath` content inspection, cross-checked against evaluator source and against `kubernaut-demo-scenarios` main's canonical `deploy/defaults/{signalprocessing-policy,approval-policy}.rego` (which use the correct un-prefixed package names) | Same script's Step 2 detected the mismatch and reapplied canonical content from `kubernaut-demo-scenarios`; both controllers rolled out cleanly. This is a **recurrence** of the same bug class documented in `kubernaut-demo-scenarios#403`/`#404` (v1.5/v1.6) — whatever bootstraps this shared cluster's ConfigMaps between installs is still applying stale/wrong content, now with a different wrong prefix. The script remains the reliable stopgap either way (idempotent, reads names from the live CR) |
| 3 | `console-e2e-keycloak-creds` Secret (kubernaut-system) missing entirely — expected after the CR/namespace was recreated for this rc5 deploy, since `kubernaut-console-oidc`'s `client-secret` is regenerated on every fresh CR install | `oc get secret console-e2e-keycloak-creds -n kubernaut-system` → `NotFound`; `keycloak-0` pod itself is 5d12h old (independent of the 25h-old CR), so the underlying `console-e2e-test` Keycloak identity in the `kagenti` realm was untouched and still exists | Reset the `console-e2e-test` user's password via `kcadm.sh` (Keycloak itself, not kubernaut-system, owns this identity) and recreated the Secret with the new password + the fresh `kubernaut-console-oidc` `client-secret`. Verified end-to-end: `keycloak-token.mjs` successfully issues a JWT |

None of these are new/v1.6-specific bugs in the console or in fleet mode itself — all
three are the same fresh-install gap classes already known from v1.5 validation,
recurring here because this is a genuinely fresh `Kubernaut` CR install (previous
v1.5.12 spot-check was fully torn down first). `seed-fresh-install-prerequisites.sh` was
also hardened during this preflight: its Step 1 catalog check previously queried the
now-nonexistent `remediation_workflow_catalog` Postgres table (harmless — the query
failure was swallowed by a `\|\| echo "0"` fallback that always forced a reseed
attempt) — updated to check the CRD count directly when the CRD exists, falling back to
the Postgres table only for genuinely old v1.5-era clusters. Re-verified idempotent
after the fix: second run correctly reports "already seeded" for both the catalog and
both policy ConfigMaps.

Everything else — `MCPServerRegistration` (`Ready: True`, 19 tools), tool RBAC
ClusterRoleBindings (all 6 present), no stale `console-e2e-*` namespaces — was already
healthy with no changes needed.

## Full setup sequence — v1.6.0-rc5 deployed, environment ready

| # | Step | Command | Status |
|---|---|---|---|
| 1 | Confirm cluster context | `oc whoami && oc config current-context` | Done |
| 2 | Operator deploys `v1.6.0-rc5` `Kubernaut` CR (fleet-enabled) | — | Done 2026-08-23/24 |
| 3 | Verify fleet wiring is healthy | `oc get kubernaut -n kubernaut-system -o yaml` — check `spec.fleet.enabled: true`, `status` conditions; `oc get mcpserverregistration -n mcp-system` still `Ready: True` | Done — confirmed healthy |
| 4 | Seed workflow/action-type catalogs + policy ConfigMaps | `e2e/live/scripts/seed-fresh-install-prerequisites.sh` (also seeds catalogs via `kubernaut-demo-scenarios` scripts) | Done — 32 workflows / 35 action types, both policy ConfigMaps corrected |
| 5 | Verify catalog populated (CRD-native, see above) | `oc get remediationworkflows -n kubernaut-system --no-headers \| wc -l` | Done — 32 |
| 6 | Fetch credentials | `source e2e/live/scripts/fetch-creds.sh` (same Keycloak `kagenti` realm / `console-e2e-test` identity as v1.5 — unrelated to fleet's own auth) | Done — Secret recreated, token issuance verified |
| 7 | Provision fixtures | `e2e/live/scripts/setup-fixtures.sh` (same script as v1.5 — fixtures are plain K8s resources, no fleet-specific references) | Ready to run |
| 8 | Preflight | Confirmed: CR `Running`, all services ready, `MCPServerRegistration` `Ready: True`, no stale namespaces | Done |
| 9 | Run | `npx playwright test --config=playwright.live-v15.config.ts` — same config as v1.5, no fleet-specific variant created (none of the 12 tests reference cluster identity, so no config changes are anticipated to be needed) | Ready to run |

## Open questions

- Does the same 6-spec-file / 12-test suite pass unmodified against a fleet-enabled
  backend, or are there fleet-specific behavioral differences the console needs to
  handle (e.g. cluster-identity display, multi-cluster investigation context)? Given
  ADR-009 never exercised this combination, treat "unmodified" as the null hypothesis
  to disprove, not a default expectation. **Still open — suite run pending.**
- ~~What `spec.fleet.backend` does this deployment actually use?~~ **Answered**:
  `fleetmetadatacache`, deployed and healthy as part of the rc5 rollout.
- ~~What exact `spec.fleet.oauth2` values satisfy CR admission?~~ **Answered**:
  `enabled: true`, `credentialsSecretRef: fleet-oauth2-creds`, `tokenURL` pointing at the
  existing `kagenti` realm (not a separate `kubernaut-fleet` realm).
- ~~Does `WorkflowExecution`'s served CRD version include `Fleet`/`OAuth2` fields?~~
  **Answered**: no — only `v1alpha1` is served/stored, `v1alpha2` doesn't exist on this
  CRD at all. **Not a novel gap** — already tracked as `kubernaut-operator#235`
  (BR-FLEET-054/ADR-068/DD-235), gated on the broader v1alpha2 CRD migration
  (`kubernaut-operator#297`); see the confirmed-gap section above.
- Are fixture namespaces (crashloop/memory-eater) correctly discoverable through the
  `loopback_cluster_`-prefixed MCP tools without any changes to `setup-fixtures.sh`?
  **Still open — requires a real suite run to observe.**
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
