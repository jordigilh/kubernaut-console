# Test Plan: Keep the RCA Visible During Workflow Discovery

> IEEE 829 test plan for kubernaut-console#129
> Status: Active

## Scope

When an RCA arrives before workflow discovery completes, the chat must position
the viewport at the RCA card rather than below the workflow discovery
placeholder. Ordinary message updates must retain the existing bottom-following
behavior, and an operator who intentionally scrolled upward must not be moved.

## Compliance Boundary

This is a presentation and operator-usability change. It does not change
authentication, authorization, input validation, audit content, transport
security, or the server-authoritative investigation data. Therefore it does
not independently satisfy an OWASP ASVS security requirement. The behavior
supports the operator-visibility intent of FedRAMP IR-4 (Incident Handling) and
SI-4 (System Monitoring), but those controls require broader system evidence
than this UI test. No stronger FedRAMP or ASVS claim is made here.

## Pyramid Invariant

The pure transition decision is unit-tested. The real component tree is
integration-tested through `ChatContainer -> useChat -> AgentBubble`, with only
the A2A transport mocked. A browser E2E test is not required for this change:
the repository's E2E layer validates complete operator journeys and is not a
substitute for component wiring coverage; no backend contract or security
boundary changed.

## Unit Tests

| ID | Scenario | Expected | Controls |
|---|---|---|---|
| UT-CONSOLE-CHAT-SCROLL-001 | New RCA appears while the user is at the live edge | Anchor to the RCA | Functional; no direct ASVS control |
| UT-CONSOLE-CHAT-SCROLL-002 | Existing RCA receives a later update | Do not re-anchor | Functional; no direct ASVS control |
| UT-CONSOLE-CHAT-SCROLL-003 | User has scrolled upward | Preserve the user's position | Functional; no direct ASVS control |
| UT-CONSOLE-CHAT-SCROLL-004 | No RCA is present | Do not anchor | Functional; no direct ASVS control |

## Integration Tests

| ID | Scenario | Expected | Controls |
|---|---|---|---|
| IT-CONSOLE-RCA-SCROLL-001 | A decision payload presents RCA data while workflow discovery remains streaming | The RCA and workflow placeholder render together, and the real component wiring calls `scrollIntoView({ behavior: "smooth", block: "start" })` on the RCA anchor | Supports IR-4/SI-4 operator visibility; no direct ASVS control |

## Acceptance Criteria

- The unit and integration tests pass.
- Existing bottom-following behavior remains intact for non-RCA updates.
- User-initiated upward scrolling is preserved.
- No FedRAMP or ASVS security claim is inferred from this presentation test.
- `pnpm --filter @kubernaut/ui-core build` passes.
