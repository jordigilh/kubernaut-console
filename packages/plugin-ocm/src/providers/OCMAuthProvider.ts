import { consoleFetch } from "@openshift-console/dynamic-plugin-sdk";
import type {
  KubernautAuthProvider,
  KubernautUser,
} from "@kubernaut/ui-core";

/**
 * Authentication provider for the OCP console plugin.
 * Uses the console's built-in proxy with UserToken authorization,
 * which automatically forwards the logged-in user's OAuth token.
 */
export class OCMAuthProvider implements KubernautAuthProvider {
  private cachedUser: KubernautUser | null = null;

  async getToken(): Promise<string> {
    // The console proxy handles token injection via the ConsolePlugin
    // spec.proxy[].authorization: UserToken field. No explicit token
    // management needed — consoleFetch adds it automatically.
    return "";
  }

  async getUser(): Promise<KubernautUser> {
    if (this.cachedUser) {
      return this.cachedUser;
    }

    try {
      const response = await consoleFetch(
        "/api/kubernetes/apis/user.openshift.io/v1/users/~",
      );
      const user = await response.json();
      this.cachedUser = {
        name: user.metadata?.name || "Unknown",
        email:
          user.metadata?.annotations?.["openshift.io/email"] ||
          `${user.metadata?.name}@cluster.local`,
        initials: this.getInitials(user.metadata?.name || "U"),
      };
    } catch {
      this.cachedUser = {
        name: "Console User",
        email: "user@cluster.local",
        initials: "CU",
      };
    }

    return this.cachedUser;
  }

  private getInitials(name: string): string {
    const parts = name.split(/[\s._-]+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }
}
