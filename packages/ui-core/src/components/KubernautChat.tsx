import React, { useEffect, useState } from "react";
import { AuthContext, type KubernautAuthProvider, type KubernautUser } from "../providers/auth";
import { ConfigContext, type KubernautConfig } from "../providers/config";
import { ChatContainer } from "./ChatContainer";

export interface KubernautChatProps {
  authProvider: KubernautAuthProvider;
  config: KubernautConfig;
}

export function KubernautChat({ authProvider, config }: KubernautChatProps) {
  const [user, setUser] = useState<KubernautUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    authProvider.getUser().then((u) => {
      if (!cancelled) {
        setUser(u);
        setIsLoading(false);
      }
    }).catch((err) => {
      if (!cancelled) {
        setError(err.message);
        setIsLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [authProvider]);

  if (isLoading) {
    return (
      <div className="kn-chat kn-chat--loading" role="status" aria-label="Loading authentication">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", opacity: 0.6 }}>
          <span>Authenticating...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="kn-chat kn-chat--error" role="alert">
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: "0.5rem" }}>
          <strong>Authentication Error</strong>
          <span style={{ fontSize: "0.875rem", opacity: 0.7 }}>{error}</span>
        </div>
      </div>
    );
  }

  return (
    <ConfigContext.Provider value={config}>
      <AuthContext.Provider value={{ provider: authProvider, user, isLoading, error }}>
        <ChatContainer />
      </AuthContext.Provider>
    </ConfigContext.Provider>
  );
}
