import type { ChatMessage } from "../hooks/useChat";

export type ChatStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const PHASE_KEY = "kubernaut-console-phase"; // pre-commit:allow-sensitive (storage key name)
const WORKFLOW_RESOLVED_KEY = "kubernaut-console-workflow-resolved"; // pre-commit:allow-sensitive (storage key name)
export const CONSOLE_MESSAGES_KEY = "kubernaut-console-messages"; // pre-commit:allow-sensitive (storage key name)
export const CONSOLE_CONTEXT_KEY = "kubernaut-console-context"; // pre-commit:allow-sensitive (storage key name)
export const CONSOLE_PENDING_CONTEXT_KEY = "kubernaut-pending-context"; // pre-commit:allow-sensitive (storage key name)

export function loadPersistedPhase(storage?: ChatStorage): ChatMessage["phase"] | undefined {
  try {
    const raw = (storage ?? sessionStorage).getItem(PHASE_KEY);
    if (!raw) return undefined;
    return raw as ChatMessage["phase"];
  } catch {
    return undefined;
  }
}

export function savePersistedPhase(phase: ChatMessage["phase"] | undefined, storage?: ChatStorage): void {
  try {
    if (phase) {
      (storage ?? sessionStorage).setItem(PHASE_KEY, phase);
    } else {
      (storage ?? sessionStorage).removeItem(PHASE_KEY);
    }
  } catch {
    // Storage unavailable
  }
}

export function loadWorkflowResolvedIds(storage?: ChatStorage): Set<string> {
  try {
    const raw = (storage ?? sessionStorage).getItem(WORKFLOW_RESOLVED_KEY);
    if (!raw) return new Set();
    const ids = JSON.parse(raw) as string[];
    return new Set(ids);
  } catch {
    return new Set();
  }
}

export function markWorkflowResolved(rrId: string, storage?: ChatStorage): void {
  try {
    const ids = loadWorkflowResolvedIds(storage);
    ids.add(rrId);
    (storage ?? sessionStorage).setItem(WORKFLOW_RESOLVED_KEY, JSON.stringify([...ids]));
  } catch {
    // Storage unavailable
  }
}

export function isWorkflowResolved(rrId: string | undefined, storage?: ChatStorage): boolean {
  if (!rrId) return false;
  return loadWorkflowResolvedIds(storage).has(rrId);
}

export function clearSessionState(storage?: ChatStorage): void {
  try {
    (storage ?? sessionStorage).removeItem(PHASE_KEY);
    (storage ?? sessionStorage).removeItem(WORKFLOW_RESOLVED_KEY);
  } catch {
    // Storage unavailable
  }
}

/**
 * Ends the browser-side authenticated console session while retaining a
 * non-empty context ID so AF cannot reattach the next session by user.
 */
export function clearConsoleSessionState(): string {
  const freshContext = crypto.randomUUID();
  try {
    const keys = [CONSOLE_MESSAGES_KEY, CONSOLE_PENDING_CONTEXT_KEY, CONSOLE_CONTEXT_KEY, PHASE_KEY, WORKFLOW_RESOLVED_KEY];
    for (const key of keys) sessionStorage.removeItem(key);
    for (const key of keys) {
      if (sessionStorage.getItem(key) !== null) throw new Error("session state remains");
    }
    sessionStorage.setItem(CONSOLE_CONTEXT_KEY, freshContext);
    if (sessionStorage.getItem(CONSOLE_CONTEXT_KEY) !== freshContext) throw new Error("context rotation failed");
  } catch (error) {
    throw new Error("unable to clear console session storage", { cause: error });
  }

  return freshContext;
}

/** Phases where workflow execute/dismiss/escalate must not be offered. */
export function isPastDecisionPhase(phase: ChatMessage["phase"] | undefined): boolean {
  if (!phase) return false;
  return phase !== "investigation" && phase !== "decision";
}
