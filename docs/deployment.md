# Deployment Guide

This document covers all deployment options for Kubernaut Console.

## Deployment Options

| Method | Use Case | Prerequisites |
|--------|----------|---------------|
| **kubernaut-operator** | Production / OpenShift (recommended) | `Kubernaut` CR, OIDC provider |
| **kubernaut's Helm chart** | Production, non-operator Helm installs | Kubernetes cluster, OIDC provider |
| **Kind manifests** | Local development / demos | Kind cluster, Kubernaut deployed |
| **Vite dev server** | Frontend development | Node.js 22+, AF port-forwarded |

---

## Production Deployment

This repo does not ship its own Helm chart. The console is deployed as part
of the Kubernaut platform via one of two officially-sanctioned paths, both
of which provision the same shape described below (an OAuth2 Proxy sidecar
handling OIDC on port 4180, in front of an Nginx container serving the SPA
and proxying API requests on port 8080) using the same
`quay.io/kubernaut-ai/kubernaut-console` image this repo builds and
publishes:

1. **`kubernaut-operator`** (recommended): set `spec.console.enabled: true`
   (plus `spec.console.auth.*` for OIDC) on the cluster's `Kubernaut` CR. See
   [kubernaut-operator](https://github.com/jordigilh/kubernaut-operator)'s
   own docs for the full field reference.
2. **`kubernaut`'s Helm chart**: set `console.enabled: true` when installing
   [kubernaut](https://github.com/jordigilh/kubernaut)'s chart directly
   (`charts/kubernaut/`), for environments that install via plain Helm
   instead of the operator/OLM.

The sections below (Nginx Configuration, Container Image, Health Checks)
describe what's baked into this repo's own image and apply regardless of
which of the two paths above deployed it.

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
- **Build stage**: `registry.access.redhat.com/ubi9/nodejs-22-minimal:1` (pnpm install + pnpm build)
- **Runtime stage**: `registry.access.redhat.com/ubi9/nginx-126` (serves static files)

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

No runtime environment variables are needed — all routing is handled by the nginx configuration baked into the container image. The OAuth2 Proxy is configured via its command-line flags in whichever deployment path is used (kubernaut-operator, kubernaut's Helm chart, or the Kind manifest).

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
