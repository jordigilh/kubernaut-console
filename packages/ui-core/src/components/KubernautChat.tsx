import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AuthContext, AuthenticationRequiredError, AuthenticationSupersededError, AuthenticationUnavailableError, type AuthLifecycle, type KubernautAuthProvider, type KubernautUser } from "../providers/auth";
import { ConfigContext, type KubernautConfig } from "../providers/config";
import { checkConsoleAccess } from "../lib/access-check";
import { notifyAuthLifecycleChanged, subscribeAuthLifecycleNotifications } from "../lib/auth-notifications";
import { BackendContractUnavailableError, readBackendIncarnation } from "../lib/backend-contract";
import { clearConsoleSessionState } from "../lib/session-state";
import { ChatContainer } from "./ChatContainer";

export interface KubernautChatProps {
  authProvider: KubernautAuthProvider;
  config: KubernautConfig;
}

// console#48 / kubernaut#1919: gate rendering behind AF's coarse-grained
// console-access authorization check (GET /a2a/access), not just per-tool
// SAR. A user with valid OIDC credentials but zero Kubernaut tool grants
// would otherwise see the full chat shell and only discover they can't do
// anything once every action starts failing one by one. This lives in the
// shared KubernautChat component (not packages/standalone/App.tsx) so it
// covers every consumer -- standalone, plugin-backstage, plugin-ocm -- for
// free, since they all mount through this single integration point.
type Phase = "loading" | "auth-error" | "access-denied" | "access-error" | "ready";

// console#48: in mock-A2A mode (standalone/accessibility E2E, local `pnpm dev`)
// there is no real AF backend to answer GET /a2a/access, so the fail-closed
// check would otherwise always resolve to "access-error" and block every
// consumer of the mocked backend. Mirrors the existing VITE_MOCK_A2A bypass
// in ProxyAuthProvider.getUser() / useChat.ts / useRRStatus.ts.
const USE_MOCK = import.meta.env.VITE_MOCK_A2A === "true";

export function KubernautChat({ authProvider, config }: KubernautChatProps) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [user, setUser] = useState<KubernautUser | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authRetry, setAuthRetry] = useState(0);
  const [verifiedSource, setVerifiedSource] = useState<{ provider: KubernautAuthProvider; backendUrl: string } | null>(null);
  const generationRef = useRef(0);
  const activeGenerationRef = useRef(0);
  const lifecycleActiveRef = useRef(false);
  const sourceRef = useRef<{ provider: KubernautAuthProvider; backendUrl: string } | null>(null);

  const backendIncarnationRef = useRef<string | undefined>(undefined);
  const invalidateLifecycle = useCallback((reason = "authenticated lifecycle replaced", message?: string) => {
    if (!lifecycleActiveRef.current) return;
    lifecycleActiveRef.current = false;
    backendIncarnationRef.current = undefined;
    setUser(null);
    setVerifiedSource(null);

    try {
      clearConsoleSessionState();
    } catch {
      setAuthError("Unable to clear console session storage. Reload to retry.");
      setPhase("auth-error");
      return;
    }

    if (reason === "authentication-required") {
      notifyAuthLifecycleChanged();
      setAuthError("Authentication required. Sign in again.");
      setPhase("auth-error");
      window.location.href = "/oauth2/sign_in";
      return;
    }

    if (reason === "authentication-unavailable") {
      setAuthError(message ?? "Unable to verify authentication. Retry.");
      setPhase("auth-error");
      return;
    }

    if (reason === "backend-incarnation-unavailable") {
      setAuthError(message ?? "Unable to verify backend lifecycle. Retry.");
      setPhase("auth-error");
      return;
    }

    setAuthError(null);
    setPhase("loading");
    setAuthRetry((value) => value + 1);
  }, []);

  const observeBackendIncarnation = useCallback((incarnation: string | null) => {
    if (!config.requireBackendIncarnation || USE_MOCK) return;
    if (!incarnation) {
      invalidateLifecycle("backend-incarnation-unavailable");
      return;
    }
    const previous = backendIncarnationRef.current;
    if (!previous) {
      backendIncarnationRef.current = incarnation;
      return;
    }
    if (previous !== incarnation) {
      invalidateLifecycle("backend-incarnation-changed");
    }
  }, [config.requireBackendIncarnation, invalidateLifecycle]);

  const lifecycle = useMemo<AuthLifecycle>(() => ({
    get generation() {
      return generationRef.current;
    },
    isCurrent: () => lifecycleActiveRef.current && generationRef.current === activeGenerationRef.current,
    invalidate: invalidateLifecycle,
    observeBackendIncarnation,
  }), [invalidateLifecycle, observeBackendIncarnation]);

  useEffect(() => {
    const generation = ++generationRef.current;
    activeGenerationRef.current = generation;
    const sourceChanged = sourceRef.current !== null && (
      sourceRef.current.provider !== authProvider || sourceRef.current.backendUrl !== config.backendUrl
    );
    sourceRef.current = { provider: authProvider, backendUrl: config.backendUrl };
    lifecycleActiveRef.current = !sourceChanged;
    backendIncarnationRef.current = undefined;
    const isGenerationCurrent = () => generationRef.current === generation;
    const isCurrent = () => lifecycleActiveRef.current && isGenerationCurrent();

    if (sourceChanged) {
      setUser(null);
      setVerifiedSource(null);
      try {
        clearConsoleSessionState();
      } catch {
        // This effect is the boundary that can prove storage cleanup failed;
        // render the retry gate before any successor chat can mount.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setAuthError("Unable to clear console session storage. Reload to retry.");
        setPhase("auth-error");
        return;
      }
      lifecycleActiveRef.current = true;
    }

    (async () => {
      let resolvedUser: KubernautUser;
      try {
        resolvedUser = await authProvider.getUser();
      } catch (err) {
        if (!isCurrent()) return;
        if (err instanceof AuthenticationSupersededError) {
          return;
        }
        if (err instanceof AuthenticationRequiredError) {
          invalidateLifecycle("authentication-required");
          return;
        }
        invalidateLifecycle(
          "authentication-unavailable",
          err instanceof AuthenticationUnavailableError || err instanceof Error
            ? err.message
            : "Unable to verify authentication. Retry.",
        );
        return;
      }
      if (!isCurrent()) return;

      if (config.requireBackendIncarnation && !USE_MOCK) {
        try {
          const incarnation = await readBackendIncarnation({
            baseUrl: config.backendUrl,
            fetchFn: config.fetchFn,
          });
          if (!isCurrent()) return;
          backendIncarnationRef.current = incarnation;
        } catch (err) {
          if (!isCurrent()) return;
          invalidateLifecycle(
            "backend-incarnation-unavailable",
            err instanceof BackendContractUnavailableError ? err.message : "Unable to verify backend lifecycle",
          );
          return;
        }
      }

      if (!isCurrent()) return;
      setUser(resolvedUser);

      if (USE_MOCK) {
        setVerifiedSource({ provider: authProvider, backendUrl: config.backendUrl });
        setPhase("ready");
        notifyAuthLifecycleChanged();
        return;
      }

      // The access check is always required: GET /a2a/access is called on
      // every mount and the chat shell only renders on a clean "allowed".
      // The API frontend controls the behavior server-side
      // (consoleAccessAuthorizationCheckEnabled) — there is no client-side
      // toggle to skip it.
      const access = await checkConsoleAccess({
        baseUrl: config.backendUrl,
        getToken: () => authProvider.getToken(),
      });
      if (!isCurrent()) return;
      setVerifiedSource({ provider: authProvider, backendUrl: config.backendUrl });

      // Fail closed: only a clean "allowed" mounts the chat shell. A
      // network/5xx/401 "error" result does not default to rendering chat.
      const nextPhase = access === "allowed" ? "ready" : access === "denied" ? "access-denied" : "access-error";
      setPhase(nextPhase);
      if (nextPhase === "ready") notifyAuthLifecycleChanged();
    })();

    return () => {
      if (isGenerationCurrent()) lifecycleActiveRef.current = false;
    };
  }, [authProvider, config.backendUrl, config.fetchFn, config.requireBackendIncarnation, authRetry, invalidateLifecycle]);

  useEffect(() => {
    if (
      phase !== "ready" ||
      verifiedSource?.provider !== authProvider ||
      verifiedSource.backendUrl !== config.backendUrl
    ) {
      return;
    }

    const generation = generationRef.current;
    let revalidationPending = false;
    let disposed = false;
    const isCurrent = () => !disposed && lifecycleActiveRef.current && generationRef.current === generation;

    const revalidate = async () => {
      if (revalidationPending || !isCurrent()) return;
      revalidationPending = true;
      try {
        const verifiedUser = await authProvider.getUser();
        if (!isCurrent()) return;

        if (config.requireBackendIncarnation && !USE_MOCK) {
          const incarnation = await readBackendIncarnation({
            baseUrl: config.backendUrl,
            fetchFn: config.fetchFn,
          });
          if (!isCurrent()) return;
          observeBackendIncarnation(incarnation);
          if (!isCurrent()) return;
        }

        setUser(verifiedUser);
      } catch (err) {
        if (!isCurrent() || err instanceof AuthenticationSupersededError) return;
        if (err instanceof AuthenticationRequiredError) {
          invalidateLifecycle("authentication-required");
          return;
        }
        invalidateLifecycle(
          "authentication-unavailable",
          err instanceof AuthenticationUnavailableError || err instanceof Error
            ? err.message
            : "Unable to verify authentication. Retry.",
        );
      } finally {
        revalidationPending = false;
      }
    };

    const unsubscribe = subscribeAuthLifecycleNotifications(() => { void revalidate(); });
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [authProvider, config.backendUrl, config.fetchFn, config.requireBackendIncarnation, invalidateLifecycle, observeBackendIncarnation, phase, verifiedSource]);

  if (phase === "loading" || (phase === "ready" && (verifiedSource?.provider !== authProvider || verifiedSource.backendUrl !== config.backendUrl))) {
    return (
      <div className="kn-chat kn-chat--loading" role="status" aria-label="Loading authentication">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", opacity: 0.6 }}>
          <span>Authenticating...</span>
        </div>
      </div>
    );
  }

  if (phase === "auth-error") {
    return (
      <div className="kn-chat kn-chat--error" role="alert">
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: "0.5rem" }}>
          <strong>Authentication Error</strong>
          <span style={{ fontSize: "0.875rem", opacity: 0.7 }}>{authError}</span>
          <button type="button" onClick={() => {
            setAuthError(null);
            setPhase("loading");
            setAuthRetry((value) => value + 1);
          }}>Retry</button>
        </div>
      </div>
    );
  }

  if (phase === "access-denied") {
    return (
      <div className="kn-chat kn-chat--denied" role="alert">
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: "0.5rem", padding: "0 2rem", textAlign: "center" }}>
          <strong>Access Denied</strong>
          <span style={{ fontSize: "0.875rem", opacity: 0.7 }}>
            You don't have permission to use Kubernaut. Contact your administrator to request access.
          </span>
        </div>
      </div>
    );
  }

  if (phase === "access-error") {
    return (
      <div className="kn-chat kn-chat--error" role="alert">
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: "0.5rem", padding: "0 2rem", textAlign: "center" }}>
          <strong>Unable to Verify Access</strong>
          <span style={{ fontSize: "0.875rem", opacity: 0.7 }}>
            Could not confirm Kubernaut access right now. Please try again shortly.
          </span>
        </div>
      </div>
    );
  }

  return (
    <ConfigContext.Provider value={config}>
      <AuthContext.Provider value={{ provider: authProvider, user, isLoading: false, error: null, lifecycle }}>
        <ChatContainer />
      </AuthContext.Provider>
    </ConfigContext.Provider>
  );
}
