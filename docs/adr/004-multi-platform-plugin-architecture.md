# ADR-004: Multi-Platform Plugin Architecture

## Status

Accepted

## Context

The Kubernaut console is currently a standalone React application deployed with oauth2-proxy behind an OpenShift route. To reach a broader audience and integrate with existing developer workflows, the console needs to run as a plugin inside platform developer portals — specifically Backstage (upstream) and OCM multicluster-console (upstream).

Red Hat downstream products (RHDH and ACM) are expected to consume these upstream plugins with minimal adaptation. The downstream integration is explicitly deferred to the downstream team.

Key constraints:
- The chat UI is the core value — it must work identically across all platforms
- Each platform has its own auth system, layout shell, and plugin lifecycle
- PatternFly 6 is the Red Hat design system standard; `@patternfly/chatbot` provides purpose-built chat components
- Backstage uses its own component system (BUI), not PatternFly, but dynamic plugins run in isolation
- OCM/OCP console plugins use PatternFly natively
- The backend auth is already issuer-agnostic (JWKS-based validation, confirmed in #1436)

## Decision

### 1. Portable UI Core + Platform Adapters

Extract the chat UI into a platform-agnostic core package (`kubernaut-ui-core`) that exports a single `<KubernautChat />` root component. Platform-specific plugins are thin wrappers that provide layout, auth, and routing.

```
kubernaut-ui-core (PF6 + @patternfly/chatbot)
├── Backstage plugin wrapper (standalone page at /kubernaut)
├── OCM console plugin wrapper (ConsolePlugin CR)
└── Standalone wrapper (oauth2-proxy, current mode)
```

### 2. Upstream First, Downstream Inherits

| Layer | Owner | Target |
|-------|-------|--------|
| `kubernaut-ui-core` | This team | Portable, platform-agnostic |
| `plugin-backstage` | This team | Upstream Backstage 1.49+ |
| `plugin-ocm` | This team | Upstream OCM 0.14+ / OCP 4.17+ |
| RHDH adaptation | Downstream team | RHDH 1.8+ (PF6 dynamic plugins) |
| ACM adaptation | Downstream team | ACM 2.12+ |

### 3. PatternFly 6 with `@patternfly/chatbot`

The UI core uses PatternFly 6 and `@patternfly/chatbot` from day one:
- `@patternfly/chatbot` is purpose-built for conversational UIs (message bubbles, streaming indicators, action cards)
- PF6 provides the token system, layout primitives, and accessibility patterns
- Backstage dynamic plugins run in isolation — PF6 does not conflict with Backstage's BUI
- OCM/OCP 4.17-4.18 uses PF5; the plugin uses CSS module isolation to avoid conflicts
- OCM/OCP 4.19+ adopts PF6 natively, removing the isolation requirement

### 4. Generic Auth Abstraction

A single interface abstracts token acquisition across platforms:

```typescript
interface KubernautAuthProvider {
  getToken(): Promise<string>;
  getUser(): Promise<{ name: string; email: string }>;
}
```

Implementations:
- `BackstageAuthProvider` — uses `identityApi.getCredentials()` from `@backstage/core-plugin-api`
- `OCMAuthProvider` — reads OIDC token from hub cluster session or ServiceAccount
- `ProxyAuthProvider` — reads `X-Forwarded-Access-Token` from oauth2-proxy (current standalone mode)

The backend validates all tokens identically via JWKS (issuer-agnostic).

### 5. OCM Dual Deployment (Console Plugin + Addon)

- **Console Plugin**: UI extension in the OCM hub cluster's multicluster-console, providing visibility into investigations across managed clusters
- **ManagedClusterAddon**: Deploys the Kubernaut agent to spoke clusters, managed by the OCM addon framework

## Alternatives Considered

### A. OCP Console Plugin Only (No Backstage)

Rejected — Backstage/RHDH is the strategic developer portal for Red Hat. OCP console is deprioritized for general developer workflows.

### B. Single Platform, Multiple Modes

Rejected — building a monolithic app that conditionally behaves as a Backstage plugin, OCM plugin, or standalone app creates unmaintainable conditional logic and testing matrix.

### C. PatternFly 5 Core

Rejected — `@patternfly/chatbot` targets PF6. Starting with PF5 would require an immediate migration once chatbot components are adopted. Dynamic plugin isolation makes PF6 safe in PF5 hosts.

### D. Platform-Specific Auth (No Abstraction)

Rejected — duplicating auth logic per platform increases maintenance. A thin `getToken()` interface is trivial to implement per platform while keeping the core token-agnostic.

## Consequences

### Positive

- Single source of truth for the chat UI — fixes and features propagate to all platforms
- Downstream teams inherit a working plugin and only need platform-specific configuration
- `@patternfly/chatbot` provides accessible, tested chat patterns out of the box
- Incremental migration from current codebase (extraction, not rewrite)
- Backstage integration unlocks the RHDH ecosystem (catalog-aware, TechDocs, search)
- OCM integration provides multicluster remediation visibility at the hub level

### Negative

- Initial extraction effort (~2-3 weeks for Phase 0)
- CSS isolation adds complexity for OCM 4.17-4.18 (temporary, until PF6 adoption)
- Three deployment targets increase CI/CD surface area
- Downstream teams must understand the adapter pattern to customize

### Neutral

- Tailwind CSS removed from core (replaced by PF6 tokens) — different styling approach
- Build tooling changes: Vite (standalone) / Webpack (OCM) / Backstage CLI (Backstage)
- Test strategy: core unit tests + per-platform integration tests

## References

- [#1436 — Backend JWKS auth is issuer-agnostic](https://github.com/jordigilh/kubernaut/issues/1436)
- [PatternFly Chatbot](https://www.patternfly.org/extensions/chatbot/)
- [Backstage New Frontend System](https://backstage.io/docs/frontend-system/)
- [OCM Addon Framework](https://open-cluster-management.io/concepts/addon/)
- [OCP Dynamic Console Plugins](https://docs.openshift.com/container-platform/latest/web_console/dynamic-plugin/overview-dynamic-plugin.html)
