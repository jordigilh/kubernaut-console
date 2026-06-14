# Deployment Guide

This document covers all deployment options for Kubernaut Console.

## Deployment Options

| Method | Use Case | Prerequisites |
|--------|----------|---------------|
| **Helm chart** | Production / OpenShift | Kubernetes cluster, OIDC provider |
| **Kind manifests** | Local development / demos | Kind cluster, Kubernaut deployed |
| **Vite dev server** | Frontend development | Node.js 22+, AF port-forwarded |

---

## Helm Chart (Production)

The Helm chart deploys a pod with two containers:
1. **OAuth2 Proxy** — handles OIDC authentication (port 4180)
2. **Nginx** — serves the SPA and proxies API requests (port 8080)

### Prerequisites

- Kubernetes 1.28+ or OpenShift 4.14+
- Kubernaut API Frontend deployed in the cluster
- OIDC provider (Keycloak, Dex, or compatible)
- A Kubernetes Secret with OIDC credentials

### Install

```bash
# Create the OIDC secret
kubectl create secret generic kubernaut-console-oidc \
  --namespace kubernaut-system \
  --from-literal=client-id=kubernaut-console \
  --from-literal=client-secret=<YOUR_CLIENT_SECRET> \
  --from-literal=cookie-secret=$(openssl rand -base64 32)

# Install the chart
helm install kubernaut-console ./chart \
  --namespace kubernaut-system \
  --set auth.issuerUrl=https://your-keycloak/realms/kubernaut \
  --set auth.clientId=kubernaut-console \
  --set apiFrontend.url=http://apifrontend-service.kubernaut-system.svc:8443
```

### Configuration

Key values in `chart/values.yaml`:

| Value | Default | Description |
|-------|---------|-------------|
| `image.repository` | `quay.io/kubernaut-ai/demo-console` | Container image |
| `image.tag` | `0.5.5` | Image version |
| `apiFrontend.url` | `http://apifrontend.kubernaut-system.svc:8443` | API Frontend service URL |
| `auth.issuerUrl` | — | OIDC issuer URL |
| `auth.clientId` | `kubernaut-console` | OIDC client ID |
| `auth.existingSecret` | `kubernaut-console-oidc` | Secret name with OIDC creds |
| `service.type` | `ClusterIP` | Service type |
| `service.port` | `4180` | Service port |
| `route.enabled` | `true` | Create OpenShift Route |
| `route.host` | — | Route hostname (auto-derived if empty) |

### Upgrade

```bash
helm upgrade kubernaut-console ./chart \
  --namespace kubernaut-system \
  --set image.tag=0.5.12
```

### OpenShift Route

On OpenShift, the chart auto-detects the `route.openshift.io/v1` API and creates a TLS-terminated Route. Configure the hostname:

```bash
helm install kubernaut-console ./chart \
  --set route.host=console.apps.my-cluster.example.com
```

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
npm ci && npm run build

# 2. Apply Kind manifests
kubectl apply -f deploy/kind/oauth2-proxy.yaml

# 3. Copy static files into the running nginx container
CONSOLE_POD=$(kubectl get pod -n kubernaut-system -l app.kubernetes.io/name=kubernaut-console -o jsonpath='{.items[0].metadata.name}')
kubectl cp dist/. kubernaut-system/$CONSOLE_POD:/opt/app-root/src/ -c console-nginx

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
docker build -t kubernaut-console:latest .
```

The multi-stage Dockerfile uses:
- **Build stage**: `registry.access.redhat.com/ubi9/nodejs-22` (npm ci + vite build)
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

No runtime environment variables are needed — all routing is handled by the nginx configuration baked into the container image. The OAuth2 Proxy is configured via its command-line flags in the Helm chart / Kind manifest.

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
