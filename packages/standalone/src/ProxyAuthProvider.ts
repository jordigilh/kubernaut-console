import type { KubernautAuthProvider, KubernautUser } from "@kubernaut/ui-core";

const USE_MOCK = import.meta.env.VITE_MOCK_A2A === "true";

/**
 * Auth provider for oauth2-proxy mode. Token acquisition is a no-op since
 * the reverse proxy injects auth headers. User info is fetched from the
 * proxy's userinfo endpoint.
 */
export class ProxyAuthProvider implements KubernautAuthProvider {
  async getToken(): Promise<string> {
    return "";
  }

  async getUser(): Promise<KubernautUser> {
    if (USE_MOCK) {
      return { name: "Dev User", email: "dev@localhost", initials: "DU" };
    }

    const res = await fetch("/oauth2/userinfo");
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        window.location.href = "/oauth2/sign_in";
        throw new Error("Redirecting to login");
      }
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();
    const name = data.preferredUsername || data.user || data.name || "";
    const email = data.email || "";
    return { name, email, initials: getInitials(name, email) };
  }
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
