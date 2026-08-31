# Test Plan: Dedupe approval cards by RR id, not RAR name

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

`ChatContainer` has two independent client-side paths that can each decide
to render an approval card for the same RAR:

- **Path A** — `useChat.ts`'s SSE artifact stream (`metaType ===
  "approval_request"`): merges the parsed payload into the current turn's
  agent message.
- **Path B** — `ChatContainer.tsx`'s status-polling effect, triggered when
  `useRRStatus` reports `AwaitingApproval`: fetches the RAR via
  `kubernaut_get_approval_request` and appends a new message.

The pre-existing dedup guard compared `approvalRequest.name` across
messages. This is not a reliable key: AF's artifact stream (Path A) uses the
bare RAR name, while Path B falls back to the namespaced
`approval_request_name` metadata value when the MCP response omits an
explicit name. The same underlying approval can therefore carry two
different `.name` values depending on which path populated it, so the guard
missed the duplicate.

## 3. Test Items

| Item | File | Change |
|------|------|--------|
| 1 | `packages/ui-core/src/lib/approval-dedup.ts` (new) | Extract the dedup predicate, `hasApprovalCardFor(messages, rrId, rarName)`, keyed primarily on `rrId` (shared by both paths) with `.name` as a fallback |
| 2 | `packages/ui-core/src/components/ChatContainer.tsx` | Use `hasApprovalCardFor` in the status-polling effect's `setMessages` updater; set `rrId: effectiveRrId` on the appended approval message |

## 4. Features to be Tested

- `hasApprovalCardFor`: an existing approval-carrying message with the same
  `rrId` as the candidate, but a different `.name`, is treated as a
  duplicate (the console#115 scenario)
- `hasApprovalCardFor`: an existing approval-carrying message with a
  different `rrId` but the same `.name` is still treated as a duplicate
  (preserves the pre-existing name-based behavior as a fallback)
- `hasApprovalCardFor`: distinct `rrId` and distinct `.name` is not a
  duplicate (two genuinely different approvals must both render)
- `hasApprovalCardFor`: no existing approval-carrying message is never a
  duplicate
- `hasApprovalCardFor`: both the candidate and an existing message having an
  `undefined` `rrId` does not cause a false-positive dedup (must not compare
  `undefined === undefined`)
- `ChatContainer`: when the chat SSE stream has already populated
  `approvalRequest` on the turn's agent message for a given RR, the
  independent status-polling path does not append a second approval card
  for that same RR, even when the RAR name it computes differs from the one
  the SSE stream used

## 5. Features Not Tested

- Backend audit-trail correctness for `orchestrator.approval.*` events
  (already confirmed single-fire via live-cluster audit trace review, out of
  scope for this repo's own test suite)
- The upstream AF/backend naming inconsistency itself (bare vs. namespaced
  RAR name) — this fix makes the console tolerant of it, not aligned with
  upstream on which format is canonical

## 6. Approach

Pyramid Invariant: a Unit Test proves `hasApprovalCardFor`'s dedup logic in
isolation (pure function, no rendering, no mocked transport); the existing
`ChatContainer.status-stream.test.tsx` Integration Test suite is extended
with one case that drives the real component tree (SSE stream + status
polling both wired to their real hooks, only the transport mocked) through
the exact name-mismatch scenario, proving the wiring — not re-proving the
predicate logic already covered by the unit test.

### 6.1 Unit Tests (UT) — `hasApprovalCardFor`

| Test ID | Input | Expected | FedRAMP |
|---------|-------|----------|---------|
| UT-CONSOLE-APPROVAL-001 | Existing message: same `rrId`, different `.name` | `true` (dedup) | AC-6 |
| UT-CONSOLE-APPROVAL-002 | Existing message: different `rrId`, same `.name` | `true` (dedup, fallback) | AC-6 |
| UT-CONSOLE-APPROVAL-003 | Existing message: different `rrId`, different `.name` | `false` (both render) | AC-6 |
| UT-CONSOLE-APPROVAL-004 | No existing approval-carrying message | `false` | AC-6 |
| UT-CONSOLE-APPROVAL-005 | Candidate and existing `rrId` both `undefined`, different `.name` | `false` (no false-positive dedup) | AC-6 |

### 6.2 Integration Test (IT) — Wiring into `ChatContainer`

| Test ID | Scenario | Expected | FedRAMP |
|---------|----------|----------|---------|
| IT-CONSOLE-BANNER-012 | Chat SSE stream renders an approval card (bare RAR name) for RR `X`; status-polling path independently resolves `AwaitingApproval` for the same RR `X`, computing a namespaced RAR name for the same underlying RAR | Exactly one "Approval Required" card is rendered | AC-6, SI-4 |

## 7. Pass/Fail Criteria

- All new tests in §6 pass
- Full `ui-core` suite continues to pass unmodified in intent
- `pnpm build` (vite build) clean

## 8. FedRAMP / OWASP ASVS Control Mapping

| Control | Description | Tests |
|---------|-------------|-------|
| AC-6 (Least Privilege) / operator-decision integrity · ASVS V8 | An operator must not be shown two representations of the same pending approval decision — a duplicated decision surface creates ambiguity about how many approvals are actually pending and which card is authoritative, extending the same operator-decision-integrity objective established in [`docs/tests/90/TEST_PLAN.md`](../90/TEST_PLAN.md) §8 for garbled/malformed approval payloads | §6.1 all, §6.2 |
| SI-4 (System Monitoring) | The operator-facing decision state must be a consistent, de-duplicated view of backend state regardless of which internal channel (SSE artifact stream vs. status poll) populated it first, matching this control's existing use in [`docs/tests/22/TEST_PLAN.md`](../22/TEST_PLAN.md) for consistent resource-identity display | §6.2 |

## 9. Test Deliverables

- This test plan document
- `packages/ui-core/src/lib/approval-dedup.ts` (new) + `approval-dedup.test.ts`
- `ChatContainer.tsx` updated to use the extracted predicate
- `IT-CONSOLE-BANNER-012` in `ChatContainer.status-stream.test.tsx`

## 10. RED → GREEN → REFACTOR

- **RED**: `IT-CONSOLE-BANNER-012` written first against the pre-fix
  name-only dedup guard; confirmed failing (2 cards rendered) before any
  fix code was written.
- **GREEN**: `hasApprovalCardFor` added and wired into `ChatContainer.tsx`;
  `IT-CONSOLE-BANNER-012` passes (1 card rendered); full suite green.
- **REFACTOR**: dedup predicate extracted out of the inline `setMessages`
  updater into `lib/approval-dedup.ts` so it has a standalone Unit Test
  (§6.1), completing the Pyramid Invariant pairing for this logic.
