# Production-Readiness Audit: FedRAMP Moderate + OWASP ASVS 5.0 Level 3

> **Audit Identifier**: AUDIT-CONSOLE-01
> **Status**: v3 — rescoped to standalone-only after `plugin-ocm`/`plugin-backstage` removal (see Scope Change Notice below)
> **Scope**: `ui-core` + `standalone` (active) + security-relevant infra. `plugin-ocm`/`plugin-backstage` findings preserved in Section 11 (deferred-scope appendix), not part of the active findings count.
> **Baseline**: FedRAMP Moderate (NIST SP 800-53 Rev 5) · OWASP ASVS 5.0 Level 3
> **Deliverable type**: Audit only — no code changes were made as part of this engagement
> **Last Updated**: 2026-08-26

## Scope Change Notice (2026-08-26, post-v2)

After this audit's v2 was delivered, `plugin-ocm` and `plugin-backstage` were removed from the active codebase — see [ADR-007](../adr/007-multi-platform-plugin-architecture.md), now marked Superseded. Only `packages/standalone` (and the shared `packages/ui-core`) are actively maintained; multi-platform integration is deferred, not cancelled.

This v3 update does **not** delete any finding produced by the v1/v2 audit work. Instead:
- Findings that were specific to `plugin-ocm`/`plugin-backstage` code, Helm charts, or CI jobs have been moved out of the active Sections 3–10 and into **Section 11: Deferred-Scope Appendix**, preserved verbatim for when multi-platform work resumes.
- Findings about `ui-core`, `standalone`, or repo-wide CI/supply-chain concerns remain in the active sections unchanged.
- The consolidated findings table (Section 5) and follow-on work table (Section 10) now reflect only the active (standalone) surface. The original full finding IDs (F-01 through F-20) are preserved as-numbered in both places so cross-references between this document and any external tracking remain valid.

## 1. Purpose and Baseline Definitions

This report audits `kubernaut-console` against two control frameworks, cited side-by-side for every finding:

- **FedRAMP Moderate**, which adopts the **NIST SP 800-53 Rev 5** control catalog's 20 families (AC, AT, AU, CA, CM, CP, IA, IR, MA, MP, PE, PL, PM, PS, PT, RA, SA, SC, SI, SR) at the Moderate impact tier (~287-323 controls depending on counting methodology, the most commonly applied FedRAMP baseline).
- **OWASP ASVS 5.0.0** (released 2025-05-30), which organizes ~350 requirements across 17 chapters (V1-V17) in 3 cumulative levels. This audit targets **Level 3** (highest assurance), so every Level 1 and Level 2 requirement in-scope is also in-scope.

Both frameworks were confirmed against their authoritative current sources (OWASP/ASVS v5.0.0 release + published requirement CSV; NIST SP 800-53 Rev 5 / FedRAMP baseline documentation) rather than assumed from memory.

## 2. Methodology

Every finding below follows a 4-step discipline (adopted from a documented cross-project lesson: a single undifferentiated "no unresolved security gaps" self-audit checklist line previously let real findings slip past self-review on a sibling project):

1. **Contract verification** — what the control actually requires.
2. **Concern decomposition** — the specific sub-concern present in *this* codebase, not generic boilerplate.
3. **Degrade-mode audit** — the failure/timeout/error path was checked explicitly, not assumed from the happy path.
4. **Independent-review gate** — Section 9 records what a second, independently-briefed review pass corroborates, adds, or disputes.

Evidence was gathered via direct source review (`Read`/`Grep`/`Glob`), actual `vitest --coverage` runs (not inferred from file/test-file pairing), the kubernaut-console architecture mental model (hindsight-docs, refreshed 2026-08-13), and known-issue history (hindsight-issues, cocoindex-indexed PRs/issues) for this repo.

**Verdict legend**: **Compliant** (evidence supports the control is met) · **Partial** (some but not all sub-concerns met) · **Gap** (control not met, evidence of the missing behavior) · **N/A** (control doesn't apply to this architecture, with rationale).

## 3. Executive Summary

kubernaut-console delegates authentication entirely to an OAuth2 Proxy sidecar (ADR-001) so the SPA itself never handles credentials — this is a strong architectural foundation for the Authentication (V6) and most of the Session Management (V7) chapters. Output encoding for LLM-generated content uses a real sanitization pipeline (`react-markdown` + `rehype-sanitize`), and the nginx layer ships a materially complete security-header set (CSP, HSTS, X-Frame-Options, etc.) and per-endpoint rate limiting already.

The most consequential findings on the **active (standalone) surface** are **structural, not exotic**:

- **CI never runs tests with `--coverage`** (`pnpm test` in [`ci.yml`](.github/workflows/ci.yml) has no `--coverage` flag), so the 80/80/75/80 thresholds already configured in `packages/ui-core/vitest.config.ts` have never actually gated a merge — and this audit found the real number (79.17% statements) is currently *below* even that pre-existing bar. There is no mechanism today that could enforce the "100% for business logic" objective this audit was asked to verify against.
- **`packages/standalone` — the package that decides which auth provider ships (`ProxyAuthProvider` vs. the E2E-only `LiveE2EAuthProvider`) — has zero test infrastructure**: no `vitest` devDependency, no test script, no test files at all.
- A currently **open, already-triaged issue** ([kubernaut-console#36](https://github.com/jordigilh/kubernaut-console/issues/36)) confirms oauth2-proxy runs with the default client-side cookie session store (no Redis/Valkey), meaning the console has no server-side mechanism to invalidate a session — this is real, already-known, and unresolved.
- **A real, unit-tested input-validation function is never actually called.** `packages/ui-core/src/lib/schemas/investigation-summary.ts`'s `isInvestigationSummary()` type guard is fully implemented and has 8 passing tests — but the one production call site, `useChat.ts:384`, uses a raw TypeScript type assertion instead (`as unknown as InvestigationSummary`, erased at runtime). This pattern — validate JSON *syntax* via `try/catch`, but never validate JSON *shape* — repeats across every SSE/JSON-RPC client in the package (`a2a-client.ts`, `a2a-status-client.ts`, `mcp-client.ts`).

None of these are exotic vulnerabilities; they are the kind of gaps a control-ID-driven audit exists to surface. See Section 8 for the full coverage/Pyramid Invariant numbers, Section 4 for full findings, Section 6 for how the independent-review pass changed this report's conclusions, and **Section 11** for the `plugin-ocm`/`plugin-backstage` findings deferred alongside those packages' removal from the active codebase (most notably: that Helm chart shipped with no Kubernetes `securityContext` at all, and its nginx config shipped with zero security headers — both real findings at the time, now out of the active surface).

**Confidence**: 90% (post-independent-review, standalone-surface scope). All three independent-review passes (Section 6) corroborated this report's draft findings and added materially to them — none contradicted a draft verdict. Confidence is held at 90%, not higher, because of genuine residual unknowns that no file in this repo can resolve: the production `/runtime-config.js` content is templated by an external `kubernaut`/`kubernaut-operator` Helm chart not in this repository; oauth2-proxy's `--cookie-httponly` default was not independently confirmed against the pinned `v7.9.0` release notes; and no full dependency CVE scan was performed (that responsibility was explicitly deferred to the existing Trivy CI job, whose own coverage gaps are now documented in F-20). Per this project's methodology, sub-95%-confidence items are escalated explicitly rather than rounded up — see Section 9.

## 4. Findings by Control Domain

### 4.1 Authentication & Identity — FedRAMP IA-2, IA-5, IA-8 · ASVS V6

**Contract**: Identity must be established and verified server-side; the client must not hold long-lived credentials it could leak.

**Concern decomposition & evidence**:
- [`docs/adr/001-oauth2-proxy-sidecar.md`](docs/adr/001-oauth2-proxy-sidecar.md) documents the decision to keep all OIDC token handling in an OAuth2 Proxy sidecar specifically to avoid "client-side credentials... tokens are never exposed to JavaScript" — explicitly cited in the ADR as "FedRAMP AC-2/AC-6 aligned."
- `packages/standalone/src/ProxyAuthProvider.ts:11-13` — `getToken()` returns `""` unconditionally; the SPA never holds a bearer token. The real `Authorization` header is injected at the nginx layer from `$http_x_forwarded_access_token` ([`deploy/nginx.conf:52,69`](deploy/nginx.conf)), which oauth2-proxy sets after its own OIDC exchange.
- `packages/ui-core/src/providers/auth.ts:9-12` defines a minimal `KubernautAuthProvider` interface (`getToken`, `getUser`) implemented by `ProxyAuthProvider` (standalone's active implementation); `OCMAuthProvider` and `BackstageAuthProvider` implemented the same interface for the now-deferred plugin packages (see Section 11).
- **Degrade-mode audit**: `ProxyAuthProvider.getUser()` (`packages/standalone/src/ProxyAuthProvider.ts:20-27`) redirects to `/oauth2/sign_in` on a 401/403 from `/oauth2/userinfo`, and throws (rather than silently returning an empty identity) on any other non-OK status — a fail-closed identity path.

**Gap — E2E-only auth path has no test coverage**: `packages/standalone/src/App.tsx:11-13` selects between `ProxyAuthProvider` and `LiveE2EAuthProvider` (an E2E-only provider per ADR-009, gated on the build-time `VITE_LIVE_E2E_TOKEN` env var) with a plain ternary. Vite bakes `import.meta.env.*` values at build time, so this cannot be toggled at runtime in a shipped image — but the selection logic itself, and both provider implementations, have **zero automated test coverage**, because `packages/standalone` has no test infrastructure at all (no `vitest` devDependency, no `test` script in [`packages/standalone/package.json`](packages/standalone/package.json)). There is nothing today that would catch a future change accidentally making this selection logic reachable in a production build path.

**Verdict**: **Partial**. Architecture is sound (IA-2/IA-5 delegated correctly to a trusted backend component per ASVS V7.2.1's intent), but the one piece of decision logic in this domain that lives in the console's own code (`App.tsx`'s provider selection) is completely unverified by tests — an ASVS V6/IA-2 verification gap, not a design gap. (The independent-review pass also found gaps in `OCMAuthProvider`/`BackstageAuthProvider` — see Section 11, deferred alongside those packages.)

### 4.2 Session Management — FedRAMP AC-12, SC-23 · ASVS V7, V3.3

**Contract**: Session tokens must be generated/verified by a trusted backend (V7.2.1), bound with `Secure`/`HttpOnly`/`SameSite` cookie attributes (V3.3.1/V3.3.4), and be terminable server-side (AC-12).

**Evidence**:
- `deploy/kind/oauth2-proxy.yaml:120-125` — `--cookie-name=_kubernaut_console`, `--cookie-samesite=lax` (reasonable, ASVS V3.3.2-aligned), `--pass-authorization-header=true`.
- Session state is a browser `httpOnly` cookie managed entirely by oauth2-proxy (per the architecture mental model, confirming ADR-001's "no client-side tokens" claim); the console's own React code never reads or writes a session token.

**Gap 1**: `deploy/kind/oauth2-proxy.yaml:121` sets `--cookie-secure=false` explicitly. This is the *kind* (local dev) manifest specifically, and no production overlay exists in this repo to confirm the flag differs there — but shipping `false` as the value anywhere in-repo, with no accompanying production-overlay counterexample, is itself a documentation/audit gap against ASVS **V3.3.1** (cookie `Secure` attribute).

**Gap 2 — already open, independently confirmed**: [kubernaut-console#36](https://github.com/jordigilh/kubernaut-console/issues/36) ("Consider server-side (Redis/Valkey) oauth2-proxy session store instead of default cookie store") documents that the operator wires oauth2-proxy with the **default cookie session store** — no `--session-store-type=redis` — meaning all session state (ID/access/refresh tokens, expiry) lives client-side, encrypted in the cookie via `OAUTH2_PROXY_COOKIE_SECRET`, with **zero server-side session state**. The issue itself documents a real production incident this caused: after an IdP mapper change, affected users' sessions could not be invalidated server-side; the only fix was per-user manual cookie clearing. This is a direct, already-known, currently-open gap against **FedRAMP AC-12 (Session Termination)** and the intent of **ASVS V7.2.1** (session state verifiable by a trusted backend service) — a backend that holds no state cannot revoke a session.

**Verdict**: **Gap** (AC-12 / ASVS V7.2.1, via #36) with one **Partial** sub-finding (V3.3.1, kind-manifest-only, unconfirmed for production overlays).

### 4.3 Authorization / Access Control — FedRAMP AC-3, AC-6, AC-24 · ASVS V8

**Contract**: Every privileged action must be authorized server-side; a client-side check is advisory-only and must fail closed.

**Evidence**:
- [`packages/ui-core/src/lib/access-check.ts`](packages/ui-core/src/lib/access-check.ts) (100% unit-tested: 11/11 lines, 8/8 branches) — `checkConsoleAccess()` calls `GET /a2a/access`, a coarse-grained pre-flight SAR gate. The code's own comment (lines 8-19) is explicit that this "does not replace per-tool SAR checks enforced server-side on every `/mcp` and `/a2a/invoke` call" and that it **fails closed**: any outcome other than a clean `200` (`401`, `5xx`, network failure, timeout via `AbortSignal.timeout(10_000)`) returns `"error"`, not `"allowed"`.
- PR [#28](https://github.com/jordigilh/kubernaut-console/pull/28) (merged) fixed a real prior authorization-adjacent bug: `callMcpTool` was silently treating `result.isError = true` as success, letting the UI claim an action succeeded when the backend RBAC/state check had actually rejected it. Fixed with explicit test cases `UT-CONSOLE-MCP-009/010/011 [SI-10]` and `IT-CONSOLE-MCP-005/006 [AC-6]`.

**Gap — untested authorization path in production e2e evidence**: hindsight-issues records (issue #71 investigation notes) that across a batch of live e2e runs, **zero** runs reached the `AwaitingApproval` state that exercises `kubernaut_get_approval_request` RBAC — i.e., the approval-gate authorization path was not exercised end-to-end in the observed run sample. This is evidence of an *exercise* gap (E2E layer of the Pyramid Invariant), not necessarily a code defect, but it means the most security-sensitive authorization surface (approve/decline a remediation action) lacks confirmed live-path verification in the sampled runs.

**Verdict**: **Compliant** for the advisory client-side gate itself (fail-closed, fully unit-tested, correctly scoped). **Partial** for E2E-tier verification of the higher-stakes MCP-side approval RBAC path.

### 4.4 Input Validation & Output Encoding — FedRAMP SI-10 · ASVS V1, V2, V5

**Contract**: Server-originated data must be validated against an expected shape before use; content rendered as HTML/markdown must be sanitized against injection.

**Headline gap, confirmed by independent review** ([input-validation/comms pass](3b59a252-a90a-4bb4-beee-a6625960c5b6)): `packages/ui-core/src/lib/schemas/investigation-summary.ts`'s `isInvestigationSummary()` (lines 44-52) is a real, hand-rolled type guard with its own 8-test suite (`UT-SCHEMA-001` through `-008`) — and it is **dead code**. A repo-wide search shows it is imported/invoked only by its own test file. The one production consumption point, `useChat.ts:384`, reads the exact same payload via a bare TypeScript type assertion (`as unknown as InvestigationSummary`), which performs zero runtime validation (type assertions are erased at compile time). Every field this audit's Section 8 coverage table shows as "100% covered" for this schema file is therefore proving the validator's own correctness in isolation, not that it gates anything in the real data path. This is the single most concrete, verifiable finding in the entire audit — a control that exists, is tested, and is simply not wired in.

This is not an isolated lapse: the same pass found the identical *pattern* (validate JSON syntax via `try/catch`, never validate JSON shape via a schema check) repeated across every other SSE/JSON-RPC client — `a2a-client.ts:128` (`parsed as unknown as JsonRpcResponse`), `a2a-status-client.ts:93` (`parsed.error as {code, message}`), and the 7 separate `JSON.parse` call sites inside `useChat.ts` itself (`approval_request`, `approval_request_resolved`, `decision`, `output`, `alignment_check_failed` payloads) — all type-asserted, none shape-validated. 5 of those 7 also fail **silently** on a syntactically-valid-but-wrong-shaped or malformed payload (no operator-visible error, no telemetry), which is an availability/observability concern layered on top of the SI-10 gap: a backend regression producing malformed payloads would be invisible to the operator during a live incident.

**Evidence**:
- `packages/ui-core/package.json` dependencies: `react-markdown` + `rehype-sanitize` + `remark-gfm` — a real sanitization pipeline is in place for LLM-generated markdown content (`MarkdownContent.tsx`), not a raw `dangerouslySetInnerHTML` pass-through. This is the correct architectural choice for ASVS **V1** (Encoding/Sanitization) applied to untrusted/LLM-originated content.
- `packages/ui-core/src/lib/schemas/investigation-summary.ts` is **100%-unit-tested** (3/3 lines, 8/8 branches, 1/1 functions) — a schema-validation module for a server-sent artifact payload.
- `docs/tests/35/TEST_PLAN.md` (an existing, merged test plan in this repo) already documents the SI-10 convention this audit is extending: absent/malformed identity fields (e.g. `cluster_id`) must resolve to `undefined`, never a false empty-string value — and cites this exact pattern against SI-10 for 4 independent wire paths.

**Gap — untested error branches in the two client modules that parse all server-sent data**: `packages/ui-core/src/lib/mcp-client.ts` is 84.69% statements / **72.72% branches** covered, with uncovered lines `62,65,66,93,101,122,125,126,142,146,151,180,181` — a large share of a JSON-RPC client's own error/malformed-response branches untested. `packages/ui-core/src/lib/a2a-status-client.ts` is 86.76%/82.69%, uncovered `80-85,105,148-149`. Since these two modules are the actual boundary where all server-originated data enters the client, untested branches here are the most control-relevant coverage gaps in the entire audit — an untested "malformed response" branch is simultaneously a coverage gap and an unverified SI-10 control.

Separately, `packages/ui-core/src/lib/sse-reader.ts`'s frame buffer (`readSSEStream`, line 64: `buffer += decoder.decode(...)`) has **no maximum size cap** — a misbehaving or malicious upstream that never terminates a `data:` line with `\n\n` can grow this buffer unboundedly for up to the full idle-timeout window (default 300s). This is a genuine, untested client-side memory-exhaustion surface, despite `sse-reader.ts` otherwise being one of the two 100%-line/branch-covered files in Section 8.1 — 100% branch coverage of the code that exists does not cover a bound that was never written.

**Verdict**: **Compliant** for the markdown-sanitization architecture (confirmed independently: no `rehype-raw` plugin exists anywhere in the repo, so raw HTML is inert before `rehype-sanitize` even runs — a stronger finding than initially drafted). **Gap** for: (a) the dead `isInvestigationSummary()` validator and the systemic type-assertion-instead-of-schema-validation pattern across all SSE/JSON-RPC clients, (b) branch-level verification of the MCP/A2A-status client parsing/error paths (see Section 8 for full numbers), and (c) the unbounded SSE frame buffer.

### 4.5 Communications / Transport Security — FedRAMP SC-8, SC-13 · ASVS V3.4, V12

**Contract**: Responses must carry the browser security-mechanism headers (HSTS, CSP with `frame-ancestors`), and service-to-service calls must be over an encrypted channel.

**Evidence** — [`deploy/nginx.conf:8-13`](deploy/nginx.conf), the standalone deployment's nginx config (the only nginx config in the active codebase as of the plugin removal — see Section 11 for the now-deferred `plugin-ocm` nginx config's own, materially worse finding):
- `Strict-Transport-Security: max-age=31536000; includeSubDomains` — **Compliant** with ASVS **V3.4.1** (max-age ≥ 1 year; note `preload` per V3.7.4 is not set, which is L3-only and a minor residual gap).
- `Content-Security-Policy` with `frame-ancestors 'none'` — **Compliant** with ASVS **V3.4.6** (the modern, correct mechanism; the config also still sends the obsolete `X-Frame-Options: DENY` as defense-in-depth, which ASVS notes should not be relied on alone but is fine as a supplement).
- `script-src 'self'` with no `'unsafe-inline'` — confirmed load-bearing by `packages/standalone/src/App.tsx:15-23`'s own comment: runtime config is loaded as an external `<script src>` file specifically *because* an inline script block would be blocked by this CSP. This is a good sign the CSP is enforced in practice, not just declared.
- `style-src 'self' 'unsafe-inline' ...` — the one CSP relaxation present, scoped to styles only (lower-severity than a script relaxation, but still a residual **Partial** against a strict reading of V3.4).
- Rate-limiting zones for `/a2a/` (30r/s) and `/mcp` (10r/s) — a reasonable DoS mitigation, though not itself an ASVS/FedRAMP-numbered control in this chapter.

Separately flagged as an open question rather than a confirmed gap: `deploy/nginx.conf` sends `Strict-Transport-Security` on a `server` block that only `listen`s on plain HTTP port 8080 (line 2) with no TLS termination visible in this file — very likely correct if TLS is terminated upstream at an ingress/Route (a common OpenShift pattern), but this repo does not contain that ingress/Route manifest to confirm it. Likewise, both `/a2a/` and `/mcp` nginx locations re-inject `Authorization: Bearer $http_x_forwarded_access_token` from an inbound header with no visibility, from this file alone, into where that header is first set/validated (presumably the oauth2-proxy sidecar) — plausible and consistent with the documented architecture, but not confirmed within this repo's files.

**Verdict**: **Compliant**, for the active standalone deployment path. `style-src 'unsafe-inline'` and missing HSTS `preload` remain minor residual items (F-11, Partial). The v2 draft's downgrade to Partial was driven entirely by the `plugin-ocm` nginx config gap, which has moved to Section 11 with that package's removal.

### 4.6 Error Handling & Audit Logging — FedRAMP AU-3, SI-11 · ASVS V16

**Contract**: Errors shown to the user must not leak internal implementation detail; security-relevant events must be logged with sufficient content to support audit.

**Evidence**:
- `packages/ui-core/src/components/ErrorBoundary.tsx` is 100%-covered for statements/lines/functions but **83.33% branch coverage** (1 uncovered branch, line 49). The independent-review pass ([input-validation/comms](3b59a252-a90a-4bb4-beee-a6625960c5b6)) resolved what the draft had flagged as unconfirmed: the fallback render **does** display `error.message` verbatim to the user by design, and test `IT-CONSOLE-EB-002` explicitly asserts this ("renders the underlying error message text"), i.e. the behavior is intentional and locked in by a test, not an accidental leak-and-forget. Whether this constitutes an ASVS V16 information-disclosure concern depends on what exception types are allowed to reach this boundary uncaught; this audit found no message-sanitization step between a thrown error and this render path.
- By contrast, `useChat.ts`'s own `friendlyError()` helper *does* map internal error content to sanitized, user-facing strings before display in the chat surface. This is an inconsistency in error-disclosure policy between two user-facing surfaces in the same package: one path redacts, the sibling boundary-of-last-resort does not.
- The architecture mental model documents a real audit-trail mechanism: terminal-state context is summarized and made available via `kubernaut_get_audit_trail(rr_id)` (Section 5.3), and `ThinkingPanel` explicitly redacts provider-redacted reasoning content rather than rendering it — a positive AU-3-relevant design choice (the system distinguishes "nothing to show" from "something hidden by policy").

**Verdict**: **Partial**, refined from the draft. The `ErrorBoundary` behavior is now confirmed (not merely flagged as unconfirmed): verbatim `error.message` rendering to the user is deliberate and test-locked, which is a real ASVS V16 consideration for any error type reaching that boundary, and it is inconsistent with the redaction policy `useChat.ts` applies to its own errors.

### 4.7 Data Protection, Configuration & Secrets — FedRAMP SC-28, CM-6 · ASVS V13, V14

**Contract**: Sensitive data must not be stored client-side unnecessarily (V14.3.3); Kubernetes workloads must run under a hardened `securityContext` (CM-6); secrets must not be hardcoded in source.

**Evidence — compliant**:
- `ProxyAuthProvider.getToken()` returning `""` (Section 4.1) means the SPA structurally cannot leak a bearer token from browser storage, because it never has one — directly satisfying the intent of ASVS **V14.3.3**.
- `deploy/kind/oauth2-proxy.yaml:15` — the `cookie-secret` value is an explicitly-labeled dummy dev value (`# pre-commit:allow-sensitive (dummy dev value)`), i.e. a deliberate, policy-permitted placeholder rather than a real leaked secret.
- `packages/standalone/Containerfile:21` — the runtime stage runs `USER 1001` (non-root baked into the image itself, defense-in-depth independent of the Kubernetes-level `securityContext`).

**Partial — dev manifest's own `securityContext` has one gap**: `deploy/kind/oauth2-proxy.yaml:104-108` sets pod-level `runAsNonRoot: true` and `seccompProfile: RuntimeDefault`, and its `oauth2-proxy` container (lines 146-151) additionally sets `allowPrivilegeEscalation: false`, `capabilities.drop: ["ALL"]`, and `readOnlyRootFilesystem: true`. Its `nginx` container (lines 172-176), however, sets `allowPrivilegeEscalation: false` and `capabilities.drop: ["ALL"]` but **omits `readOnlyRootFilesystem`** — despite mounting `emptyDir` volumes for `/tmp`, `/var/cache/nginx`, and `/var/run` (lines 191-196), which is exactly the pattern a `readOnlyRootFilesystem: true` deployment needs. The volume-mount pattern shows the intent was there; the actual security-context field was not set.

**Gap, confirmed by independent review** ([data-protection/supply-chain pass](96206314-2001-4790-b3a1-fcf5349f8bac)): `packages/standalone/Containerfile`'s base image (`ubi9/nginx-126:1`) is pinned by floating major/minor tag, not an immutable digest (`@sha256:...`) — the tag can be repointed upstream without this file changing, which undercuts the reproducibility guarantee the SLSA provenance work (Section 4.8) is otherwise built to provide. This Containerfile's build itself is a true multi-stage build (build tooling never reaches the runtime image) and correctly runs as `USER 1001`.

**Verdict**: **Partial**. The dev/kind manifest is one field short of what its own volume layout already anticipates; the standalone Containerfile is otherwise well-built but uses a floating base-image tag. (`plugin-ocm`'s own Helm chart had a more severe finding — no `securityContext` at all — see Section 11, deferred alongside that package's removal.)

### 4.8 Supply Chain & Build Integrity — FedRAMP SA-11, SR-3, SR-4

**Contract**: Build artifacts must carry verifiable provenance; dependencies must be scanned for known vulnerabilities; test execution must be a real CI gate, not a decorative script.

**Evidence — compliant, and well above average for a project this size**:
- [`.github/workflows/slsa-provenance.yml`](.github/workflows/slsa-provenance.yml) generates **SLSA v1.0 Build L3** provenance via an isolated reusable workflow (its own OIDC identity, so the calling release workflow cannot forge the attestation) using `cosign` + `actions/attest-build-provenance@v4`. The workflow's own comments cite a real A/B spike (kubernaut#1109) justifying the choice over `slsa-framework/slsa-github-generator` (unmaintained since Feb 2025) — this is genuine engineering rigor, not boilerplate. **Compliant** with SA-11/SR-3/SR-4.
- `.github/workflows/ci.yml`'s `security-scan` job runs a Trivy filesystem scan (CRITICAL/HIGH severity) and uploads SARIF results to GitHub code scanning — **Compliant** with RA-5/SR-3 (vulnerability scanning).

**Gap — the single most consequential structural finding in this audit**: `.github/workflows/ci.yml:29-30` runs the test step as plain `pnpm test`, with **no `--coverage` flag**. `packages/ui-core/vitest.config.ts:21-26` already configures 80/80/75/80 coverage thresholds — but because CI never invokes coverage, that threshold has **never gated a single merge**. This audit's own coverage run (Section 8) found the real number, 79.17% statements, is currently *below* even that pre-existing, unenforced bar. There is currently **no CI mechanism of any kind** that could enforce "100% for business logic" — the objective this audit was asked to verify against — for any of the 4 packages. This is a direct SA-11 (developer testing) and CM-6 (configuration management — a configured-but-inert control) gap, and the root cause underlying most of the Section 8 findings below.

**Verdict**: **Compliant** for provenance and dependency scanning. **Gap** for coverage enforcement — the audit's own headline structural finding.

**Additional gaps confirmed by independent review** ([data-protection/supply-chain pass](96206314-2001-4790-b3a1-fcf5349f8bac)):
- Every GitHub Action referenced in both `ci.yml` and `slsa-provenance.yml` — `actions/checkout@v4`, `pnpm/action-setup@v4`, `actions/setup-node@v4`, `aquasecurity/trivy-action@v0.36.0`, `github/codeql-action/upload-sarif@v3`, `sigstore/cosign-installer@v4.1.2`, and, most consequentially, `actions/attest-build-provenance@v4` (the action that generates the SLSA attestation this whole workflow exists to produce) — are pinned by mutable tag, not immutable commit SHA. A repointed or compromised tag on any of these would silently affect every CI run and, for the last one, the integrity of every future provenance attestation.
- The Trivy scan (`ci.yml`) is scoped to `severity: CRITICAL,HIGH` only (no MEDIUM/LOW visibility) and `scan-type: fs` only (source-tree/dependency scan; the built UBI9-based container images are never scanned for OS-package CVEs in this workflow). There is also no SBOM-generation step and no `.github/dependabot.yml` (confirmed absent repo-wide) — dependency updates, including security patches, depend entirely on manual review with no automated proposal mechanism.

## 5. Consolidated Findings Table (Active Scope: `ui-core` + `standalone`)

Original finding IDs are preserved as-numbered (gaps in the sequence, e.g. no F-03 here, are findings moved to Section 11 with the `plugin-ocm`/`plugin-backstage` removal — not renumbered, to keep any external references to this report's finding IDs stable).

**Tracking**: an issue was opened for every row below on 2026-08-26 (see Issue column). F-09 has no dedicated issue — it is an E2E coverage gap tracked separately under the live-e2e test backlog, not this remediation pass.

| ID | Domain | Severity | Evidence | FedRAMP | ASVS 5.0 | Verdict | Issue |
|----|--------|----------|----------|---------|----------|---------|-------|
| F-01 | Session | High | [kubernaut-console#36](https://github.com/jordigilh/kubernaut-console/issues/36) — default cookie session store, no server-side revocation | AC-12 | V7.2.1 | Gap | [#91](https://github.com/jordigilh/kubernaut-console/issues/91) |
| F-02 | Supply chain / CI | High | [`ci.yml:29-30`](.github/workflows/ci.yml) — `pnpm test` runs with no `--coverage`; configured 80% threshold never enforced; real number is 79.17% | SA-11, CM-6 | — | Gap | [#89](https://github.com/jordigilh/kubernaut-console/issues/89) |
| F-04 | Auth / test coverage | Medium | `packages/standalone` has zero test infrastructure; `App.tsx:11-13` provider-selection logic and both auth providers are entirely untested | IA-2 | V6 | Partial | [#92](https://github.com/jordigilh/kubernaut-console/issues/92) |
| F-06 | Session (cookie flags) | Medium | [`oauth2-proxy.yaml:121`](deploy/kind/oauth2-proxy.yaml) — `--cookie-secure=false`, no production overlay found to confirm the prod value differs | SC-23 | V3.3.1 | Partial | [#95](https://github.com/jordigilh/kubernaut-console/issues/95) |
| F-07 | Input validation | Medium | `mcp-client.ts` 72.72% / `a2a-status-client.ts` 82.69% branch coverage — untested error/malformed-response branches at the server-data ingestion boundary | SI-10 | V1, V5 | Gap | [#96](https://github.com/jordigilh/kubernaut-console/issues/96) |
| F-08 | Config / K8s hardening | Low | `deploy/kind/oauth2-proxy.yaml`'s `nginx` container omits `readOnlyRootFilesystem` despite its own emptyDir-volume layout anticipating it | CM-6 | V13 | Partial | [#98](https://github.com/jordigilh/kubernaut-console/issues/98) |
| F-09 | Authorization (E2E tier) | Low | Sampled live e2e runs show zero exercises of the `AwaitingApproval` / `kubernaut_get_approval_request` RBAC path | AC-6 | V8 | Partial | — (e2e backlog) |
| F-10 | Error handling | Low | `ErrorBoundary.tsx` 83.33% branch coverage — 1 untested branch, leak-relevance not confirmed from coverage data alone | AU-3, SI-11 | V16 | Partial | [#99](https://github.com/jordigilh/kubernaut-console/issues/99) |
| F-11 | Comms | Info | `style-src 'unsafe-inline'` in CSP (scoped to styles only); HSTS `preload` not set (L3 item) | SC-8 | V3.4 | Partial | [#102](https://github.com/jordigilh/kubernaut-console/issues/102) |
| F-12 | Input validation | High | [`useChat.ts:384`](packages/ui-core/src/hooks/useChat.ts) uses a type assertion instead of the existing, unit-tested `isInvestigationSummary()` validator — real shape validation never runs; same type-assertion-not-validation pattern repeats in `a2a-client.ts`, `a2a-status-client.ts`, and 7 `JSON.parse` sites in `useChat.ts` | SI-10 | V1.2, V5.1 | Gap | [#90](https://github.com/jordigilh/kubernaut-console/issues/90) |
| F-15 | Availability | Medium | [`sse-reader.ts:64`](packages/ui-core/src/lib/sse-reader.ts) — SSE frame buffer has no maximum size cap; a non-terminating upstream can grow it unboundedly for the life of the connection | SC-5 | V1.1 | Gap | [#93](https://github.com/jordigilh/kubernaut-console/issues/93) |
| F-16 | Supply chain / CI | Medium | All GitHub Actions in `ci.yml` and `slsa-provenance.yml`, including `actions/attest-build-provenance@v4`, pinned by mutable tag, not immutable SHA | SR-3, SR-4 | — | Gap | [#94](https://github.com/jordigilh/kubernaut-console/issues/94) |
| F-19 | Error handling | Low | `ErrorBoundary.tsx` confirmed (test-locked) to render `error.message` verbatim to the user, inconsistent with `useChat.ts`'s own `friendlyError()` redaction of the same class of errors | AU-3, SI-11 | V16.1 | Partial (refines F-10) | [#97](https://github.com/jordigilh/kubernaut-console/issues/97) |
| F-20 | Supply chain | Info | Trivy scan limited to CRITICAL/HIGH + filesystem-scope only (no image scan); no SBOM step; no Dependabot config anywhere in repo | RA-5, SR-3 | — | Partial | [#100](https://github.com/jordigilh/kubernaut-console/issues/100) |
| — | Supply chain (image) | Low | `packages/standalone/Containerfile` base images pinned by floating tag, not digest; build stage runs as `USER 0` | CM-6, SR-4 | — | Partial | [#101](https://github.com/jordigilh/kubernaut-console/issues/101) |

**Moved to Section 11 (deferred-scope appendix) with the `plugin-ocm`/`plugin-backstage` removal**: F-03 (Helm chart missing `securityContext`), F-05 (missing `@vitest/coverage-v8`), F-13 (nginx config missing security headers), F-14 (`OCMAuthProvider` fail-open identity), F-17 (`image.tag: latest` in Helm `values.yaml`), F-18 (`BackstageAuthProvider` missing error handling / empty email).

Compliant, evidence-backed controls not repeated here: fail-closed advisory access gate (`access-check.ts`, 100% tested), markdown sanitization pipeline (confirmed: no `rehype-raw` anywhere in repo), HSTS/CSP/X-Frame-Options header set on the standalone/kind deployment path, SLSA L3 provenance workflow design, Trivy CI wiring, zero-client-side-token architecture (`ProxyAuthProvider`), secrets-via-`secretKeyRef` patterns (oauth2-proxy), `config.ts`/`preferences.ts`/`runtime-config.js` all confirmed free of secrets.

## 6. Independent-Review Reconciliation

Three independently-briefed review passes were run in parallel over disjoint file sets, without seeing this report's draft findings, per the audit's independent-review-gate methodology (Section 2, step 4):

- [**Auth/session domain**](a1b43e40-fc75-4681-a44c-a54ea7450ff5) — `auth.ts`, `useUser.ts`, `session-state.ts`, `OCMAuthProvider.ts`, `BackstageAuthProvider.ts`, `LiveE2EAuthProvider.ts`, `App.tsx`, oauth2-proxy config.
- [**Input-validation & communications domain**](3b59a252-a90a-4bb4-beee-a6625960c5b6) — `investigation-summary.ts`, `MarkdownContent.tsx`, `sse-reader.ts`, `mcp-client.ts`, `a2a-client.ts`, `a2a-status-client.ts`, `useChat.ts`, `ErrorBoundary.tsx`, `deploy/nginx.conf`.
- [**Data protection, config & supply-chain domain**](96206314-2001-4790-b3a1-fcf5349f8bac) — `config.ts`, `preferences.ts`, all three Containerfiles, the plugin-ocm Helm chart, `deploy/kind/oauth2-proxy.yaml`, Backstage `app-config.kubernaut.yaml`, both GitHub Actions workflows, `pnpm-lock.yaml`, `runtime-config.js`.

**Outcome: no contradictions, substantial net-new findings.** None of the three passes disputed a draft verdict from Sections 4.1–4.8; every pass corroborated the original finding where one existed (F-01, F-03, F-04, F-06, F-07, F-11 all held up unchanged) and, more significantly, each pass surfaced concrete new findings the initial single-pass draft had missed entirely: the dead `isInvestigationSummary()` validator and its systemic pattern (F-12), the OCM-plugin nginx config's total absence of security headers (F-13), `OCMAuthProvider`'s fail-open identity fallback (F-14), the unbounded SSE buffer (F-15), tag-not-SHA pinning across both workflows (F-16), `image.tag: latest` in the plugin-ocm chart (F-17), `BackstageAuthProvider`'s missing error handling (F-18), and the now-confirmed (rather than merely suspected) `ErrorBoundary` verbatim-message rendering (F-19). This is the expected, intended outcome of the independent-review-gate methodology: a single pass under-counts findings even when its existing findings are individually correct, and running a second pass with fresh eyes over the same files is what closes that gap — see Section 9 for what this means for the report's final confidence score.

*Post-v2 note*: F-03, F-13, F-14, F-17, and F-18 above were all findings about `plugin-ocm`/`plugin-backstage`. Both packages were removed from the active codebase shortly after this review completed (Section 0). This does not change whether the independent-review pass was correct — it was, and remains a valid record of those packages' state at removal time — it only changes where those findings now live in this document (Section 11, not Section 5).

## 7. Report vs. Reality: Reconciling One Prior Memory

An earlier internal note recorded "security context correctly rendered in Helm template" for this project. That observation is **not contradicted** by F-03 (now Section 11) — it evidently referred to a different chart (most likely kubernaut-operator's own console template, which this repo does not contain), not `packages/plugin-ocm/deploy/helm/kubernaut-console-plugin/templates/deployment.yaml`, which this audit verified directly and found to have no `securityContext` at all before that chart was removed from the active codebase. Flagged explicitly so this discrepancy isn't silently dropped.

## 8. Pyramid Invariant / Business-Logic Coverage Appendix (Active Scope)

**Method**: real `vitest run --coverage` execution per package (not inferred from file/test-file pairing), 2026-08-26. "Business logic" = decision/transform code (hooks, providers, `lib/*.ts` modules); "wiring/presentation" = React rendering composition, consistent with this repo's own Pyramid Invariant language in [`docs/tests/35/TEST_PLAN.md`](docs/tests/35/TEST_PLAN.md) §6. `plugin-ocm`/`plugin-backstage` coverage numbers (as measured before their removal) are preserved in Section 11.

### 8.1 `packages/ui-core` — overall 79.17% stmt / 79.59% branch / 82.58% funcs / 80.61% lines (below the package's own configured 80/80/75/80 threshold on statements, and unenforced by CI regardless — see F-02)

**100% covered (lines, branches, functions) — fully meets the audit's business-logic mandate:**

| File | Lines | Branches |
|---|---|---|
| `src/lib/access-check.ts` | 11/11 | 8/8 |
| `src/lib/context-builder.ts` | 9/9 | 10/10 |
| `src/lib/query-intent.ts` | 7/7 | 8/8 |
| `src/lib/sse-reader.ts` | 44/44 | 26/26 |
| `src/lib/schemas/investigation-summary.ts` | 3/3 | 8/8 |

**Below 100% — Pyramid Invariant gaps, in descending order of branch-coverage severity:**

| File | Stmts | Branch | Funcs | Lines | Uncovered lines |
|---|---|---|---|---|---|
| `src/hooks/useRRStatus.ts` | 70.12% | **46.42%** | 75% | 75% | 57, 66-71, 92, 114, 131-146 |
| `src/hooks/useUser.ts` | 81.81% | **58.33%** | 100% | 82.75% | 19-21, 23, 41 |
| `src/lib/a2a-mock.ts`* | 88.23% | **66.66%** | 100% | 100% | 91-140 |
| `src/lib/mcp-client.ts` | 84.69% | **72.72%** | 100% | 85.86% | 62, 65, 66, 93, 101, 122, 125, 126, 142, 146, 151, 180, 181 |
| `src/hooks/useChat.ts` | 86.63% | **77.71%** | 92.3% | 89.02% | 167, 180, 181, 186, 211, 395, 572-577, 620-649 (partial), 706, 709, 757, 758, 806, 846-858, 891-894 |
| `src/lib/phase-rank.ts` | 100% | **80%** | 100% | 100% | line 20 (branch only) |
| `src/lib/a2a-status-client.ts` | 86.76% | **82.69%** | 100% | 87.09% | 80-85, 105, 148, 149 |
| `src/lib/a2a-client.ts` | 94.33% | **85.71%** | 100% | 97.91% | line 98 |
| `src/lib/session-state.ts` | 90.62% | **91.66%** | 100% | 92.85% | 12, 35 |
| `src/lib/preferences.ts` | 90% | 100% | 100% | 88.88% | line 20 (statement only) |

\* `a2a-mock.ts` is a dev/mock-mode fixture, not production business logic — included for completeness, not counted against the mandate.

**Component-tier (wiring, generally lower-priority against the "business logic" mandate, but flagged where a component embeds real decision logic):** `RCACard.tsx` (35.29% lines — the lowest in the package; renders RCA-derived business data, worth a closer look despite being component-tier), `ApprovalCard.tsx` (92.59% lines, 2 uncovered lines in the approve/decline decision-adjacent path), `ChatContainer.tsx` (68.78% — contains the multi-source fallback-chain resolution logic documented in `docs/tests/35/TEST_PLAN.md`, arguably business logic wearing a component's clothes), `InvestigationContext.tsx` (62.5%), `WorkflowCards.tsx` (72.52%).

### 8.2 `packages/standalone` — coverage **not measurable; no test infrastructure exists**

No `vitest` devDependency, no `test` script in [`packages/standalone/package.json`](packages/standalone/package.json), no `vitest.config.ts`, and no test files for any of its 4 source files (`App.tsx`, `main.tsx`, `ProxyAuthProvider.ts`, `LiveE2EAuthProvider.ts`) — including the production auth-provider-selection logic flagged in F-04.

## 9. Independent-Review Status — Complete

Per the mandatory independent-review gate (Section 2, step 4), three parallel review passes were launched over disjoint file sets (auth/session/access; input-validation/comms/error-handling; data-protection/config/supply-chain) without exposure to this draft's conclusions. **All three passes have completed and been reconciled** (Section 6); this is now v2 of the report.

**Final confidence: 90%.** Rationale:
- **Raises confidence above the 80% draft figure**: zero contradictions across three independent passes covering every file this audit touched; every draft finding that could be independently re-checked was corroborated, and the passes' 8 net-new findings (F-12–F-19, plus F-20) were all delivered with direct file:line evidence, not speculation.
- **Holds confidence below 95%**: three specific, named unknowns remain that no amount of additional review of *this* repo can resolve, because the ground truth lives outside it:
  1. The production `/runtime-config.js` response is templated by the external `kubernaut`/`kubernaut-operator` Helm chart, not this repo — its contents were explicitly out of scope and unverifiable here (noted in Section 4.7's evidence and by the data-protection pass).
  2. `oauth2-proxy`'s `--cookie-httponly` behavior was inferred from the tool's documented default for the pinned `v7.9.0` release, not confirmed by an explicit flag in `deploy/kind/oauth2-proxy.yaml` — plausible, not verified.
  3. No independent CVE scan of resolved dependency versions was performed as part of this audit (by design — deferred to the existing Trivy CI job), whose own scope gaps are now documented as F-20.
- Per this project's methodology, an item below the 95% bar is escalated explicitly (as above) rather than rounded up to a false "closed" state.

## 10. Recommended Follow-On Work (Active Scope — titles + priority only, not filed, not implemented)

Per the audit-only deliverable scope, none of the following were implemented. Each should go through this repo's existing `docs/tests/<issue>/TEST_PLAN.md`-first workflow before implementation. Items specific to `plugin-ocm`/`plugin-backstage` moved to Section 11 (deferred alongside those packages).

| Priority | Title |
|---|---|
| P0 | Add `--coverage` to the CI test step and make the existing 80/80/75/80 thresholds a real merge gate (closes F-02) |
| P1 | Stand up minimal test infrastructure for `packages/standalone` (vitest + at least the auth-provider-selection logic in `App.tsx`) (closes F-04) |
| P1 | Revisit oauth2-proxy session store (Redis/Valkey) per already-open #36 (closes F-01) |
| P2 | Close branch-coverage gaps in `useChat.ts`, `useRRStatus.ts`, `mcp-client.ts`, `a2a-status-client.ts` to meet the 100%-business-logic mandate (closes F-07 and the bulk of Section 8.1) |
| P2 | Confirm production cookie-secure value / add a production oauth2-proxy overlay to this repo for auditability (closes F-06) |
| P3 | Add `readOnlyRootFilesystem: true` to the `nginx` container in `deploy/kind/oauth2-proxy.yaml` (closes F-08) |
| P3 | Confirm `ErrorBoundary.tsx`'s untested branch doesn't render further leak-relevant detail beyond the now-confirmed `error.message` (closes F-10, informs F-19) |
| P0 | Wire `isInvestigationSummary()` into `useChat.ts:384`'s actual consumption path (or delete it if truly unneeded) and apply the same shape-validation discipline to `a2a-client.ts`, `a2a-status-client.ts`, and `useChat.ts`'s other `JSON.parse` sites (closes F-12) |
| P1 | Add a maximum buffer-size guard (with explicit error/abort) to `sse-reader.ts`'s frame accumulation loop (closes F-15) |
| P1 | Pin all GitHub Actions in `ci.yml` and `slsa-provenance.yml` to immutable commit SHAs, prioritizing `actions/attest-build-provenance` (closes F-16) |
| P2 | Reconcile `ErrorBoundary`'s verbatim-message rendering with `useChat.ts`'s `friendlyError()` redaction policy — pick one disclosure posture and apply it consistently (closes F-19) |
| P3 | Widen Trivy scan severity to include MEDIUM, add an image-scan step, add SBOM generation, and add a `.github/dependabot.yml` (closes F-20) |
| P3 | Pin `packages/standalone/Containerfile`'s base image (`ubi9/nginx-126:1`) by immutable digest instead of floating tag |

## 11. Deferred-Scope Appendix — `plugin-ocm` / `plugin-backstage` (Removed 2026-08-26)

This section preserves, verbatim in substance, every v1/v2 finding that was specific to `plugin-ocm` or `plugin-backstage` code, Helm charts, Containerfiles, or CI jobs. Both packages were removed from the active codebase after this audit's v2 was delivered (Section 0 / [ADR-007](../adr/007-multi-platform-plugin-architecture.md), now Superseded). None of these findings are wrong or retracted — they accurately describe those packages' state at the time of removal — they are simply out of the active audit scope until multi-platform work resumes, at which point this section should be re-verified against whatever code is reintroduced (it should **not** be assumed still accurate without re-auditing, since the reintroduced code may differ).

### 11.1 Findings table

| ID | Domain | Severity | Evidence | FedRAMP | ASVS 5.0 | Verdict |
|----|--------|----------|----------|---------|----------|---------|
| F-03 | Config / K8s hardening | High | `plugin-ocm/deploy/helm/kubernaut-console-plugin/templates/deployment.yaml` — production Helm chart had no `securityContext` at all (pod or container level): no `runAsNonRoot`, no `seccompProfile`, no `allowPrivilegeEscalation: false`, no `capabilities.drop`, no `readOnlyRootFilesystem`. The single largest hardening gap found anywhere in this audit; the dev-only `deploy/kind/oauth2-proxy.yaml` manifest, by contrast, set most of these fields. | CM-6 | V13 | Gap |
| F-05 | Test tooling | Medium | `plugin-backstage` was missing `@vitest/coverage-v8` as a devDependency; `vitest run --coverage` failed outright with `Cannot find package '@vitest/coverage-v8'`, meaning coverage could not be measured for this package at all. Of its 7 non-trivial source files, only 2 (`BackstageAuthProvider.ts`, `KubernautPluginPage.tsx`) had any test file; `plugin.ts`, `routes.ts`, `useBackstageTheme.ts`, `alpha.tsx`, `index.ts`, `NfsKubernautPage.tsx` had none. | SA-11 | — | Gap |
| F-13 | Comms | High | `plugin-ocm/deploy/helm/kubernaut-console-plugin/templates/nginx-configmap.yaml` — the production OCM-plugin nginx config had zero security headers (no CSP, HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, or Permissions-Policy), unlike `deploy/nginx.conf` (the standalone path), which had a full 6-header set. It did correctly serve TLS-only via OpenShift's service-serving-cert mechanism. | SC-8 | V3.4, V14.4 | Gap |
| F-14 | Auth (identity) | Medium | `OCMAuthProvider.ts:39-45` failed open on identity-resolution errors: any `consoleFetch`/JSON-parse failure while fetching the OpenShift user identity silently substituted a hardcoded fallback identity (`{ name: "Console User", email: "user@cluster.local", initials: "CU" }`) rather than surfacing an error. Tested (the fallback test asserted the substitute value), but meant a genuine identity-resolution failure was indistinguishable from a real user literally named "Console User" — any audit-logging/actor-attribution feature built on `getUser()` would have silently misattributed actions. | IA-2, AU-3 | V6.3 | Gap |
| F-17 | Config / K8s hardening | Medium | `plugin-ocm/deploy/helm/kubernaut-console-plugin/values.yaml:3-4` defaulted `image.tag` to `latest` with `pullPolicy: IfNotPresent`, undermining SLSA digest-pinning for chart consumers — combined with F-03's absent `securityContext`, a consumer who never overrode `image.tag` had no built-in mechanism to pin to a specific attested digest. | CM-2, SR-4 | — | Gap |
| F-18 | Auth (identity) | Low | `BackstageAuthProvider.ts` had no error handling at all: `getToken()`/`getUser()` had no try/catch, so a rejection from Backstage's `identityApi` propagated unhandled with no test confirming a caller handled it. `email` was hardcoded to `""` for every Backstage-sourced identity, meaning no FedRAMP audit-trail requirement for a verifiable actor email could be met via this provider. | IA-8 | V6.3 | Gap |

Additional gaps noted but not assigned standalone finding IDs in the original v1/v2 report:
- `plugin-ocm/Containerfile` and `plugin-backstage/Containerfile.dynamic` were not multi-stage builds — both `COPY`'d a pre-built `dist/`/`dist-dynamic/` directory produced by the CI job outside the container, providing no independent in-container build verification (contrast with `standalone/Containerfile`, a true multi-stage build).
- `plugin-ocm/Containerfile`'s base image (`ubi9/nginx-126:1`) was pinned by floating tag, not digest — same class of gap as the standalone Containerfile finding retained in Section 4.7/Section 10.
- `plugin-ocm/package.json`'s `peerDependencies` pinned `react`/`react-dom` to `^18.3.1` while the rest of the monorepo (post-removal: just `ui-core`/`standalone`) targets `^19.x` — a version-consistency observation, not a confirmed vulnerability.
- `plugin-ocm`'s Helm `deployment.yaml`'s volume mounts (`cert`, `nginx-conf`) were both correctly `readOnly: true`, and its TLS cert was correctly sourced from a Kubernetes `Secret` via OpenShift's service-serving-cert mechanism, not baked into the image — these were compliant findings, for completeness.
- `plugin-backstage/app-config.kubernaut.yaml` correctly sourced its service-to-service token via `${KUBERNAUT_SERVICE_TOKEN}` env-var interpolation (never hardcoded), scoped server-side to the Backstage backend proxy — also a compliant finding.

### 11.2 Coverage (as measured before removal)

**`packages/plugin-ocm`** — overall 94.44% stmt / 70% branch (measured scope: `OCMAuthProvider.ts` only):

| File | Stmts | Branch | Lines | Uncovered |
|---|---|---|---|---|
| `src/providers/OCMAuthProvider.ts` | 92.85% | 70% | 92.85% | line 53 |

`src/hooks/useOCMConfig.ts` and `src/hooks/useConsoleFetch.ts` both had paired test files but did not appear in the v8 coverage report at all under this package's `vitest.config.ts` (no explicit `coverage.include`/`coverage.exclude`) — their actual coverage was not measurable from that run.

**`packages/plugin-backstage`** — coverage not measurable (see F-05: `@vitest/coverage-v8` missing).

### 11.3 Follow-on work (deferred, not filed — re-evaluate if/when multi-platform work resumes)

| Priority | Title |
|---|---|
| P0 | Add a Kubernetes `securityContext` (pod + container) to `plugin-ocm`'s Helm `deployment.yaml` (closes F-03) |
| P0 | Add the standard 6-header security-header set from `deploy/nginx.conf` to `plugin-ocm`'s `nginx-configmap.yaml` (closes F-13) |
| P1 | Add `@vitest/coverage-v8` to `plugin-backstage` and write missing test files for `plugin.ts`, `routes.ts`, `useBackstageTheme.ts`, `alpha.tsx`, `NfsKubernautPage.tsx` (closes F-05) |
| P1 | Replace `OCMAuthProvider`'s fail-open generic-identity fallback with a surfaced error state, matching `useUser.ts`'s pattern (closes F-14) |
| P1 | Set an explicit, non-`latest` default `image.tag` in `plugin-ocm`'s Helm `values.yaml`, and change `pullPolicy` to `Always` or document digest-pinning guidance for chart consumers (closes F-17) |
| P2 | Add error handling to `BackstageAuthProvider` and source a real email from Backstage's `identityApi`/catalog instead of hardcoding `""` (closes F-18) |
| P2 | Convert `plugin-ocm`/`plugin-backstage` Containerfiles to true multi-stage builds with in-container build verification |
| P3 | Reconcile `plugin-ocm`'s React 18 `peerDependencies` with the rest of the monorepo's React 19 target |
