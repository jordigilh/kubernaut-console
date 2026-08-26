# Test Plan: Wire shape validation into JSON.parse/type-assertion call sites

> **IEEE 829 Test Plan** for kubernaut-console#90
> **Audit source**: `docs/audit/PRODUCTION-READINESS-FEDRAMP-ASVS.md` F-12
> **Status**: Active
> **Last Updated**: 2026-08-26

## 1. Test Plan Identifier

TP-CONSOLE-90

## 2. Introduction

`packages/ui-core/src/lib/schemas/investigation-summary.ts`'s `isInvestigationSummary()`
type guard is fully implemented and unit-tested (8 tests), but is dead code:
the one production call site, `useChat.ts:384`, uses a bare TypeScript type
assertion (`as unknown as InvestigationSummary`) instead, which performs zero
runtime validation. The identical anti-pattern — treat successful
`JSON.parse` (syntax valid) as proof of the *expected shape* (never
verified) — repeats at:

| # | File:Line | Payload | Current behavior on wrong-shape (not wrong-syntax) input |
|---|-----------|---------|----|
| 1 | `useChat.ts:384` | `investigation_summary` DataPart | Silently propagates `undefined` fields into `RCAData`/`ChatMessage`; existing `isInvestigationSummary()` never called |
| 2 | `useChat.ts:592` | `approval_request` status message | Silently propagates a malformed `ApprovalRequest` into UI state — operator-decision-critical (approval card) |
| 3 | `useChat.ts:606` | `approval_request_resolved` status message | Same, for `ApprovalResolution` |
| 4 | `useChat.ts:658` | `alignment_check_failed` status message | Silently drops the verdict (falls to the existing catch-equivalent path) if shape is wrong but JSON-valid |
| 5 | `a2a-client.ts:128` | Every SSE frame (`JsonRpcResponse` envelope) | A frame with neither `.error` nor `.result` (wrong envelope shape) causes the stream loop to silently `return "continue"` forever — no visible failure, connection just hangs until idle timeout |
| 6 | `a2a-status-client.ts:108-110` | `status/update` JSON-RPC notification | A malformed `params.phase` (not a real `RRPhase`) is passed straight to `onPhaseChange` unchecked |

This issue closes #1, #2, #3, #5, #6 with real shape validation and a visible
failure path. #4 already degrades to an equivalent-safe fallback on JSON
*syntax* errors; this issue extends that same fallback to JSON-valid/
wrong-shape input for consistency, at negligible cost.

`useChat.ts:676` (`decision`) and `:750` (`output`) are deliberately left
out of scope: both already gate every field access behind `if (parsed.rca)`/
`Array.isArray(parsed.options)`/`Array.isArray(parsed.steps)` checks, so a
wrong-shape (but JSON-valid) payload degrades safely today (fields are
simply not applied) with no crash and no misleading data — the audit's
"silent failure" concern is about `investigation_summary`/`approval_*`
propagating garbage into typed fields unchecked, which these two do not do.

## 3. Test Items

| Item | File | Change |
|------|------|--------|
| 1 | `useChat.ts` | Call `isInvestigationSummary(dataPart.data)` before treating it as `InvestigationSummary`; on failure, `setError(...)` + `console.error(...)`, keep the text fallback, skip structured-field extraction |
| 2 | `useChat.ts` | Add `isApprovalRequest()` guard; on failure, `setError(...)` instead of `update({ approvalRequest: parsed })` |
| 3 | `useChat.ts` | Add `isApprovalResolution()` guard; on failure, `setError(...)` instead of `update({ approvalResolution: parsed })` |
| 4 | `useChat.ts` | Add `isAlignmentVerdict()` guard; on failure, behave like the existing catch path (`update({ recoverySignal: "alignment_check_failed" })` without a verdict) |
| 5 | `a2a-client.ts` | Add `isJsonRpcResponse()` guard on the raw SSE frame; on failure, call `options.onError(...)` and return `"fatal"` instead of silently looping |
| 6 | `a2a-status-client.ts` | Validate `params.phase` is a known `RRPhase` before calling `onPhaseChange`; on failure, call `options.onError(...)` and return `"fatal"` |

## 4. Features to be Tested

- Each new guard: valid payload → `true`/pass-through; malformed payload (missing required field, wrong type, null) → `false`/rejected
- `useChat`: a shape-invalid `investigation_summary`/`approval_request`/`approval_request_resolved` payload sets `error` (non-null) and does **not** populate the corresponding typed field with garbage
- `useChat`: a shape-invalid `alignment_check_failed` payload behaves identically to a JSON-syntax-invalid one (recoverySignal set, no verdict)
- `streamA2A`: an SSE frame that is valid JSON but not a valid `JsonRpcResponse` (no `error`, no `result`) calls `onError` and stops the stream, rather than looping silently
- `subscribeRRStatus`: a `status/update` notification with an invalid `phase` value calls `onError`, rather than forwarding the bad value to `onPhaseChange`

## 5. Features Not Tested

- `decision`/`output` metaType parsing (already field-gated; see rationale above — no behavior change, no new tests needed)
- Backend-side payload correctness (out of scope for this repo)

## 6. Approach

Pyramid Invariant: Unit Tests prove each guard function in isolation;
existing hook-level tests (`useChat.test.ts`, already covering the
JSON-syntax-error "malformed JSON" cases) are extended with matching
"JSON-valid, wrong-shape" cases to prove the wiring, not the parsing logic
itself.

### 6.1 Unit Tests (UT) — Guard functions

| Test ID | Target | Input | Expected | FedRAMP |
|---------|--------|-------|----------|---------|
| UT-CONSOLE-CHAT-055 | `isApprovalRequest` | Valid `ApprovalRequest` shape | `true` | SI-10 |
| UT-CONSOLE-CHAT-056 | `isApprovalRequest` | Missing `requiredBy`/`confidence` | `false` | SI-10 |
| UT-CONSOLE-CHAT-057 | `isApprovalResolution` | Valid `ApprovalResolution` shape | `true` | SI-10 |
| UT-CONSOLE-CHAT-058 | `isApprovalResolution` | Invalid `decision` enum value | `false` | SI-10 |
| UT-CONSOLE-CHAT-059 | `isAlignmentVerdict` | Valid `AlignmentVerdict` shape | `true` | SI-10 |
| UT-CONSOLE-CHAT-060 | `isAlignmentVerdict` | Missing `findings`/`result` | `false` | SI-10 |
| UT-A2A-CLIENT-010 | `isJsonRpcResponse` (a2a-client.ts) | `{ jsonrpc: "2.0", id: "x", result: {...} }` | `true` | SI-10 |
| UT-A2A-CLIENT-011 | `isJsonRpcResponse` | `{ foo: "bar" }` (neither error nor result) | `false` | SI-10 |

### 6.2 Unit/Hook Tests (UT) — Wiring into `useChat`/`streamA2A`/`subscribeRRStatus`

| Test ID | Scenario | Expected | FedRAMP |
|---------|----------|----------|---------|
| UT-CONSOLE-CHAT-061 | `investigation_summary` DataPart with none of `isInvestigationSummary`'s recognized fields present (genuinely unrecognizable shape, valid JSON) | `error` becomes non-null; `rca`/`workflowOptions` remain undefined; text fallback still rendered | SI-10, AU-3 |
| UT-CONSOLE-CHAT-062 | `approval_request` status message, JSON-valid but missing `requiredBy` | `error` becomes non-null; `approvalRequest` remains undefined | SI-10, AC-6 |
| UT-CONSOLE-CHAT-063 | `approval_request_resolved` status message with invalid `decision` value | `error` becomes non-null; `approvalResolution` remains undefined | SI-10, AC-6 |
| UT-CONSOLE-CHAT-064 | `alignment_check_failed` with JSON-valid but wrong-shape body (missing `findings`) | `recoverySignal` set to `"alignment_check_failed"`, `alignmentVerdict` undefined (same as syntax-error path) | SI-10 |
| UT-A2A-CLIENT-012 | SSE frame valid JSON, neither `.error` nor `.result` | `onError` called; stream stops (`fatal`), no infinite silent loop | SI-10 |
| UT-A2A-STATUS-005 | `status/update` notification with `params.phase = "NotARealPhase"` | `onError` called; `onPhaseChange` NOT called with the bad value | SI-10 |

## 7. Pass/Fail Criteria

- All new tests in §6 pass
- All existing tests in `useChat.test.ts`, `a2a-client.test.ts` (if present), `a2a-status-client.test.ts` continue to pass unmodified in intent (existing malformed-JSON-syntax tests keep their original assertions)
- `pnpm --filter @kubernaut/ui-core test` green with coverage still ≥ configured thresholds
- `pnpm build` clean

## 8. FedRAMP Control Mapping

| Control | Description | Tests |
|---------|-------------|-------|
| SI-10 (Input Validation) | Structured input is validated against an explicit expected shape before being trusted, not merely checked for JSON syntax | All of §6 |
| AC-6 (Least Privilege) / operator-decision integrity | An operator cannot be shown a garbled/partial approval request or asked to act on a malformed resolution | UT-CONSOLE-CHAT-062, 063 |
| AU-3 (Audit Content) | A validation failure is surfaced (visible `error` state + `console.error`), not silently absorbed | UT-CONSOLE-CHAT-061, 062, 063 |

## 9. Test Deliverables

- This test plan document
- New guard functions: `isApprovalRequest`, `isApprovalResolution`, `isAlignmentVerdict` (`useChat.ts`), `isJsonRpcResponse` (`a2a-client.ts`)
- `investigation-summary.ts`'s existing `isInvestigationSummary` wired into `useChat.ts:384`
- `a2a-status-client.ts` phase validation
- New/updated test cases per §6

## 10. Open Item (Non-Blocking)

`useChat.ts:676`/`:750` (`decision`/`output`) are explicitly deferred (see
§2) rather than silently dropped from scope — flagging here so a reviewer
can request they be included if they disagree with the "already
field-gated" rationale.

## 11. Amendment (RED phase finding): `isInvestigationSummary` contract refined

During RED-phase test writing, three **pre-existing, currently-passing**
integration tests (`IT-CONSOLE-MCP-005/006/007`, `IT-CONSOLE-DISMISS-001`,
`IT-CONSOLE-ESCALATE-001` in `ChatContainer.integration.test.tsx`, and
`IT-CONSOLE-PROVIDER-002` in `KubernautChat.integration.test.tsx`) sent real
`investigation_summary` fixtures that are legitimately *partial*: some omit
top-level `session_id`, others omit top-level `summary` (nesting it at
`rca.summary` instead, with `useChat.ts` already falling back to artifact
text for the top-level field). The wire protocol is progressive/incremental,
not a fixed schema — `InvestigationSummary`'s "all required" TypeScript
interface documents an idealized full shape, not a per-message guarantee.

`isInvestigationSummary()` was therefore implemented as a **plausibility
check** rather than a strict schema gate: it accepts any object containing
at least one of a known set of `investigation_summary` identifying fields
(`schema_version`, `type`, `session_id`, `rr_id`, `signal_name`, `namespace`,
`cluster_id`, `summary`, `rca`, `options`, `searched_target`,
`signal_target`), and separately still rejects a malformed `rca` (present
but not a non-null object) regardless of what else is present. It rejects
only genuinely unrecognizable payloads (zero field overlap) — this is what
UT-SCHEMA-006/UT-CONSOLE-CHAT-061 test. This changes §6.1's original
"missing `session_id`" framing for `isInvestigationSummary()`'s existing
unit tests (`investigation-summary.test.ts`, not table above since that
guard predates this issue) but does not change any test ID or the item 1
call-site wiring in §3 — only the guard's internal accept/reject boundary.
All pre-existing integration tests listed above pass unmodified after this
refinement; this is the authoritative, verified contract.
