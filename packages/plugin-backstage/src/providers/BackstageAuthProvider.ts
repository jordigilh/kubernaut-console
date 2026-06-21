import { IdentityApi } from "@backstage/core-plugin-api";
import type { KubernautAuthProvider, KubernautUser } from "@kubernaut/ui-core";

export class BackstageAuthProvider implements KubernautAuthProvider {
  constructor(private readonly identityApi: IdentityApi) {}

  async getToken(): Promise<string> {
    const { token } = await this.identityApi.getCredentials();
    return token ?? "";
  }

  async getUser(): Promise<KubernautUser> {
    const identity = await this.identityApi.getBackstageIdentity();
    const userRef = identity.userEntityRef;
    const name = userRef.replace(/^user:default\//, "");
    const initials = getInitials(name);
    return {
      name,
      email: "",
      initials,
    };
  }
}

function getInitials(name: string): string {
  const parts = name.trim().split(/[\s._-]+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}
