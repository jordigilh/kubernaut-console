# Console #168 MVP Implementation Plan

## Scope and authority

Console #168 is the acceptance authority. The MVP is the standalone OAuth2
Proxy host with one API Frontend (AF) replica. Operator #621 owns enforcing
that deployment prerequisite. Operator #609 HTTP qualification is supporting
OAuth2 Proxy evidence, not evidence of this incarnation contract.

AF owns an opaque per-process noncredential incarnation exposed via a
same-origin no-store contract and matching A2A/MCP response header. Console
requires verified nonempty `additionalClaims.iss`, `sub`, and `sid` from
`/oauth2/userinfo`, fences before cleanup, revalidates after a change, and
preserves login only when all three claims remain unchanged. Unavailable or
malformed incarnation is retryable and fenced, not a reason to log out.
Auth rejection, invalid verified claims, changed identity or session cause
session cleanup and server-owned login navigation. Non-idempotent requests
must not be replayed automatically.

On document startup unbound chat storage is cleared or ignored before render;
failure to verify cleanup blocks chat with a retry. OAuth cookies are never
modified by browser code. SPA navigation must not reset an active page session.

Non-goals: #163 approval features, #167 owner-bound reload persistence, #170
page-lifetime chat ownership, and #2606 HA, failover, shared runtime storage,
stream replay, or chat recovery. No browser credentials, raw Authorization
headers or secret-bearing cross-tab messages.

## TDD and readiness

1. RED: scenario-driven tests for unsafe replay, stale lifecycle work, missing
   claims, storage failures, contract/header validation and production routing.
2. GREEN: minimal implementations connected to actual standalone, MCP/A2A and
   AF dispatch paths; both unit and integration evidence required.
3. REFACTOR: remove retry and lifecycle duplication, improve error handling;
   rerun affected tests, build and lint. Do not create components in refactor.

The existing `TEST_PLAN.md` is preserved. Its historical RED entries must be
updated with fresh execution evidence before acceptance. Scenario coverage
must be at least 90% of the defined in-scope UT scenarios and 100% of critical
identity, security and stale-work scenarios. Count outcomes, not assertions;
no pending/skipped placeholder is acceptance evidence.

The local implementation gate is complete: affected scenario tests pass,
production callers are wired, and both Console packages build. The AF contract
is implemented on isolated branch `feat/console-168-af-contract` and has a
passing handler package suite, but it is not yet merged into the canonical AF
checkout.

## Wiring manifest and checkpoint

| Component | Production path | Required integration evidence | Status |
|---|---|---|---|
| Storage cleanup | standalone `App.tsx` before chat render; source replacement in `KubernautChat.tsx` | IT-CONSOLE-168-003/004/014/016 | local tests pass; deployed browser storage boundary pending |
| Verified identity and lifecycle | `ProxyAuthProvider` -> `KubernautChat` -> `AuthContext` consumers | UT-CONSOLE-168-023/024; IT-CONSOLE-168-001/002/014/016 | wired and locally passing |
| Scoped MCP client | `ChatContainer` creates one `McpClient` per authenticated lifecycle | IT-CONSOLE-168-006/007/008/009; full UI-core suite | wired and locally passing |
| A2A/status incarnation fencing | `useChat`, `useRRStatus`, A2A/status clients | IT-CONSOLE-168-015/018/019; full UI-core suite | wired and locally passing |
| AF incarnation | AF `NewRouter` -> same-origin contract and A2A/MCP/status headers | IT-AF-CONSOLE-168-001/002/003; handler suite | implemented in isolated AF worktree; merge/deploy pending |
| Single AF deployment | Operator reconciliation and rollout | Operator #621 deployment tests | external prerequisite |

The provider validates required fields, detects changed claims in its own
instance, and reports typed auth failures rather than navigating. KubernautChat
fences asynchronous work before cleanup, revalidates the backend incarnation,
and only redirects for required authentication. A2A state-changing requests
have no automatic replay; status-stream retries remain read-only status
subscriptions. MCP session state is instance-scoped and disposed with the
authenticated lifecycle.

CHECKPOINT W passes for the Console production callers and the isolated AF
router tests. It is not a deployed qualification result: the AF branch still
needs integration into the canonical AF change, proxy pass-through validation,
and single-replica rollout evidence from Operator #621.

## Execution evidence (2026-11-06)

| Check | Result |
|---|---|
| UI-core full Vitest | 60 files, 756 tests passed |
| Standalone full Vitest | 2 files, 22 tests passed; 93.1% statement coverage in the package run |
| UI-core build | passed; Vite emitted existing config-loader warning |
| Standalone build | passed; Vite emitted existing chunk-size warning |
| Console lint | exit 0; 12 warnings remain, including generated coverage reports and existing React-hook warnings |
| AF handler suite | `go test ./pkg/apifrontend/handler` passed in isolated worktree |
| Formatting/diff checks | `git diff --check` and AF `gofmt -d` clean |

No live OAuth2 Proxy, browser reload/cross-tab, AF restart, mixed-replica,
operator reconciliation, or deployed single-replica test has been run.

## Scenario and evidence matrix

| Critical scenario | Required proof |
|---|---|
| Verified valid, missing, malformed and changed iss/sub/sid | UT and standalone integration; no display-only authentication |
| 401/403 versus network/5xx/invalid signal | UT/IT: redirect only when warranted; transient remains fenced |
| Changed incarnation, late responses, abort, logout, cross-tab | UT/IT: fence before cleanup; no stale state commit |
| A2A/MCP uncertain failure | UT/IT: no replay of state-changing operation |
| Reload and storage failure | UT/IT: no stale data rendered; retry without logout |
| AF endpoint and response headers | UT/IT: same opaque process value, no-store, bounded input, no credentials |
| Deployment restart and conflicting responses | separate deployed E2E; no recovery/replay claims |

## Control objectives and limitations

Identity and session protection support IA-2, AC-12, SC-23 and OWASP ASVS
session-management objectives; same-origin encrypted transport supports SC-8.
Evidence must be mapped to actual passing tests and the deployment boundary;
these local tests do not constitute FedRAMP, SOC2 or ASVS certification.
SOC2 CC8.1 concerns change management; no new audit event is specified here.
Qualification of full SOC2/FedRAMP control objectives needs separately
authorized deployed journeys, not synthetic tests or Operator #609 alone.

## Risks, rollback and verification

Risk: mixed AF replicas violate the v1 authority assumption; deployment is
blocked on Operator #621 and executable single-replica/rollout proof. Existing
uncommitted Console and AF work must be preserved. On rollback, coordinate
Console/AF versions: old AF lacks the signal and the new Console must remain
fenced, not silently trust a fallback. No OAuth session deletion is authorized
for a transient backend failure.

Run focused and affected package suites, lint and builds; run AF unit and
integration tests if AF changes. Record exact commands, failures and scenario
numerators/denominators. Live restart, OAuth, proxy, cookie and multi-tab
qualification remains separate and must not be claimed without evidence.
