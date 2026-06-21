import type { ChatMessage } from "../hooks/useChat";

/** User messages that should not start remediation UX (backend may still mis-route). */
const READ_ONLY_QUERY =
  /^(list|show|get|what are|display|summarize|summarise)\b[\s\S]*\b(active\s+)?alerts?\b/i;

export function isReadOnlyQuery(text: string): boolean {
  return READ_ONLY_QUERY.test(text.trim());
}

/** True once the operator has moved beyond a read-only query into remediation. */
export function isInvestigationEngaged(messages: ChatMessage[]): boolean {
  const lastUser = messages.findLast((m) => m.role === "user");
  if (lastUser && !isReadOnlyQuery(lastUser.text)) {
    return true;
  }
  return messages.some(
    (m) =>
      m.role === "agent" &&
      ((m.workflowOptions?.length ?? 0) > 0 || !!m.rca || !!m.approvalRequest),
  );
}
