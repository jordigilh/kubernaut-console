# ADR-009: Real-Cluster (Live) E2E Test Strategy

## Status

Proposed

## Context

The existing Playwright suite runs against a mocked A2A backend. It gives fast
UI regression coverage, but it does not verify the Console against a running
Kubernaut API Frontend, KubernautAgent, workflow controllers, or Kubernetes.
The integration guide remains the contract authority; this suite verifies that
contract from the real browser side.

The live workflow also needs to be reproducible and safe:

1. The Console repository must own the browser, fixture, diagnostic, and
   teardown lifecycle.
2. Upstream's supported demo Make targets must remain unchanged and own
   platform bootstrap.
3. Every run must consume immutable, hash-verified images, charts, and scenario
   archives.
4. No external LLM credential or bearer token may enter the browser or an
   uploaded artifact.

## Decision

### Ownership and contract

`kubernaut-console` owns `.github/workflows/e2e-live.yml` and all scripts under
`e2e/live/scripts`. `kubernaut` is consumed read-only at a pinned SHA through
its public `setup-local-demo-infra` and `setup-fleet-demo-infra` Make targets.
The upstream Makefile is not modified by this workflow.

`docs/integration-guide.md` is the A2A/MCP contract authority. Upstream tests
verify server behavior; this suite verifies the production Console UI against
that server behavior.

### Disposable topology matrix

The workflow runs one isolated matrix job for each mode:

| Mode | Make target | Topology |
|---|---|---|
| `local` | `setup-local-demo-infra` | One hub Kind cluster |
| `fullpipeline` | `setup-local-demo-infra` | A separate one-cluster local-demo run |
| `fleet` | `setup-fleet-demo-infra` | Hub and spoke Kind clusters |

`fullpipeline` is a Console workflow label, not an invocation of upstream's
FullPipeline Go suite or setup API. It deliberately uses the same Keycloak,
Traefik, Console, API Frontend, catalog, and fixture contract as `local`, with
an isolated run-specific cluster name.

### Artifact boundary

The workflow builds the Console, Kubernaut services, mock-LLM, operator charts,
demo scenarios, and auxiliary images once. The provenance job records source
SHAs, archive hashes, image IDs, and the setup contract. Each live job verifies
the manifest and sidecars before loading any image or extracting any archive.

The verified image contract uses `localhost:${ARTIFACT_TAG}` names. The mock-LLM
archive is loaded by Console-owned setup after catalog seeding, rather than
being delegated to upstream's unrelated test fixtures.

### Fixed mock-LLM boundary

All three modes use these deterministic settings:

| Setting | Value |
|---|---|
| Provider | `openai` |
| Model | `mock-model` |
| Endpoint | `http://mock-llm:8080` |
| Credential | `mock-api-key-for-e2e` |
| Image | `localhost/mock-llm:${ARTIFACT_TAG}` |
| Config | `/config/scenarios.yaml`, mounted read-only |

After the upstream catalog is seeded, `generate-mock-llm-scenarios.py` reads
the active `RemediationWorkflow` resources and substitutes their catalog UUIDs
into every workflow-selection response. Selector chains use top-level
`next_tool_call` entries, and `repeat_tool_call` is opt-in only. The mock
Deployment runs as UID `1001`, uses `/health` liveness/readiness probes, and is
exposed only through a ClusterIP Service.

The credential file is created with mode `0600` under the run directory. It is
never printed, included in the runtime manifest, or uploaded.

### Authentication boundary

The demo topology uses Keycloak behind Traefik. Playwright authenticates in the
browser as the disposable `sre-user` / `password` account. The Console uses its
production `ProxyAuthProvider`, which obtains identity from the host-owned
session and returns no browser bearer token. The Vite configuration has no
Dex-token import, token fetch, or server-side token injection path.

The CI host mapping resolves `keycloak` and `kubernaut-console.local` to
`127.0.0.1`; the runtime manifest records the Keycloak, Console, and API
Frontend URLs without Secret data.

### Required execution order

Every live job follows this order and gates each step on the preceding one:

1. Bootstrap the upstream demo topology.
2. Emit the sanitized runtime manifest.
3. Seed and verify catalog and policy prerequisites.
4. Deploy the verified mock-LLM and generated scenarios.
5. Run read-only preflight checks.
6. Create run-suffixed fixtures from pinned demo-scenario manifests.
7. Run `playwright.live-kind.config.ts`.
8. Collect diagnostics, scan outputs, upload safe artifacts, and tear down.

The fleet proof runs beside Playwright and requires a successful
`WorkflowExecution` with `spec.clusterID=remote-cluster`, a matching successful
Job on the spoke, and the expected spoke-side state change.

### Fixture isolation and teardown

`fixtures.list` is the single source of truth for fixture namespaces. Local and
fullpipeline fixtures are created on the hub; fleet fixtures are created only
on the spoke. Each namespace includes the current run suffix, and teardown
deletes only those listed namespaces before deleting the run-specific Kind
clusters. A failed deletion keeps the state file so the cleanup can be retried.

No lane consumes a preserved workload or the fixed `fullpipeline-e2e` cluster
name. No Playwright test calls `kubectl`; privileged fixture setup is isolated
to the Console-owned CI setup step.

### Diagnostics and redaction

Diagnostics collect resource state, events, controller logs, and the generated
mock-LLM ConfigMap without reading Kubernetes Secret data. Credential-shaped
values are redacted before persistence. The artifact scanner checks reports,
manifests, diagnostics, browser output, and the credential file before upload.
Browser traces, videos, and screenshots are disabled by default in CI.

## Cadence and location

The workflow runs nightly and through `workflow_dispatch`; it is not part of
the PR-blocking mocked E2E workflow because multi-service Kind bootstrap is
expensive. The suite lives in `e2e/live/` and uses
`playwright.live-kind.config.ts`, separate from `playwright.config.ts`.

## Alternatives considered

### Host the suite in kubernaut

Rejected. The Console is an optional, replaceable reference UI and must not
become a required upstream CI dependency.

### Use a real external LLM

Rejected for this deterministic qualification lane. It requires repository
secrets, adds latency and nondeterminism, and makes credential redaction harder.
The mock-LLM is built from the pinned upstream source and loaded from the same
verified artifact set as the other services.

### Reuse a preserved cluster or fixed cluster name

Rejected. Per-run clusters and namespaces prevent stale sessions, remediation
cooldowns, catalog drift, and accidental deletion of user-owned resources.

### Invoke upstream's FullPipeline test suite or setup API

Rejected. The Console lane owns its browser coverage and needs the upstream
demo contract shared by local and fleet setup. `fullpipeline` therefore uses
the supported local-demo Make target instead of a second infrastructure path.

## Consequences

### Positive

- Real browser coverage exercises the Console, AF, KA, controllers, and Jobs.
- All three lanes share one bootstrap and authentication contract.
- Mock-LLM responses use UUIDs from the catalog actually deployed in that run.
- Artifact provenance, redaction, fixture ownership, and teardown are explicit.
- Fleet routing is proven on the spoke rather than inferred from hub state.

### Negative

- The live workflow remains slower and more resource-intensive than the mocked
  suite.
- The Console lane depends on the pinned upstream Make/demo contract and must
  update its pin when that contract changes.
- The `sre-user` account is intentionally synthetic and must never be reused
  outside the disposable demo topology.

## References

- [Integration Guide](../integration-guide.md)
- [ADR-007: Multi-Platform Plugin Architecture](007-multi-platform-plugin-architecture.md)
- `e2e/live/README.md`
- `.github/workflows/e2e-live.yml`
- `e2e/live/scripts/ci-provision-demo-infra.sh`
- `e2e/live/scripts/generate-mock-llm-scenarios.py`
- Upstream `Makefile` targets `setup-local-demo-infra` and
  `setup-fleet-demo-infra` (read-only dependency)
