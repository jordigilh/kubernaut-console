# Implementation and Test Plan: Issue #168

## Objective and scope

Qualify a reusable trusted identity and lifecycle boundary for the standalone
OAuth2 Proxy host. Console #168 and parent kubernaut#855 are the acceptance
authorities. A specific browser-session BR identifier still needs confirmation;
the upstream durable-ownership BRs do not substitute for it.

Console #163 approval integration, #167 reload persistence and #170 chat-owner
integration are out of scope. Browser fencing does not change AF ownership,
recover lost data, or authorize replay of an in-flight operation.

## Contract and external dependency

The authenticated proxy response must provide verified issuer and immutable
subject plus a noncredential session discriminator. Display name and email are
not identity proof. Raw claims and credentials must not be persisted or sent in
cross-tab notifications. A host-owned page-local generation fences callbacks;
reload and notification recipients must revalidate with the host.

AF defines a sanitized same-origin contract at
`/.well-known/kubernaut-console-contract.json`, with `Cache-Control: no-store`
and an opaque `backend_incarnation` value. A matching
`X-Kubernaut-Backend-Incarnation` response header is emitted on authenticated
A2A/MCP/status responses. After a signal change, invalidate old work before
cleanup and revalidate the proxy session. Preserve login when issuer, subject
and session remain valid and unchanged, including on ordinary
same-configuration AF restart. Redirect to `/oauth2/sign_in` and clear
session-scoped state on required authentication or changed verified
principal/session. Other failures fence and expose retry; they do not justify a
login redirect.

## Test matrix

| Tier | Scenario | Evidence |
|---|---|---|
| UT | Missing/malformed `iss`/`sub`/`sid` and changed verified session fail closed | `UT-CONSOLE-168-023/024`, standalone auth-provider suite |
| IT | Superseded auth work cannot clear successor storage or render stale UI | `IT-CONSOLE-168-001/002/014`, `KubernautChat.test.tsx` |
| IT | Cleanup failure blocks login navigation and startup retry remains local | `IT-CONSOLE-168-003/004/005/016`, App and auth component suites |
| IT | One MCP client owns one session; disposal and incarnation changes fence without replay | `IT-CONSOLE-168-006/007/008/009`, MCP suite |
| IT | A2A and status work fence missing/changed incarnation signals | `IT-CONSOLE-168-015/018/019`, A2A/status/component suites |
| UT | Contract request is no-store, same-origin, credential-free and validates bounded values | `UT-CONSOLE-168-020/021/022`, backend-contract suite |
| IT | AF serves one process value and propagates it through contract and auth responses | `IT-AF-CONSOLE-168-001/002/003`, not run in this worktree; durable AF worktree and handler evidence pending |
| Browser/deployment | Reload, cross-tab, proxy cookies, restart and single-replica rollout | Not run; requires deployed qualification and Operator #621 |

Critical lifecycle isolation scenarios must all pass; record scenario coverage
and control objectives (AC-6, AC-12 and session management) against actual
evidence. Synthetic tests do not prove deployment behavior or authorization.

## Existing deployment evidence

Operator #609 qualification reports `E2E-CN-609-HTTP-001` through `004` passed
on helios08. The redacted evidence artifact SHA-256 is
`640dc67c4d75cf0dcd95c7a583bdc4550d926f02baa98d03a5eb5f30884fa126`.
It proves the reported four HTTP scenarios, including one observed refresh
with stable session ID and logout/relogin with a changed session ID. It does
not establish natural expiry, concurrent tabs, source replacement, deployed
negative claim cases, or an independently observed deployment revision.

## Verification and wiring gate

The local GREEN gate is satisfied for the Console callers. Unit tests prove
transition logic; local integration tests exercise the standalone auth host and
lifecycle consumers. AF contract/handler work was not recreated or changed in
this worktree, so AF, proxy pass-through and deployment evidence remain
acceptance blockers. Record unavailable live checks separately and do not call
#168 production-qualified without them.

## Local evidence (2026-11-08)

- `pnpm --filter @kubernaut/ui-core test`: 61 files and 776 tests passed.
- `pnpm --filter @kubernaut/standalone test`: 2 files and 24 tests passed;
  package coverage reported 88.70% statements, 88.33% branches, 100%
  functions and 92.59% lines.
- `pnpm --filter @kubernaut/ui-core build` and
  `pnpm --filter @kubernaut/standalone build` passed.
- `pnpm lint` exited zero with 10 warnings and no errors; the remaining
  warnings are generated coverage directives and existing React-hook/unused
  symbol recommendations.
- `pnpm --filter @kubernaut/ui-core exec tsc --noEmit` still reports
  pre-existing repository errors, including `findLast` target errors in
  `ChatContainer.tsx`; no new errors were reported in changed auth/SSE/A2A
  production files.
- `git diff --check` passed. No AF handler suite was run because AF work was
  not recreated or changed in this worktree.

The local scenario evidence covers the critical identity, cleanup, stale-work,
no-replay and MCP isolation cases listed above. The 52/52 outcomes from
explicitly tagged Console #168 regressions, including parameterized cases, and
4/4 SSE hardening scenarios present in the local test tree pass. The local tests
do not prove browser reload/cross-tab behavior, deployed
OAuth2 Proxy cookies, AF contract/header behavior, AF restart through the
operator proxy, conflicting replicas, or single-replica rollout. Production
acceptance remains blocked on those unrun deployment and AF boundaries.
