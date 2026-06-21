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

  return (
    <ConfigContext.Provider value={config}>
      <AuthContext.Provider value={{ provider: authProvider, user, isLoading, error }}>
        <ChatContainer />
      </AuthContext.Provider>
    </ConfigContext.Provider>
  );
}
