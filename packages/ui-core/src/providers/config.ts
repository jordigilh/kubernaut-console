import { createContext, useContext } from "react";

export interface KubernautConfig {
  backendUrl: string;
}

export const ConfigContext = createContext<KubernautConfig | null>(null);

export function useConfig(): KubernautConfig {
  const ctx = useContext(ConfigContext);
  if (!ctx) {
    throw new Error("useConfig must be used within a KubernautChat provider");
  }
  return ctx;
}
