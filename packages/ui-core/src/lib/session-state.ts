import type { ChatMessage } from "../hooks/useChat";

const PHASE_KEY = "kubernaut-console-phase"; // pre-commit:allow-sensitive (storage key name)
const WORKFLOW_RESOLVED_KEY = "kubernaut-console-workflow-resolved"; // pre-commit:allow-sensitive (storage key name)

export function loadPersistedPhase(): ChatMessage["phase"] | undefined {
  try {
    const raw = sessionStorage.getItem(PHASE_KEY);
    if (!raw) return undefined;
    return raw as ChatMessage["phase"];
  } catch {
    return undefined;
  }
}

export function savePersistedPhase(phase: ChatMessage["phase"] | undefined): void {
  try {
    if (phase) {
      sessionStorage.setItem(PHASE_KEY, phase);
    } else {
      sessionStorage.removeItem(PHASE_KEY);
    }
  } catch {
    // Storage unavailable
  }
}

export function loadWorkflowResolvedIds(): Set<string> {
  try {
    const raw = sessionStorage.getItem(WORKFLOW_RESOLVED_KEY);
    if (!raw) return new Set();
    const ids = JSON.parse(raw) as string[];
    return new Set(ids);
  } catch {
    return new Set();
  }
}

export function markWorkflowResolved(rrId: string): void {
  try {
    const ids = loadWorkflowResolvedIds();
    ids.add(rrId);
    sessionStorage.setItem(WORKFLOW_RESOLVED_KEY, JSON.stringify([...ids]));
  } catch {
    // Storage unavailable
  }
}

export function isWorkflowResolved(rrId: string | undefined): boolean {
  if (!rrId) return false;
  return loadWorkflowResolvedIds().has(rrId);
}

export function clearSessionState(): void {
  try {
    sessionStorage.removeItem(PHASE_KEY);
    sessionStorage.removeItem(WORKFLOW_RESOLVED_KEY);
  } catch {
    // Storage unavailable
  }
}

/** Phases where workflow execute/dismiss/escalate must not be offered. */
export function isPastDecisionPhase(phase: ChatMessage["phase"] | undefined): boolean {
  if (!phase) return false;
  return phase !== "investigation" && phase !== "decision";
}
