import React, { useEffect, useState } from "react";
import { AuthContext, type KubernautAuthProvider, type KubernautUser } from "../providers/auth";
import { ConfigContext, type KubernautConfig } from "../providers/config";
import { checkConsoleAccess } from "../lib/access-check";
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

  useEffect(() => {
    let cancelled = false;

    (async () => {
      let resolvedUser: KubernautUser;
      try {
        resolvedUser = await authProvider.getUser();
      } catch (err) {
        if (!cancelled) {
          setAuthError((err as Error).message);
          setPhase("auth-error");
        }
        return;
      }
      if (cancelled) return;
      setUser(resolvedUser);

      if (USE_MOCK) {
        setPhase("ready");
        return;
      }

      const access = await checkConsoleAccess({
        baseUrl: config.backendUrl,
        getToken: () => authProvider.getToken(),
      });
      if (cancelled) return;

      // Fail closed: only a clean "allowed" mounts the chat shell. A
      // network/5xx/401 "error" result does not default to rendering chat.
      setPhase(access === "allowed" ? "ready" : access === "denied" ? "access-denied" : "access-error");
    })();

    return () => { cancelled = true; };
  }, [authProvider, config.backendUrl]);

  if (phase === "loading") {
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
      <AuthContext.Provider value={{ provider: authProvider, user, isLoading: false, error: null }}>
        <ChatContainer />
      </AuthContext.Provider>
    </ConfigContext.Provider>
  );
}
