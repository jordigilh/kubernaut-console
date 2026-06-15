# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.5.x   | :white_check_mark: |
| < 0.5   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

### How to Report

1. **GitHub Private Advisory** (preferred): Use [GitHub Security Advisories](https://github.com/jordigilh/kubernaut-demo-console/security/advisories/new) to report the vulnerability privately.

2. **Email**: Send details to the repository maintainers via the email associated with the [@jordigilh](https://github.com/jordigilh) GitHub account.

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact assessment
- Suggested fix (if any)

### Response Timeline

- **Acknowledgment**: Within 48 hours
- **Initial assessment**: Within 5 business days
- **Fix timeline**: Depends on severity (Critical: 7 days, High: 14 days, Medium: 30 days)

### Scope

This policy covers the `kubernaut-demo-console` frontend application, including:

- React application code (`src/`)
- Nginx proxy configuration (`deploy/`, `chart/`)
- Docker image and container security
- Helm chart templates
- CI/CD pipeline security

For vulnerabilities in the upstream Kubernaut platform (API Frontend, KA, operators), please report to the [kubernaut repository](https://github.com/jordigilh/kubernaut/security).

## Security Practices

This project implements the following security measures:

- **Pre-commit hooks**: Automated scanning for secrets and sensitive data
- **Dependency auditing**: `npm audit` runs in CI on every PR
- **Container scanning**: Trivy scans Docker images for CRITICAL vulnerabilities
- **XSS protection**: `rehype-sanitize` for Markdown rendering, CSP headers via Nginx
- **Authentication**: OAuth2 Proxy with OIDC (Keycloak) — no direct credential handling
- **Transport security**: HTTPS enforced via HSTS headers, TLS termination at edge
- **Rate limiting**: Nginx rate limiting on API proxy paths
- **Non-root containers**: All containers run as non-root with seccomp profiles
