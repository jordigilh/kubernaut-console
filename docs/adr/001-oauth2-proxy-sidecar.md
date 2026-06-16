# ADR-001: OAuth2 Proxy Sidecar Pattern

## Status

Accepted

## Context

Kubernaut Console requires OIDC authentication to protect access to incident remediation capabilities. We need to decide where authentication logic lives.

### Options Considered

1. **Client-side OIDC** — SPA handles token exchange, refresh, and storage
2. **Backend-for-Frontend (BFF)** — Dedicated server handles auth and proxies requests
3. **OAuth2 Proxy sidecar** — Dedicated container handles OIDC, injects tokens into proxied requests

## Decision

Use **OAuth2 Proxy as a sidecar container** in the same pod as the nginx SPA server.

## Rationale

- **No client-side credentials**: Tokens are never exposed to JavaScript, eliminating XSS-based token theft
- **Session cookies**: OAuth2 Proxy manages httpOnly/Secure cookies — the SPA is stateless
- **Zero auth code in SPA**: No OIDC library, no token refresh logic, no redirect handling in React
- **Provider-agnostic**: Works with Dex, Keycloak, Azure AD, Okta — any OIDC provider
- **FedRAMP AC-2/AC-6 aligned**: Principle of least privilege — SPA has no direct access to tokens
- **Kubernetes-native**: Sidecar pattern is well-understood in K8s deployments

### Trade-offs

- **Extra container**: Adds ~32Mi memory per pod
- **Coupling**: Authentication is tied to deployment topology (can't run SPA standalone with auth)
- **Session affinity**: Multi-replica deployments need shared session store or sticky sessions

## Consequences

- User identity is extracted from `X-Auth-Request-*` headers (set by OAuth2 Proxy)
- The `useUser` hook reads identity from these headers via a lightweight fetch
- All API requests (`/a2a/`, `/mcp`) are authenticated by the proxy before reaching nginx
- Local development uses Vite's built-in proxy (no auth) — mock mode doesn't need OAuth2 Proxy
