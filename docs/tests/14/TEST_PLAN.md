# Test Plan: MCP Tool Error Handling on Timed-Out RRs

> **IEEE 829 Test Plan** for kubernaut-console#14
> **Status**: Active
> **Last Updated**: 2026-06-25

## 1. Test Plan Identifier

TP-CONSOLE-14

## 2. Introduction

When a user clicks "No action needed" or "Escalate to team" on a Remediation
Request that has already timed out, the MCP `tools/call` returns a tool-level
error (`result.isError = true`) rather than a JSON-RPC transport error. The
console treats this as success, injecting a misleading "Investigation dismissed"
message and advancing the phase to "complete".

## 3. Test Items

| Item | File | Description |
|------|------|-------------|
| `callMcpTool` | `packages/ui-core/src/lib/mcp-client.ts` | MCP tool call function — must detect `result.isError` |
| `handleDismiss` | `packages/ui-core/src/components/ChatContainer.tsx` | Dismiss handler — inherits error detection from mcp-client |
| `workflowActionTaken` | `packages/ui-core/src/components/ChatContainer.tsx` | Proactive guard — must incorporate `isTerminal` from status stream |

## 4. Features to be Tested

- MCP tool-level error detection (`result.isError = true`)
- Error message extraction from `result.content[].text`
- Proactive button disabling when RR enters a terminal phase
- Error banner display on failed MCP tool calls

## 5. Features Not Tested

- Backend MCP tool behavior (covered by upstream tests)
- JSON-RPC transport error handling (already tested by UT-CONSOLE-MCP-002/003)
- Approval flow error handling (same mcp-client fix applies universally)

## 6. Approach

Pyramid Invariant: Unit Tests prove parse logic, Integration Tests prove wiring.

### 6.1 Unit Tests (UT) — MCP Client Error Detection

| Test ID | Input | Expected | FedRAMP |
|---------|-------|----------|---------|
| UT-CONSOLE-MCP-009 [SI-10] | `result: { isError: true, content: [{ type: "text", text: "RR timed out" }] }` | Returns `{ error: { code: -32000, message: "RR timed out" } }` | SI-10 |
| UT-CONSOLE-MCP-010 [SI-10] | `result: { isError: true, content: [{ type: "text", text: "err1" }, { type: "text", text: "err2" }] }` | Returns error with joined message `"err1; err2"` | SI-10 |
| UT-CONSOLE-MCP-011 [SI-10] | `result: { content: [{ type: "text", text: "success" }] }` (no `isError`) | Returns `{ result: ... }` (success) | SI-10 |

### 6.2 Integration Tests (IT) — Component Wiring

| Test ID | Input | Expected | FedRAMP |
|---------|-------|----------|---------|
| IT-CONSOLE-MCP-002 [AC-6] | Dismiss click when MCP returns `isError: true` | Error banner shown, no success message injected, phase not advanced | AC-6 |
| IT-CONSOLE-MCP-003 [AC-6] | `isTerminal = true` from status stream | Dismiss/escalate buttons are disabled | AC-6 |

## 7. Pass/Fail Criteria

- All tests in section 6 pass
- No existing tests regress
- `pnpm build` clean across all packages
- `pnpm test` full suite green

## 8. FedRAMP Control Mapping

| Control | Description | Tests |
|---------|-------------|-------|
| SI-10 (Input Validation) | MCP tool responses with `isError` are not silently treated as success | MCP-009, MCP-010, MCP-011 |
| AC-6 (Least Privilege) | Actions denied on terminal RRs; buttons disabled proactively | MCP-002, MCP-003 |

## 9. Test Deliverables

- This test plan document
- New unit tests in `mcp-client.test.ts`
- New integration tests in `ChatContainer.integration.test.tsx`
