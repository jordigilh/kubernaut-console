/**
 * Source-only lifecycle contract. The host must independently verify these
 * values; this module cannot authenticate them. Never put credentials here.
 */
export interface ChatOwnerScope {
  /** Canonical, host-qualified backend/source identity. */
  source: string;
  /** Verified issuer and immutable subject, not display name or email. */
  issuer: string;
  subject: string;
  /** Nonsecret, host-issued authenticated session generation. */
  authSession: string;
  /** Browser-local conversation identity, not an RR, task or driver ID. */
  conversation: string;
}

export interface ChatOwnerLease {
  /** Aborted synchronously on explicit invalidation or scope replacement. */
  readonly signal: AbortSignal;
  isCurrent(): boolean;
  /** Synchronous side effects only; re-check after every asynchronous wait. */
  runIfCurrent(effect: () => void): boolean;
  /** Invalidate only this generation. A stale lease cannot invalidate a successor. */
  invalidate(): boolean;
}

function validScope(scope: ChatOwnerScope): boolean {
  return [scope.source, scope.issuer, scope.subject, scope.authSession, scope.conversation]
    .every((value) => typeof value === "string" && value.length > 0 && value === value.trim());
}

function sameScope(a: ChatOwnerScope, b: ChatOwnerScope): boolean {
  return a.source === b.source && a.issuer === b.issuer && a.subject === b.subject &&
    a.authSession === b.authSession && a.conversation === b.conversation;
}

/**
 * In-memory fencing primitive for one logical owner. It does not manage storage,
 * auth, MCP, network requests, cross-tab state, or backend driver ownership.
 */
export function createChatOwnerBoundary() {
  let active: { scope: ChatOwnerScope; controller: AbortController; lease: ChatOwnerLease } | undefined;
  let revision = 0;
  let loggedOut = false;
  let loggingOut = false;
  let rejectingScope = false;
  let loggedOutSession: string | undefined;
  let lastActiveSession: string | undefined;

  function invalidateCurrent() {
    const invalidationRevision = ++revision;
    const previous = active;
    active = undefined; // Fence callbacks before abort listeners execute.
    previous?.controller.abort();
    return invalidationRevision;
  }

  function activate(scope: ChatOwnerScope | null): ChatOwnerLease | null {
      if (loggedOut || loggingOut || rejectingScope) return null;
      if (!scope || !validScope(scope)) {
        rejectingScope = true;
        try { invalidateCurrent(); } finally { rejectingScope = false; }
        return null;
      }
      if (active && sameScope(active.scope, scope)) return active.lease;
      const invalidationRevision = invalidateCurrent();
      if (revision !== invalidationRevision) return null;
      const captured = { ...scope };
      const controller = new AbortController();
      const isCurrent = () => active?.controller === controller && !controller.signal.aborted;
      const lease: ChatOwnerLease = {
        signal: controller.signal,
        isCurrent,
        runIfCurrent(effect) {
          if (!isCurrent()) return false;
          effect();
          return true;
        },
        invalidate() {
          if (!isCurrent()) return false;
          invalidateCurrent();
          return true;
        },
      };
      active = { scope: captured, controller, lease };
      lastActiveSession = captured.authSession;
      return lease;
  }

  return {
    /** Null means no verified scope. Authentication loading must not call activate. */
    activate,
    /** Source/identity teardown; invoke before clearing associated data. */
    invalidate() { invalidateCurrent(); },
    /** Logout locks activation before abort listeners run. */
    logout() {
      if (loggingOut) return;
      if (lastActiveSession) loggedOutSession = lastActiveSession;
      loggedOut = true;
      loggingOut = true;
      try { invalidateCurrent(); } finally { loggingOut = false; }
    },
    /** Only a host-confirmed fresh authenticated transition may call this. */
    resumeAuthenticated(scope: ChatOwnerScope | null): ChatOwnerLease | null {
      if (!loggedOut || loggingOut || rejectingScope || !scope || !validScope(scope) || scope.authSession === loggedOutSession) return null;
      loggedOut = false;
      return activate(scope);
    },
  };
}
