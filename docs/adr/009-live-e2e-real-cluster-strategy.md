# ADR-009: Real-Cluster (Live) E2E Test Strategy

## Status

Proposed

## Context

The existing Playwright suite (`e2e/standalone.spec.ts`, `e2e/accessibility.spec.ts`, etc.) runs entirely against a mocked A2A backend — `.github/workflows/e2e.yml` invokes it with `VITE_MOCK_A2A=true`, and `standalone.spec.ts` further mocks individual SSE responses via `page.route()`. This gives fast, deterministic UI regression coverage, but has never verified the console against a real running Kubernaut backend.

`docs/integration-guide.md` formally documents the A2A/MCP contract the console expects from any backend, including a "Minimal Implementation Checklist" for compatible implementations. Upstream kubernaut's own `test/e2e/apifrontend/` suite (Go, headless HTTP/SSE clients) verifies the server side of that same contract, but never renders the actual console UI or exercises real browser behavior. No test today proves both sides remain compatible end-to-end — a real signal ingested, a real investigation run, a real remediation executed, and the actual console UI rendering all of it correctly in a browser.

Two constraints shape the decision:

1. **The console must stay decoupled from kubernaut.** Per [ADR-007](007-multi-platform-plugin-architecture.md) and explicit product direction, this console is a reference/demo implementation, not a mandatory customer-facing component — customers are expected to bring their own UI against the same `integration-guide.md` contract. Coupling kubernaut's CI/release process to this console's test suite would invert that relationship and make an optional component load-bearing for the platform.
2. **kubernaut's CI publishes no durable artifacts.** `ci-pipeline.yml` is explicitly "Artifact-Based, No Registry": service images are `docker save`d and uploaded as GitHub Actions artifacts with `retention-days: 2`, downloaded only by downstream jobs within the *same* workflow run (see the `load-ci-images` composite action and the Helm-smoke job's `download-artifact` step). There is no ghcr.io/registry publishing to depend on, and no cross-repo/cross-day artifact contract.

## Decision

### 1. Ownership

`kubernaut-console` owns and runs the live E2E suite entirely. kubernaut carries zero references to, dependencies on, or required checks involving `kubernaut-console`.

### 2. Contract authority

`docs/integration-guide.md` remains the single source of truth for the A2A/MCP contract. Both repos verify against it independently:

- kubernaut's `apifrontend` E2E tier verifies the server side (headless Go clients).
- `kubernaut-console`'s new live suite verifies the client side (real browser, real backend).

Neither repo takes a source-level or CI-level dependency on the other beyond the disposable, one-directional build step described next.

### 3. Cluster provisioning: build kubernaut from source, then drive upstream's own `fullpipeline` E2E harness as a black box

This decision was revised after a preflight spike read the actual kubernaut source (Makefile, `ci-pipeline.yml`, `test/infrastructure/fullpipeline_e2e.go`) rather than relying on `E2E_SERVICE_DEPENDENCY_MATRIX.md` alone, which turned out to be stale/incomplete on several points below.

Console's nightly workflow:

1. Resolves the latest commit on kubernaut `main` with a green `ci-pipeline.yml` run:
   ```bash
   gh run list --repo jordigilh/kubernaut --workflow=ci-pipeline.yml \
     --branch=main --status=success --limit=1 --json headSha
   ```
   Verified live: this command works today against the real repo and returns a usable `headSha`.
2. Shallow-checks out kubernaut at that SHA into a scratch directory.
3. Builds every image `test/infrastructure/fullpipeline_e2e.go`'s `fullPipelineImageConfigs` needs, in parallel (§4), using kubernaut's own Dockerfiles.
4. Loads those images and hands off to kubernaut's own `make test-e2e-fullpipeline` target with `PRESERVE_E2E_CLUSTER=true` set:
   ```bash
   PRESERVE_E2E_CLUSTER=true make test-e2e-fullpipeline
   ```
   This is the exact target upstream itself defines (`Makefile:883-891`: `$(GINKGO) -v --race --timeout=50m --procs=$(TEST_PROCS) ./test/e2e/fullpipeline/...`) and already runs in kubernaut's own CI (`ci-pipeline.yml` E2E matrix, `service: fullpipeline`). It builds/loads whatever images weren't pre-supplied, creates the Kind cluster, deploys **every** service the full remediation lifecycle needs (including Dex — see §5), seeds the real workflow catalog fixtures, and runs kubernaut's own full-lifecycle assertions. `PRESERVE_E2E_CLUSTER=true` (`suite_test.go:365-372`, an existing, documented escape hatch — not a console-side patch) skips upstream's teardown and leaves the cluster + kubeconfig behind instead of deleting it.
5. Console's own `e2e/live/` Playwright suite then runs against the preserved cluster's chart-pinned NodePorts (verified in `test/e2e/fullpipeline/suite_test.go`/`06_af_audit_trace_test.go`): Gateway `http://localhost:30080`, DataStorage `https://localhost:30081`, API Frontend `https://localhost:30443` (self-signed TLS), Dex `https://localhost:5556/dex`.
6. Console deletes the Kind cluster itself afterward (`kind delete cluster --name fullpipeline-e2e`), since step 4 intentionally skipped upstream's own cleanup.

This is a **build-time-only, read-only, disposable dependency**: nothing from kubernaut ships in console's repo or release artifacts, and kubernaut has no knowledge this happens (its own `PRESERVE_E2E_CLUSTER` flag and `load-ci-images` action exist for its own CI's benefit; console just also happens to be a valid caller). Building from source — rather than depending on kubernaut's own CI artifacts (2-day retention, single-run scoped) — remains the right call for the reasons in the Context section; running upstream's own `fullpipeline` suite as the bootstrap/deploy driver, instead of console hand-rolling Kind manifests and service wiring, avoids reimplementing infrastructure that already exists, is already tested, and will track upstream's own future changes (new services, port/config changes) automatically.

### 4. Build parallelization

Mirror upstream's own matrix-build pattern and plug directly into its own prebuilt-artifact fast path — this isn't a new mechanism console invents, it's the exact one `ci-pipeline.yml` already uses to make its own `fullpipeline` E2E job fast (20 min, vs. `test-e2e-fullpipeline`'s ~30-50 min stand-alone estimate in the Makefile, precisely because the images don't need to be (re)built serially inside the suite):

- Matrix over every entry in `fullPipelineImageConfigs` (`test/infrastructure/fullpipeline_e2e.go:97-111` — 13 images, all Go-built: `gateway`, `signalprocessing`, `remediationorchestrator`, `aianalysis`, `workflowexecution`, `notification`, `datastorage`, `authwebhook`, `kubernautagent`, `mock-llm`, `effectivenessmonitor`, `apifrontend`, `fleetmetadatacache`) plus `db-migrate`, built the same way `ci-pipeline.yml`'s own `build-images`/`build-infra-images` jobs do (`docker build --build-arg GOFLAGS=-cover -t localhost/<service>:<tag> -f <dockerfile> .`, after `make generate`).
- amd64 only — no arm64 leg (irrelevant on GitHub-hosted runners; matches upstream's own `fullpipeline` job, which only needs amd64).
- `fail-fast: false` — one broken service shouldn't hide unrelated results.
- Each leg: build → `docker save` → `actions/upload-artifact`, named `image-<service>-amd64` (this exact naming is required — see next point) — scoped to this single console workflow run.
- The downstream job reuses kubernaut's **own** composite action directly, cross-repo, pinned to the resolved SHA — `uses: jordigilh/kubernaut/.github/actions/load-ci-images@<sha>` — rather than console reimplementing the download/load logic. That action is generic (downloads `image-*-amd64` artifacts from the current run, `podman load`s them) and has no kubernaut-repo-specific assumptions, so it works unmodified when invoked from console's own workflow run.
- The same tag used when building (`KUBERNAUT_CI_ARTIFACT_TAG=<tag>`) must be exported before invoking `make test-e2e-fullpipeline`: `test/infrastructure/e2e_images.go`'s `resolvePrebuiltCIArtifact()` checks `localhost/<service>:<tag>` and, when found, skips building that service entirely — this is the identical mechanism `ci-pipeline.yml`'s own `e2e-tests`/`integration-tests` jobs rely on (`KUBERNAUT_CI_ARTIFACT_TAG: ${{ needs.build-images.outputs.tag }}`).
- `kubernautagent` (contrary to `E2E_SERVICE_DEPENDENCY_MATRIX.md`, which describes it as a separate Python component) is a plain Go service in the same matrix, built identically to the rest — confirmed by reading its Dockerfile and the Makefile's `CROSS_SERVICES`/`BINARY_NAME_kubernautagent` entries. No separate build step is needed.

### 5. Scope — Phase 1 (single-cluster only, no fleet)

Rather than a hand-curated service list (which the original draft of this ADR had, based on the dependency-matrix doc — since shown to be incomplete/stale), phase 1 scope is simply **whatever `test/e2e/fullpipeline` (invoked with its fleet provisioner left `nil`) already deploys**, which is a verified superset of the originally-considered minimal set:

| Category | Services |
|---|---|
| Core RR pipeline | `gateway`, `datastorage`, `signalprocessing`, `remediationorchestrator`, `authwebhook`, `aianalysis`, `kubernautagent`, `mock-llm`, `workflowexecution`, `apifrontend` |
| Along for the ride (built/deployed by `fullpipeline` regardless) | `notification`, `effectivenessmonitor`, Prometheus, Alertmanager, event-exporter/mock-slack |
| Auth | **Dex** (real OIDC provider — see below) |
| Data | PostgreSQL 16, Redis |
| Explicitly excluded (fleet-only, stripped by passing `fleetProvisioner=nil`) | EAIGW/Kuadrant MCP Gateway, `kube-mcp-server`, Keycloak, `fleetmetadatacache` deployment (image still builds, chart-disabled), multi-cluster OCM scenarios |

- **No Tekton.** Confirmed independent code path: `WorkflowExecution`'s `JobExecutor` (`pkg/workflowexecution/executor/job.go`) creates plain `batchv1.Job`s and never touches Tekton types; Tekton is only registered at controller startup if its CRDs are discovered in-cluster, and `fullpipeline`'s own Helm values leave Tekton config empty. `execution.engine: job` is explicit per-workflow, not a fallback.
- **Dex/OIDC is required, not excluded.** Preflight correction: the original draft excluded Dex, assuming AF had a test/dev auth bypass. It does not — `apifrontend`'s own E2E suite (`test/e2e/apifrontend/helpers_test.go`) proves every legitimate call needs a real Dex-issued, JWKS-validated JWT, and `fullpipeline` already deploys Dex for exactly this reason (`fullpipeline_e2e.go`, `deployDexOIDCProviderForAF`). Console's live suite fetches a token the same way upstream's own tests do: an OAuth2 ROPC POST to `https://localhost:5556/dex/token` (client `kubernaut-apifrontend`).
- **Real workflow catalog fixtures**, not invented "echo bundle" images — `fullpipeline` already seeds `crashloop-config-fix-v1`, `oomkill-increase-memory-v1`, and `fix-certificate-v1` via its own `SynchronizedBeforeSuite`, backed by real (if minimal) remediation scripts (`test/fixtures/workflows/*/remediate.sh`). Console's suite validates against these real, already-registered workflows rather than needing its own fixture set.

### 6. Cadence

Scheduled nightly, plus `workflow_dispatch` for on-demand runs (e.g. validating a contract-affecting change before merge). Not part of the PR-blocking `e2e.yml` gate — a from-source, multi-service Kind bootstrap is too slow/heavy to run on every PR.

### 7. Suite location

`e2e/live/`, a separate Playwright project from the existing mocked suite, run via a new `.github/workflows/e2e-live.yml`.

## Alternatives Considered

### A. Host the live E2E suite in kubernaut itself

Rejected — would make an optional, customer-replaceable UI a required, coupled component of the platform's CI, inverting the intended relationship (ADR-007; customers may bring their own console).

### B. Consume kubernaut's ghcr.io images

Rejected — kubernaut's CI no longer publishes to a registry; it is deliberately "Artifact-Based, No Registry."

### C. Cross-repo fetch of kubernaut's own CI artifacts

Rejected — 2-day retention and single-workflow-run scoping make this fragile and run against the grain of how those artifacts are designed to be used (intra-pipeline handoff, not cross-repo/cross-day reuse).

### D. Reuse `kubernaut-demo-scenarios`' Kind manifests

Considered, not chosen for phase 1 — that repo's tooling targets manual/local demo setup, not ephemeral CI bootstrap. Revisit if a phase 2 (fleet) benefits from its multi-cluster scenario content.

### E. Run on every PR

Rejected for now — the cost/flakiness of a multi-service, from-source Kind bootstrap is too high for a PR-blocking gate. Nightly + on-demand balances signal freshness against CI cost.

### F. Full fleet/multi-cluster scope in phase 1

Rejected — defer until the single-cluster remediation flow is proven; avoids over-scoping the first iteration.

### G. Hand-curate a minimal 10-service subset with a console-authored Kind bootstrap

This was the original draft of this ADR. Rejected after a preflight spike found `test/infrastructure/fullpipeline_e2e.go` (invoked with `fleetProvisioner=nil`) already *is* an existing, tested, single-cluster/no-Tekton/no-fleet bootstrap for the full remediation lifecycle — reimplementing a hand-picked subset of it in console would duplicate real infrastructure code, drift from upstream's own service/port/config changes over time, and (per the Dex finding in §5) would have shipped with an infeasible scope decision (excluding a service, Dex, that `apifrontend` hard-requires). Driving upstream's own `make test-e2e-fullpipeline` with `PRESERVE_E2E_CLUSTER=true` as a black box is strictly less code and lower drift risk, at the cost of pulling in a few non-essential services (§5) console doesn't strictly need.

## Consequences

### Positive

- Real, browser-driven verification of the console against a genuinely running signal → investigation → remediation pipeline, closing the gap left by the fully-mocked existing suite.
- Zero new coupling in kubernaut's repo/CI — console remains a client of a documented contract, consistent with its role as an optional/replaceable reference implementation.
- Reuses upstream's own build recipes, its `KUBERNAUT_CI_ARTIFACT_TAG` prebuilt-artifact fast path, its `load-ci-images` composite action (referenced cross-repo, unmodified), and its entire `fullpipeline` bootstrap/deploy/seed orchestration as a black box. Console writes almost no new infrastructure code, and automatically absorbs upstream's own future changes (new services, port/config changes) without this ADR or console's workflow needing to track them individually.
- As a side effect, every nightly run also re-validates kubernaut's own full-lifecycle assertions (`test/e2e/fullpipeline`'s own specs), not just console's UI — free additional signal.
- Nightly cadence surfaces contract drift within ~24h without slowing PR feedback loops.

### Negative

- Console CI takes on a nontrivial new capability: building ~13 Go services in parallel from kubernaut source every night.
- Deeper coupling to upstream's *test infrastructure* internals than originally scoped: not just Dockerfiles, but specific Makefile targets (`test-e2e-fullpipeline`), an env var contract (`PRESERVE_E2E_CLUSTER`, `KUBERNAUT_CI_ARTIFACT_TAG`), a Go symbol (`fullPipelineImageConfigs`, indirectly, via its build list), fixed NodePort assumptions, and a cross-repo composite action reference. All of this is upstream's own internal test tooling, not a published/versioned API — if upstream renames or restructures any of it, console's nightly workflow breaks until updated. This is still build-time-only and disposable, but the blast radius of an upstream refactor is larger than the original "just Dockerfiles" framing implied.
- Larger footprint than originally scoped: `fullpipeline` unconditionally also builds/deploys `notification`, `effectivenessmonitor`, Prometheus, Alertmanager, and event-exporter/mock-slack (~6GB RAM total) even though console doesn't need them — accepted as the cost of reusing tested infrastructure rather than hand-curating a leaner set (see Alternative G).
- No durable version pin — testing against kubernaut's "latest green main" means a console failure could stem from an upstream regression the console can't fix directly. Failures need clear attribution (upstream `fullpipeline` suite failure vs. console Playwright failure) via separated job steps/logs — notably, `PRESERVE_E2E_CLUSTER=true` preserves the cluster even if upstream's own specs fail, so console's Playwright suite may still run against a partially-degraded backend; this needs an explicit CI policy (documented separately in the implementation plan).
- Requires a PAT (or equivalent) with read access to kubernaut's Actions API to resolve the latest green SHA cross-repo.

### Neutral

- Fleet/multi-cluster live E2E is explicitly deferred; this ADR covers phase 1 (single-cluster) only.
- Dropping Tekton for phase 1 means `workflowexecution`'s Tekton-based execution path (used elsewhere upstream) is not exercised by this suite — only the plain-Job execution path is covered.

## References

- [Integration Guide](../integration-guide.md) — the A2A/MCP contract this suite validates
- [ADR-007: Multi-Platform Plugin Architecture](007-multi-platform-plugin-architecture.md) — establishes the console as an optional, platform-agnostic reference UI
- `kubernaut` `Makefile:883-891` — `test-e2e-fullpipeline` target, the black-box entrypoint this ADR drives
- `kubernaut` `test/infrastructure/fullpipeline_e2e.go` — `fullPipelineImageConfigs` (image list) and `SetupFullPipelineInfrastructure` (bootstrap orchestration) this ADR reuses
- `kubernaut` `test/e2e/fullpipeline/suite_test.go` — `PRESERVE_E2E_CLUSTER` escape hatch and chart-pinned NodePort values this ADR depends on
- `kubernaut` `.github/workflows/ci-pipeline.yml` — source of the matrix-build pattern and `KUBERNAUT_CI_ARTIFACT_TAG` prebuilt-artifact handoff reused here
- `kubernaut` `.github/actions/load-ci-images/action.yml` — generic composite action reused cross-repo, unmodified
- `kubernaut` `pkg/workflowexecution/executor/job.go` — confirms the plain-Job execution path is fully independent of Tekton
- `kubernaut` `test/e2e/apifrontend/helpers_test.go` — confirms Dex/OIDC has no test bypass, motivating its inclusion in phase 1 scope
- `kubernaut` `test/e2e/E2E_SERVICE_DEPENDENCY_MATRIX.md` — background context only; several claims in it (mock-llm Dockerfile path, kubernautagent being Python, apifrontend's standalone Dex requirement) were found stale/incomplete during this ADR's preflight and should not be trusted without cross-checking source
