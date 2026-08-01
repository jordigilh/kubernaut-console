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

### 3. Cluster provisioning: build kubernaut from source, on demand

Console's nightly workflow:

1. Resolves the latest commit on kubernaut `main` with a green `ci-pipeline.yml` run:
   ```bash
   gh run list --repo jordigilh/kubernaut --workflow=ci-pipeline.yml \
     --branch=main --status=success --limit=1 --json headSha
   ```
2. Shallow-checks out kubernaut at that SHA into a scratch directory.
3. Builds only the services phase 1 needs (below) using kubernaut's own `make` targets and Dockerfiles as a black box — no reimplementation of their build system.

This is a **build-time-only, read-only, disposable dependency**: nothing from kubernaut ships in console's repo or release artifacts, and kubernaut has no knowledge this happens. It exists specifically because kubernaut's own CI artifacts (2-day retention, single-run scoped) are not designed for cross-repo/cross-day reuse — rebuilding from source sidesteps that fragility entirely instead of fighting it.

### 4. Build parallelization

Mirror upstream's own matrix-build pattern, rightsized:

- Matrix over the Go services in scope (not all 12 — only what phase 1 exercises).
- amd64 only — no arm64 leg (irrelevant on GitHub-hosted runners).
- `fail-fast: false` — one broken service shouldn't hide unrelated results.
- Each leg: build → `docker save` → `actions/upload-artifact` (scoped to this single console workflow run — this is the valid, intended use of the mechanism; only cross-repo/cross-run reuse of *kubernaut's* artifacts was rejected).
- A single downstream job downloads everything (`pattern: image-*`, `merge-multiple: true`) and `kind load image-archive`s each tarball — the same handoff shape upstream already uses for its Helm-smoke job.
- `kubernaut-agent` (Python) is built via a separate step outside the Go matrix.

### 5. Scope — Phase 1 (single-cluster only, no fleet)

| Services | Dependencies |
|---|---|
| `gateway`, `datastorage`, `signalprocessing`, `remediationorchestrator`, `authwebhook`, `aianalysis`, `kubernaut-agent`, `mock-llm`, `workflowexecution`, `apifrontend` | PostgreSQL 16, Redis |

- **No Tekton.** `workflowexecution` executes remediation via a plain Kubernetes Job, not the Tekton pipeline path used elsewhere upstream — keeps the Kind footprint and setup simpler for phase 1.
- **Minimal workflow catalog** backed by lightweight "echo bundle" OCI execution bundles (reusing the existing INT/E2E convention already used upstream), not real demo workflow images. The goal is validating the console's rendering/wiring of a real RR lifecycle, not workflow operational logic.
- **Explicitly excluded from phase 1**: fleet, EAIGW, kube-mcp-server, multi-cluster OCM scenarios, Dex/OIDC. Revisit once single-cluster remediation is proven end-to-end.

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

## Consequences

### Positive

- Real, browser-driven verification of the console against a genuinely running signal → investigation → remediation pipeline, closing the gap left by the fully-mocked existing suite.
- Zero new coupling in kubernaut's repo/CI — console remains a client of a documented contract, consistent with its role as an optional/replaceable reference implementation.
- Reuses upstream's own build system and matrix pattern rather than inventing a parallel one, reducing maintenance drift.
- Nightly cadence surfaces contract drift within ~24h without slowing PR feedback loops.

### Negative

- Console CI takes on a nontrivial new capability: building ~7 Go services + 1 Python service from kubernaut source, increasing nightly runtime and requiring awareness of kubernaut's build tooling (Makefile targets, Dockerfile paths) to avoid silent breakage if upstream refactors its build system.
- No durable version pin — testing against kubernaut's "latest green main" means a console failure could stem from an upstream regression the console can't fix directly. Failures need clear attribution (kubernaut build failure vs. console E2E failure) via separated job steps/logs.
- Requires a PAT (or equivalent) with read access to kubernaut's Actions API to resolve the latest green SHA cross-repo.

### Neutral

- Fleet/multi-cluster live E2E is explicitly deferred; this ADR covers phase 1 (single-cluster) only.
- Dropping Tekton for phase 1 means `workflowexecution`'s Tekton-based execution path (used elsewhere upstream) is not exercised by this suite — only the plain-Job execution path is covered.

## References

- [Integration Guide](../integration-guide.md) — the A2A/MCP contract this suite validates
- [ADR-007: Multi-Platform Plugin Architecture](007-multi-platform-plugin-architecture.md) — establishes the console as an optional, platform-agnostic reference UI
- `kubernaut` `test/e2e/E2E_SERVICE_DEPENDENCY_MATRIX.md` — authoritative service dependency tiers this ADR's phase 1 scope is derived from
- `kubernaut` `.github/workflows/ci-pipeline.yml` — source of the matrix-build and artifact-handoff patterns reused here
