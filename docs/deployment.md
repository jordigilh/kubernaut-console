# Deployment Guide

This document covers all deployment options for Kubernaut Console.

## Deployment Options

| Method | Use Case | Prerequisites |
|--------|----------|---------------|
| **kubernaut-operator** | Production / OpenShift | `Kubernaut` CR, OIDC provider |
| **kubernaut's Helm chart** | Production / vanilla Kubernetes | Kubernetes cluster, OIDC provider |
| **Kind manifests** | Testing / local demos | Kind cluster, Kubernaut deployed |
| **Vite dev server** | Frontend development | Node.js 22+, AF port-forwarded |

---

## Production Deployment

This repository does not own or ship either production deployment. For the
upstream `kubernaut` `v1.6.0-rc24` platform release, use one of these paths:

1. **`kubernaut-operator`** for OpenShift: set `spec.console.enabled: true`
   (plus `spec.console.auth.*` for OIDC) on the cluster's `Kubernaut` CR. See
   the [operator documentation](https://github.com/jordigilh/kubernaut-operator)
   for the full field reference.
2. **`kubernaut`'s Helm chart** for vanilla Kubernetes: set
   `console.enabled: true` when installing the
   [`v1.6.0-rc24` chart](https://github.com/jordigilh/kubernaut/tree/v1.6.0-rc24/charts/kubernaut).

The manifests in this repository provide an easy deployment path for testing
and local demos; they are not production deployment templates.

The sections below (Nginx Configuration, Container Image, Health Checks)
describe what's baked into this repo's own image and apply regardless of
which supported upstream deployment path deployed it.

### Production OAuth2 Proxy ownership

This repository does **not** provide a production OAuth2 Proxy manifest or
overlay. Do not promote `deploy/kind/oauth2-proxy.yaml`: it is a local HTTP
demo and intentionally uses `--cookie-secure=false` plus oauth2-proxy's
default encrypted-cookie session store.

The production deployment owners must provide and validate the session-store
configuration. The current
[`kubernaut-operator` implementation](https://github.com/jordigilh/kubernaut-operator/blob/main/internal/resources/console.go)
and the upstream
[`v1.6.0-rc24` Helm template](https://github.com/jordigilh/kubernaut/blob/v1.6.0-rc24/charts/kubernaut/templates/console/console.yaml)
set `--cookie-secure=true`, but neither configures
`--session-store-type=redis` (or an equivalent Redis/Valkey connection) yet.
This repository does not own either deployment's topology, Redis/Valkey
lifecycle, or credentials, so it must not invent a production overlay that
could contradict the upstream owner. Track the production reference and
revocation evidence
in [kubernaut-console#91](https://github.com/jordigilh/kubernaut-console/issues/91);
the earlier [#36](https://github.com/jordigilh/kubernaut-console/issues/36)
consideration is closed and superseded by #91.

---

## Kind Demo Deployment

For local demos using Kind (Kubernetes in Docker).

### Prerequisites

1. A running Kind cluster with Kubernaut deployed via [kubernaut-demo-scenarios](https://github.com/jordigilh/kubernaut-demo-scenarios)
2. Dex and API Frontend running in the cluster
3. Node.js 22+ for building the SPA

### Deploy

```bash
# 1. Build the Console SPA
pnpm install --frozen-lockfile && pnpm build

# 2. Apply Kind manifests
kubectl apply -f deploy/kind/oauth2-proxy.yaml

# 3. Copy static files into the running nginx container
CONSOLE_POD=$(kubectl get pod -n kubernaut-system -l app.kubernetes.io/name=kubernaut-console -o jsonpath='{.items[0].metadata.name}')
kubectl cp packages/standalone/dist/. kubernaut-system/$CONSOLE_POD:/opt/app-root/src/ -c nginx

# 4. Access the console
open http://localhost:30418
# Login: e2e-user@kubernaut.ai / password
```

### Kind Manifest Structure

| File | Purpose |
|------|---------|
| `deploy/kind/oauth2-proxy.yaml` | Full deployment: Secret, ConfigMap (nginx), Deployment, NodePort Service |
| `deploy/kind/console-deployment.yaml` | Comments for `kubectl cp` workflow |
| `deploy/kind/dex-client.yaml` | Dex redirect URI configuration |

### Dex Configuration

Ensure Dex has the console's redirect URI registered:

```yaml
staticClients:
  - id: kubernaut-console
    name: Kubernaut Console
    secret: <client-secret>
    redirectURIs:
      - http://localhost:30418/oauth2/callback
```

---

## Nginx Configuration

### Security Headers

The production nginx config (`deploy/nginx.conf`) includes:

```nginx
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; ..." always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
```

### Rate Limiting

| Zone | Rate | Burst | Endpoint |
|------|------|-------|----------|
| `api` | 30 req/s | 50 | `/a2a/` (SSE streaming) |
| `mcp` | 10 req/s | 20 | `/mcp` (tool calls) |

### Proxy Routes

| Location | Target | Timeout | Notes |
|----------|--------|---------|-------|
| `/a2a/` | API Frontend | 3600s | SSE streaming, buffering disabled |
| `/mcp` | API Frontend | 30s | JSON-RPC tool calls |
| `/.well-known/` | API Frontend | default | Agent card discovery |
| `/healthz` | local 200 | — | Liveness/readiness probe |
| `/` | static files | — | SPA fallback to index.html |

### SSE Streaming Configuration

For long-lived SSE connections, the following timeouts are critical:

```nginx
proxy_buffering off;
proxy_cache off;
proxy_read_timeout 3600s;
proxy_send_timeout 3600s;
send_timeout 3600s;
keepalive_timeout 3600s;
```

---

## Container Image

### Build

```bash
docker build -f packages/standalone/Containerfile -t kubernaut-console:latest .
```

The multi-stage Containerfile uses:
- **Build stage**: `registry.access.redhat.com/ubi9/nodejs-22-minimal:1-1791924375` (pnpm install + pnpm build)
- **Runtime stage**: `registry.access.redhat.com/ubi9/nginx-126:1-1793251909` (serves static files)

Both UBI images are pinned by manifest digest in `packages/standalone/Containerfile`;
the timestamped tags above document the corresponding Red Hat releases. Bump
the tag and digest together when refreshing the base images.

The runtime stage also applies the pinned Red Hat `curl-minimal` and
`libcurl-minimal` `7.76.1-40.el9_8.9` RPM fixes, which postdate that vendor image.
Only this build-time patch uses root; the final image still runs as `USER 1001`.
Revalidate both architecture repositories and the image scan when changing these
RPM pins; do not remove the patches just because the base-image HIGH/CRITICAL
scan passes.

#### Safely bumping base-image digests

When updating a Red Hat base image, use `docker buildx imagetools inspect` (or an
equivalent registry manifest tool) to verify that the intended human-readable
tag is the UBI Node.js or UBI Nginx image and that its manifest list includes
both `linux/amd64` and `linux/arm64`. Update the tag and its `@sha256:` digest
together in `packages/standalone/Containerfile`, using the manifest-list digest
rather than an architecture-specific child digest. Then build the image and
smoke-test `GET /` for a successful static response; retain `USER 1001` in the
runtime stage.

### Registry

Production images are published to:
```
quay.io/kubernaut-ai/demo-console:<tag>
```

Tags follow semver: `v0.5.12` → image tag `0.5.12`.

### Security

- Runs as non-root user (UBI9 default)
- No shell or package manager in runtime image
- `seccompProfile: RuntimeDefault` in pod security context

---

## Environment Variables

### Build-time (Vite)

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_UPSTREAM` | `http://localhost:8443` | Dev proxy target for AF |
| `VITE_MOCK_A2A` | `false` | Enable mock A2A responses |

### Runtime

No runtime environment variables are needed — all routing is handled by the nginx configuration baked into the container image. The OAuth2 Proxy is configured via its command-line flags by the `kubernaut-operator` in production, the upstream [`kubernaut` v1.6.0-rc24 Helm chart](https://github.com/jordigilh/kubernaut/tree/v1.6.0-rc24/charts/kubernaut), or the repository's Kind testing manifest.

---

## Health Checks

| Probe | Endpoint | Expected |
|-------|----------|----------|
| Liveness | `GET /healthz` | 200 "ok" |
| Readiness | `GET /healthz` | 200 "ok" |

Configure in your deployment:

```yaml
livenessProbe:
  httpGet:
    path: /healthz
    port: 8080
  initialDelaySeconds: 5
  periodSeconds: 10
readinessProbe:
  httpGet:
    path: /healthz
    port: 8080
  initialDelaySeconds: 3
  periodSeconds: 5
```

---

## Troubleshooting

### Common Issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| 502 on `/a2a/` | AF not reachable | Check AF service DNS and port |
| 405 on `/mcp` | Missing nginx location | Ensure `/mcp` proxy block exists |
| OIDC redirect loop | Incorrect redirect URI | Verify Dex/Keycloak client config |
| Stale UI after deploy | Image pull policy `IfNotPresent` | Use `Always` or pin by digest |
| SSE disconnects | Proxy timeout too low | Ensure 3600s timeouts on SSE route |
| Rate limited (503) | Burst exceeded | Increase `burst` in nginx config |
