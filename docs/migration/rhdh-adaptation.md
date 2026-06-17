# RHDH Downstream Adaptation Guide

This guide covers adapting the `@kubernaut/plugin-backstage` for Red Hat Developer Hub (RHDH) deployment.

## Compatibility Matrix

| RHDH Version | Backstage Version | Frontend System | Plugin Loading | Status |
|---|---|---|---|---|
| 1.9.x | ~1.40 | Legacy | YAML static | Supported |
| 1.10.x | ~1.45 | NFS (optional) | YAML + Dynamic | Supported |
| 1.11+ | ~1.49+ | NFS (default) | Dynamic OCI | Supported |

## Distribution: OCI Image

The plugin is distributed as an OCI image built from the `dist-dynamic/` directory:

```bash
# Build the plugin
pnpm --filter @kubernaut/plugin-backstage build
pnpm --filter @kubernaut/plugin-backstage bundle

# Build OCI image
podman build -f packages/plugin-backstage/Containerfile.dynamic \
  -t ghcr.io/jordigilh/kubernaut-plugin-backstage:latest \
  packages/plugin-backstage/
```

## Installation: RHDH 1.9 (Legacy Frontend)

### 1. Dynamic Plugin Configuration

In your RHDH `app-config.yaml`:

```yaml
dynamicPlugins:
  frontend:
    kubernaut-plugin-backstage:
      mountPoints:
        - mountPoint: entity.page.kubernaut/cards
          importName: KubernautPage
          config:
            layout:
              gridColumnEnd: -1
      dynamicRoutes:
        - path: /kubernaut
          importName: KubernautPage
```

### 2. Backend Proxy Configuration

```yaml
proxy:
  endpoints:
    /kubernaut:
      target: https://kagenti.kubernaut.svc.cluster.local:8443
      changeOrigin: true
      headers:
        Authorization: "Bearer ${KUBERNAUT_SERVICE_TOKEN}"

kubernaut:
  backendUrl: /api/proxy/kubernaut
```

### 3. RBAC (if RHDH permission framework is enabled)

```yaml
permission:
  enabled: true
  rbac:
    policies:
      - role: kubernaut-user
        permission: kubernaut.chat.read
      - role: kubernaut-user
        permission: kubernaut.chat.write
      - role: kubernaut-admin
        permission: kubernaut.remediation.approve
```

## Installation: RHDH 1.10+ (NFS / Dynamic)

### 1. Plugin Configuration

```yaml
dynamicPlugins:
  frontend:
    kubernaut-plugin-backstage:
      pluginConfig:
        kubernaut:
          backendUrl: /api/proxy/kubernaut
```

The NFS entry point (`./alpha`) is automatically detected by RHDH 1.10+.

### 2. Backend Proxy (same as above)

The proxy configuration is identical across RHDH versions.

## CSS Isolation

The plugin wraps all content in a `.kubernaut-plugin-root` container with PF6 styles scoped. This prevents any style leakage into the RHDH host application.

Since RHDH uses PatternFly internally, the PF6 tokens are generally compatible. The scoped root ensures version isolation if the host uses a different PF6 minor version.

## Authentication Flow

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────┐
│   RHDH Frontend │     │   RHDH Backend    │     │   kagenti   │
│                 │     │   Proxy           │     │             │
│  BackstageAuth  │────▶│  /api/proxy/      │────▶│  /a2a/invoke│
│  Provider       │     │  kubernaut/       │     │             │
│  (identityApi)  │     │  + Bearer token   │     │  SSE stream │
└─────────────────┘     └──────────────────┘     └─────────────┘
```

1. `BackstageAuthProvider` calls `identityApi.getCredentials()` to get the user's Backstage token
2. The proxy endpoint adds the service token for kagenti authentication
3. SSE streaming works through the standard Backstage proxy (Node.js http-proxy)

## Testing in RHDH

### Local Development

```bash
# Use the Backstage dev app
cd packages/plugin-backstage
pnpm start
```

### Deploy to RHDH Dev Instance

```bash
# Push OCI image
podman push ghcr.io/jordigilh/kubernaut-plugin-backstage:latest

# Install in RHDH (Helm)
helm upgrade rhdh redhat-developer/backstage \
  --set "global.dynamic.plugins[0].package=oci://ghcr.io/jordigilh/kubernaut-plugin-backstage:latest" \
  --set "global.dynamic.plugins[0].integrity=sha256:..." \
  --reuse-values
```

## Known Limitations

1. **RHDH 1.9 only**: The `mountPoints` approach requires explicit wiring; the plugin won't auto-register
2. **Proxy timeout**: Default Backstage proxy timeout is 30s. For long chat sessions, configure:
   ```yaml
   proxy:
     endpoints:
       /kubernaut:
         timeout: 300000  # 5 minutes for SSE
   ```
3. **RBAC**: The plugin does not enforce its own permissions — it relies on RHDH's permission framework if enabled
