# ADR-001: OAuth2 Proxy Sidecar for Authentication

## Status

Accepted

## Context

The console needs OIDC authentication. Options considered:

1. **Client-side OIDC** (PKCE flow in React) — simpler deployment but exposes tokens in browser, requires managing refresh logic in JS
2. **OAuth2 Proxy as reverse proxy** — handles all auth server-side, browser only sees a session cookie
3. **Envoy with ext_authz** — powerful but complex configuration

## Decision

Use **OAuth2 Proxy** as a sidecar container in the same pod. It runs on port 4180 (service-facing) and forwards authenticated requests to the Nginx container on port 8080 with the `X-Forwarded-Access-Token` header.

## Consequences

- **Positive**: No OIDC secrets in the browser; session cookie is httpOnly/secure; works with any OIDC provider; well-maintained OSS project
- **Positive**: Token refresh handled transparently by oauth2-proxy
- **Negative**: Extra container per pod (minimal resource cost: 25m CPU, 32Mi memory)
- **Negative**: Nginx must explicitly forward `X-Forwarded-Access-Token` as `Authorization` header to backend
- **Lesson learned**: When oauth2-proxy runs in reverse proxy mode (`--upstream`), it sets `X-Forwarded-Access-Token` (not `X-Auth-Request-Access-Token`). Nginx config must match.
