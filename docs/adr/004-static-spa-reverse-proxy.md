# ADR-004: Static SPA with Reverse Proxy

## Status

Accepted

## Context

We need to decide the application architecture for Kubernaut Console: how it's built, served, and how it communicates with backend services.

### Options Considered

1. **Server-rendered (Next.js/Remix)** — Server generates HTML, handles routing and API calls
2. **Static SPA + Reverse Proxy** — Pre-built static files served by nginx, API requests proxied
3. **Micro-frontend** — Console as a module loaded into a larger shell application

## Decision

Build as a **static Single Page Application** served by nginx, with API requests reverse-proxied to the API Frontend.

## Rationale

- **Zero server runtime**: No Node.js process to manage, monitor, or scale — just nginx serving static files
- **Minimal attack surface**: Runtime image contains only nginx + static HTML/JS/CSS — no interpreter, no package manager
- **CDN-friendly**: Static assets can be cached and served from edge locations
- **Simple deployment**: Container image is immutable — same image works in dev, staging, production
- **UBI9 compliance**: Red Hat Universal Base Image provides enterprise security certifications
- **Decoupled scaling**: SPA scales independently from backend (AF handles compute-intensive agent work)
- **Offline-capable**: SPA can render cached UI even during brief API outages

### Trade-offs

- **No SSR**: First paint requires JavaScript execution (acceptable — console is a workspace app, not a public page)
- **Runtime config**: Environment-specific values must be baked at build time or injected via nginx config (we chose the latter via proxy routes)
- **SEO**: Not applicable — console is authenticated, not indexable

## Consequences

- Multi-stage Dockerfile: build with Node.js, serve with nginx
- All routing decisions made in nginx configuration
- API Frontend URL is a nginx config value, not a client-side variable
- Vite handles development proxy; nginx handles production proxy
- SPA fallback (`try_files $uri $uri/ /index.html`) enables client-side routing
- OAuth2 Proxy sits in front of nginx as a sidecar (see ADR-001)
