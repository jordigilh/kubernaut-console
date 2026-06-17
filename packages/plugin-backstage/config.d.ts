export interface Config {
  kubernaut?: {
    /**
     * Base URL for the Kubernaut backend API.
     * Defaults to "/api/proxy/kubernaut" (uses Backstage backend proxy).
     * @visibility frontend
     */
    backendUrl?: string;
  };
}
