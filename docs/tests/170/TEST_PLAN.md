# Issue #170 — page-memory storage and MCP test plan

## Scope

`PageLifetimeChatOwnerProvider` creates a private in-memory session for the
existing owner and presenter and is now mounted by the real `KubernautChat`
production path after the host auth/access gate succeeds. The existing public
`ChatContainer`, its legacy `ChatOwnerProvider`, standalone/public no-argument
`useChat` behavior and the merged #168 lifecycle-aware `McpClient` remain
compatible. The page-memory owner uses that operational lifecycle-aware client;
the separate scoped MCP client remains internal and unwired.

The page-memory owner does not read, write, remove or adopt the legacy
transcript, context, pending-context, phase or workflow-resolution keys. Its
raw-thinking preference is also memory-only. The legacy keys remain untouched;
their deletion or migration is not decided here. New/reset conversations use
a fresh UUID, and a missing, malformed, repeated or unavailable UUID blocks
sends. A failed reset keeps the draft and reports an error. This is not an
identity, authorization or backend-session guarantee.

Reload discards page-memory content; it does not recover a driver or imply that
backend work stopped. Mount, hide, show, reload and recovery never send or
replay a prompt automatically. The production-entrypoint browser test uses a
synthetic A2A backend; deployed auth, logout, source change and concurrency
qualification remain separate #184/#168 work. Reload-safe browser history is
separate (#167).

## Pyramid invariant and RED/GREEN/REFACTOR

Before implementation, the component tests ran against the existing owner as a
behavior-level RED baseline: legacy content was adopted, separate owners lacked
fresh contexts, and denied storage caused initialization to fail. The first
two browser tests also failed against that baseline. The source tests directly
import the new internal provider, while the production integration and
entrypoint browser tests exercise the `KubernautChat` and standalone paths that
mount it; they do not fall back to the legacy owner.

| Tier | Test IDs | Business behavior |
| --- | --- | --- |
| Unit | `UT-CONSOLE-170-001`–`004` | Per-owner in-memory storage, fresh context generation, repeat/invalid/throwing generator failure and local reset. |
| Unit | `UT-CONSOLE-170-005`–`006` | Phase and workflow decisions remain owner-local; denied/malformed storage never falls back to legacy state. |
| Unit | `UT-CONSOLE-170-007`–`010` | Hook initialization, pending-context consumption, reset failure, invalid session construction and existing standalone quota fallback. |
| Component integration | `IT-CONSOLE-170-001`–`010` | Real owner/hook/presenter isolation; hide/show; denied storage; initial, explicit and terminal reset failures; local preference; retained drafts; delayed synthetic events/actions. |
| Component integration | `IT-CONSOLE-170-011`–`012` | Explicit select/escalate handlers record resolution in the owner, not the legacy store. Transports are mocked. |
| Production integration | `IT-CONSOLE-170-PROD-001` | Real `KubernautChat` auth/access/provider composition mounts the page-memory owner, ignores legacy transcript/context/pending keys and sends through the existing A2A dispatch boundary. The backend transport is synthetic. |
| Synthetic browser | `E2E-CONSOLE-170-001`–`003` | Real Chromium storage, reload and denied getters; failed reset and explicit retry. Only the local fixture origin is allowed; A2A is a synthetic in-process response. |
| Production-entrypoint browser | `E2E-CONSOLE-170-PROD-001` | Real standalone `App` → `KubernautChat` → page-memory owner path ignores legacy state, does not persist the new transcript to `sessionStorage`, and loses it on reload. A2A/auth are synthetic; this is not deployed qualification. |

The delayed-action test establishes only that a callback holding one provider's
storage cannot mark another provider's store. The production integration and
entrypoint browser test prove the mounted path, not deployed identity,
cross-user authorization, same-user concurrency or every callback fence across
a real logout. The scoped MCP seam and its synthetic transport behavior remain
separately tested and unwired.

## Unit coverage

Both storage files measured at least **90% per file** for statements, branches,
functions and lines without lowering repository defaults. The original combined
Vitest command requested `perFile=true`, but a later threshold challenge showed
that this CLI invocation checked only the aggregate. The following single-file
coverage runs enforce the threshold independently:

```sh
pnpm --filter @kubernaut/ui-core exec vitest run --coverage \
  --coverage.include=src/lib/page-chat-session.ts \
  --coverage.thresholds.lines=90 --coverage.thresholds.functions=90 \
  --coverage.thresholds.statements=90 --coverage.thresholds.branches=90 \
  src/lib/page-chat-session.test.ts src/lib/session-state.memory.test.ts
pnpm --filter @kubernaut/ui-core exec vitest run --coverage \
  --coverage.include=src/lib/session-state.ts \
  --coverage.thresholds.lines=90 --coverage.thresholds.functions=90 \
  --coverage.thresholds.statements=90 --coverage.thresholds.branches=90 \
  src/lib/session-state.test.ts \
  src/lib/session-state.memory.test.ts
```

| File | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| `page-chat-session.ts` | 100% | 100% | 100% | 100% |
| `session-state.ts` | 95.83% | 90% | 100% | 100% |

The existing, much larger `useChat.ts` is **not** at 90% whole-file unit
coverage: its separate three-file unit run measured 86.36% statements, 78.74%
branches, 92% functions and 91.16% lines. Its earlier baseline was 83.26%,
75.3%, 91.3% and 86.8% respectively. For the changed lines only, intersecting
`git diff --unified=0` added line numbers with the run's LCOV `DA` and `BRDA`
records measured 40/40 executable lines and 49/49 associated branch records.
In the Istanbul JSON report, statements whose start line and functions whose
declaration line were added measured 45/45 statements and 11/11 functions.
These source-mapped changed-code figures are not a full-file 90% pass and do not
replace component/browser wiring tests. Do not add unrelated tests solely to
inflate the whole-file figure.

```sh
pnpm --filter @kubernaut/ui-core exec vitest run --coverage \
  --coverage.include=src/hooks/useChat.ts \
  --coverage.reporter=text --coverage.reporter=json --coverage.reporter=lcov \
  --coverage.thresholds.lines=0 --coverage.thresholds.functions=0 \
  --coverage.thresholds.statements=0 --coverage.thresholds.branches=0 \
  src/hooks/useChat.test.ts src/hooks/useChat.session.test.ts \
  src/hooks/useChat.memory.test.ts
```

The zero values above disable global thresholds **only for this whole-file
measurement**, not as an acceptance gate or a configuration change.

## Source-only MCP client evidence

`createScopedMcpClient` is an internal seam, not an authenticated integration.
It captures transport inputs but does not qualify the identity behind them. The
operational `ChatContainer` continues to use the merged #168 lifecycle-aware
`McpClient`; the page-memory provider does not wire this scoped seam. The
standalone/public legacy path retains its existing behavior. The shared decoder
was extracted without changing that behavior or its existing retry contract.

Before implementation, a temporary adapter to that singleton made the new tests
fail at unit, synthetic-integration and Chromium levels: handshakes and session
state crossed instances, delayed work survived reset, and mutations were retried.
After the first GREEN run, an independent plan review identified response-ID/SSE,
redirect, session-expiry, reentrancy and consumer-evidence gaps. Eight targeted
review cases were RED before those changes and GREEN afterward.

The later behavior-preserving REFACTOR pass first added two GREEN characterization
tests for reentrant abort callbacks and SSE tool-level errors. It then centralized
session clearing, expiry recognition and invalidation/epoch checks, and separated
SSE framing from response correlation. Focused tests passed after each step; the
characterization tests are not represented as new RED behavior.

The separate source-only transport-auth slice had RED unit, integration and
Chromium tests before implementation: the old candidate rejected the proxy
provider's empty token and inferred transport behavior when no mode was supplied.
Further RED/GREEN cases rejected a same-origin-looking `blob:` URL and prevented
ambient cookies from being mixed into explicit bearer requests. After GREEN,
transport configuration checks were consolidated and focused tests rerun.
These are synthetic transport mechanics, not a qualified host-auth contract.

The independent review's missing MCP `Accept` header was RED in proxy and bearer
unit cases and in the synthetic integration server's rejection (originally 406).
Adding both required media types made those tests GREEN. The synthetic browser
proxy route also rejects requests missing either type. The focused header change
needed no further refactor and does not change the #168 lifecycle-aware client.

Offline AF source comparison: `pkg/apifrontend/handler/mcp.go` at local
`origin/main` `be9413c4e437b01f03c591fe266cf07681a8c1ec` constructs the Go MCP
SDK Streamable HTTP handler with default options. That revision pins SDK v1.8.0;
its transport requires both Accept types (HTTP 400 otherwise), returns an empty
202 for notifications, defaults to SSE for calls, and supplies the session ID
on initialize. The synthetic integration fixture now exercises these shapes for
both modes. This is source-aligned characterization, not an execution of AF or
proof of its deployed version, authentication, tool behavior or authorization.
The updated fixture passed with 46 focused tests; four synthetic MCP browser
tests, targeted lint and `git diff --check` also passed. The fixture change
characterizes existing behavior, so it is not presented as a RED/GREEN fix.

### Local AF-handler transport check

`IT-CONSOLE-170-MCP-003` is an **opt-in** integration test against the actual
AF `NewMCPHandler`, with one explicitly registered stub tool and no AF router,
auth middleware, bridge, backend, deployment or cluster. A loopback-only process
is started and stopped by the test. It exercises the scoped client's real SSE
handshake, 202 notification, session header, stub call, explicit session close,
404 with no action replay, and later explicit reinitialization. Two clients
also establish separate handler sessions; proxy mode uses a test-only loopback
adapter, not an actual reverse proxy. Bearer tokens are synthetic and ignored by
the handler. This does not establish cookie behavior, identity, authorization,
deployed AF compatibility or production concurrency.

The local run used sibling AF checkout `072a6016cc5e43be069cfb6055b0ea0b045b4431`,
SDK v1.8.0, and two tests passed. Its `mcp.go` matched local `origin/main`
`be9413c4e437b01f03c591fe266cf07681a8c1ec`; other dependencies differ. The
fixture characterizes this source snapshot, not any deployed version.
With the fixture enabled the full UI-core suite passed 826 tests; targeted lint,
Go formatting and `git diff --check` passed. UI-core typechecking still fails
with the same 91 normalized baseline diagnostics and no new signatures.

To repeat, set `AF_SOURCE` to a trusted local checkout and `CONSOLE_SOURCE` to
this checkout, and `AF_HANDLER_BIN` to a path in an approved temporary directory.
The first command builds only a temporary binary; `GOPROXY=off`
requires dependencies already cached. The second command starts the handler on
an OS-assigned loopback port for the duration of the test:

```sh
cd "$AF_SOURCE"
GOPROXY=off GOFLAGS=-mod=readonly go build -o "$AF_HANDLER_BIN" "$CONSOLE_SOURCE/docs/tests/170/fixtures/af-mcp-handler.go"
cd "$CONSOLE_SOURCE"
CONSOLE_170_AF_HANDLER="$AF_HANDLER_BIN" pnpm --filter @kubernaut/ui-core exec vitest run src/lib/scoped-mcp-client.af-handler.integration.test.ts
```

The test is skipped when `CONSOLE_170_AF_HANDLER` is unset; normal
unit-suite success alone does not indicate this integration test ran.

| Tier | Test IDs | Business behavior and limit |
| --- | --- | --- |
| Unit | `UT-CONSOLE-170-MCP-001`–`020`, `027`–`030` | Captured transport inputs, independent and shared initialization, session state, invalidation before/during token/fetch/body/delay, failures, no replay, stale-session fencing and explicit retry. All transports and credentials are synthetic. |
| Unit | `UT-CONSOLE-170-MCP-021`–`026`, `031`–`035` | Correlated JSON-RPC and SSE responses, tool-level errors, redirect mode, later explicit reinitialization, stale expiry/header races and synchronous reentrancy. |
| Unit | `UT-CONSOLE-170-MCP-036`–`042` | Explicit same-origin proxy and bearer modes, invalid configuration, denied/off-origin proxy requests, captured mode and no ambient cookies in bearer mode. No fallback between modes. |
| Unit | `UT-CONSOLE-170-MCP-043` | Both transport modes advertise JSON and SSE for initialization, notification and tool calls. |
| Synthetic integration | `IT-CONSOLE-170-MCP-001`–`002` | A test-only consumer fences a delayed result; separate proxy/bearer clients use isolated synthetic sessions. No production owner or auth lifecycle is integrated. |
| Synthetic Chromium | `E2E-CONSOLE-170-MCP-001`–`003` | Delayed initialization is fenced; native fetch does not follow 307/308; explicit proxy mode makes same-origin synthetic requests without a browser bearer token. Routes never reach a backend. |
| Legacy regression | `UT-CONSOLE-MCP-001`–`026` | The existing #168 lifecycle-aware client retains its established wire decoding, session behavior and retry contract. |

An error or abort does not prove an action was not executed by the backend. A
caller must reconcile an unknown outcome before deciding whether another action
is safe. No test establishes server-side cancellation or authorization.
Proxy-mode tests do not set or inspect real cookies and do not prove proxy
authentication. The host must select the mode explicitly and qualify the actual
transport, source, identity, logout and server authorization before wiring the
scoped MCP seam; the mounted page-memory path intentionally continues to use
the existing #168 lifecycle-aware client.

The three files below were each measured in a separate unit run with 90%
global thresholds, so the threshold necessarily applies to the one included
file. A deliberate combined-run threshold challenge confirmed that
`perFile=true` alone cannot be relied on in this Vitest invocation.

| File | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| `scoped-mcp-client.ts` | 98.2% | 97.45% | 100% | 100% |
| `mcp-wire.ts` | 98.3% | 94% | 100% | 100% |
| `mcp-client.ts` | 87.64% | 81.39% | 88% | 95.91% |

The `mcp-client.ts` figure is the current merged #168 client measured in an
isolated legacy test run; it is reported rather than hidden, but it is not a
new #170 implementation gate. The #170 scoped transport and extracted decoder
both meet the independent 90% gate above.

Each command includes one production file; the wire run includes both legacy and
scoped unit suites because both consumers use the decoder:

```sh
pnpm --filter @kubernaut/ui-core exec vitest run --coverage \
  --coverage.include=src/lib/scoped-mcp-client.ts \
  --coverage.thresholds.lines=90 --coverage.thresholds.functions=90 \
  --coverage.thresholds.statements=90 --coverage.thresholds.branches=90 \
  src/lib/scoped-mcp-client.test.ts src/lib/scoped-mcp-client.failure.test.ts \
  src/lib/scoped-mcp-client.review.test.ts src/lib/scoped-mcp-client.auth.test.ts
pnpm --filter @kubernaut/ui-core exec vitest run --coverage \
  --coverage.include=src/lib/mcp-wire.ts \
  --coverage.thresholds.lines=90 --coverage.thresholds.functions=90 \
  --coverage.thresholds.statements=90 --coverage.thresholds.branches=90 \
  src/lib/scoped-mcp-client.test.ts src/lib/scoped-mcp-client.failure.test.ts \
  src/lib/scoped-mcp-client.review.test.ts src/lib/mcp-client.test.ts \
  src/lib/mcp-wire.test.ts
pnpm --filter @kubernaut/ui-core exec vitest run --coverage \
  --coverage.include=src/lib/mcp-client.ts \
  --coverage.thresholds.lines=0 --coverage.thresholds.functions=0 \
  --coverage.thresholds.statements=0 --coverage.thresholds.branches=0 \
  src/lib/mcp-client.test.ts
```

## Control-objective crosswalk

These tests provide scoped engineering evidence, not FedRAMP authorization,
SOC 2 attestation or OWASP ASVS certification.

| Business outcome | FedRAMP/NIST SP 800-53 Rev. 5 | SOC 2 TSC | OWASP ASVS 5.0.0 | Evidence and limit |
| --- | --- | --- | --- | --- |
| Page-memory mode does not persist or adopt incident data in browser storage | SC-28, AC-6 | CC6.1, CC6.3 | `v5.0.0-V14.3.3` | `UT-CONSOLE-170-001`–`008`, `IT-CONSOLE-170-001`–`002`, `005`–`007`, `009`–`012`, `IT-CONSOLE-170-PROD-001`, browser `001`–`002`, `E2E-CONSOLE-170-PROD-001`; legacy standalone storage remains a separate path, so this is not an application-wide pass. |
| Invalid context generation fails closed without losing a draft or dispatching a request | SI-10, SA-11 | CC6.1, CC8.1 | V14 data-protection objective | `UT-CONSOLE-170-003`, `008`, `010`; `IT-CONSOLE-170-003`–`004`, `008`, `010`; browser `003`. No backend authorization claim. |
| Synthetic MCP instances isolate client state and do not automatically replay an action | AC-6, SC-7, SI-10, SA-11 | CC6.1, CC6.3, CC8.1 | V4 API/web service and V7 session-management objectives | MCP unit/integration/browser cases above; not proof of real identity isolation, server-side authorization, revocation or successful mutation reconciliation. |
| Explicit transport mode prevents a failed bearer token from silently becoming a proxy request | IA-2, AC-6, SI-10, SA-11 | CC6.1, CC6.3, CC8.1 | V6 authentication and V7 session-management objectives | `UT-CONSOLE-170-MCP-036`–`042`, `IT-CONSOLE-170-MCP-002`, `E2E-CONSOLE-170-MCP-003`; synthetic transport evidence only, not proof of the deployed proxy or auth lifecycle. |
| Authenticated data is cleared on qualified termination and the server rejects terminated sessions | AC-12 | CC6.3 | `v5.0.0-V14.3.1`, `v5.0.0-V7.4.1` | **Open**: local `KubernautChat` lifecycle remount behavior is covered, but trusted deployed identity/logout/source-change, callback fencing and server-side termination evidence belong to #184/#168. |

## Regression and remaining gates

The full UI-core suite, standalone unit suite, synthetic console-foundation
browser suite, selected mocked standalone browser journeys, targeted lint,
UI-core build, design/logo checker and `git diff --check` are run separately.
The UI-core `tsc --noEmit` baseline has 91 existing diagnostics; it is not
reported as passing. Compare before/after diagnostics rather than masking them.

Historical checkpoint from the earlier source-only phase:

- UI-core: 63 test files / 754 tests passed; standalone: 2 files / 16 tests passed.
- Browser: 37 console-foundation fixture tests and 4 selected mocked standalone
  journeys passed; the foundation count includes all 3 new memory-owner cases.
- Both UI-core and standalone builds, targeted lint, the console design/logo
  check and `git diff --check` passed. Vite emitted existing configuration and
  bundle-size warnings.
- UI-core `tsc --noEmit` still reported 91 diagnostics. Comparing normalized
  diagnostic counts against the preflight baseline found no additions or removals;
  this is not a passing typecheck.

At the later MCP checkpoint, 67 UI-core files / 802 tests and all 40
console-foundation Chromium tests passed. All three MCP files independently
passed the 90% unit threshold as recorded above. The standalone suite passed
16 tests, the standalone Vite build and standalone typecheck passed, and four
selected mocked standalone browser journeys passed. The UI-core build, targeted
lint and design/logo check also passed. UI-core `tsc --noEmit` remains at the
same 91 baseline diagnostics; it is not a passing typecheck.

After the MCP REFACTOR pass, 67 UI-core files / 804 tests, 16 standalone tests,
40 console-foundation Chromium tests and four selected mocked standalone browser
journeys passed. Single-file 90% gates passed again for the three MCP files and
the two storage files. `useChat.ts` remains at the whole-file figures above.
UI-core build, standalone Vite build and typecheck, targeted lint and the design/
logo check passed. UI-core `tsc --noEmit` still has the same 91 baseline
diagnostics, with no new normalized signatures; it remains a failing check.

After the explicit transport-mode slice, 69 UI-core files / 822 tests, 16
standalone tests, 41 console-foundation Chromium tests and four selected mocked
standalone browser journeys passed. Each of the three MCP production files
passed its independently enforced 90% unit threshold as shown above. The
UI-core build, standalone Vite build and typecheck, targeted lint, and
design/logo check passed. UI-core `tsc --noEmit` still has 91 baseline
diagnostics and no new normalized signatures; it remains a failing check.

After the review header fix, 824 UI-core tests, 16 standalone tests and four
synthetic MCP browser tests passed; scoped-client unit coverage remained 98.2%
statements, 97.45% branches and 100% functions and lines. Targeted lint passed.
No real AF compatibility or authentication was tested.

Final production-path ownership boundary:

- #170 owns the page-memory implementation, local `KubernautChat` integration,
  synthetic transport evidence and the actual standalone production-entrypoint
  browser journey recorded above.
- #184 owns deployed/authenticated qualification: local/fleet provisioning,
  real AF/KA transport and authorization, verified claims/session lifecycle,
  logout/re-login, browser reload/cross-tab fencing, AF incarnation changes,
  no automatic replay or credential leakage, and real backend concurrency.
- #168 remains a dependency where the qualification uses its lifecycle-aware
  client or existing reload/auth contracts. The new scoped MCP seam remains
  internal and unwired until its host transport/auth contract is qualified.

Synthetic owners and local mock-A2A tests do not prove cross-user
authorization, same-user deployed concurrency, driver ownership, logout safety
or any G1–G5/OWN/SAFE gate.

Final local production-path checkpoint (2026-11-14):

- Focused `KubernautChat` tests passed **27/27**; full `pnpm test` passed
  **880 UI-core tests with 2 skipped** and **24 standalone tests**.
- Single-file coverage gates passed: page session **100/100/100/100**;
  session state **95.83/90/100/100**; scoped MCP **98.2/97.45/100/100**;
  MCP wire **98.3/94/100/100** (statements/branches/functions/lines).
  The whole-file `useChat.ts` measurement was **86.36/78.74/92/91.16**.
- `pnpm lint`, `pnpm build` and `git diff --check` passed. Build output kept
  existing Vite configuration and bundle-size warnings; lint reported no
  errors.
- UI-core typecheck output matched `origin/main` exactly at **91 diagnostics**;
  it remains a known baseline failure, not a passing typecheck.
- The source-only fixture browser lane passed **41/41** and the standalone
  production-entrypoint lane passed `E2E-CONSOLE-170-PROD-001` **1/1** after
  rebuilding with `VITE_MOCK_A2A=true`. Both are local/synthetic evidence, not
  deployed qualification.
