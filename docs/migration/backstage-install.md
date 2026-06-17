# Kubernaut Console — Backstage Plugin Installation Guide

## Overview

The `@kubernaut/plugin-backstage` package provides the Kubernaut Console as a
Backstage frontend plugin. It supports:

- **Upstream Backstage 1.49+** (New Frontend System / Module Federation)
- **Red Hat Developer Hub (RHDH) 1.9+** (Legacy frontend, OCI dynamic plugins)
- **RHDH 1.10+** (NFS via `APP_CONFIG_app_packageName=app-next`)

## Prerequisites

- A running Kubernaut backend (kagenti) accessible from the Backstage backend
- Backstage 1.49+ or RHDH 1.9+
- `podman` or `docker` for building OCI images (RHDH deployments)

## Configuration

Add the following to your `app-config.yaml` (or as a separate included file):

```yaml
# Backend proxy — forwards /api/proxy/kubernaut/* to the Kubernaut backend
proxy:
  endpoints:
    '/kubernaut':
      target: ${KUBERNAUT_BACKEND_URL}  # e.g. http://kagenti.kubernaut.svc:8080
      changeOrigin: true
      pathRewrite:
        '^/api/proxy/kubernaut': ''
      headers:
        Authorization: Bearer ${KUBERNAUT_SERVICE_TOKEN}

# Plugin frontend configuration (optional override)
kubernaut:
  # backendUrl: http://localhost:8080  # Only for dev — production uses the proxy
```

## Installation — Upstream Backstage (NFS)

### Option A: From Source (Monorepo Integration)

If Kubernaut lives in the same Backstage monorepo:

```bash
# In your Backstage app packages/app/src/App.tsx
import kubernautPlugin from '@kubernaut/plugin-backstage/alpha';
```

The NFS alpha entry auto-registers the `/kubernaut` route via `PageBlueprint`.

### Option B: Dynamic Plugin Loading

Copy the built plugin to the dynamic plugins directory:

```bash
# Build the plugin
cd packages/plugin-backstage
pnpm build

# Copy to Backstage's dynamic plugins root
cp -r dist/ /path/to/backstage/dynamicPlugins/kubernaut-plugin-backstage/
```

Register in `app-config.yaml`:

```yaml
dynamicPlugins:
  rootDirectory: dynamicPlugins
```

## Installation — RHDH (OCI Dynamic Plugin)

### Build the OCI Image

```bash
cd packages/plugin-backstage

# Build + bundle
./scripts/bundle-dynamic.sh

# Build OCI image
podman build \
  -t ghcr.io/jordigilh/kubernaut-backstage-plugin:0.1.0 \
  -f Containerfile.dynamic .

# Push to registry
podman push ghcr.io/jordigilh/kubernaut-backstage-plugin:0.1.0
```

### Configure RHDH

Add to the `dynamic-plugins` ConfigMap in your RHDH deployment:

#### RHDH 1.9 (Legacy Frontend)

```yaml
# dynamic-plugins.yaml
plugins:
  - package: oci://ghcr.io/jordigilh/kubernaut-backstage-plugin:0.1.0
    integrity: sha256:<computed-hash>
    pluginConfig:
      dynamicPlugins:
        frontend:
          kubernaut.plugin-backstage:
            dynamicRoutes:
              - path: /kubernaut
                importName: KubernautPage
                menuItem:
                  text: Kubernaut
                  icon: chat
```

#### RHDH 1.10+ (NFS)

```yaml
# dynamic-plugins.yaml
plugins:
  - package: oci://ghcr.io/jordigilh/kubernaut-backstage-plugin:0.1.0
    integrity: sha256:<computed-hash>
```

The NFS alpha export auto-registers routes — no `dynamicRoutes` wiring needed.

Ensure NFS is enabled:

```yaml
# app-config.yaml
app:
  packageName: app-next
```

## Verifying the Installation

1. Navigate to `/kubernaut` in your Backstage instance
2. The Kubernaut Console should render with the chat interface
3. Verify the proxy by checking browser DevTools for requests to `/api/proxy/kubernaut`

## Theme Integration

The plugin automatically adapts to Backstage's light/dark theme:
- In upstream Backstage (BUI): PF6 styles are scoped via `.kubernaut-plugin-root`
- In RHDH: PF6 is already loaded by the host — no style conflicts

## Troubleshooting

### Plugin not loading

- Verify the `remoteEntry.js` is accessible from the Backstage frontend
- Check browser console for Module Federation loading errors
- Ensure `backstage.role: "frontend-plugin"` is in the plugin's `package.json`

### API calls failing

- Verify the proxy configuration in `app-config.yaml`
- Check that `KUBERNAUT_BACKEND_URL` is reachable from the Backstage backend pod
- Inspect the Backstage backend logs for proxy errors

### CSS conflicts

- The plugin wraps all content in `.kubernaut-plugin-root` with `all: initial`
- If you see style leaks, ensure the wrapper div is present in the DOM

## Development

Run the plugin in dev mode with mocked Backstage APIs:

```bash
cd packages/plugin-backstage
pnpm start  # Uses @backstage/dev-utils dev app
```

Run tests:

```bash
pnpm --filter @kubernaut/plugin-backstage test
```

Verify bundle structure:

```bash
pnpm --filter @kubernaut/plugin-backstage verify-bundle
```
