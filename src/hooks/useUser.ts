import { useState, useEffect, useRef } from "react";

export interface UserInfo {
  initials: string;
  name: string;
  email: string;
  isLoading: boolean;
  error: string | null;
}

function getInitials(name: string, email: string): string {
  if (name && name !== email) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }
  if (email) {
    const local = email.split("@")[0];
    return local.slice(0, 2).toUpperCase();
  }
  return "??";
}

export function useUser(): UserInfo {
  const [user, setUser] = useState<UserInfo>({ initials: "??", name: "", email: "", isLoading: true, error: null });
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;

    fetch("/oauth2/userinfo", { signal: controller.signal })
      .then(res => {
        if (!res.ok) {
          if (res.status === 401 || res.status === 403) {
            window.location.href = "/oauth2/sign_in";
            return;
          }
          throw new Error(`HTTP ${res.status}`);
        }
        return res.json();
      })
      .then(data => {
        if (!data) return;
        const name = data.preferredUsername || data.user || data.name || "";
        const email = data.email || "";
        setUser({ initials: getInitials(name, email), name, email, isLoading: false, error: null });
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        setUser(prev => ({ ...prev, isLoading: false, error: err.message }));
      });

    return () => { controller.abort(); };
  }, []);

  return user;
}
