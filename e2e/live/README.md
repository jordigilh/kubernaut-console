# Live E2E Suite (ADR-009)

This suite validates the Console against a real Kubernaut backend: real
KubernautAgent investigations, real API Frontend, real Job-backed workflow
execution, and real Postgres/Valkey services. The LLM boundary is deterministic
and local: Console deploys the verified mock-LLM image and generates its
scenarios from the seeded workflow catalog.

The mocked browser suite remains in `playwright.config.ts` and
`.github/workflows/e2e.yml`. The disposable Kind lanes are defined by
`.github/workflows/e2e-live.yml`. The separate release/v1.5 OpenShift suite is
documented in [`README-v15-openshift.md`](./README-v15-openshift.md).

## Lanes

| Mode | Upstream bootstrap | Fixture owner | Purpose |
|---|---|---|---|
| `local` | `setup-local-demo-infra` | Hub | Single-cluster Console journeys |
| `fullpipeline` | `setup-local-demo-infra` | Hub | Isolated local-demo cluster running the full Console suite |
| `fleet` | `setup-fleet-demo-infra` | Spoke | Hub Console plus remote-cluster execution proof |

`fullpipeline` is only a workflow-matrix label. It does not invoke upstream's
FullPipeline Go suite, native setup API, preserved cluster, or separate auth
stack. It uses the same isolated local-demo contract as `local`.

Every lane runs in this order:

1. Verify immutable artifacts and bootstrap the pinned upstream Make target.
2. Emit the sanitized runtime manifest.
3. Seed the ActionType and RemediationWorkflow catalogs and verify policies.
4. Load the verified mock-LLM image and apply catalog-derived scenarios.
5. Run read-only topology preflight checks.
6. Create run-suffixed fault fixtures.
7. Run the shared Playwright suite.
8. Collect and scan sanitized diagnostics, then delete only run-owned resources.

## Authentication and mock-LLM contract

The demo uses Keycloak behind the upstream Traefik ingress. Playwright logs in
through the browser with the disposable demo account `sre-user` / `password`.
The browser uses the production `ProxyAuthProvider`; it never receives a
synthetic bearer token and the Console image contains no live-E2E token helper.

The live workflow always uses these fixed LLM settings:

| Setting | Value |
|---|---|
| Provider | `openai` |
| Model | `mock-model` |
| Endpoint | `http://mock-llm:8080` |
| Credential | `mock-api-key-for-e2e` |
| Image | `localhost/mock-llm:${ARTIFACT_TAG}` |
| Scenario path | `/config/scenarios.yaml` (read-only) |

The credential file is created under the run directory with mode `0600`. Its
contents are never printed, put in the runtime manifest, or uploaded.

## Running

Run the three-lane CI matrix with:

```bash
gh workflow run e2e-live.yml --repo jordigilh/kubernaut-console --ref main \
  -f gateway_type=eaigw
gh run watch --repo jordigilh/kubernaut-console
```

For a manually provisioned disposable demo cluster, set the Console URL and
Keycloak credentials, then run the shared configuration:

```bash
export LIVE_E2E_CONSOLE_URL=https://kubernaut-console.local:8843
export LIVE_E2E_KEYCLOAK_USERNAME=sre-user
export LIVE_E2E_KEYCLOAK_PASSWORD=password
export LIVE_E2E_IGNORE_HTTPS_ERRORS=true
pnpm test:e2e:live
```

The manual command runs `playwright.live-kind.config.ts`; it does not create a
cluster or mutate fixtures. CI owns bootstrap and fixture setup through the
scripts in this directory.

## Pinned inputs

| Input | Value |
|---|---|
| Kubernaut | `397fc2b70eabc8932176aa10729ced1e8a6c5b5d` |
| kubernaut-operator | `ad80481c3fb7cd1ea3c9d29c26b3d9a36a360906` |
| demo scenarios | `0af47027d654bc5bf9ed055790c0311642b43be1` |
| Kind / kubectl / Helm | `v0.32.0` / `v1.36.1` / `v3.18.6` |
| Fleet gateway | EAIGW by default; Kuadrant is a dispatch choice |

The workflow verifies all image, chart, and scenario archive hashes before
loading or extracting them. `ci-write-live-provenance.py` records the selected
source SHAs, archive digests, image contract, and Make target contract.

## Fixture and fleet safety

`fixtures.list` is the source of truth for per-test namespaces. Fixture setup
retargets only the pinned demo-scenario manifests and appends the run suffix;
it never uses a shared or preserved workload. Local and fullpipeline fixtures
are created on the hub. Fleet fixtures are created only on the spoke, and the
fleet proof requires a successful `WorkflowExecution` with
`spec.clusterID=remote-cluster` plus a matching successful spoke Job.

The teardown script validates DNS-safe run-owned cluster names, removes only
listed fixture namespaces, preserves its state file after a failed deletion,
and removes the hub and (for fleet) spoke Kind clusters.

## Diagnostics and browser artifacts

Diagnostics redact credential-shaped values before persistence and include
resource state, events, controller logs, and the mock-LLM ConfigMap without
Secret data. The artifact scan checks diagnostics, reports, manifests, and the
credential file before upload. CI does not retain traces, videos, or
screenshots unless explicitly enabled with
`LIVE_E2E_RETAIN_BROWSER_ARTIFACTS=1`.

## Suite layout

| File | Covers |
|---|---|
| `contract-compliance.spec.ts` | Integration-guide contract against real payloads |
| `approval-gate.spec.ts` | Real approval and no-action MCP calls |
| `full-remediation-lifecycle.spec.ts` | Investigation through execution and verification |
| `autonomous-fix.spec.ts` | Autonomous remediation through execution and verification |
| `consent-gate-regression.spec.ts` | Interactive consent boundary |
| `cancellation.spec.ts` | Cancellation behavior |
| `logout.spec.ts` | Browser logout boundary |
| `playwright.live-kind.config.ts` | Shared disposable Kind Playwright project |
