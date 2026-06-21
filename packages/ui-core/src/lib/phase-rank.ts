import type { ChatMessage } from "../hooks/useChat";

export const CHAT_PHASE_RANK: Record<NonNullable<ChatMessage["phase"]>, number> = {
  investigation: 0,
  decision: 1,
  remediation: 2,
  verifying: 3,
  complete: 4,
  failed: 4,
  timed_out: 4,
};

/** Prefer the furthest-along lifecycle phase; never regress the banner on stale status. */
export function maxChatPhase(
  a: ChatMessage["phase"] | undefined,
  b: ChatMessage["phase"] | undefined,
): ChatMessage["phase"] | undefined {
  if (!a) return b;
  if (!b) return a;
  return (CHAT_PHASE_RANK[a] ?? 0) >= (CHAT_PHASE_RANK[b] ?? 0) ? a : b;
}
