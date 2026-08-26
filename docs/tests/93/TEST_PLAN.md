# Test Plan: SSE frame buffer maximum size cap

> **IEEE 829 Test Plan** for kubernaut-console#93
> **Audit source**: `docs/audit/PRODUCTION-READINESS-FEDRAMP-ASVS.md` F-15
> **Status**: Active
> **Last Updated**: 2026-08-26

## 1. Test Plan Identifier

TP-CONSOLE-93

## 2. Introduction

`readSSEStream()` (`packages/ui-core/src/lib/sse-reader.ts`) accumulates
incoming bytes into an in-memory string buffer (`buffer += decoder.decode(...)`)
until it finds an SSE frame terminator (`"\n\n"`). If the upstream never
sends that terminator — a misbehaving proxy, a truncated/non-conformant
backend, or a deliberately hostile one — this buffer grows without bound for
up to the full idle-timeout window (default 300s), a client-side
memory-exhaustion path (browser tab degradation/crash).

This is pure parsing logic local to `sse-reader.ts`; the two call sites
(`a2a-client.ts`, `a2a-status-client.ts`) only need to react to a new
terminal outcome, they don't own the bound itself.

## 3. Test Items

| Item | File | Change |
|------|------|--------|
| 1 | `sse-reader.ts` | Add `maxBufferBytes` to `SSEReaderOptions` (default `DEFAULT_MAX_SSE_BUFFER_BYTES = 1_048_576`, 1 MiB); after each drain of complete frames, if the leftover (undelimited) buffer exceeds the cap, cancel the reader and return a new `"buffer_overflow"` result instead of continuing to accumulate |
| 2 | `a2a-client.ts` | `attemptStream`/`streamA2A`: treat `"buffer_overflow"` as an immediate, non-retried failure — call `options.onError(...)` and stop (do not fall through to the retry loop, since a hostile/broken upstream will just repeat the same failure) |
| 3 | `a2a-status-client.ts` | `attemptSubscription`/`subscribeRRStatus`: same treatment — `options.onError(...)`, stop, no retry |

The size check is placed **after** draining all complete frames from the
current chunk, not on the raw accumulated total — a burst of many small,
well-formed frames arriving in one chunk must not spuriously trip the cap;
only a buffer that *cannot* be drained (no `"\n\n"` found) and keeps growing
is the actual attack/failure surface.

## 4. Features to be Tested

- `readSSEStream`: buffer stays under the cap for normal traffic (including
  chunked/partial-line traffic that legitimately spans multiple reads) →
  behaves exactly as before, `"complete"`
- `readSSEStream`: a stream that never sends `"\n\n"` and whose accumulated
  undelimited data exceeds `maxBufferBytes` → returns `"buffer_overflow"`,
  reader is cancelled, no further reads attempted
- `readSSEStream`: a stream whose *individual complete frames* are large but
  each gets drained (frame boundary found) before the next chunk arrives →
  does not spuriously trigger the cap, even if cumulative *total* bytes over
  the life of the stream exceeds `maxBufferBytes`
- `a2a-client.ts`/`streamA2A`: `"buffer_overflow"` from the reader calls
  `onError` with a clear message and does not retry
- `a2a-status-client.ts`/`subscribeRRStatus`: same

## 5. Features Not Tested

- Exact byte-accounting semantics (`buffer.length` is JS string UTF-16 code
  units, not wire bytes — an acceptable approximation for a resource bound;
  precise multi-byte-vs-UTF-16 accounting is not security-relevant here,
  only "some generous, enforced upper bound exists")
- Real browser memory pressure/crash behavior (out of scope for a unit test)

## 6. Approach

Pyramid Invariant: Unit tests own this entirely — the failure mode is pure
parsing logic in `sse-reader.ts`, plus two small wiring assertions in the
existing client test suites proving the new result is not silently
swallowed.

### 6.1 Unit Tests (UT) — `sse-reader.ts`

| Test ID | Scenario | Expected | FedRAMP |
|---------|----------|----------|---------|
| UT-CONSOLE-SSE-009 | Many small well-formed frames, cumulative total far exceeds `maxBufferBytes` but each is drained immediately | `"complete"`, all frames delivered, no false-positive overflow | SC-5 |
| UT-CONSOLE-SSE-010 | Stream sends chunks with no `"\n\n"` ever, cumulative size exceeds a small test `maxBufferBytes` (e.g. 20 bytes) | `"buffer_overflow"`; `reader.cancel()` called; no `onFrame` invocation after the cap is hit | SC-5 |
| UT-CONSOLE-SSE-011 | Buffer sits exactly at the cap boundary (`buffer.length === maxBufferBytes`) | `"complete"` (cap is exceeded, not met, that triggers the failure — off-by-one proven explicitly) | SC-5 |
| UT-CONSOLE-SSE-012 | Default `maxBufferBytes` (no option passed) still bounds an unterminated stream | `"buffer_overflow"` eventually returned (using a stream that emits well past `DEFAULT_MAX_SSE_BUFFER_BYTES` with no delimiter) | SC-5 |

### 6.2 Wiring Tests (UT) — call sites

| Test ID | Scenario | Expected | FedRAMP |
|---------|----------|----------|---------|
| UT-CONSOLE-A2A-018 | `readSSEStream` (mocked via a real oversized undelimited stream) returns `"buffer_overflow"` inside `streamA2A` | `onError` called with a clear message; no retry attempted | SC-5 |
| UT-CONSOLE-STATUS-028 | Same, inside `subscribeRRStatus` | `onError` called; no retry attempted | SC-5 |

## 7. Pass/Fail Criteria

- All new tests in §6 pass
- All existing `sse-reader.test.ts`/`a2a-client.test.ts`/`a2a-status-client.test.ts` tests continue to pass unmodified
- `pnpm --filter @kubernaut/ui-core test` green
- `pnpm build` clean

## 8. FedRAMP Control Mapping

| Control | Description | Tests |
|---------|-------------|-------|
| SC-5 (Denial of Service Protection) | A client-side resource-exhaustion vector (unbounded buffer growth) is bounded and fails closed with a visible error | All of §6 |

## 9. Test Deliverables

- This test plan document
- `maxBufferBytes` option + `DEFAULT_MAX_SSE_BUFFER_BYTES` constant + `"buffer_overflow"` result in `sse-reader.ts`
- Wiring in `a2a-client.ts` and `a2a-status-client.ts`
- New test cases per §6
