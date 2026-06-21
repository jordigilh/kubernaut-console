import type { KubernautConfig } from "@kubernaut/ui-core";
import { consoleStreamingFetch } from "./useConsoleFetch";

/**
 * The console plugin proxy is declared in the ConsolePlugin CR at
 * spec.proxy[].alias = "kagenti". This routes requests through:
 *   /api/proxy/plugin/kubernaut-console-plugin/kagenti/<path>
 *
 * The proxy automatically handles TLS (service CA) and optionally
 * forwards the user's OAuth token (authorization: UserToken).
 */
const PROXY_BASE_URL =
  "/api/proxy/plugin/kubernaut-console-plugin/kagenti";

export function useOCMConfig(): KubernautConfig {
  return {
    backendUrl: PROXY_BASE_URL,
    fetchFn: consoleStreamingFetch,
  };
}
