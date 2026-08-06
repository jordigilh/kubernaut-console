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
5. Console's own `e2e/live/` Playwright suite then runs against the preserved cluster's chart-pinned NodePorts (verified in `test/e2e/fullpipeline/suite_test.go`/`06_af_audit_trace_test.go`): Gateway `http://localhost:30080`, DataStorage `https://localhost:30081`, API Frontend `https://localhost:30443` (self-signed TLS), Dex `https://localhost:30556/dex` (self-signed TLS).
6. Console deletes the Kind cluster itself afterward (`kind delete cluster --name fullpipeline-e2e`), since step 4 intentionally skipped upstream's own cleanup.

This is a **build-time-only, read-only, disposable dependency**: nothing from kubernaut ships in console's repo or release artifacts, and kubernaut has no knowledge this happens (its own `PRESERVE_E2E_CLUSTER` flag and `load-ci-images` action exist for its own CI's benefit; console just also happens to be a valid caller). Building from source — rather than depending on kubernaut's own CI artifacts (2-day retention, single-run scoped) — remains the right call for the reasons in the Context section; running upstream's own `fullpipeline` suite as the bootstrap/deploy driver, instead of console hand-rolling Kind manifests and service wiring, avoids reimplementing infrastructure that already exists, is already tested, and will track upstream's own future changes (new services, port/config changes) automatically.

### 4. Build parallelization

Mirror upstream's own matrix-build pattern and plug directly into its own prebuilt-artifact fast path — this isn't a new mechanism console invents, it's the exact one `ci-pipeline.yml` already uses to make its own `fullpipeline` E2E job fast (20 min, vs. `test-e2e-fullpipeline`'s ~30-50 min stand-alone estimate in the Makefile, precisely because the images don't need to be (re)built serially inside the suite):

- Matrix over every entry in `fullPipelineImageConfigs` (`test/infrastructure/fullpipeline_e2e.go:97-111` — 13 images, all Go-built: `gateway`, `signalprocessing`, `remediationorchestrator`, `aianalysis`, `workflowexecution`, `notification`, `datastorage`, `authwebhook`, `kubernautagent`, `mock-llm`, `effectivenessmonitor`, `apifrontend`, `fleetmetadatacache`) plus `db-migrate`, built the same way `ci-pipeline.yml`'s own `build-images`/`build-infra-images` jobs do (`docker build --build-arg GOFLAGS=-cover -t localhost/<service>:<tag> -f <dockerfile> .`, after `make generate`). Per §5's Gateway finding, this can drop to 12 once excluding Gateway from the deploy is actually wired up — not assumed done by this ADR.
- amd64 only — no arm64 leg (irrelevant on GitHub-hosted runners; matches upstream's own `fullpipeline` job, which only needs amd64).
- `fail-fast: false` — one broken service shouldn't hide unrelated results.
- Each leg: build → `docker save` → `actions/upload-artifact`, named `image-<service>-amd64` (this exact naming is required — see next point) — scoped to this single console workflow run.
- The downstream job reuses kubernaut's **own** composite action directly, cross-repo, pinned to the resolved SHA — `uses: jordigilh/kubernaut/.github/actions/load-ci-images@<sha>` — rather than console reimplementing the download/load logic. That action is generic (downloads `image-*-amd64` artifacts from the current run, `podman load`s them) and has no kubernaut-repo-specific assumptions, so it works unmodified when invoked from console's own workflow run.
- The same tag used when building (`KUBERNAUT_CI_ARTIFACT_TAG=<tag>`) must be exported before invoking `make test-e2e-fullpipeline`: `test/infrastructure/e2e_images.go`'s `resolvePrebuiltCIArtifact()` checks `localhost/<service>:<tag>` and, when found, skips building that service entirely — this is the identical mechanism `ci-pipeline.yml`'s own `e2e-tests`/`integration-tests` jobs rely on (`KUBERNAUT_CI_ARTIFACT_TAG: ${{ needs.build-images.outputs.tag }}`).
- `kubernautagent` (contrary to `E2E_SERVICE_DEPENDENCY_MATRIX.md`, which describes it as a separate Python component) is a plain Go service in the same matrix, built identically to the rest — confirmed by reading its Dockerfile and the Makefile's `CROSS_SERVICES`/`BINARY_NAME_kubernautagent` entries. No separate build step is needed.
- **Registry-pull mode (`IMAGE_REGISTRY`+`IMAGE_TAG` set to a real registry URL) was considered and rejected**: it's a real code path in `fullpipeline_e2e.go:79-82`/`InstallFullPipelineHelmChart`, but grepping `ci-pipeline.yml` shows upstream's own CI never actually exercises it with a real registry — every live usage is either `KUBERNAUT_CI_ARTIFACT_TAG` or `IMAGE_REGISTRY=localhost` (a local-tag naming convention, not a network pull). Using the untested registry-pull path would also require console to stand up new registry infrastructure (auth, `imagePullSecrets`, package cleanup) that cuts against reusing upstream's own proven mechanism.
- **`KUBERNAUT_CI_ARTIFACT_TAG` only skips the build half, not the Kind-load half.** `resolvePrebuiltCIArtifact()` short-circuits `BuildImageForKind`'s compile+`docker build` step once it finds the image already in the local podman store — but `GetImagePullPolicy()` still returns `Never` in this mode, so `SetupFullPipelineInfrastructure`'s own `kind load image-archive` step still runs for every image, same as local dev. That's fine: the load step is cheap (seconds per image, no build); the ~30-50min→20min speedup upstream's own CI gets from this mechanism comes entirely from skipping compilation, which is exactly the part parallelizing across GitHub-hosted runners buys us.

### 5. Scope — Phase 1 (single-cluster only, no fleet)

Rather than a hand-curated service list (which the original draft of this ADR had, based on the dependency-matrix doc — since shown to be incomplete/stale), phase 1 scope is simply **whatever `test/e2e/fullpipeline` (invoked with its fleet provisioner left `nil`) already deploys**, which is a verified superset of the originally-considered minimal set:

| Category | Services |
|---|---|
| Core RR pipeline | `datastorage`, `signalprocessing`, `remediationorchestrator`, `authwebhook`, `aianalysis`, `kubernautagent`, `mock-llm`, `workflowexecution`, `apifrontend` |
| Deployed by `fullpipeline` today, but not required by console's own suite | `gateway` (console's suite is chat/A2A/MCP-driven — see §3's scope note and §6 — and never exercises Gateway's webhook-ingestion path), `notification`, `effectivenessmonitor`, Prometheus, Alertmanager, event-exporter/mock-slack |
| Auth | **Dex** (real OIDC provider — see below) |
| Data | PostgreSQL 16, Redis |
| Explicitly excluded (fleet-only, stripped by passing `fleetProvisioner=nil`) | EAIGW/Kuadrant MCP Gateway, `kube-mcp-server`, Keycloak, `fleetmetadatacache` deployment (image still builds, chart-disabled), multi-cluster OCM scenarios |

- **Gateway is not required by console's suite and can be excluded to shrink the footprint.** Confirmed by the project maintainer (2026-08-01): the chart supports deploying without Gateway, and since none of console's `e2e/live/` scenarios go through Gateway's webhook ingestion path (they're chat-initiated, per §3's scope note), the matrix build in §4 can drop the `gateway` image/leg once the CI harness is actually implemented — one fewer image to build/load per nightly run. Left in today's phase-1 table above as "deployed but not required" rather than already removed: `InstallFullPipelineHelmChart` (`fullpipeline_e2e_helm.go`) currently hardcodes a fixed, closed `--set` list with no passthrough for extra overrides, so actually excluding it needs either an upstream change to that function or console patching the install step post-hoc — real implementation work for issue #39's next phase, not assumed done by this ADR.
- **No Tekton.** Confirmed independent code path: `WorkflowExecution`'s `JobExecutor` (`pkg/workflowexecution/executor/job.go`) creates plain `batchv1.Job`s and never touches Tekton types; Tekton is only registered at controller startup if its CRDs are discovered in-cluster, and `fullpipeline`'s own Helm values leave Tekton config empty. `execution.engine: job` is explicit per-workflow, not a fallback.
- **Dex/OIDC is required, not excluded.** Preflight correction: the original draft excluded Dex, assuming AF had a test/dev auth bypass. It does not — `apifrontend`'s own E2E suite (`test/e2e/apifrontend/helpers_test.go`) proves every legitimate call needs a real Dex-issued, JWKS-validated JWT, and `fullpipeline` already deploys Dex for exactly this reason (`fullpipeline_e2e.go`, `deployDexOIDCProviderForAF`). Console's live suite fetches a token the same way upstream's own tests do: an OAuth2 ROPC POST to `https://localhost:30556/dex/token` (client `kubernaut-apifrontend`, secret `e2e-client-secret`, user `sre@kubernaut.ai`/`password` — all synthetic Kind-only fixtures committed in `deploy/apifrontend/overlays/e2e/dex.yaml` upstream, verified 2026-08-01). See §8 for how that token reaches the *browser*, which this ADR's first draft did not address.
- **Real workflow catalog fixtures**, not invented "echo bundle" images — `fullpipeline` already seeds `crashloop-config-fix-v1`, `oomkill-increase-memory-v1`, and `fix-certificate-v1` via its own `SynchronizedBeforeSuite`, backed by real (if minimal) remediation scripts (`test/fixtures/workflows/*/remediate.sh`). Console's suite validates against these real, already-registered workflows rather than needing its own fixture set.

### 6. Cadence

Scheduled nightly, plus `workflow_dispatch` for on-demand runs (e.g. validating a contract-affecting change before merge). Not part of the PR-blocking `e2e.yml` gate — a from-source, multi-service Kind bootstrap is too slow/heavy to run on every PR.

### 7. Suite location

`e2e/live/`, a separate Playwright project from the existing mocked suite, run via a new `.github/workflows/e2e-live.yml`.

### 8. Console-side authentication

Gap found while drafting the actual `e2e/live/` suite (not covered by this ADR's original text): every `KubernautAuthProvider` implementation the console ships (`ProxyAuthProvider`, the only one that exists before this ADR) assumes an oauth2-proxy sits in front of the whole console+backend, injecting `Authorization` server-side and answering `/oauth2/userinfo` — `getToken()` is a literal no-op (`return ""`). `fullpipeline` deploys no oauth2-proxy; nothing in kubernaut's own bootstrap stands one up, and provisioning one (Dex client registration, redirect URIs, session cookie store) is new console-side infrastructure this ADR never scoped.

Standing up a real oauth2-proxy was considered and deferred (Alternative H below). Instead, `LiveE2EAuthProvider` (`packages/standalone/src/LiveE2EAuthProvider.ts`) authenticates the console's live-suite build the same way kubernaut's own Go E2E suites authenticate to AF directly (`fpFetchDEXToken`/`getAFToken` in `test/e2e/fullpipeline`): a Dex ROPC token, fetched once before the console's dev server starts (`e2e/live/scripts/start-console-with-token.mjs`), baked into the bundle as `VITE_LIVE_E2E_TOKEN`, and attached client-side as `Authorization: Bearer <token>` — a code path `streamA2A`/`callMcpTool` already support (`token`/`getToken` options), unused until now because `ProxyAuthProvider` never populated it. `App.tsx` selects this provider only when `VITE_LIVE_E2E_TOKEN` is set; every other mode is unaffected.

This surfaced a second, more interesting finding: `charts/kubernaut/values.yaml`'s `sre` persona ACL (the Dex test user this token authenticates as) lists `kubernaut_approve`/`kubernaut_complete` but not `kubernaut_complete_no_action` — the exact MCP tool the console's Dismiss/Escalate buttons call. Rather than switching to a different test persona to dodge this, `e2e/live/approval-gate.spec.ts`'s dismiss test asserts the real MCP response directly and fails with an explanatory message if this is a live authorization gap — this is precisely the class of contract drift this whole ADR exists to catch, so the suite surfaces it instead of working around it.

### 9. First real-cluster run: found a genuine AF/KA contract violation, not a console bug

Manually ran the full `e2e/live/` suite against a real, locally-built `fullpipeline` cluster (2026-08-02) to validate the harness end-to-end before wiring up CI. 8 of 9 tests failed, all the same way: the `investigation_summary` artifact never rendered.

**Root cause, confirmed by directly `curl`ing `/a2a/invoke`**: AF returned a bare `TextPart` containing stringified, near-empty JSON instead of the documented `DataPart` with `metadata.type: "investigation_summary"`. This traces to [kubernaut#1818](https://github.com/jordigilh/kubernaut/issues/1818) ("orphaned RCA when autonomous investigation completes before AF's interactive upgrade/subscribe arrives"): a single free-form chat message — the console's real, only investigation entry point — routes through AA's autonomous submit path (`RequestBuilder` never sets `Interactive`), and mock-llm's near-instant response reliably wins the race against AF's interactive-session upgrade, so KA orphans the real RCA behind an RCA-less placeholder session.

**This is an AF/KA defect, not a console one.** The console's contract-parsing logic (`useChat.ts`) correctly requires a `DataPart` with the documented `metadata.type` to render the RCA card, exactly per `docs/integration-guide.md`, and correctly declined to render the malformed fallback payload as a valid investigation.

**A workaround was considered and rejected**: kubernaut's own `test/e2e/fullpipeline/15_af_a2a_interactive_streaming_test.go` mitigates the same race by splitting "create the RR" and "investigate" into two separate turns of literal text (`"create interactive-streaming remediation..."`, then `"investigate the remediation"`), each interpreted by AF's Gemini-based agent as a distinct tool invocation. This is that Go test's own low-level way of driving AF's A2A endpoint directly over HTTP with no UI — it is not a protocol the console's actual UI implements or a real SRE would use. Checking `ChatContainer.tsx` confirms every console decision point (Approve, Decline, "No action needed", workflow Execute) is a **direct MCP tool call from a button click** (`callMcpTool("kubernaut_approve", ...)`, etc.), never chat text, and there is no console concept of a scripted "discover workflows"/"select workflow X" message. Adopting the Go test's multi-turn text shape in `e2e/live/` would have produced a false-green suite — passing by exercising a usage pattern the console doesn't implement, while a real SRE's actual single-message flow would still hit the bug in production. The suite instead keeps the single free-form message (real usage) and targets a real, always-on broken resource (`kubernaut-system/memory-eater`, genuinely `OOMKilled` — see `e2e/live/helpers.ts`'s `OOMKILL_TARGET`) instead of a fabricated one, and documents the expected failure mode via `waitForInvestigationSummaryOrKnownRace` so a recurrence reports kubernaut#1818 by name instead of an opaque timeout.

**Net effect (superseded by §10)**: every `e2e/live/` test that depends on a rendered `investigation_summary` was expected to fail against this cluster until kubernaut#1818 was fixed upstream. This was treated as the suite doing its job (surfacing a real backend regression a real SRE would hit), not as a suite defect to work around. #1818 has since been fixed (§10) — but re-validation found the suite is still blocked, by a second, distinct issue.

**Separately, a coverage-scoping question was resolved**: while investigating whether `approval-gate.spec.ts`'s real-MCP-call tests overlap with upstream's own `test/e2e/fullpipeline/05_mcp_interactive_lifecycle_test.go` (8 scenarios covering takeover/message/complete/discover_workflows/select_workflow/complete_no_action/session-contention/reconnect), tracing the endpoints showed they test different code entirely: upstream's suite connects to **KA's** `/api/v1/mcp` (port `:8088`) directly, authenticated with a Kubernetes ServiceAccount token, never AF. AF has its own, separate `/mcp` implementation (`pkg/apifrontend/handler/mcp.go`: `mcp.NewServer` + `RegisterTools(srv, cfg.Bridge)` + a persona-based `Authorizer`) — the endpoint `docs/integration-guide.md` actually documents for clients like the console — which no existing upstream test exercises at all, with any auth model. Filed as [kubernaut#1827](https://github.com/jordigilh/kubernaut/issues/1827) rather than building that coverage out here: verifying AF's own MCP authorization/dispatch/bridge-to-KA logic is upstream's responsibility, not this project's. `approval-gate.spec.ts` stays scoped to its original, narrower purpose — proving the console's own production UI code correctly drives AF's real endpoint for the actions it exposes — which remains legitimate and non-redundant regardless of #1827's resolution.

### 10. #1818 fixed upstream; re-validation found a second, distinct blocker (kubernaut#1853)

[kubernaut#1844](https://github.com/jordigilh/kubernaut/pull/1844) fixed #1818 and merged to `main` (2026-08-02). Re-validated directly rather than assuming: checked out the merge commit (`e018a4747`), waited for upstream CI's arm64 image matrix to build (12 of 13 Go services; CI only builds `mock-llm`/`db-migrate` for amd64, so those two were built locally for arm64 from the same Dockerfiles), loaded everything into a local Kind cluster via `PRESERVE_E2E_CLUSTER=true`, and ran the focused upstream regression test directly (`--label-filter=issue-1189`, covering `test/e2e/fullpipeline/06`–`15`). **4/4 passed**, including `15_af_a2a_interactive_streaming_test.go`'s exact #1818 race scenario — the fix works as advertised, for the multi-turn MCP protocol upstream's own tests use.

**`e2e/live/` still failed identically (8/9) against this fixed cluster.** Tracing it further (AF pod logs, plus a direct `curl` repro of the console's exact single-message request against the fixed cluster) found the cause is not a recurrence of #1818, but a **second, distinct defect**: [kubernaut#1853](https://github.com/jordigilh/kubernaut/issues/1853).

**Mechanism**: the `fullpipeline` E2E harness's mock-llm scenarios (`test/infrastructure/shared_e2e.go`'s `afKeywordYAML`) are naive keyword matches, scripted for the exact multi-turn phrase sequence upstream's own Go tests send as *separate* `message/stream` calls (a message matching `"<ns> remediation"`, then, as a later, separate message, one matching `"investigate"`). The console's single message — `"...OOMKilled and CrashLoopBackOff, please investigate."` — contains `"investigate"` but never `"remediation"`, so mock-llm matches its `af_investigate` scenario **directly on the first LLM call**, skipping `kubernaut_remediate` entirely. Confirmed via `kubectl logs deploy/apifrontend`: no `kubernaut_remediate` tool-call attempt precedes it at all. `af_investigate`'s scripted `rr_id` argument is a `$from_tool:kubernaut_remediate:rr_id` template (`test/services/mock-llm/handlers/gemini.go`'s `resolveGeminiTemplateArgs`), which only resolves from an already-completed `kubernaut_remediate` response in conversation history — since none exists yet, the literal, unresolved placeholder string is left in place (silently — no error from the template resolver itself) and passed to `kubernaut_investigate`, which then fails Kubernetes resource-name validation. AF retries 3 times ("re-invoking agent after text-only turn end"), then falls back to a text-only reply — the same-looking malformed `TextPart` symptom as #1818, but from an unrelated code path (mock-llm's scenario matcher, not `investigate_start.go`'s session-reattach logic #1844 fixed).

**This is a test-fixture scripting gap, not an AF/KA production defect** — a real production LLM would presumably reason through "create the RR, then investigate it" from a single natural-language instruction on its own; a hand-scripted keyword double can only replay the exact phrase sequence its author anticipated. Filed as [kubernaut#1853](https://github.com/jordigilh/kubernaut/issues/1853) with the full repro (curl command, log excerpts, source references) and a suggested fix (a new keyword scenario matching combined-intent single messages, using a `MultiToolCalls` response with a fixed shared `rr_id` rather than an unresolvable template).

**Net effect**: `waitForInvestigationSummaryOrKnownRace` and this ADR's affected tests now attribute failures to kubernaut#1853, not #1818. The suite's design (single free-form message, no synthetic multi-turn workaround, real always-on `memory-eater` fixture) is unchanged — this round of investigation validated that design decision was correct (§9's rejected-workaround reasoning still holds) rather than requiring any suite-side change.

### 11. Manually validating #1853's fix surfaced two more issues: a real console bug and a test-isolation gap

Upstream patched the shared cluster's `mock-llm-scenarios` ConfigMap directly to add the missing combined-intent scenario for #1853 (not yet in a merged PR at time of writing), which unblocked `investigation_summary` rendering — proving the fix design sound. But running the full 9-test suite repeatedly against it surfaced two further, independent problems, neither of which is #1853:

**A real console bug (kubernaut-console#43, fixed):** `useChat.ts`'s `clearHistory()` (the "New conversation" button) left `contextId` empty instead of generating a fresh one, so a reset within AF's `SessionInterceptor` idle window (BR-SESS-020, rolling ~10min) could be silently reattached server-side to the previous, already-decided session — the button's promised "new conversation" wasn't always actually new. Fixed by reusing the existing `resetContext()` helper (already used automatically on terminal completion, SC-7); backported to `release/v1.5` (kubernaut-console#44) since the same bug and code shape predate this ADR's work.

**A test-isolation gap in this suite itself, unrelated to (1)**: even with that fix, running this suite's 9 tests back-to-back against a single shared `kubernaut-system/memory-eater` target kept reproducing the same "no `investigation_summary`" symptom — traced to KubernautAgent's own per-target `session_active` dedup, which returns a lightweight "early_rca" instead of a full investigation if a prior investigation against the *same* `namespace/kind/name` is still active. This is independent of AF's session logic and isn't fixed by (1). Resolved by giving every individual test its own dedicated `memory-eater` Deployment in its own `console-e2e-<file>[-N]` namespace (see `e2e/live/helpers.ts`'s `oomkillTarget`) rather than sharing one target across tests — a deliberate, documented, manually-applied exception to §5's "pure console-driven, no privileged setup" for cluster bootstrap (not for the suite's own tests, which still never call kubectl). This bootstrap doesn't yet have a permanent, reproducible home (upstream `fullpipeline` setup vs. a console CI post-bootstrap step) — tracked as follow-up work before this suite can run unattended in CI.

### 12. Approval gate investigation: confirmed a second `sre`-persona ACL gap, not a console bug; retired the client-side audit beacon

With #1853 worked around (§11) and per-test isolation in place, `approval-gate.spec.ts`'s "approve"/"decline" tests still never exercised a real approval — always reading `isApprovalRequested()` as false. Root-caused end-to-end rather than assumed:

**Two false leads ruled out first.** (a) The OPA policy itself: `aianalysis-policies`' deployed `require_approval` rule only fires when `input.environment == "production"`, sourced from the target namespace's `kubernaut.ai/environment` label (`signalprocessing-policy`) — labeling `console-e2e-approval[-2]` with that label was necessary and correct, not a workaround. (b) Timing: `RemediationOrchestrator`'s `AnalyzingHandler` only evaluates `ApprovalRequired`/creates the `RemediationApprovalRequest` (RAR) once `AIAnalysis.Status.Phase == "Completed"`, which for an interactive session only happens after `kubernaut_select_workflow` (the real MCP call the console's "Execute" button makes, per `clickExecuteWorkflow` in `helpers.ts`) — checking for an approval gate before clicking Execute always reads false regardless of policy. Fixed by calling `clickExecuteWorkflow()` first and widening `isApprovalRequested()`'s timeout to 30s (RO's reconcile loop takes ~15s after the MCP call to actually create the RAR).

**With both of those fixed, the approval card still never rendered — even though `kubectl` confirmed the RAR was being created correctly** (`reason: "Production environment requires manual approval"`, `confidence: 0.95`). Tracing the console's own approval-rendering path (`ChatContainer.tsx`) found it already does exactly the right thing: a `useEffect` watches `useRRStatus`'s `statusMetadata.approval_request_name` (populated by AF's `POST /a2a/status` handler once `RemediationRequest.Status.Phase == "AwaitingApproval"`, via `status_types.go`'s `BuildPhaseMetadata`), and on seeing it, calls `kubernaut_get_approval_request` to fetch the full RAR (confidence, reason, recommended workflow, evidence) and render the Approve/Decline card — with an explicit, already-shipped graceful-degradation path (`.kn-approval-denied`, "Contact a team member with the approver role") if that call is denied. This is pre-existing, correct product code, not something this investigation needed to add.

**The call *is* denied**: `charts/kubernaut/values.yaml`'s (and the operator's `internal/resources/rbac.go`'s) `sre` persona ACL has `kubernaut_approve`/`kubernaut_watch` but not `kubernaut_get_approval_request` — confirmed identically present on both `main` and `release/v1.5` in both repos. This upgrades §8's `kubernaut_complete_no_action` finding from "don't yet know if intentional" to a confirmed, reproduced pattern: the `sre` persona (the only interactive-chat-capable persona, and the one this suite's Dex user authenticates as) is missing the specific *read* tools needed to act on decisions its *write* tools (`kubernaut_approve`, `kubernaut_complete_no_action`) already permit it to make. Filed as [jordigilh/kubernaut-operator#278](https://github.com/jordigilh/kubernaut-operator/issues/278) (v1.5 — the operator is the only supported production deployment path for v1.5) and [jordigilh/kubernaut#1869](https://github.com/jordigilh/kubernaut/issues/1869) (v1.6 only — the Helm chart isn't a supported production path until v1.6, so no v1.5 backport there), both superseding [kubernaut#1827](https://github.com/jordigilh/kubernaut/issues/1827)'s original "don't know if intentional" framing with a live reproduction.

**A related, initially-plausible hypothesis was ruled out**: `kubernaut_watch` (a distinct MCP tool that streams full `approval_request` SSE events) is *not* on this path at all and extending the mock-llm scenario to call it would not have fixed anything — the console's `kubernaut_get_approval_request` fetch, triggered by `/a2a/status`, is a completely independent, already-functional mechanism that needs no mock-llm scripting.

**Test behavior updated to match**: `approval-gate.spec.ts`'s "approve"/"decline" tests previously used a single `test.skip(!isApprovalRequested(...))`, which conflated two different states — "this run's policy auto-approved, nothing to test" (a legitimate skip) and "RO required approval but the console was denied the details" (a real, tracked bug). A new `assertApprovalGateReachable` helper (and `isApprovalDenied`, checking for the `.kn-approval-denied` card) now distinguishes them: only the former still skips; the latter throws a descriptive error citing both filed issues. Re-run against the live cluster (2026-08-02) with the namespace labels and per-test isolation from §11 in place: all three tests (`approve`, `decline`, `dismiss`) now fail loudly with exactly the expected, attributed error — confirming both the RBAC gap's existence and that the suite's new assertion correctly surfaces it instead of silently skipping. Expected to go green once either issue's RBAC fix lands.

**Separately, the client-side audit beacon was retired.** While investigating this flow, `/a2a/telemetry/audit` (the endpoint `emitAuditEvent()` in `packages/ui-core/src/lib/audit.ts` POSTed to via `navigator.sendBeacon`) was found to not exist on AF at all (404) — and, more fundamentally, redundant: AF already has a robust, server-side audit trail (`pkg/apifrontend/audit/audit.go`'s `EventUserDecision` etc.) that captures every user decision from the real MCP tool calls themselves, with stronger provenance (server-verified identity, not a client-asserted `user.name`/`user.email`) than a client-side beacon could ever provide. Rather than fixing the 404 or working around `sendBeacon`'s Playwright-unfriendliness, `emitAuditEvent()` was removed entirely from `ChatContainer.tsx` (execute/approve/decline/dismiss/escalate/clear-history), `audit.ts`/`audit.test.ts` were deleted, `docs/integration-guide.md`'s checklist item was dropped, and the "audit telemetry sink" test was removed from `contract-compliance.spec.ts`. `clear_history` (the one action with no corresponding MCP call, and thus no server-side audit trail either) is accepted as unaudited rather than given a bespoke new endpoint.

### 13. Full suite green: picked up #1853's real upstream fix, root-caused both remaining failures to test-repeatability artifacts (not product bugs)

With the ACL gap unblocked (§12), a full run showed 6/8 passing — 2 failures remained: `contract-compliance`'s "RR context metadata" test (`investigation_summary` never rendered again) and `full-remediation-lifecycle`'s "full flow" test (blocked by `IneffectiveChain` after reaching `Executing`). Both were root-caused with hard evidence rather than re-guessed, and neither required a console-side fix.

**"RR context metadata": upstream had already fixed it — the deployed image just predated the merge.** [jordigilh/kubernaut#1859](https://github.com/jordigilh/kubernaut/pull/1859) (the *real* #1853 fix, not §11's `fallback_arguments`-only patch) merged to kubernaut `main` at commit `964f7a642` (2026-08-02 15:04 EDT), rewriting `test/services/mock-llm/handlers/chain.go` to support arbitrarily-deep `next_tool_call` nesting resolved via `nextChainCallByCount(chain, ctx.CountToolResults())` — i.e. purely from the current request's own conversation history, with no cross-request/global state. This cluster's mock-llm image was tagged `fix-1853-148c1fc97`, built from a commit 2 hours *before* that merge (`148c1fc97`, 13:03 EDT) — the "fix-1853" tag name was aspirational, not actually containing #1859. The hand-patched ConfigMap workaround (§11) — a capped-at-1 `next_tool_call` to `discover_workflows` plus a *separate*, broadly-keyword-matched `af_present_decision_after_discovery` scenario relying on AF's reinvocation-loop retry to fire on a later turn — is the suspected source of an observed cross-session cross-talk failure (one session's `discover_workflows` response text spuriously matching another in-flight session's scenario selection). Fix: rebuilt mock-llm from kubernaut `main` @ `a8b9edd4` (includes #1859), reloaded into the Kind cluster, and rewrote the ConfigMap to use a single native 3-deep chain per target (`investigate → discover_workflows → present_decision`), removing `af_present_decision_after_discovery` entirely. Every chain step now stays scoped to the same per-request keyword match. Re-ran: passed cleanly, and the whole 8-test suite has since run clean on this design multiple times.

**"full flow": two real, but expected, RemediationOrchestrator safety mechanisms — not test-infra or product bugs.** First, `console-e2e-lifecycle`/`-2` had genuinely tripped `IneffectiveChain` (issue #214) — confirmed, not inferred, via a direct query against `action_history.audit_events`:

```sql
SELECT event_timestamp, event_data->>'target_resource' AS target,
       event_data->>'pre_remediation_spec_hash' AS pre_hash
FROM audit_events WHERE event_data->>'target_resource' LIKE '%memory-eater%'
ORDER BY event_timestamp DESC LIMIT 20;
```

showed the identical `pre_remediation_spec_hash` recurring 3 times in a row for `console-e2e-lifecycle` (20:28, 20:44, 20:59 EDT) — because today's iterative mock-llm debugging repeatedly re-ran this test against the same fixed-spec fixture faster than any successful remediation's memory bump could "stick" as the next run's new baseline. `RoutingEngine.CheckIneffectiveRemediationChain`'s hash-chain detector (`pkg/remediationorchestrator/routing/blocking.go`) correctly read that as "the same starting condition keeps recurring, stop wasting remediation cycles" and escalated to manual review — exactly as designed. Not expected to recur in real CI, where every run gets a fresh cluster/fixture with empty history. Fix for *today*: stood up a brand-new, never-before-remediated target (`console-e2e-lifecycle-3`, fresh namespace + `memory-eater` Deployment, `50Mi` limit) and added its mock-llm scenario; updated `full-remediation-lifecycle.spec.ts`'s `TARGETS.fullLifecycle` accordingly.

Second — found immediately after, on the very next full-suite run — the *same* target hit a *different* RO safety check: `CheckRecentlyRemediated` (DD-WE-001)'s 5-minute cooldown, since the standalone re-run moments earlier had already remediated it successfully (`RR ... Completed/Remediated`) and the whole-suite run repeated the identical test against the identical target inside that cooldown window (`RecentlyRemediated: Target was remediated recently... Cooldown expires: ...`). Confirmed by `kubectl get rr`: the first RR against `console-e2e-lifecycle-3` shows `Completed`/`Remediated` (proving the mock-llm chain fix works end-to-end — investigate → discover_workflows → present_decision → select_workflow → execute → verify → complete, all real MCP calls, real Job execution, real memory-limit patch); the second, 3 minutes later, shows `Failed`/`RecentlyRemediated`. Waited out the cooldown and re-ran: passed. Both blocks are the same class of finding as `IneffectiveChain` — genuine RO safety mechanisms behaving correctly against same-day repeated manual iteration against a fixed fixture, not something a fresh-per-run CI target would ever trigger, and not a reason to weaken either check.

Full suite (8/8) subsequently confirmed green in a single run.

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

### H. Stand up a real oauth2-proxy in front of the live-suite console instead of `LiveE2EAuthProvider`

Considered while resolving §8. Would exercise the exact production auth path (cookie/session, `/oauth2/userinfo`, header injection) rather than a client-side bearer token — more faithful, but requires new console-side infrastructure (Dex client registration/redirect URIs, a session store) this ADR never scoped, to re-validate a code path (`ProxyAuthProvider`, oauth2-proxy session handling) that is already a distinct, already-tracked concern (issue #36) rather than something this suite's stated goal — validating the console's own A2A/MCP contract handling — needs. Deferred; revisit if oauth2-proxy's own behavior needs live-cluster coverage.

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
- Larger footprint than originally scoped: `fullpipeline` unconditionally also builds/deploys `gateway`, `notification`, `effectivenessmonitor`, Prometheus, Alertmanager, and event-exporter/mock-slack (~6GB RAM total) even though console doesn't need them — accepted as the cost of reusing tested infrastructure rather than hand-curating a leaner set (see Alternative G). Gateway specifically is a known, confirmed-excludable candidate (§5) for a future footprint reduction once the CI harness supports it; the rest are accepted as-is.
- No durable version pin — testing against kubernaut's "latest green main" means a console failure could stem from an upstream regression the console can't fix directly. Failures need clear attribution (upstream `fullpipeline` suite failure vs. console Playwright failure) via separated job steps/logs — notably, `PRESERVE_E2E_CLUSTER=true` preserves the cluster even if upstream's own specs fail, so console's Playwright suite may still run against a partially-degraded backend; this needs an explicit CI policy (documented separately in the implementation plan).
- Requires a PAT (or equivalent) with read access to kubernaut's Actions API to resolve the latest green SHA cross-repo.

### Neutral

- Fleet/multi-cluster live E2E is explicitly deferred; this ADR covers phase 1 (single-cluster) only.
- Dropping Tekton for phase 1 means `workflowexecution`'s Tekton-based execution path (used elsewhere upstream) is not exercised by this suite — only the plain-Job execution path is covered.
- The console has no "list active remediations" / attach-by-`rr_id` UI (only chat-initiated investigation creates an `rr_id`) — `e2e/live/full-remediation-lifecycle.spec.ts` therefore drives the interactive investigation path rather than a Gateway-signal-then-attach path; the latter is exercised by kubernaut's own `fullpipeline` Go specs, not console's suite. Revisit once a console "Remediations" list view exists (see [issue #40](https://github.com/jordigilh/kubernaut-console/issues/40)).
- The `sre` test persona's ACL gap for `kubernaut_complete_no_action` (§8) and `kubernaut_get_approval_request` (§12) are confirmed real upstream bugs, not console-side concerns — filed as [jordigilh/kubernaut-operator#278](https://github.com/jordigilh/kubernaut-operator/issues/278) and [jordigilh/kubernaut#1869](https://github.com/jordigilh/kubernaut/issues/1869), not resolved by this ADR. The console's own handling of both (a friendly denied message, not a crash or hang) is correct and unaffected by whichever repo fixes the ACL.
- The client-side audit beacon (`/a2a/telemetry/audit`, `emitAuditEvent()`) found while investigating §12 was retired rather than fixed — AF's server-side, MCP-triggered audit trail (`pkg/apifrontend/audit`) already covers every decision the beacon duplicated, with stronger provenance.
- The suite's first real-cluster run (§9) found a genuine, currently-blocking upstream defect (kubernaut#1818) rather than validating a clean pass — expected and accepted for a suite whose purpose is catching exactly this class of regression. #1818 was fixed and re-validated (§10), but the suite remains red for a second, distinct reason (kubernaut#1853, a test-fixture gap); `e2e/live/`'s tests remain red against this cluster until that's fixed upstream, and this is not evidence of a suite defect.
- Deep AF `/mcp` endpoint protocol/authorization coverage (kubernaut#1827) is explicitly out of scope for this project — flagged upstream rather than built here, since it verifies AF-server-side correctness independent of any console code.
- Validating an upstream fix (§10) required rebuilding kubernaut's own CI image matrix locally for arm64 (upstream CI only validates arm64 builds, never loads/tests them, and only builds `mock-llm`/`db-migrate` for amd64) — a real, one-off cost of testing against arm64 hardware that would not exist on an amd64 CI runner, but confirms this ADR's image-handoff mechanism (§4) works for either architecture.

## References

- [Integration Guide](../integration-guide.md) — the A2A/MCP contract this suite validates
- [ADR-007: Multi-Platform Plugin Architecture](007-multi-platform-plugin-architecture.md) — establishes the console as an optional, platform-agnostic reference UI
- `kubernaut` `Makefile:883-891` — `test-e2e-fullpipeline` target, the black-box entrypoint this ADR drives
- `kubernaut` `test/infrastructure/fullpipeline_e2e.go` — `fullPipelineImageConfigs` (image list) and `SetupFullPipelineInfrastructure` (bootstrap orchestration) this ADR reuses
- `kubernaut` `test/e2e/fullpipeline/suite_test.go` — `PRESERVE_E2E_CLUSTER` escape hatch and chart-pinned NodePort values this ADR depends on
- `kubernaut` `test/infrastructure/kind-fullpipeline-config.yaml` — authoritative host-port mapping; corrected this ADR's Dex port (30556, not 5556) during `e2e/live/` drafting
- `kubernaut` `deploy/apifrontend/overlays/e2e/dex.yaml` — Dex static clients/users this suite's token-fetch helper authenticates as
- `kubernaut` `charts/kubernaut/values.yaml` (`rbac.personas`) — per-persona MCP tool ACL; source of the `kubernaut_complete_no_action` gap noted in §8
- `kubernaut` `test/services/mock-llm/scenarios/scenario_oomkilled.go` — deterministic investigation scenario `e2e/live/`'s specs trigger and assert exact values against (targeting the always-on real `kubernaut-system/memory-eater` fixture, per §9)
- [kubernaut#1818](https://github.com/jordigilh/kubernaut/issues/1818) — orphaned-RCA race this suite's first real run hit (§9); fixed by [#1844](https://github.com/jordigilh/kubernaut/pull/1844) and re-validated (§10)
- [kubernaut#1827](https://github.com/jordigilh/kubernaut/issues/1827) — AF's own `/mcp` endpoint coverage gap flagged upstream (§9), not addressed by this project
- [kubernaut#1853](https://github.com/jordigilh/kubernaut/issues/1853) — `fullpipeline` mock-llm fixture gap found while re-validating #1818's fix (§10); current blocker for every RCA-content-dependent test
- [kubernaut-operator#278](https://github.com/jordigilh/kubernaut-operator/issues/278) / [kubernaut#1869](https://github.com/jordigilh/kubernaut/issues/1869) — `sre` persona missing `kubernaut_get_approval_request` (operator's `internal/resources/rbac.go` and the Helm chart's `rbac.personas.sre`, respectively), confirmed via live reproduction (§12); current blocker for `approval-gate.spec.ts`'s approve/decline paths
- `kubernaut-operator` `internal/resources/rbac.go` (`toolPersonas`) — operator's equivalent of the Helm chart's `rbac.personas`; source of the §12 finding on the operator side
- `kubernaut` `test/infrastructure/shared_e2e.go` (`afKeywordYAML`) — the mock-llm scenario generator whose keyword-scripting gap is #1853
- `kubernaut` `test/services/mock-llm/handlers/gemini.go` (`resolveGeminiTemplateArgs`) — the `$from_tool` template-resolution mechanism behind #1853
- `kubernaut` `test/e2e/fullpipeline/05_mcp_interactive_lifecycle_test.go` / `pkg/apifrontend/handler/mcp.go` — the KA-vs-AF MCP endpoint distinction behind #1827
- `kubernaut` `.github/workflows/ci-pipeline.yml` — source of the matrix-build pattern and `KUBERNAUT_CI_ARTIFACT_TAG` prebuilt-artifact handoff reused here
- `kubernaut` `.github/actions/load-ci-images/action.yml` — generic composite action reused cross-repo, unmodified
- `kubernaut` `pkg/workflowexecution/executor/job.go` — confirms the plain-Job execution path is fully independent of Tekton
- `kubernaut` `test/e2e/apifrontend/helpers_test.go` — confirms Dex/OIDC has no test bypass, motivating its inclusion in phase 1 scope
- `kubernaut` `test/e2e/E2E_SERVICE_DEPENDENCY_MATRIX.md` — background context only; several claims in it (mock-llm Dockerfile path, kubernautagent being Python, apifrontend's standalone Dex requirement) were found stale/incomplete during this ADR's preflight and should not be trusted without cross-checking source
