import { useState, useEffect } from "react";

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

  useEffect(() => {
    fetch("/oauth2/userinfo")
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        const name = data.preferredUsername || data.user || data.name || "";
        const email = data.email || "";
        setUser({ initials: getInitials(name, email), name, email, isLoading: false, error: null });
      })
      .catch((err) => {
        setUser(prev => ({ ...prev, isLoading: false, error: err.message }));
      });
  }, []);

  return user;
}
