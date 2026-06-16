# Security Policy

## Reporting Vulnerabilities

If you discover a security vulnerability in Kubernaut Console, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

### Reporting Process

1. Email: **security@kubernaut.ai**
2. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact assessment
   - Suggested fix (if any)

### Response Timeline

| Action | SLA |
|--------|-----|
| Acknowledge receipt | 48 hours |
| Initial triage and severity assessment | 5 business days |
| Fix development (Critical/High) | 14 days |
| Fix development (Medium/Low) | 30 days |
| Public disclosure | After fix is released |

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.5.x   | Yes |
| < 0.5.0 | No  |

## Security Controls

Kubernaut Console implements the following security measures aligned with FedRAMP control objectives:

### Access Control (AC-2, AC-6)

- Authentication via OAuth2 Proxy (OIDC with Dex/Keycloak)
- No client-side credential storage
- Session tokens managed by OAuth2 Proxy (httpOnly, Secure cookies)
- Principle of least privilege: `GITHUB_TOKEN` permissions set to read-only

### Audit and Accountability (AU-2, AU-3)

- Client-side audit events emitted for all security-relevant actions:
  - `approve` — User approves a remediation approval request
  - `decline` — User declines a remediation approval request
  - `escalate` — User escalates to team with reason
  - `dismiss` — User dismisses investigation (no action needed)
  - `execute_workflow` — User triggers workflow execution
  - `clear_history` — User clears chat session
- Events include: action, timestamp, user identity, RR ID, and detail payload
- Delivery via `navigator.sendBeacon` (fire-and-forget, survives page unload)

### System and Information Integrity (SI-4, SI-10)

- Input validation: Markdown rendered through rehype-sanitize (XSS protection)
- Content Security Policy (CSP) blocks inline scripts and external resources
- Rate limiting on API endpoints (30r/s for A2A, 10r/s for MCP)

### System and Communications Protection (SC-5, SC-8)

- HSTS enforced (max-age=31536000, includeSubDomains)
- X-Frame-Options: DENY (clickjacking prevention)
- X-Content-Type-Options: nosniff (MIME sniffing prevention)
- Referrer-Policy: strict-origin-when-cross-origin
- Permissions-Policy: camera=(), microphone=(), geolocation=()
- TLS termination at ingress/route level

### Configuration Management (CM-6)

- Container runs as non-root user (UBI9 security context)
- Minimal base image (Red Hat Universal Base Image 9)
- No shell or package manager in runtime image
- Pre-commit hooks detect sensitive data (API keys, tokens, secrets)

## Dependency Security

- `npm audit` runs in CI on every PR
- Trivy container scanning for CRITICAL vulnerabilities
- Automated Dependabot alerts enabled
- Only production dependencies shipped in container image

## Nginx Hardening

The production nginx configuration (`deploy/nginx.conf`) includes:

- Content-Security-Policy with restrictive directives
- Rate limiting zones (configurable burst)
- Proxy buffering disabled for SSE streams
- Long-lived connection timeouts for streaming (3600s)
- Health check endpoint (`/healthz`) with access logging disabled
- Gzip compression for text-based assets
- Immutable cache headers for versioned static assets
