# Live E2E Suite (ADR-009)

Validates the console against a **real, running Kubernaut backend** — real
KubernautAgent investigation (via mock-llm's deterministic scenarios), real
AF, real Dex-issued JWTs, real Job-based workflow execution, real Postgres/
Redis. See [ADR-009](../../docs/adr/009-live-e2e-real-cluster-strategy.md)
and [issue #39](https://github.com/jordigilh/kubernaut-console/issues/39)
for the full design and status.

This is **not** part of `playwright.config.ts` / `.github/workflows/e2e.yml`
(the mocked suite, `VITE_MOCK_A2A=true`). It runs against
`playwright.live.config.ts`, nightly + `workflow_dispatch`, once the CI
harness (issue #39's remaining implementation work — matrix image build +
`load-ci-images` reuse + `PRESERVE_E2E_CLUSTER=true make
test-e2e-fullpipeline`) lands.

## Prerequisites

1. A preserved kubernaut `fullpipeline` Kind cluster (see ADR-009 §3):
   ```bash
   # From a kubernaut checkout, at the SHA the CI harness resolved:
   PRESERVE_E2E_CLUSTER=true make test-e2e-fullpipeline
   ```
2. Its NodePorts reachable at `localhost`: DataStorage `:30081`, API
   Frontend `:30443` (self-signed TLS), Dex `:30556` (self-signed TLS) —
   **not** `:5556`, which is only Dex's in-cluster Service port (see
   `e2e/live/scripts/dex-token.mjs`'s header comment for why this matters).
   Gateway (`:30080`) is deployed by `fullpipeline` today but is **not**
   required by this suite — every scenario here is chat/A2A/MCP-driven and
   never exercises Gateway's webhook-ingestion path (confirmed by the
   maintainer; see ADR-009 §5). It can be excluded from the deploy to
   shrink the cluster's footprint once the CI harness supports it.

## Running locally

```bash
pnpm test:e2e:live
```

This starts the console's own dev server (via
`e2e/live/scripts/start-console-with-token.mjs`) pointed at the real AF,
after first fetching a real Dex token — see that script and
`packages/standalone/src/LiveE2EAuthProvider.ts` for how auth is wired
(no oauth2-proxy in this harness; a real Dex ROPC token is attached
client-side, the same way kubernaut's own Go E2E suites authenticate to AF
directly).

Override any of these if your cluster's ports/credentials differ from the
`fullpipeline` defaults:

| Env var | Default |
|---|---|
| `LIVE_E2E_CONSOLE_URL` | `http://localhost:5174` |
| `LIVE_E2E_AF_URL` | `https://localhost:30443` |
| `LIVE_E2E_DEX_URL` | `https://localhost:30556/dex` |

## Suite layout

| File | Covers |
|---|---|
| `contract-compliance.spec.ts` | `docs/integration-guide.md`'s Minimal Implementation Checklist, asserted against real payloads |
| `approval-gate.spec.ts` | Real `kubernaut_approve` / `kubernaut_complete_no_action` MCP calls, real per-persona SAR authorization |
| `full-remediation-lifecycle.spec.ts` | End-to-end: real investigation → decision → (approval) → real Job execution → real verification → complete |

## Current status: blocked on kubernaut#1818

The suite's first run against a real cluster (2026-08-02) found that AF
returns a malformed `investigation_summary` (a bare `TextPart` instead of
the documented `DataPart`) for the console's single free-form investigate
message — its real, only investigation entry point. This traces to
[kubernaut#1818](https://github.com/jordigilh/kubernaut/issues/1818): KA's
near-instant mock-llm response reliably races AF's interactive-session
upgrade, orphaning the real RCA behind a placeholder session. **This is an
AF/KA defect, not a console bug** — the console correctly declines to
render the malformed fallback as a valid investigation. Every test that
calls `waitForInvestigationSummaryOrKnownRace` is expected to fail with a
message naming #1818 until it's fixed upstream; see ADR-009 §9 for the full
writeup, including why a multi-turn scripted-text workaround (mirroring
kubernaut's own Go E2E test) was tried and rejected — the console's real UI
has no such protocol (decisions are direct MCP calls from button clicks,
never chat text), so that would have masked the bug behind an unrealistic
test shape instead of catching it.

## Scope: what this suite covers vs. upstream's job

`approval-gate.spec.ts`'s real-MCP-call tests hit **AF's own** `/mcp`
endpoint (`pkg/apifrontend/handler/mcp.go`, Dex-JWT + persona `Authorizer`)
— architecturally distinct from KA's `/api/v1/mcp` (port `:8088`,
ServiceAccount-token auth), which is what every existing upstream MCP E2E
test exercises. Tracing this found AF's own MCP surface — the one
`docs/integration-guide.md` documents for clients like this console — has
no upstream E2E coverage at all. Filed as
[kubernaut#1827](https://github.com/jordigilh/kubernaut/issues/1827) rather
than building deep protocol/authorization coverage out here: verifying AF's
own MCP dispatch/authorization/bridge-to-KA correctness is upstream's job.
This suite stays narrowly scoped to proving the console's own production UI
code correctly drives that real endpoint for the actions it exposes.

## Known open question this suite is designed to surface, not pre-solve

`charts/kubernaut/values.yaml`'s `sre` persona ACL (the Dex test user this
suite authenticates as) lists `kubernaut_approve`/`kubernaut_complete` but
not `kubernaut_complete_no_action` — the exact tool the console's
Dismiss/Escalate buttons call. `approval-gate.spec.ts`'s dismiss test
asserts the real MCP response directly and fails with a clear message if
that's a real authorization gap, rather than skip or guess (currently
unreachable until #1818 is fixed — see above). Verified against
`jordigilh/kubernaut@origin/main` on 2026-08-01; re-check if this has since
been fixed upstream.
