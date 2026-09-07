# Test Plan: Issue #102

## Objective

Verify that the standalone console's browser security headers and forwarded
authentication contract are explicit, while preserving the current UI styling
behavior.

## Control objectives

- FedRAMP SC-18/SC-8: protect browser-facing communications and security
  mechanisms.
- OWASP ASVS V14.4: enforce browser security headers.
- Authentication forwarding: preserve API Frontend token validation and do not
  move bearer-token handling into the SPA.

## Pyramid coverage

- Configuration assertions: verify security headers and proxy authorization
  forwarding in the shipped Nginx configuration.
- Proxy smoke: verify authenticated and unauthenticated requests follow the
  intended authorization boundary.
- Browser smoke: verify the built console remains styled and functional.
- No unit test is warranted for a comment or static Nginx directive; the
  proxy/browser smoke checks validate the business-level security outcome.

## Preflight decision

`style-src 'unsafe-inline'` remains required for the current component set,
which emits React inline style attributes. Removing it is deferred until a
separate styling refactor. The strict `script-src 'self'` policy remains in
place.

## RED

Verify that the Nginx configuration has no local explanation of where
`X-Forwarded-Access-Token` comes from or where the resulting Authorization
header is validated.

## GREEN

- Document the oauth2-proxy -> Nginx -> API Frontend token path in the active
  Nginx configuration.
- Document why `style-src 'unsafe-inline'` is retained.

## Verification

- Build the standalone image.
- Verify CSP includes `script-src 'self'` and `frame-ancestors 'none'`.
- Verify authenticated `/a2a/` and `/mcp` requests are forwarded as
  `Authorization: Bearer ...`.
- Verify unauthenticated requests do not receive a fabricated authorization
  header or bypass API Frontend authentication.
- Verify the rendered UI remains styled and interactive.
