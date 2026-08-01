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

## Known open question this suite is designed to surface, not pre-solve

`charts/kubernaut/values.yaml`'s `sre` persona ACL (the Dex test user this
suite authenticates as) lists `kubernaut_approve`/`kubernaut_complete` but
not `kubernaut_complete_no_action` — the exact tool the console's
Dismiss/Escalate buttons call. `approval-gate.spec.ts`'s dismiss test
asserts the real MCP response directly and fails with a clear message if
that's a real authorization gap, rather than skip or guess. Verified
against `jordigilh/kubernaut@origin/main` on 2026-08-01; re-check if this
has since been fixed upstream.
