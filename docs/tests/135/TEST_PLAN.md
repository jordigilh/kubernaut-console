# Test Plan: Restore Chat Live-Edge Following on Enter Submission

> **IEEE 829 Test Plan** for kubernaut-console#135
> **Status**: Active
> **Last Updated**: 2026-09-15

## 1. Introduction

When an operator intentionally scrolls upward, streamed agent updates must not
move the viewport. A newly submitted turn is an explicit request to resume
following the live conversation, regardless of whether it was submitted with
the send button or the Enter key.

Issue #135 exposed a divergence between those two submission paths: the button
path reset the scroll intent and scheduled a bottom scroll, while the Enter
path called `sendMessage` directly. The existing effect then preserved the
stale upward-scroll intent while the new response streamed below the viewport.

## 2. Preflight and Spike Evidence

- Authenticated access to the live Kind console at
  `https://kubernaut-console.local:8843` was verified with `sre-user`.
- The deployed UI was exercised with an intercepted long A2A response to avoid
  changing cluster state during the spike.
- Before the fix, after scrolling upward and submitting a second turn with
  Enter, the viewport measured `scrollTop: 0`, `max scroll: 3841`, and
  `remaining: 3841`.
- The cause was confirmed by tracing both handlers in
  `ChatContainer.tsx`: `handleSubmit` reset `userScrolledUpRef` and scheduled
  scrolling; `handleKeyDown` did neither.
- After the fix, the same reproduction reached `scrollTop: 3840` with
  `max scroll: 3841` and `remaining: 1`.
- Confidence in the localized fix is greater than 90%.

## 3. Pyramid Invariant

The pure scroll-state transition is unit-tested, and the real component wiring
is integration-tested through `ChatContainer -> useChat -> AgentBubble` with
only the A2A transport mocked. The existing RCA and approval scroll tests
remain regression coverage for their separate wiring points.

## 4. Test Items

| Item | File | Description |
|---|---|---|
| Scroll transition | `packages/ui-core/src/lib/chat-scroll.ts` | Determine whether a submitted turn clears upward-scroll intent. |
| Input wiring | `packages/ui-core/src/components/ChatContainer.tsx` | Share submit behavior between button and Enter paths. |
| Component integration | `packages/ui-core/src/components/ChatContainer.integration.test.tsx` | Verify Enter submission re-anchors after simulated upward scrolling. |

## 5. Unit Tests

| Test ID | Scenario | Expected |
|---|---|---|
| UT-CONSOLE-CHAT-SCROLL-005 | Non-empty turn submitted while scrolled up | Return `false`, resuming live-edge following. |
| UT-CONSOLE-CHAT-SCROLL-006 | Empty input submitted | Preserve the existing scroll intent. |

## 6. Integration Tests

| Test ID | Scenario | Expected |
|---|---|---|
| IT-CONSOLE-CHAT-SCROLL-002 | User scrolls upward, then submits a follow-up with Enter | The real `ChatContainer` wiring calls `scrollTo({ top: scrollHeight, behavior: "smooth" })`. |

## 7. Acceptance Criteria

- Button and Enter submissions share identical scroll/reset behavior.
- A valid Enter submission follows the new agent turn to the live edge.
- Shift+Enter remains multiline and does not submit.
- Streaming updates continue to preserve an intentional upward scroll when no
  new turn has been submitted.
- Existing RCA and approval scroll behavior remains green.
- `pnpm build`, `pnpm test`, and `pnpm lint` pass with no errors.

## 8. Test Commands

```bash
pnpm build
pnpm test
pnpm lint
```
