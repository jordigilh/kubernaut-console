import { createContext, useContext } from "react";

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export interface KubernautConfig {
  backendUrl: string;
  /** Optional custom fetch function (e.g. consoleFetch for OCP plugins) */
  fetchFn?: FetchFn;
}

export const ConfigContext = createContext<KubernautConfig | null>(null);

export function useConfig(): KubernautConfig {
  const ctx = useContext(ConfigContext);
  if (!ctx) {
    throw new Error("useConfig must be used within a KubernautChat provider");
  }
  return ctx;
}
