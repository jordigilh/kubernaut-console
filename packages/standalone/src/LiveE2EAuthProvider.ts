import type { KubernautAuthProvider, KubernautUser } from "@kubernaut/ui-core";

/**
 * Auth provider for the live E2E suite (ADR-009) only. Real deployments and
 * local dev always use `ProxyAuthProvider` — oauth2-proxy sits in front and
 * injects the Authorization header server-side, so the browser never handles
 * a bearer token directly.
 *
 * The live E2E cluster (kubernaut's own `fullpipeline` bootstrap) has no
 * oauth2-proxy in front of API Frontend, only Dex issuing tokens directly
 * (see `deploy/apifrontend/overlays/e2e/dex.yaml` upstream). There is no
 * console-side equivalent of oauth2-proxy to stand up for phase 1, so this
 * provider authenticates the same way kubernaut's own Go E2E suites do
 * (`fpFetchDEXToken` / `getAFToken` in `test/e2e/fullpipeline`): a Dex ROPC
 * grant fetched once before the console dev server starts, baked into the
 * bundle as `VITE_LIVE_E2E_TOKEN`, and attached client-side as
 * `Authorization: Bearer <token>` on every A2A/MCP request (already
 * supported by `streamA2A`/`callMcpTool` via their `token`/`getToken`
 * options — this provider is the only new piece).
 *
 * `getUser()` returns a fixed identity instead of calling
 * `/oauth2/userinfo` (which does not exist without oauth2-proxy) — audit
 * events still carry a real, stable actor name.
 */
export class LiveE2EAuthProvider implements KubernautAuthProvider {
  async getToken(): Promise<string> {
    const token = import.meta.env.VITE_LIVE_E2E_TOKEN;
    if (!token) {
      throw new Error(
        "LiveE2EAuthProvider: VITE_LIVE_E2E_TOKEN is not set. " +
          "This provider must only run under playwright.live.config.ts, " +
          "whose webServer fetches a real Dex token before starting Vite " +
          "(see e2e/live/scripts/start-console-with-token.mjs).",
      );
    }
    return token;
  }

  async getUser(): Promise<KubernautUser> {
    return { name: "sre-user", email: "sre@kubernaut.ai", initials: "SR" };
  }
}
