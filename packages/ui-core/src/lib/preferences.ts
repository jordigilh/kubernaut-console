// User-facing preferences that should persist across sessions/tabs, unlike
// the ephemeral per-investigation state in session-state.ts (sessionStorage).
// Uses localStorage deliberately: a preference like "show raw thinking" is a
// standing choice about how the UI behaves, not state tied to one chat.

const SHOW_RAW_THINKING_KEY = "kubernaut-console-show-raw-thinking";

// #53: default ON. Anthropic's extended-thinking text is exploratory model
// deliberation, not a polished statement -- some users will want it hidden,
// but a silent/blank panel during a multi-minute investigation is worse UX
// than showing it, so raw thinking stays visible until a user opts out.
const DEFAULT_SHOW_RAW_THINKING = true;

export function getShowRawThinking(): boolean {
  try {
    const raw = localStorage.getItem(SHOW_RAW_THINKING_KEY);
    if (raw === null) return DEFAULT_SHOW_RAW_THINKING;
    return raw === "true";
  } catch {
    return DEFAULT_SHOW_RAW_THINKING;
  }
}

export function setShowRawThinking(value: boolean): void {
  try {
    localStorage.setItem(SHOW_RAW_THINKING_KEY, String(value));
  } catch {
    // Storage unavailable -- preference just won't persist across reloads.
  }
}
