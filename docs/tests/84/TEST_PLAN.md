# Test Plan: Issue #84

## Objective

Verify that a user can explicitly terminate an active interactive investigation
through the backend session lifecycle instead of only aborting the browser's
SSE stream.

## Control objectives

- FedRAMP AC-12: terminate an active user session on request.
- FedRAMP AC-6: only the active driver may terminate its investigation.
- OWASP ASVS V3: preserve authenticated session lifecycle and termination.
- Auditability: use the backend cancellation path so session release and audit
  events remain authoritative.

## Scope boundary

This plan covers the explicit Cancel investigation action. Reliable automatic
cancellation on browser close/navigation is tracked upstream in
kubernaut#2370 and is not a GA acceptance criterion for this issue.

## Pyramid coverage

- Unit: verify cancellation payload construction and local success/error state
  transitions.
- Integration: verify ChatContainer renders the action only for an active
  investigation and calls the real MCP client boundary.
- Live E2E: verify the backend releases the active session and the session
  becomes terminal/cancelled.

## RED

Add failing tests proving that the current Stop agent response action only
aborts the stream and never calls `kubernaut_investigate(action=cancel)`.

## GREEN

- Add an explicit Cancel investigation action.
- Send `{ action: "cancel", rr_id }` through the authenticated MCP client.
- Clear local active-investigation state only after backend success.
- Preserve the active state and show the error when cancellation fails.

## Verification

- Run targeted unit and integration tests.
- Run the live interactive-investigation cancellation scenario.
- Confirm a later investigation does not reattach to the cancelled session.
- Confirm wrong-user/backend authorization failures do not clear local state.
