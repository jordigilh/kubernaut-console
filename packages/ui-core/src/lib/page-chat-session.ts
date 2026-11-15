import { CONSOLE_CONTEXT_KEY, type ChatStorage } from "./session-state";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** A page-local storage seam, not an authenticated identity or lifecycle boundary. */
export function createPageChatSession(generateContext: () => string | undefined = () => crypto.randomUUID()) {
  const values = new Map<string, string>();
  const usedContexts = new Set<string>();

  const storage: ChatStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  };

  const rotateContext = (): string | undefined => {
    // Invalidate first: a failed reset must never reuse the old context.
    values.delete(CONSOLE_CONTEXT_KEY);
    try {
      const context = generateContext();
      if (typeof context !== "string" || !UUID_V4.test(context) || usedContexts.has(context)) return undefined;
      usedContexts.add(context);
      values.set(CONSOLE_CONTEXT_KEY, context);
      return context;
    } catch {
      return undefined;
    }
  };

  const clearConversation = (): string | undefined => {
    values.clear();
    return rotateContext();
  };

  rotateContext();
  return { storage, rotateContext, clearConversation };
}

export type PageChatSession = ReturnType<typeof createPageChatSession>;
