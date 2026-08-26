# Test Plan: Close untested branches in mcp-client.ts and a2a-status-client.ts

> **IEEE 829 Test Plan** for kubernaut-console#96
> **Audit source**: `docs/audit/PRODUCTION-READINESS-FEDRAMP-ASVS.md` F-07
> **Status**: Active
> **Last Updated**: 2026-08-26

## 1. Test Plan Identifier

TP-CONSOLE-96

## 2. Introduction

Per `pnpm --filter ui-core test -- --coverage` (lcov), `mcp-client.ts` and
`a2a-status-client.ts` — the two modules that parse all server-originated
MCP/status data — have real untested branches, not just uncovered lines
inside already-tested functions. An untested "malformed response" or
"HTTP error" branch here is simultaneously a coverage gap and an
unverified SI-10 control, per the audit's own framing.

**Branch inventory (this branch, i.e. `main`, pre-#89/#90/#93):**

`mcp-client.ts` (LF 92 / LH 79, BRF 55 / BRH 40):

| Lines | Branch | Currently exercised by any test? |
|---|---|---|
| 61-62 | `sendMcpRequest`: reuse existing `mcpSessionId` in headers | No |
| 64-66 | `sendMcpRequest`: `options.getToken()` sets Authorization | No |
| 92-93 | `sendMcpRequest`: response sets `mcpSessionId` from header | No |
| 44 (false) | `parseSSEResponse`: an early empty `data:` line, loop continues to a later one | No |
| 98-101 | `sendMcpRequest`: `parseSSEResponse` throws (malformed/empty body) | No |
| 108-110 (false) | `result.isError` with no/empty `content` → `"Tool call failed"` fallback | No |
| 121-122 | `sendMcpNotification`: reuse existing `mcpSessionId` | No |
| 124-126 | `sendMcpNotification`: `options.getToken()` sets Authorization | No |
| 141-142 | `sendMcpNotification`: fetch throws | No |
| 145-146 | `sendMcpNotification`: `!response.ok` | No |
| 149-151 | `sendMcpNotification`: response sets `mcpSessionId` from header | No |
| 164 | `ensureInitialized`: concurrent call reuses in-flight `initializingPromise` | No |
| 179-181 | `ensureInitialized`: `notifyResult.error` → propagate, reset init state | No |
| 217 | `callMcpTool`: re-init-after-session-expiry itself fails | No |

`a2a-status-client.ts` (LF 62 / LH 54, BRF 52 / BRH 43):

| Lines | Branch | Currently exercised by any test? |
|---|---|---|
| 79-85 | `attemptSubscription`: `postForSSE` returns a fatal `SSEFetchError` (4xx, non-5xx) — both the `404 → service_unavailable` and generic `onError` + `"fatal"` sub-branches | No — existing 5xx tests (`UT-CONSOLE-STATUS-010/011`) only exercise `postForSSE`'s *retryable* path, never its fatal-HTTP-error path |
| 105 | `status/closing` with `reconnect: false` → `"complete"` | No — `UT-CONSOLE-STATUS-022/023` only cover `reconnect: true` |
| 147-149 | `subscribeRRStatus`: `"service_unavailable"` result handling in the retry loop | No |

**Explicitly out of scope**: `sendMcpRequest`'s line 79 `...(params ? { params } : {})` false branch is unreachable through any real call site — both of `sendMcpRequest`'s two callers (`initialize`, `tools/call`) always pass `params`, and the function isn't exported, so no test can reach the false branch without calling non-public code artificially. Documented here rather than silently dropped; not closed by this issue.

## 3. Test Items

| Item | File | Change |
|------|------|--------|
| 1 | `mcp-client.test.ts` | 11 new tests closing the branches in the table above (session-id reuse/capture on both request paths, getToken on both request paths, malformed/empty SSE body, empty-content isError fallback, notify failure propagation via both its own failure modes, concurrent-init dedup, re-init-itself-fails) |
| 2 | `a2a-status-client.test.ts` | 3 new tests: fatal non-5xx/non-404 HTTP status, fatal 404 → service_unavailable retry-then-fail, `status/closing` with `reconnect: false` |

No production code changes are anticipated — this is coverage-closing work per the issue's own framing (F-02/#89 is the CI gate; this issue is "the actual coverage-closing work"). If any new test exposes a real bug (RED phase surfaces unexpected behavior), it will be fixed and documented per §11.

## 4. Features to be Tested

See the two branch-inventory tables in §2 — every row gets at least one new test.

## 5. Features Not Tested

- `sendMcpRequest` line 79's unreachable `params` false branch (§2, explicitly out of scope, documented not silently dropped)
- Real MCP/AF backend behavior (out of scope for this repo)

## 6. Approach

Pyramid Invariant: unit tests own this entirely — pure parsing/protocol
logic in two client modules, no UI/wiring involved. TDD RED (write the
test against current code; it should fail only if it exposes a real gap
in behavior, otherwise it should pass immediately since we're closing
*coverage* gaps in already-correct code, not fixing bugs) → GREEN → REFACTOR.

### 6.1 `mcp-client.ts`

| Test ID | Scenario | Expected |
|---------|----------|----------|
| UT-CONSOLE-MCP-015 | `initialize`'s mock response includes an `mcp-session-id` header | The subsequent `notifications/initialized` **and** `tools/call` requests both carry `Mcp-Session-Id` in their headers |
| UT-CONSOLE-MCP-016 | `options.getToken` resolves to a token string | `initialize`, `notifications/initialized`, and `tools/call` requests all carry `Authorization: Bearer <token>` |
| UT-CONSOLE-MCP-017 | `tools/call`'s response body is non-JSON, non-empty text | `result.error.message` contains a truncated snippet of the raw text |
| UT-CONSOLE-MCP-018 | `tools/call`'s response body is the empty string | `result.error.message` is exactly `"Invalid JSON response from MCP endpoint"` |
| UT-CONSOLE-MCP-019 | SSE-formatted response with an early empty `data:` line followed by a populated one | Result parses from the *populated* line; no error |
| UT-CONSOLE-MCP-020 | `result.isError: true` with no `content` field at all | `result.error.message` is exactly `"Tool call failed"` |
| UT-CONSOLE-MCP-021 | `notifications/initialized`'s fetch call itself throws (network error) | `callMcpTool` returns that error; a subsequent call re-attempts initialization (init state was reset) |
| UT-CONSOLE-MCP-022 | `notifications/initialized`'s response is `!ok` (e.g. 500) | Same propagation via the HTTP-status code path instead of a thrown error |
| UT-CONSOLE-MCP-023 | `initialize`'s response has no session header, but `notifications/initialized`'s response does | The next `tools/call` request carries that session id |
| UT-CONSOLE-MCP-024 | Two `callMcpTool` calls fired concurrently before the first's `initialize` round-trip resolves | Only one `initialize`+`notifications/initialized` pair of requests total (second call awaits the same in-flight promise) |
| UT-CONSOLE-MCP-025 | Session expires mid-use (triggers automatic re-init), and the re-init's own `initialize` call also fails | `callMcpTool` returns the re-init error; the second `tools/call` retry is never attempted |

### 6.2 `a2a-status-client.ts`

| Test ID | Scenario | Expected |
|---------|----------|----------|
| UT-CONSOLE-STATUS-040 | `postForSSE` returns a fatal `SSEFetchError` with a non-5xx, non-404 status (e.g. 403) | `onError` called with an `"HTTP 403..."` message; exactly one fetch call, no retry |
| UT-CONSOLE-STATUS-041 | Every attempt returns HTTP 404 (`service_unavailable`, not a JSON-RPC `not_found`) up through `maxRetries` | `onError` called with the "max retries" message (not `onNotFound` — a 404 transport error is not the same as a server-attested `rr_not_found`) |
| UT-CONSOLE-STATUS-042 | `status/closing` with `reconnect: false` | Stream ends as `"complete"`: exactly one fetch call, `onReconnecting` never called |

## 7. Pass/Fail Criteria

- All new tests in §6 pass
- All existing tests in both files' suites continue to pass unmodified
- `mcp-client.ts` and `a2a-status-client.ts` each reach (or come very close to) 100% branch coverage individually
- `pnpm --filter @kubernaut/ui-core test` green
- `pnpm build` clean

## 8. FedRAMP Control Mapping

| Control | Description | Tests |
|---------|-------------|-------|
| SA-11 (Developer Testing) | Error/edge branches in the two modules that parse all server-originated MCP/status data are verified by tests, not just present in code | All of §6 |

## 9. Test Deliverables

- This test plan document
- New test cases per §6, no production code changes anticipated (see §11 if that changes)

## 10. Note on the global 80% threshold

This branch is based on `main`, which does not yet include #89/PR#104's
`vitest.config.ts` `*.stories.tsx` exclude-glob fix (still an open PR at
time of writing) — main's *global* coverage number is depressed by
Storybook files being wrongly counted, independent of anything in this
issue's scope. This issue's acceptance criteria ("coverage meets
thresholds") is scoped to the two files this issue is actually about
(mcp-client.ts, a2a-status-client.ts reaching ~100% branch coverage
individually), consistent with the issue's own framing: "F-02 is the
CI-gate... this issue is the actual coverage-closing work." The *global*
threshold will be re-verified once #89, #90, #93, and this issue are all
merged together — sequencing already decided (gap-closing issues merge
before #89's CI-enforcement PR).

## 11. RED-phase findings

All 14 new tests (11 in `mcp-client.test.ts`, plus `UT-CONSOLE-STATUS-040`
through `043` in `a2a-status-client.test.ts`) **passed on the first run**
against unmodified production code — confirming this was genuinely
coverage-closing work on already-correct behavior, not a bug hunt. No
production code changes were needed. Final per-file coverage:

| File | Statements | Branches | Functions | Lines |
|------|-----------|----------|-----------|-------|
| `mcp-client.ts` | 100% | 98.18% (line 79, documented unreachable) | 100% | 100% |
| `a2a-status-client.ts` | 100% | 96.15% (lines 108-110, a "status/update with no params" edge case not cited by the audit — extremely low real-world likelihood for a JSON-RPC method that always carries params; left as a documented, non-blocking residual gap) | 100% | 100% |

Global `ui-core` coverage (on this pre-#89-glob-fix `main`-based branch,
better than expected per §10's caveat): **80.63% statements / 81.16%
branches / 82.58% functions / 82.04% lines — all four above the
configured 80/75/80/80 thresholds**, `vitest run --coverage` reports zero
threshold errors.

## 12. REFACTOR review

Reviewed both test files after GREEN. No production code changes were
made (this issue is test-only), so there was nothing to refactor there.
The new tests follow the existing helper/pattern conventions already
established in both files (`mockSuccessResponse`/`mockFetchSuccess` in
`mcp-client.test.ts`, `createSSEResponse`/`sseFrame` in
`a2a-status-client.test.ts`) plus one small new helper
(`mockResponseWithSessionHeader`) that's used by 2 of the new tests —
not enough repetition on its own to warrant further extraction.
**Conclusion: no refactor applied.**
