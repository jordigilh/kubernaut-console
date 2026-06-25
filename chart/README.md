# Kubernaut Demo Console — Helm Chart

## Overview

Deploys the Kubernaut Demo Console with OAuth2 Proxy authentication and Nginx reverse proxy.

## Prerequisites

- Kubernetes 1.24+
- Helm 3.x
- An OIDC provider (Keycloak) with a configured client
- A pre-created Secret with OIDC credentials

## Installation

```bash
# Create OIDC secret (cookie-secret must be exactly 16, 24, or 32 bytes)
kubectl create secret generic kubernaut-console-oidc \
  --from-literal=client-id=kubernaut-console \
  --from-literal=client-secret=<secret> \
  --from-literal=cookie-secret=$(openssl rand -hex 16) \
  -n kubernaut-system

# Install
helm install kubernaut-console ./chart \
  --namespace kubernaut-system \
  --set auth.issuerUrl=https://keycloak.example.com/realms/your-realm
```

## Values

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `replicaCount` | int | `1` | Number of replicas |
| `image.repository` | string | `ghcr.io/jordigilh/kubernaut-console` | Image repository |
| `image.tag` | string | `latest` | Image tag |
| `image.digest` | string | `""` | Digest (overrides tag when set) |
| `image.pullPolicy` | string | `Always` | Pull policy |
| `apiFrontend.url` | string | `http://apifrontend.kubernaut-system.svc:8443` | Backend URL |
| `auth.provider` | string | `oidc` | OAuth2 provider |
| `auth.issuerUrl` | string | `""` (required) | OIDC issuer URL |
| `auth.clientId` | string | `""` (required) | OIDC client ID |
| `auth.skipTlsVerify` | bool | `false` | Skip TLS verify (dev only) |
| `auth.existingSecret` | string | `""` (required) | Secret name with OIDC credentials |
| `service.type` | string | `ClusterIP` | Service type |
| `service.port` | int | `4180` | Service port |
| `route.enabled` | bool | `true` | Create OpenShift Route |
| `route.host` | string | `""` | Route hostname (auto if empty) |
| `route.tls.termination` | string | `edge` | TLS termination |
| `securityContext.runAsNonRoot` | bool | `true` | Non-root enforcement |
| `resources.oauth2Proxy` | object | 25m/32Mi req | OAuth2 Proxy resources |
| `resources.nginx` | object | 10m/16Mi req | Nginx resources |

## Upgrading

```bash
helm upgrade kubernaut-console ./chart \
  --namespace kubernaut-system \
  --set image.tag=<new-sha> \
  --set image.digest="" \
  --reuse-values --wait
```

## Uninstalling

```bash
helm uninstall kubernaut-console -n kubernaut-system
```
