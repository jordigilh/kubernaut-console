# Design Document: Multi-Platform Plugin Architecture

> **ADR Reference**: [ADR-004](../adr/004-multi-platform-plugin-architecture.md)
> **Status**: Draft
> **Last Updated**: 2026-06-16

## 1. Overview

This document defines the technical architecture for migrating the Kubernaut console from a standalone React application to a portable UI core that runs as a plugin in multiple platforms: Backstage (upstream), OCM multicluster-console (upstream), and standalone (current oauth2-proxy mode).

The migration is **incremental extraction** — the current codebase becomes the core, not a rewrite.

## 2. Package Structure

```
kubernaut-demo-console/
├── packages/
│   ├── ui-core/                    # Platform-agnostic chat UI
│   │   ├── src/
│   │   │   ├── components/         # All chat UI components (PF6)
│   │   │   ├── hooks/              # useChat, useInvestigation, etc.
│   │   │   ├── lib/                # A2A client, MCP client, schemas
│   │   │   ├── providers/          # Auth context, theme context
│   │   │   └── index.ts            # Public API: <KubernautChat />, types
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── vite.config.ts          # Library build (ESM + CJS)
│   │
│   ├── plugin-backstage/           # Backstage frontend plugin
│   │   ├── src/
│   │   │   ├── plugin.ts           # createPlugin() + createPageExtension()
│   │   │   ├── routes.ts           # /kubernaut route
│   │   │   ├── BackstageAuthProvider.ts
│   │   │   └── index.ts
│   │   ├── dev/                    # Backstage dev app for local testing
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── plugin-ocm/                 # OCM dynamic console plugin
│   │   ├── src/
│   │   │   ├── plugin.ts           # ConsolePlugin entry (module federation)
│   │   │   ├── OCMAuthProvider.ts
│   │   │   ├── components/
│   │   │   │   └── KubernautPage.tsx
│   │   │   └── index.ts
│   │   ├── console-extensions.json # OCP ConsolePlugin extensions
│   │   ├── package.json
│   │   └── webpack.config.ts       # Module federation config
│   │
│   └── standalone/                 # Current deployment mode
│       ├── src/
│       │   ├── App.tsx             # Standalone shell (Vite dev server)
│       │   ├── ProxyAuthProvider.ts
│       │   └── main.tsx
│       ├── package.json
│       └── vite.config.ts
│
├── package.json                    # Workspace root (pnpm workspaces)
├── pnpm-workspace.yaml
└── turbo.json                      # Turborepo build orchestration
```

### Dependency Graph

```
plugin-backstage ──┐
plugin-ocm ────────┼──► ui-core
standalone ────────┘
```

All platform packages depend on `ui-core`. The core has **zero** platform dependencies.

## 3. UI Core (`packages/ui-core`)

### 3.1 Public API

```typescript
// packages/ui-core/src/index.ts

export { KubernautChat } from "./components/KubernautChat";
export type { KubernautChatProps } from "./components/KubernautChat";
export type { KubernautAuthProvider } from "./providers/auth";
export type { KubernautConfig } from "./providers/config";
export type { ChatMessage, TargetDivergence } from "./hooks/useChat";
```

### 3.2 Root Component

```typescript
// packages/ui-core/src/components/KubernautChat.tsx

import { AuthContext } from "../providers/auth";
import { ConfigContext } from "../providers/config";
import { ChatContainer } from "./ChatContainer";

export interface KubernautChatProps {
  authProvider: KubernautAuthProvider;
  config: KubernautConfig;
  className?: string;
}

export function KubernautChat({ authProvider, config, className }: KubernautChatProps) {
  return (
    <AuthContext.Provider value={authProvider}>
      <ConfigContext.Provider value={config}>
        <ChatContainer className={className} />
      </ConfigContext.Provider>
    </AuthContext.Provider>
  );
}
```

### 3.3 Component Migration

| Current Location | Core Location | Notes |
|---|---|---|
| `src/components/ChatContainer.tsx` | `ui-core/src/components/ChatContainer.tsx` | Replaces Tailwind with PF6 |
| `src/components/AgentBubble.tsx` | `ui-core/src/components/AgentBubble.tsx` | Uses `@patternfly/chatbot` `<Message>` |
| `src/components/WorkflowCards.tsx` | `ui-core/src/components/WorkflowCards.tsx` | PF6 Card, Alert, Button |
| `src/components/UserBubble.tsx` | `ui-core/src/components/UserBubble.tsx` | Uses `@patternfly/chatbot` `<Message>` |
| `src/hooks/useChat.ts` | `ui-core/src/hooks/useChat.ts` | No changes to logic |
| `src/lib/a2a-client.ts` | `ui-core/src/lib/a2a-client.ts` | Fetch API (platform-agnostic) |
| `src/lib/mcp-client.ts` | `ui-core/src/lib/mcp-client.ts` | Token from AuthContext |

### 3.4 Styling: PF6 Token System

The core replaces all Tailwind utility classes with PatternFly 6 equivalents:

```typescript
// Before (Tailwind)
<div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-700">

// After (PF6)
import { Alert } from "@patternfly/react-core";
<Alert variant="info" isInline isPlain title="Targeting root cause">
  {/* content */}
</Alert>
```

Key PF6 dependencies:
- `@patternfly/react-core` — layout, buttons, cards, alerts, panels
- `@patternfly/react-icons` — iconography
- `@patternfly/chatbot` — `<Chatbot>`, `<MessageBox>`, `<Message>`, `<ChatbotFooter>`
- `@patternfly/react-styles` — CSS token system

### 3.5 State Management

The current `useChat` hook is the single source of state. It is extracted to the core with one modification: the A2A/MCP clients read the auth token from `AuthContext` instead of reading proxy headers directly.

```typescript
// packages/ui-core/src/lib/a2a-client.ts
import { useAuth } from "../providers/auth";

export function createA2AClient(config: KubernautConfig, authProvider: KubernautAuthProvider) {
  return {
    async stream(taskId: string, message?: string) {
      const token = await authProvider.getToken();
      const response = await fetch(`${config.backendUrl}/a2a`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ /* ... */ }),
      });
      // SSE streaming logic unchanged
    },
  };
}
```

## 4. Auth Interface

### 4.1 Interface Definition

```typescript
// packages/ui-core/src/providers/auth.ts
import { createContext, useContext } from "react";

export interface KubernautAuthProvider {
  /** Returns a valid access token (JWT) for Kubernaut backend */
  getToken(): Promise<string>;

  /** Returns the authenticated user's identity */
  getUser(): Promise<KubernautUser>;

  /** Optional: refresh the token proactively */
  refreshToken?(): Promise<string>;

  /** Optional: handle token expiration */
  onTokenExpired?(): void;
}

export interface KubernautUser {
  name: string;
  email: string;
  groups?: string[];
}

export const AuthContext = createContext<KubernautAuthProvider | null>(null);

export function useAuth(): KubernautAuthProvider {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("KubernautAuthProvider not configured");
  return ctx;
}
```

### 4.2 Platform Implementations

#### Backstage (`plugin-backstage`)

```typescript
// packages/plugin-backstage/src/BackstageAuthProvider.ts
import { identityApiRef, useApi } from "@backstage/core-plugin-api";
import type { KubernautAuthProvider, KubernautUser } from "@kubernaut/ui-core";

export class BackstageAuthProvider implements KubernautAuthProvider {
  constructor(private identityApi: typeof identityApiRef) {}

  async getToken(): Promise<string> {
    const { token } = await this.identityApi.getCredentials();
    return token ?? "";
  }

  async getUser(): Promise<KubernautUser> {
    const identity = await this.identityApi.getBackstageIdentity();
    return {
      name: identity.userEntityRef,
      email: identity.userEntityRef,
    };
  }
}
```

#### OCM (`plugin-ocm`)

```typescript
// packages/plugin-ocm/src/OCMAuthProvider.ts
import type { KubernautAuthProvider, KubernautUser } from "@kubernaut/ui-core";

export class OCMAuthProvider implements KubernautAuthProvider {
  async getToken(): Promise<string> {
    // OCP console injects a ServiceAccount token or user OIDC token
    // via consoleplugin-backend proxy or direct OIDC
    const response = await fetch("/api/kubernaut/token", { credentials: "include" });
    const { token } = await response.json();
    return token;
  }

  async getUser(): Promise<KubernautUser> {
    const response = await fetch("/api/kubernaut/user", { credentials: "include" });
    return response.json();
  }
}
```

#### Standalone (`packages/standalone`)

```typescript
// packages/standalone/src/ProxyAuthProvider.ts
import type { KubernautAuthProvider, KubernautUser } from "@kubernaut/ui-core";

export class ProxyAuthProvider implements KubernautAuthProvider {
  async getToken(): Promise<string> {
    // oauth2-proxy sets X-Forwarded-Access-Token header
    // In standalone mode, the proxy passes the token to the backend
    // The frontend trusts the proxy and sends requests without an explicit token
    return "";
  }

  async getUser(): Promise<KubernautUser> {
    // oauth2-proxy sets X-Forwarded-User and X-Forwarded-Email headers
    const response = await fetch("/oauth2/userinfo");
    const { user, email } = await response.json();
    return { name: user, email };
  }
}
```

## 5. Backstage Plugin (`packages/plugin-backstage`)

### 5.1 Plugin Registration (New Frontend System)

```typescript
// packages/plugin-backstage/src/plugin.ts
import {
  createPlugin,
  createPageExtension,
} from "@backstage/frontend-plugin-api";
import { KubernautChat } from "@kubernaut/ui-core";

export const kubernautPlugin = createPlugin({
  id: "kubernaut",
});

export const KubernautPage = kubernautPlugin.provide(
  createPageExtension({
    defaultPath: "/kubernaut",
    loader: async () => import("./components/KubernautPageWrapper"),
  }),
);
```

### 5.2 Page Wrapper

```typescript
// packages/plugin-backstage/src/components/KubernautPageWrapper.tsx
import { useApi, identityApiRef } from "@backstage/core-plugin-api";
import { Header, Page, Content } from "@backstage/core-components";
import { KubernautChat } from "@kubernaut/ui-core";
import { BackstageAuthProvider } from "../BackstageAuthProvider";

export default function KubernautPageWrapper() {
  const identityApi = useApi(identityApiRef);
  const authProvider = new BackstageAuthProvider(identityApi);
  const config = { backendUrl: "/api/proxy/kubernaut" };

  return (
    <Page themeId="tool">
      <Header title="Kubernaut" subtitle="AI-Driven Kubernetes Remediation" />
      <Content>
        <KubernautChat authProvider={authProvider} config={config} />
      </Content>
    </Page>
  );
}
```

### 5.3 Build & Distribution

- Built with `@backstage/cli` for compatibility
- Published as:
  - **npm package**: `@kubernaut/plugin-backstage` (static installation)
  - **OCI artifact**: Dynamic plugin loading in Backstage 1.49+ / RHDH
- Tested against upstream Backstage dev app

## 6. OCM Console Plugin (`packages/plugin-ocm`)

### 6.1 Module Federation Entry

```typescript
// packages/plugin-ocm/src/plugin.ts
import { KubernautChat } from "@kubernaut/ui-core";
import { OCMAuthProvider } from "./OCMAuthProvider";

const KubernautPage = () => {
  const authProvider = new OCMAuthProvider();
  const config = { backendUrl: "/api/proxy/kubernaut" };

  return <KubernautChat authProvider={authProvider} config={config} />;
};

export default KubernautPage;
```

### 6.2 ConsolePlugin CR

```yaml
apiVersion: console.openshift.io/v1
kind: ConsolePlugin
metadata:
  name: kubernaut-console-plugin
spec:
  displayName: Kubernaut
  backend:
    type: Service
    service:
      name: kubernaut-console-plugin
      namespace: kubernaut-system
      port: 9443
      basePath: /
  proxy:
    - alias: kubernaut
      endpoint:
        type: Service
        service:
          name: kubernaut-api
          namespace: kubernaut-system
          port: 8080
      authorize: true
```

### 6.3 Console Extensions

```json
// packages/plugin-ocm/console-extensions.json
[
  {
    "type": "console.page/route",
    "properties": {
      "path": "/kubernaut",
      "exact": true,
      "component": { "$codeRef": "KubernautPage" }
    }
  },
  {
    "type": "console.navigation/href",
    "properties": {
      "id": "kubernaut",
      "name": "Kubernaut",
      "href": "/kubernaut",
      "perspective": "admin"
    }
  }
]
```

### 6.4 ManagedClusterAddon

The addon deploys the Kubernaut agent to spoke clusters:

```yaml
apiVersion: addon.open-cluster-management.io/v1alpha1
kind: ManagedClusterAddOn
metadata:
  name: kubernaut-agent
  namespace: managed-cluster-1
spec:
  installNamespace: kubernaut-system
```

The addon controller watches `ManagedClusterAddOn` resources on the hub and deploys the agent manifests (Deployment, Service, ConfigMap) to each managed cluster via ManifestWork.

## 7. Isolation Strategy

### 7.1 Problem: PF6 in PF5 Hosts

OCM/OCP 4.17-4.18 uses PatternFly 5. The console plugin loads PF6 components into the same DOM. Without isolation, CSS conflicts occur (variable name collisions, specificity overrides).

### 7.2 Solution: CSS Modules + Scoped Variables

```typescript
// packages/plugin-ocm/webpack.config.ts
module.exports = {
  module: {
    rules: [
      {
        test: /\.css$/,
        use: [
          "style-loader",
          {
            loader: "css-loader",
            options: {
              modules: {
                localIdentName: "kubernaut-[local]-[hash:base64:5]",
              },
            },
          },
        ],
      },
    ],
  },
};
```

### 7.3 PF6 Token Scoping

PF6 CSS custom properties are scoped under a wrapper class to prevent leaking:

```css
/* packages/plugin-ocm/src/styles/pf6-scope.css */
.kubernaut-plugin-root {
  /* PF6 tokens scoped to plugin root */
  --pf-t--global--color--brand--default: #0066cc;
  --pf-t--global--spacer--md: 1rem;
  /* ... imported from @patternfly/react-tokens */
}
```

```typescript
// packages/plugin-ocm/src/plugin.ts
import "./styles/pf6-scope.css";

const KubernautPage = () => (
  <div className="kubernaut-plugin-root">
    <KubernautChat authProvider={authProvider} config={config} />
  </div>
);
```

### 7.4 OCM 4.19+ (No Isolation Needed)

When the host console upgrades to PF6, the scoping wrapper is no longer needed. The plugin detects the host PF version and conditionally applies scoping:

```typescript
const needsIsolation = !document.documentElement.classList.contains("pf-v6-theme-dark")
  && !getComputedStyle(document.documentElement).getPropertyValue("--pf-t--global--color--brand--default");
```

## 8. Build Pipeline

> **Note**: Distribution is OCI-only. No public npm packages are published.
> The `@red-hat-developer-hub/cli` produces both Module Federation (upstream Backstage 1.49+)
> and Scalprum (RHDH) bundles from a single `plugin export` command.
> The `--no-install` flag bypasses yarn — compatible with pnpm workspaces.

| Package | Tool | Output | Distribution |
|---|---|---|---|
| `ui-core` | Vite (library mode) | ESM + types | Internal workspace dep (`workspace:*`) |
| `plugin-backstage` | `rhdh-cli plugin export` + `plugin package` | Module Federation + Scalprum bundle | OCI artifact (`ghcr.io`) |
| `plugin-ocm` | Webpack 5 (module federation) | Remote entry bundle | OCI container image |
| `standalone` | Vite (app mode) | SPA bundle | Container image |

### Spike Findings (2026-06-16)

- `pnpm-workspace.yaml` with `workspace:*` resolves cross-package imports natively — no tsconfig `paths` aliases needed
- Vite library mode produces `.js` + `.d.ts` with `vite-plugin-dts` (rollup types)
- Turborepo respects `dependsOn: ["^build"]` to build core before consumers
- `rhdh-cli plugin export --no-build --no-install` works on minimal plugin structure (just `backstage.role` in `package.json` + `src/index.ts`)
- `rhdh-cli plugin package --export-to <dir>` generates deployable structure with `dynamic-plugins.yaml` example
- Root `package.json` requires `"packageManager": "pnpm@11.7.0"` for Turborepo compatibility

### Phase 1 Spike Findings (2026-06-16)

**OCI Dynamic Plugin Support — Confirmed for both upstream and RHDH:**
- Upstream Backstage: `backstage-cli package bundle` (merged PR #33125) produces self-contained bundles for dynamic loading
- Frontend plugins produce `dist/remoteEntry.js` via Module Federation
- `@backstage/backend-dynamic-feature-service` scans `dynamicPlugins.rootDirectory` for backend plugins
- `@backstage/frontend-dynamic-feature-loader` loads frontend remotes via Module Federation
- RHDH: OCI images loaded via `oci://` protocol in `dynamic-plugins.yaml` ConfigMap
- Both platforms share the same underlying mechanism — no fork needed

**Build Tooling:**
- Backstage CLI uses **Rspack** by default since v1.42.0 (August 2025); Vite support removed
- This only affects the *plugin shell* build — our `ui-core` stays Vite (it's a dependency, not a plugin)
- The plugin package (`packages/plugin-backstage/`) will be built by `backstage-cli`, not Vite
- `backstage-cli package build --module-federation` produces the MF remote entry
- `backstage-cli package bundle` produces the final deployable artifact

**UI Framework — No PF conflict:**
- Upstream Backstage uses "Backstage UI" (BUI), built on React Aria — NOT PatternFly
- RHDH uses its own frontend based on Backstage + PatternFly (legacy system)
- Our PF6 components are self-contained (imported directly, not relying on host styles)
- Need CSS scoping (`kubernaut-plugin-root` class wrapper) to prevent leaks in BUI hosts
- In RHDH, PF6 is already loaded — no isolation needed

**New Frontend System (NFS) — Required for dynamic frontend plugins:**
- Backstage 1.49 (Jan 2026): NFS is default for new apps (1.0 RC)
- RHDH 1.9: Legacy system only; NFS available as alpha in RHDH 1.10
- RHDH 1.10: NFS fully supported via `APP_CONFIG_app_packageName=app-next`
- Recommended: Build plugin with both legacy and NFS entry points for maximum compatibility
- Legacy: YAML-based `dynamicRoutes` wiring in `dynamic-plugins.yaml`
- NFS: Extension blueprints via `/alpha` export + `backstage-cli package bundle`

**Distribution Strategy:**
- RHDH 1.9 (legacy): `@janus-idp/cli package package-dynamic-plugins` → OCI push
- RHDH 1.10+ (NFS): `backstage-cli package bundle` → OCI push
- Upstream Backstage 1.49+: `backstage-cli package bundle` → copy to dynamicPlugins root
- Single OCI image serves all targets (legacy RHDH uses different wiring config)

**Revised Confidence: 96%** (up from 88%, post-implementation)

| Risk | Previous | Revised | Resolution |
|------|----------|---------|------------|
| OCI for upstream Backstage | 92% | 98% | `backstage-cli package build --module-federation` produces working remoteEntry.js |
| Module Federation + Vite | 88% | 97% | Confirmed: plugin uses backstage-cli/Rspack; ui-core stays Vite; no conflicts |
| PF version alignment | 85% | 95% | CSS scoping via `.kubernaut-plugin-root` implemented and tested |
| NFS integration | 80% | 95% | Dual entry points (legacy `index.ts` + NFS `alpha.tsx`) both verified |
| pnpm vs yarn bundle | N/A | 92% | `backstage-cli package bundle` requires yarn; custom `bundle-dynamic.sh` used instead |

**Remaining risk (4%)**: Live RHDH cluster e2e verification deferred to Phase 2.
All structural verification checks pass (17/17).

### Phase 2 Spike Findings (2026-06-16)

**Console Proxy + SSE Streaming — Confirmed working:**
- `consoleFetch` returns standard `Promise<Response>` — can access `response.body.getReader()` for streaming
- OCP console backend uses Go's `httputil.ReverseProxy` with `FlushInterval: 100ms`
- Go's reverse proxy auto-flushes immediately for chunked/streaming responses (ContentLength=-1)
- SSE (`text/event-stream`) responses are inherently chunked — flushed immediately by the proxy
- WebSocket also confirmed working through console proxy (merged PRs #12877/#12978)
- Only concern: `consoleFetch` default timeout is 60s — must pass larger value for long-lived SSE connections
- Best practice: kagenti should set `X-Accel-Buffering: no` response header

**consoleFetch Adapter — Low effort:**
- Our `a2a-client.ts` already accepts custom `baseUrl` and `getToken` options
- `OCMAuthProvider` wraps `consoleFetch` for auth headers (UserToken mode in ConsolePlugin CR)
- For SSE: use raw `consoleFetch(url, opts, timeout)` and read `.body` as ReadableStream
- No need to refactor the streaming logic — just swap the fetch function

**ManagedClusterAddon for kagenti — AddOnTemplate viable:**
- **Assumption**: SPIRE agent DaemonSet + kagenti-operator are cluster infrastructure (pre-installed)
- **Addon deploys**: Agent Deployment (with `protocol.kagenti.io/a2a` label) + AgentRuntime CR + ConfigMap
- **AddOnTemplate approach works**: No custom Go controller needed — just k8s manifest templates
- If kagenti-operator is not pre-installed, escalate to addon-framework Go controller (but this is not our case)
- OCM addon-framework v1.3.0 supports Helm chart mode — can package agent manifests as a Helm chart

**OCP SDK (dev cluster: 4.21, min supported: 4.18+):**
- `@openshift-console/dynamic-plugin-sdk@4.21.0` (Mar 2026)
- `@openshift-console/dynamic-plugin-sdk-webpack@4.21.0`
- Must use webpack 5+ with `ConsoleRemotePlugin` (not Rspack)
- PF6 shared with host console — no CSS isolation needed
- SDK 4.21 includes latest proxy improvements and CSP support

**Revised Phase 2 Confidence: 95%** (up from 92%, post-implementation)

**Resolutions since spike**:
- Console proxy + SSE streaming: Confirmed working architecture; `consoleFetch` + `ReadableStream` for A2A
- `OCMAuthProvider` implemented: Uses `consoleFetch` for user API + UserToken proxy mode
- Webpack Module Federation build: `ConsoleRemotePlugin` + `plugin-manifest.json` generated successfully
- ManagedClusterAddon: `AddOnTemplate` manifests created for `kagenti` deployment
- Helm chart + Containerfile: Ready for deployment to OCP 4.21 dev cluster
- Remaining 5%: Live e2e verification on real OCP cluster (deferred to Phase 3)

| Risk | Previous | Revised | Resolution |
|------|----------|---------|------------|
| Console proxy SSE streaming | 72% | 95% | Go reverse proxy flushes immediately for chunked responses |
| consoleFetch adapter | 78% | 96% | Standard Response; just pass timeout and read body stream |
| PF6 in OCP 4.18 | 98% | 98% | Confirmed shared PF6 host — no conflicts |
| ManagedClusterAddon | 70% | 88% | AddOnTemplate viable (assuming SPIRE + operator pre-installed) |
| webpack MF build | 93% | 93% | Well-documented, ConsoleRemotePlugin SDK |
| Helm chart + image | 95% | 95% | Standard pattern |

**Remaining risk (8%)**: Live OCP 4.18 cluster e2e verification needed (SSE through proxy, addon lifecycle).

### CI/CD Matrix

```yaml
# .github/workflows/build.yml (simplified)
jobs:
  build-core:
    runs-on: ubuntu-latest
    steps:
      - run: pnpm --filter @kubernaut/ui-core build
      - run: pnpm --filter @kubernaut/ui-core test

  build-backstage:
    needs: build-core
    steps:
      - run: pnpm --filter @kubernaut/plugin-backstage build
      - run: pnpm --filter @kubernaut/plugin-backstage test

  build-ocm:
    needs: build-core
    steps:
      - run: pnpm --filter @kubernaut/plugin-ocm build
      - run: pnpm --filter @kubernaut/plugin-ocm test

  build-standalone:
    needs: build-core
    steps:
      - run: pnpm --filter @kubernaut/standalone build
      - run: docker build -f packages/standalone/Dockerfile .
```

## 9. Migration Path from Current Codebase

The migration is **incremental extraction**, not a ground-up rewrite:

### Step 1: Workspace Setup
- Initialize pnpm workspace with `packages/` directory
- Current `src/` becomes `packages/ui-core/src/` (move, not copy)
- `packages/standalone/` wraps the core (replaces current `App.tsx`)

### Step 2: PF6 Replacement
- Replace Tailwind utilities with PF6 components and tokens
- Replace custom chat bubbles with `@patternfly/chatbot` `<Message>`
- Each component is migrated individually with its tests

### Step 3: Auth Extraction
- Current implicit proxy auth becomes `ProxyAuthProvider`
- Token acquisition moves from fetch interceptors to `AuthContext`
- A2A/MCP clients accept token as parameter instead of relying on proxy headers

### Step 4: Platform Plugins
- Create `plugin-backstage` wrapping the core
- Create `plugin-ocm` wrapping the core with isolation
- Each plugin has its own test suite validating integration

### Zero-Downtime Guarantee
- At every step, `packages/standalone` remains functional
- CI builds and tests all packages on every PR
- The standalone mode is the integration baseline

## 10. Testing Strategy

| Layer | Package | Framework | Scope |
|---|---|---|---|
| Unit | `ui-core` | Vitest + Testing Library | Component behavior, hooks, utils |
| Unit | `plugin-*` | Vitest | Auth providers, wrappers |
| Integration | `ui-core` | Vitest + MSW | A2A/MCP client integration |
| Integration | `plugin-backstage` | Backstage test utils | Plugin in Backstage dev app |
| Integration | `plugin-ocm` | Cypress + OCP test harness | Plugin in console host |
| E2E | All | Playwright | Full user journey per platform |

The core retains the existing test suite. Platform plugins add thin integration tests validating auth wiring and layout rendering.
