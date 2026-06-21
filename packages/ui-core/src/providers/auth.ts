import { createContext, useContext } from "react";

export interface KubernautUser {
  name: string;
  email: string;
  initials: string;
}

export interface KubernautAuthProvider {
  getToken(): Promise<string>;
  getUser(): Promise<KubernautUser>;
}

export interface AuthContextValue {
  provider: KubernautAuthProvider;
  user: KubernautUser | null;
  isLoading: boolean;
  error: string | null;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within a KubernautChat provider");
  }
  return ctx;
}
