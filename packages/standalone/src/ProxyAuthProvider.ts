import type { KubernautAuthProvider, KubernautUser } from "@kubernaut/ui-core";
import { AuthenticationRequiredError, AuthenticationSupersededError, AuthenticationUnavailableError } from "@kubernaut/ui-core";

const USE_MOCK = import.meta.env.VITE_MOCK_A2A === "true";

/**
 * Auth provider for oauth2-proxy mode. Token acquisition is a no-op since
 * the reverse proxy injects auth headers. User info is fetched from the
 * proxy's userinfo endpoint.
 */
export class ProxyAuthProvider implements KubernautAuthProvider {
  private principal: { iss: string; sub: string; sid: string } | undefined;
  private revision = 0;

  async getToken(): Promise<string> {
    return "";
  }

  async getUser(): Promise<KubernautUser> {
    if (USE_MOCK) {
      return { name: "Dev User", email: "dev@localhost", initials: "DU" };
    }

    const revision = ++this.revision;
    let res: Response;
    try { res = await fetch("/oauth2/userinfo"); }
    catch {
      if (revision !== this.revision) throw new AuthenticationSupersededError();
      throw new AuthenticationUnavailableError("Unable to verify authentication");
    }
    if (revision !== this.revision) throw new AuthenticationSupersededError();
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw new AuthenticationRequiredError();
      }
      throw new AuthenticationUnavailableError(`HTTP ${res.status}`);
    }
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      if (revision !== this.revision) throw new AuthenticationSupersededError();
      throw new AuthenticationRequiredError();
    }
    if (revision !== this.revision) throw new AuthenticationSupersededError();
    const record = data && typeof data === "object" ? data as Record<string, unknown> : undefined;
    const claims = record?.additionalClaims && typeof record.additionalClaims === "object"
      ? record.additionalClaims as Record<string, unknown>
      : undefined;
    const valid = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 2048 && value.trim() === value;
    if (!claims || !valid(claims.iss) || !valid(claims.sub) || !valid(claims.sid) ||
        (this.principal && (claims.iss !== this.principal.iss || claims.sub !== this.principal.sub || claims.sid !== this.principal.sid))) {
      throw new AuthenticationRequiredError();
    }
    this.principal = { iss: claims.iss, sub: claims.sub, sid: claims.sid };
    const name = typeof record?.preferredUsername === "string" ? record.preferredUsername
      : typeof record?.user === "string" ? record.user
        : typeof record?.name === "string" ? record.name : "";
    const email = typeof record?.email === "string" ? record.email : "";
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
