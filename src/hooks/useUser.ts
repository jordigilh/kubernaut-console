import { useState, useEffect } from "react";

interface UserInfo {
  initials: string;
  name: string;
  email: string;
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
  const [user, setUser] = useState<UserInfo>({ initials: "??", name: "", email: "" });

  useEffect(() => {
    fetch("/oauth2/userinfo")
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) {
          const name = data.preferredUsername || data.user || data.name || "";
          const email = data.email || "";
          setUser({ initials: getInitials(name, email), name, email });
        }
      })
      .catch(() => {});
  }, []);

  return user;
}
