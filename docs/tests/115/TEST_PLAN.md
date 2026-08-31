# Test Plan: Converge duplicate approval cards onto one message, keyed by RR id

> **IEEE 829 Test Plan** for kubernaut-console#115
> **Status**: Active
> **Last Updated**: 2026-08-31

## 1. Test Plan Identifier

TP-CONSOLE-115

## 2. Introduction

Live E2E fleet testing observed a single approval decision (one RR, one RAR)
render two identical "Approval Required" cards back-to-back in the chat
timeline, both eventually showing the same resolution. The RR's audit trace
shows exactly one `orchestrator.approval.requested` and one
`orchestrator.approval.approved` event, ruling out a backend duplicate.

`ChatContainer` has two independent client-side paths that can each populate
an approval card for the same RAR:

- **Path A** — `useChat.ts`'s SSE artifact stream (`metaType ===
  "approval_request"`): merges the parsed payload into the current turn's
  agent message *in place* (same `agentMsgId` for the whole turn).
- **Path B** — `ChatContainer.tsx`'s status-polling effect, triggered when
  `useRRStatus` reports `AwaitingApproval`: fetches the RAR via
  `kubernaut_get_approval_request` (an async round trip) and, previously,
  unconditionally *appended* a new message once it resolved.

### 2.1 Root cause correction (superseding the initial diagnosis)

The first fix attempt (this same PR, initial commits) assumed the two paths
compute different `.name` values for the same RAR — AF's artifact stream
using the bare name, the status-poll fallback using a namespaced one — and
changed the dedup guard's comparison key from `.name` to `rrId`.

Pulling the actual SSE/audit payloads for a live-cluster repro RR
(`rr-be077e51d41b-663f588c`) disproved that: on the deployed backend (post
[kubernaut#1959](https://github.com/jordigilh/kubernaut/issues/1959)), both
`MarshalApprovalRequestPayload` (`approval_event.go`, Path A's `.name`) and
`BuildPhaseMetadata` (`status_types.go`, Path B's `approval_request_name`
fallback) emit the identical bare string (`rar-<rr-name>`), confirmed
byte-for-byte against `audit_events.event_data->>'rar_name'` for that RR. A
name-format mismatch was never the actual mechanism.

The real defect is a **timing race**: Path B's fetch can resolve, and its
check-then-append run, *before* Path A's SSE event has landed on the turn's
message at all. When that happens, no key comparison — name or `rrId` — has
anything to match against yet, so Path B still appends a second message.
When Path A's event arrives afterward, it updates the *original* turn
message (which Path B's append never touched), leaving two separate message
objects both carrying `approvalRequest`.

Fixing this requires both paths to converge on the *same message object*,
not just compare against a better key.

## 3. Test Items

| Item | File | Change |
|------|------|--------|
| 1 | `packages/ui-core/src/lib/approval-dedup.ts` | `findApprovalMessageIndex(messages, rrId, rarName)` — returns the index of the message to update in place (found via `rrId` match against any agent message, falling back to `.name` match), or `-1` if none exists yet |
| 2 | `packages/ui-core/src/components/ChatContainer.tsx` | Status-polling effect's `setMessages` updater: look up the target index via `findApprovalMessageIndex`; if found and `approvalRequest` is already set, no-op; if found and unset, update that message in place; only append a new message if no match exists at all |

## 4. Features to be Tested

- `findApprovalMessageIndex`: an existing agent message with the same
  `rrId` but no `approvalRequest` yet is found (the race: Path B resolves
  before Path A's SSE event lands) — caller updates it in place
- `findApprovalMessageIndex`: an existing agent message with the same
  `rrId` and `approvalRequest` already set (regardless of `.name`) is found
  — caller detects it is already-populated and no-ops
- `findApprovalMessageIndex`: a different `rrId` but the same RAR `.name` is
  still found (name-based fallback, for messages that never got `rrId`
  attached)
- `findApprovalMessageIndex`: different `rrId` and different `.name` is not
  found (`-1`) — two genuinely different approvals must both render as
  separate messages
- `findApprovalMessageIndex`: no messages at all is not found (`-1`)
- `findApprovalMessageIndex`: candidate and existing `rrId` both `undefined`
  with different `.name` does not false-positive match
- `findApprovalMessageIndex`: multiple agent messages share the same `rrId`
  (multi-turn conversation about the same RR) — converges onto the most
  recent one (`findLastIndex`), matching how `effectiveRrId` itself is
  derived elsewhere in the component
- `ChatContainer`: chat SSE stream already populated `approvalRequest`
  before the status-polling path resolves — no second card appended
  (regression coverage for the originally-observed symptom)
- `ChatContainer`: status-polling path resolves *before* the chat SSE
  stream's `approval_request` event arrives — no second card appended, and
  the later-arriving SSE event updates the same message instead of creating
  one (regression coverage for the actual root cause)

## 5. Features Not Tested

- Backend audit-trail correctness for `orchestrator.approval.*` events
  (already confirmed single-fire via live-cluster audit trace review, out of
  scope for this repo's own test suite)
- AF's own `approval_request_name`/RAR-name construction (confirmed bare and
  consistent across both emission sites during root-cause investigation;
  not this repo's code to test)

## 6. Approach

Pyramid Invariant: a Unit Test proves `findApprovalMessageIndex`'s lookup
logic in isolation (pure function, no rendering, no mocked transport); the
existing `ChatContainer.status-stream.test.tsx` Integration Test suite is
extended with two cases that drive the real component tree (SSE stream +
status polling both wired to their real hooks, only the transport mocked)
through both the already-populated scenario and the actual race ordering,
proving the wiring converges correctly regardless of which path resolves
first — not re-proving the predicate logic already covered by the unit
test.

### 6.1 Unit Tests (UT) — `findApprovalMessageIndex`

| Test ID | Input | Expected | FedRAMP |
|---------|-------|----------|---------|
| UT-CONSOLE-APPROVAL-001 | Existing agent message: same `rrId`, no `approvalRequest` set yet | index found (race scenario) | AC-6 |
| UT-CONSOLE-APPROVAL-002 | Existing agent message: same `rrId`, `approvalRequest` already set with a different `.name` | index found (already-populated scenario) | AC-6 |
| UT-CONSOLE-APPROVAL-003 | Existing message: different `rrId`, same `.name` | index found (name fallback) | AC-6 |
| UT-CONSOLE-APPROVAL-004 | Existing message: different `rrId`, different `.name` | not found (`-1`), caller appends | AC-6 |
| UT-CONSOLE-APPROVAL-005 | No messages at all | not found (`-1`) | AC-6 |
| UT-CONSOLE-APPROVAL-006 | Candidate and existing `rrId` both `undefined`, different `.name` | not found (`-1`, no false-positive) | AC-6 |
| UT-CONSOLE-APPROVAL-007 | Multiple agent messages share `rrId` (multi-turn) | converges onto the most recent one | AC-6 |

### 6.2 Integration Tests (IT) — Wiring into `ChatContainer`

| Test ID | Scenario | Expected | FedRAMP |
|---------|----------|----------|---------|
| IT-CONSOLE-BANNER-012 | Chat SSE stream renders an approval card for RR `X` first; status-polling path independently resolves `AwaitingApproval` for the same RR `X` afterward | Exactly one "Approval Required" card is rendered | AC-6, SI-4 |
| IT-CONSOLE-BANNER-013 | Status-polling path resolves `AwaitingApproval` and fetches the RAR *before* the chat SSE stream's `approval_request` event arrives for the same RR; the SSE event then arrives late | Exactly one "Approval Required" card is rendered, both before and after the late SSE event lands | AC-6, SI-4 |

## 7. Pass/Fail Criteria

- All new tests in §6 pass
- Full `ui-core` suite continues to pass unmodified in intent
- `vite build` clean

## 8. FedRAMP / OWASP ASVS Control Mapping

| Control | Description | Tests |
|---------|-------------|-------|
| AC-6 (Least Privilege) / operator-decision integrity · ASVS V8 | An operator must not be shown two representations of the same pending approval decision — a duplicated decision surface creates ambiguity about how many approvals are actually pending and which card is authoritative, extending the same operator-decision-integrity objective established in [`docs/tests/90/TEST_PLAN.md`](../90/TEST_PLAN.md) §8 for garbled/malformed approval payloads | §6.1 all, §6.2 |
| SI-4 (System Monitoring) | The operator-facing decision state must be a consistent, de-duplicated view of backend state regardless of which internal channel (SSE artifact stream vs. status poll) populates it first or resolves first, matching this control's existing use in [`docs/tests/22/TEST_PLAN.md`](../22/TEST_PLAN.md) for consistent resource-identity display | §6.2 |

## 9. Test Deliverables

- This test plan document
- `packages/ui-core/src/lib/approval-dedup.ts` + `approval-dedup.test.ts`
- `ChatContainer.tsx` updated to converge both paths onto one message index
- `IT-CONSOLE-BANNER-012` and `IT-CONSOLE-BANNER-013` in
  `ChatContainer.status-stream.test.tsx`

## 10. RED → GREEN → REFACTOR

- **RED (initial, superseded diagnosis)**: `IT-CONSOLE-BANNER-012` written
  first against the pre-fix name-only dedup guard; confirmed failing (2
  cards) before any fix code was written.
- **GREEN (initial fix)**: `hasApprovalCardFor` (rrId-keyed boolean check)
  added; `IT-CONSOLE-BANNER-012` passed. Confidence self-review flagged this
  as addressing a *plausible* but unconfirmed mechanism (§2.1) — closing the
  gap required pulling the live audit trace before treating it as done.
- **RE-RED**: audit-trace evidence disproved the name-mismatch hypothesis
  (§2.1). `IT-CONSOLE-BANNER-013` written to reproduce the actual race
  (status-poll resolves before the SSE event arrives); confirmed failing
  (2 cards) against the `hasApprovalCardFor` fix — proving that fix closed
  the originally-reported symptom by coincidence (both paths happened to
  already share the same key value on this backend), not the underlying
  race.
- **GREEN (corrected fix)**: `hasApprovalCardFor` replaced with
  `findApprovalMessageIndex`; `ChatContainer.tsx`'s status-polling effect
  updates the matched message in place instead of always appending.
  `IT-CONSOLE-BANNER-012` and `IT-CONSOLE-BANNER-013` both pass; full suite
  green (529/529); `vite build` clean.
- **REFACTOR**: lookup logic kept in `lib/approval-dedup.ts` as a
  standalone, unit-tested pure function, preserving the Pyramid Invariant
  pairing for this logic.
