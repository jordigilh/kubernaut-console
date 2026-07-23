# Test Plan: Consume cluster_id for the Investigation Context Banner

> **IEEE 829 Test Plan** for kubernaut-console#35
> **Upstream dependency**: kubernaut#1409 / kubernaut#1653 (merged)
> **Status**: Active
> **Last Updated**: 2026-07-23

## 1. Test Plan Identifier

TP-CONSOLE-35

## 2. Introduction

Upstream `kubernaut` PR #1653 threads a fleet `cluster_id` (ADR-065) through
`EventBridge.mergeRRContext` and `emitDecisionEvent` so it reaches the Console
on three independent wire paths. The Console does not yet parse it anywhere
(`grep -rn "cluster_id\|clusterId" packages/ui-core/src` returns zero matches),
so `InvestigationContext`'s existing `cluster` prop is always `undefined` —
dead code fed by a field name (`statusMetadata?.cluster`) that never existed
on the wire.

Verified directly against `jordigilh/kubernaut` source (not assumed from the
original issue body, which mislabeled one of the three sites):

| # | Wire path | Backend source of truth | Shape |
|---|---|---|---|
| 1 | Status-update envelope metadata | `event_bridge.go:132-156` (`mergeRRContext`) | `event.metadata.cluster_id` (top-level, sibling to `rr_id`/`namespace`/`alert_name`) |
| 2 | `investigation_summary` artifact DataPart | `part_converter.go:394-406` (`emitDecisionEvent`) + `investigation_summary.v1.schema.json:15-18` | `payload.cluster_id` (top-level, sibling to `session_id`/`rr_id`, **not** nested in `rca`) |
| 3 | `execution_progress` artifact DataPart | `execution_progress.v1.schema.json:30-33` | `payload.cluster_id` (top-level; schema explicitly defines it even though Console doesn't parse any identity field from this artifact today) |
| 4 | `decision` status-update (JSON-in-text mirror) | Same `mergeRRContext` as #1 — `EmitStructuredMeta` → `emitStatusEventWithMeta` → `mergeRRContext` | `event.metadata.cluster_id` (**envelope**, not `parsed.cluster_id` inside the JSON text body — the JSON body comes from `FunctionResponse`, a separate data flow from `emitDecisionEvent`'s `data` map) |

Path 4 corrects the original issue body, which assumed a `parsed.cluster_id`
read (~line 662-684) mirroring `parsed.signal_name`/`parsed.namespace`. Those
two fields ARE embedded in that JSON body (they originate from the FunctionCall
args). `cluster_id` is not — it only reaches this event via the same
`mergeRRContext` envelope path as #1, so the correct read is
`event.metadata?.cluster_id`, identical in shape to path #1 but a distinct
call site in `useChat.ts`.

Fleet-absent (local-hub) RRs omit `cluster_id` entirely at the source
(`event_bridge.go:82-85`, `ADR-065`, "no false attribution via empty-string
noise") — Console must treat absence as "no cluster field", not render an
empty value. `InvestigationContext.tsx` already guards on truthiness
(`{cluster && (...)}`), so this is satisfied for free once a real value (or
`undefined`) reaches it.

## 3. Test Items

| Item | File | Lines (current) | Description |
|------|------|-------|-------------|
| Path 1 | `packages/ui-core/src/hooks/useChat.ts` | ~511-527 | Status-update `rr_id` block — add `clusterId` from `event.metadata.cluster_id` |
| Path 2 | `packages/ui-core/src/hooks/useChat.ts` | ~385-417 | `investigation_summary` artifact handler — add `clusterId` from `payload.cluster_id` (top-level, not `payload.rca.cluster_id`) |
| Path 3 | `packages/ui-core/src/hooks/useChat.ts` | ~447-484 | `execution_progress` artifact handler — extend payload type cast + add `clusterId` from `payload.cluster_id` |
| Path 4 | `packages/ui-core/src/hooks/useChat.ts` | ~644-688 | `decision` status-update handler — add `clusterId` from `event.metadata?.cluster_id` (envelope, not parsed JSON body) |
| Path 5 | `packages/ui-core/src/components/ChatContainer.tsx` | 52 | Replace dead `statusMetadata?.cluster` read with a 3-source fallback chain matching `alertName`/`namespace`/`resource` (lines 40-51) |
| Type defs | `packages/ui-core/src/hooks/useChat.ts` | 41-52, 127-150 | Add `clusterId?: string` to `RCAData` and `ChatMessage` |

## 4. Features to be Tested

- `cluster_id` parsed from all four independent wire paths into `ChatMessage.clusterId` / `RCAData.clusterId`
- `ChatContainer`'s `cluster` value resolves via the same message-level → `lastRca` → `statusMetadata` fallback chain used by `alertName`/`namespace`/`resource`
- Absence of `cluster_id` (local-hub RR) yields `undefined`, not an empty-string render
- `InvestigationContext` "Cluster" field renders once a real value reaches it (existing component, no changes expected — verified by IT, not re-implemented)

## 5. Features Not Tested

- Backend `cluster_id` propagation/precedence logic itself (covered by upstream `kubernaut` tests: `part_converter_test.go` UT-AF-1409-006/006b/006c, `event_bridge_test.go` UT-AF-1409-001/001b/002, `streaming_it_test.go` IT-AF-1409-009)
- `BuildPhaseMetadata` (status/watch SSE channel) emitting `cluster_id` — confirmed it still does not (dead code path today); the `statusMetadata?.cluster_id` fallback in Path 5 is forward-compat only, not exercised by a live test until upstream adds it
- Any change to `InvestigationContext.tsx` itself — it already renders `cluster` correctly (lines 116-120); this plan proves it now *receives* a real value, not new rendering logic

## 6. Approach

Pyramid Invariant: Unit Tests prove parse logic per wire path, Integration Tests prove end-to-end wiring into the rendered banner.

### 6.1 Unit Tests (UT) — Parse Logic

| Test ID | Path | Input | Expected | FedRAMP |
|---------|------|-------|----------|---------|
| UT-CONSOLE-CHAT-048 | 1 | `event.metadata = { rr_id: "rr-1", cluster_id: "cluster-east-1" }` | `ChatMessage.clusterId = "cluster-east-1"` | SI-4, AU-3 |
| UT-CONSOLE-CHAT-049 | 2 | `investigation_summary` payload with top-level `cluster_id: "cluster-fleet-a"` | `RCAData.clusterId` and `ChatMessage.clusterId` both `"cluster-fleet-a"` | SI-4, AU-3 |
| UT-CONSOLE-CHAT-050 | 3 | `execution_progress` payload with `cluster_id: "cluster-fleet-a"` | `ChatMessage.clusterId = "cluster-fleet-a"` | SI-4, AU-3 |
| UT-CONSOLE-CHAT-051 | 4 | `decision` status-update with `event.metadata.cluster_id = "cluster-b"`, JSON text body WITHOUT `cluster_id` | `ChatMessage.clusterId = "cluster-b"` (proves envelope read, not body read) | SI-4, AU-3, SI-10 |
| UT-CONSOLE-CHAT-052 | 1-4 | No `cluster_id` present anywhere (local-hub RR) | `ChatMessage.clusterId = undefined` on all four paths — no false empty-string attribution | SI-10 |

### 6.2 Integration Tests (IT) — Banner Wiring

| Test ID | Path | Input | Expected | FedRAMP |
|---------|------|-------|----------|---------|
| IT-CONSOLE-CTX-002 | 2 | `investigation_summary` artifact SSE event with `cluster_id: "cluster-fleet-a"` | `investigation-context` testid banner renders "Cluster" field with `cluster-fleet-a` | AU-3, SI-4 |
| IT-CONSOLE-CTX-003 | 1 | Status-update SSE event with `cluster_id` before any artifact arrives | Banner renders cluster from the earlier-arriving status-update (fallback chain picks it up pre-artifact) | SI-4 |

## 7. Pass/Fail Criteria

- All tests in section 6 pass
- No existing tests regress (`alertName`/`namespace`/`resource` fallback chains and existing UT-CONSOLE-CHAT-0xx suite)
- `pnpm build` clean across all packages
- `pnpm test` full suite green

## 8. FedRAMP Control Mapping

| Control | Description | Tests |
|---------|-------------|-------|
| SI-4 (System Monitoring) | Operator can correlate an investigation to its originating fleet cluster in multi-cluster deployments | CHAT-048, 049, 050, 051, CTX-002, CTX-003 |
| AU-3 (Audit Content) | Displayed cluster identity matches the server-authoritative `RRContext.ClusterID`/artifact `cluster_id`, never client-inferred | CHAT-048, 049, CTX-002 |
| SI-10 (Input Validation) | Absent `cluster_id` (local-hub) does not render a false/empty value; envelope vs. body precedence is exact, not guessed | CHAT-051, CHAT-052 |

## 9. Test Deliverables

- This test plan document
- Updated type defs (`RCAData`, `ChatMessage`) in `useChat.ts`
- New test cases in `useChat.test.ts` (UT-CONSOLE-CHAT-048 through 052)
- New test cases in `ChatContainer.integration.test.tsx` (IT-CONSOLE-CTX-002, 003)

## 10. Open Item (Non-Blocking)

Confirm with upstream whether AF ever sends a secondary/aliased key for
cluster (mirroring the `alert_name`/`signal_name` dual-key pattern already
handled at Path 1/status-update `namespace`/`target_namespace` in
`ChatContainer.tsx`). Not found in current schemas/code — proceeding with a
single `cluster_id` key, matching every backend source of truth found in
section 2.
