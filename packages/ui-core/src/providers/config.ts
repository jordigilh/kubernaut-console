import { createContext, useContext } from "react";

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export interface KubernautConfig {
  backendUrl: string;
  /** Optional custom fetch function (e.g. consoleFetch for OCP plugins) */
  fetchFn?: FetchFn;
  /**
   * Show the "Hide/Show raw thinking" header toggle and honor the user's
   * saved preference (see lib/preferences.ts). Defaults to `true` (current
   * behavior) when the host doesn't set it, so existing hosts are
   * unaffected. Set to `false` to hide the control entirely and force raw
   * thinking off -- e.g. kubernaut v1.5 backends never emit the
   * `reasoning_content` events this feeds, so the button has nothing to
   * show; a host can also disable it deliberately on newer backends before
   * the feature is ready to expose broadly. Each host package is
   * responsible for sourcing this value however fits its deployment model
   * (see packages/standalone's runtime-config.js for the Helm-chart case).
   */
  enableRawThinking?: boolean;
}

export const ConfigContext = createContext<KubernautConfig | null>(null);

export function useConfig(): KubernautConfig {
  const ctx = useContext(ConfigContext);
  if (!ctx) {
    throw new Error("useConfig must be used within a KubernautChat provider");
  }
  return ctx;
}
