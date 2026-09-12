# Test Plan: Display Cumulative LLM Usage in the Final RCA

> IEEE 829 test plan for kubernaut-console#127
> Upstream contract: kubernaut#2387 / DD-KA-007
> Status: Active

## Scope

Display server-computed cumulative investigation and workflow-discovery accounting in the RCA footer. Remove the redundant RR identifier. Financial/USD cost reporting is out of scope.

The final workflow-selection payload includes `options`; its presence, including an empty array, proves discovery completed. An absent `options` key means discovery is pending or was not requested. RCA-only interactive flows must not claim combined discovery totals.

## Pyramid Invariant

Unit tests prove wire parsing, absence/zero semantics, completion gating, and footer formatting. Integration tests prove final artifact-to-`ChatMessage` wiring and DOM rendering through `useChat`.

## Unit Tests

| ID | Scenario | Expected | Controls |
|---|---|---|---|
| UT-CONSOLE-CHAT-127-001 | Final decision payload contains all token keys and `options` | All five metrics map to `RCAData`; metrics are final | AU-3, SI-4 |
| UT-CONSOLE-CHAT-127-002 | Final artifact contains all token keys and `options` | Artifact path maps all five metrics; metrics are final | AU-3, SI-4 |
| UT-CONSOLE-CHAT-127-003 | Token keys absent | No token text, no `undefined`/`NaN`; legacy footer remains safe | SI-10 |
| UT-CONSOLE-CHAT-127-004 | Explicit zero token values | `0 tokens (0 in / 0 out)` renders | AU-3, SI-10 |
| UT-CONSOLE-CHAT-127-005 | Token keys present but `options` absent | Combined token display remains pending | SI-4, SI-10 |
| UT-CONSOLE-RCA-127-001 | RCA renders final metadata | RR omitted; cumulative token text formatted with grouping | AU-3 |

## Integration Tests

| ID | Scenario | Expected | Controls |
|---|---|---|---|
| IT-CONSOLE-RCA-127-001 | Final `investigation_summary` artifact with `options` and token keys | RCA DOM contains combined metrics and no RR footer | AU-2, AU-3, SI-4 |
| IT-CONSOLE-RCA-127-002 | Final artifact with `options: []` | Metrics render and no-workflow state remains available | AU-3, SI-4 |

## Acceptance Criteria

- `pnpm --filter @kubernaut/ui-core test` passes.
- `pnpm --filter @kubernaut/ui-core build` passes.
- Full `pnpm test` and `pnpm build` pass.
- No token value is invented when the server omits a key.
