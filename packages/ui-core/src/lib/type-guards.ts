/**
 * Narrows `unknown` to a plain, non-null object whose properties can be
 * safely probed with `in`/`typeof obj.field`. Shared by every shape
 * validator introduced for kubernaut-console#90 (F-12) across
 * `investigation-summary.ts`, `useChat.ts`, and `a2a-client.ts` -- extracted
 * during REFACTOR to remove the repeated
 * `typeof data !== "object" || data === null` prefix that appeared
 * identically in all five guards.
 */
export function isRecord(data: unknown): data is Record<string, unknown> {
  return typeof data === "object" && data !== null;
}
