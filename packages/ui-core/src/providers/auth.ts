import { createContext, useContext } from "react";

/** Authentication must be re-established only after the host fences local work. */
export class AuthenticationRequiredError extends Error {
  constructor() { super("Redirecting to login"); this.name = "AuthenticationRequiredError"; }
}

/** A temporary authentication dependency failure must not force sign-out. */
export class AuthenticationUnavailableError extends Error {
  constructor(message: string) { super(message); this.name = "AuthenticationUnavailableError"; }
}

/** An older host verification request lost a race with a newer one. */
export class AuthenticationSupersededError extends Error {
  constructor() { super("Authentication verification superseded"); this.name = "AuthenticationSupersededError"; }
}

/** Only host/authentication failures use this signal; RBAC denial is separate. */
export function isAuthenticationRejectionMessage(message: string): boolean {
  return /(?:^|[\s:_-])(unauthorized|not authorized|authentication required|access_denied|invalid token|token expired|session expired)(?:$|[\s:._-])/i.test(message);
}

export function isAuthenticationRejectionStatus(status: number): boolean {
  return status === 401 || status === 403;
}

export interface KubernautUser {
  name: string;
  email: string;
  initials: string;
}

export interface KubernautAuthProvider {
  getToken(): Promise<string>;
  getUser(): Promise<KubernautUser>;
}

/**
 * Page-local authenticated lifecycle.  Consumers use isCurrent() before
 * committing asynchronous work so a replaced provider/source cannot mutate
 * the successor lifecycle.
 */
export interface AuthLifecycle {
  generation: number;
  isCurrent(): boolean;
  /** Invalidate this page generation before replacing backend/auth state. */
  invalidate(reason?: string): void;
  /** Observe the sanitized AF process-incarnation signal. */
  observeBackendIncarnation?(incarnation: string | null): void;
}

export interface AuthContextValue {
  provider: KubernautAuthProvider;
  user: KubernautUser | null;
  isLoading: boolean;
  error: string | null;
  lifecycle?: AuthLifecycle;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within a KubernautChat provider");
  }
  return ctx;
}
