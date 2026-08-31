import type { ChatMessage } from "../hooks/useChat";

/**
 * True if `messages` already contains an approval card for the same
 * decision identified by `rrId`/`rarName`.
 *
 * ChatContainer has two independent paths that can each decide to render an
 * approval card for the same RAR: the chat SSE artifact stream
 * (`useChat.ts`, "approval_request" event) and a separate status-polling
 * effect driven by `AwaitingApproval`. AF's artifact stream uses the bare
 * RAR name while the polling path falls back to the namespaced
 * `approval_request_name` metadata value when the MCP response omits an
 * explicit name, so the same approval can carry two different `.name`
 * values depending on which path populated it (console#115).
 *
 * `rrId` is the primary key: both paths tie back to the same
 * RemediationRequest regardless of naming format, so it is checked first
 * whenever provided. `rarName` remains a fallback for callers/messages that
 * never had `rrId` attached to the approval message.
 */
export function hasApprovalCardFor(
  messages: ChatMessage[],
  rrId: string | undefined,
  rarName: string,
): boolean {
  return messages.some((m) => {
    if (!m.approvalRequest) return false;
    if (rrId && m.rrId === rrId) return true;
    return m.approvalRequest.name === rarName;
  });
}
