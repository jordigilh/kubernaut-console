# Test Plan: Kind/Name Resource Display Alignment

> **IEEE 829 Test Plan** for kubernaut-console#22
> **Upstream dependency**: kubernaut#1494 (merged)
> **Status**: Active
> **Last Updated**: 2026-06-25

## 1. Test Plan Identifier

TP-CONSOLE-22

## 2. Introduction

Upstream kubernaut PR #1494 changed all SSE metadata `target` fields from bare
resource names (e.g. `"worker"`) to `Kind/Name` format (e.g.
`"Deployment/worker"`). The console has two bugs that cause regressions:

- **Bug A**: Status event handler concatenates `kind + "/" + target` even when
  `target` is already `Kind/Name`, producing `"Deployment/Deployment/worker"`.
- **Bug B**: The `slashNs` heuristic in RCA parsers extracts the pre-slash
  segment as namespace, mistaking Kind for namespace (e.g. `"Deployment"` parsed
  as namespace from `"Deployment/web-frontend"`).

## 3. Test Items

| Item | File | Lines | Description |
|------|------|-------|-------------|
| Path 1 | `packages/ui-core/src/hooks/useChat.ts` | ~456-460 | Status event metadata `resource` construction |
| Path 2 | `packages/ui-core/src/hooks/useChat.ts` | ~319-337 | RCA `investigation_summary` artifact namespace parsing |
| Path 3 | `packages/ui-core/src/hooks/useChat.ts` | ~592-608 | RCA `decision` metadata namespace parsing |

## 4. Features to be Tested

- Resource identity display uses Kind/Name format without double-prefixing
- Namespace is derived only from explicit server-provided fields
- Backward compatibility when backend sends both `kind` and `target` fields

## 5. Features Not Tested

- Backend SSE event generation (covered by upstream kubernaut#1494 tests)
- `InvestigationContext.tsx` display component (verified unaffected — regex
  cleanup is a no-op on Kind/Name format)
- `approval_request_name` handling (already uses namespace/name format)

## 6. Approach

Pyramid Invariant: Unit Tests prove parse logic, Integration Tests prove wiring.

### 6.1 Unit Tests (UT) — Parse Logic

| Test ID | Path | Input | Expected | FedRAMP |
|---------|------|-------|----------|---------|
| UT-CONSOLE-CHAT-022 (update) | 2 | `rca.target = "Deployment/worker"` | `rca.target = "Deployment/worker"` stored verbatim | AU-3 |
| UT-CONSOLE-CHAT-039 (rewrite) | 2 | `rca.target = "Deployment/web-frontend"`, `rca.namespace = "demo-webui"` | `namespace = "demo-webui"` from explicit field | SC-7 |
| UT-CONSOLE-CHAT-039b | 2 | `rca.target = "Deployment/web-frontend"`, no namespace | `namespace = undefined` | SC-7 |
| UT-CONSOLE-CHAT-039c | 2 | `rca.target = "Deployment/web-frontend"`, `rca.namespace = "demo-webui"` | `namespace = "demo-webui"` | SC-7, AU-3 |
| UT-CONSOLE-CHAT-039d | 3 | `rca.target = "StatefulSet/db"`, no namespace | `namespace = undefined` | SC-7 |
| UT-CONSOLE-CHAT-039e | 3 | `rca.target = "StatefulSet/db"`, `rca.namespace = "prod"` | `namespace = "prod"` | SC-7, AU-3 |

### 6.2 Integration Tests (IT) — Hook Wiring

| Test ID | Path | Input | Expected | FedRAMP |
|---------|------|-------|----------|---------|
| IT-CONSOLE-STATUS-META-001 (update) | 1 | `target: "Deployment/api-frontend"` | `resource = "Deployment/api-frontend"` | SI-4 |
| IT-CONSOLE-STATUS-META-004 (update) | 1 | `target: "Pod/my-pod-xyz"` | `resource = "Pod/my-pod-xyz"` | SI-4 |
| IT-CONSOLE-STATUS-META-005 | 1 | `target: "Deployment/api"`, no `kind` | `resource = "Deployment/api"` | SI-4, AU-3 |
| IT-CONSOLE-STATUS-META-006 | 1 | `kind: "Deployment"` + `target: "Deployment/api"` | `resource = "Deployment/api"` (no double-prefix) | SI-4, AU-3 |

## 7. Pass/Fail Criteria

- All tests in section 6 pass
- No existing tests regress
- `pnpm build` clean across all packages
- `pnpm test` full suite green (361+ tests)

## 8. FedRAMP Control Mapping

| Control | Description | Tests |
|---------|-------------|-------|
| AU-3 (Audit Content) | Audit records contain unambiguous resource identity matching CRD `targetDisplay` format | CHAT-022, 039c, 039e, META-005, META-006 |
| SI-4 (System Monitoring) | Status events carry accurate Kind/Name resource identifiers for operator display | META-001, META-004, META-005, META-006 |
| SC-7 (Boundary Protection) | Server-authoritative namespace — client does not infer namespace from resource identity string | CHAT-039, 039b, 039c, 039d, 039e |

## 9. Test Deliverables

- This test plan document
- Updated test fixtures in `useChat.test.ts` and `useChat.integration.test.ts`
- New test cases as specified in section 6
