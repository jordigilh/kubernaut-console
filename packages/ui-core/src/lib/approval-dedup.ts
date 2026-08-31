import type { ChatMessage } from "../hooks/useChat";

/**
 * Finds the message that should hold the approval card for a given RAR,
 * so the caller can update it in place instead of appending a new one.
 *
 * ChatContainer has two independent paths that can each populate an
 * approval card for the same RAR: the chat SSE artifact stream (`useChat.ts`,
 * "approval_request" event, applied via an in-place update to the current
 * turn's agent message) and a separate status-polling effect that fetches
 * the RAR via `kubernaut_get_approval_request` after an async round trip and
 * appends a *new* message on completion. Live audit-trace evidence for
 * console#115 showed both paths compute the identical bare RAR name on this
 * backend (kubernaut#1959 made `approval_request_name` bare-only), which
 * ruled out a name-format mismatch as the cause -- the actual defect is a
 * timing race: the polling path's fetch can resolve, and its check run,
 * *before* the SSE artifact stream's event has landed on the turn's message
 * at all, so a same-key comparison still finds nothing to dedupe against
 * and a second message gets appended.
 *
 * The fix is structural, not just a better comparison key: both paths must
 * converge on the *same message object* keyed by `rrId` (set on the turn's
 * agent message from the very first `rr_update` SSE event, long before any
 * approval decision), so whichever path resolves first, the other updates
 * that same message in place instead of appending a second one -- and if a
 * message with `approvalRequest` already populated exists there, the caller
 * skips entirely (idempotent, no-op).
 *
 * `rarName` remains a fallback lookup for messages that never had `rrId`
 * attached to them (predates rrId being set, or came from a source that
 * doesn't set it).
 *
 * Returns the index of the message to update in place, or -1 if a brand
 * new message should be appended (no existing message ties back to this
 * decision by either key).
 */
export function findApprovalMessageIndex(
  messages: ChatMessage[],
  rrId: string | undefined,
  rarName: string,
): number {
  if (rrId) {
    const byRrId = messages.findLastIndex((m) => m.role === "agent" && m.rrId === rrId);
    if (byRrId !== -1) return byRrId;
  }
  return messages.findIndex((m) => m.approvalRequest?.name === rarName);
}
