# Development Guide

This document covers local development setup, mock mode, testing strategy, and contribution workflow.

## Prerequisites

- Node.js 22+ (LTS)
- pnpm 11+ (`corepack enable && corepack prepare pnpm@11 --activate`)
- Git
- (Optional) kubectl + Kind cluster for integration testing

## Local Setup

```bash
# Clone the repository
git clone https://github.com/jordigilh/kubernaut-demo-console.git
cd kubernaut-demo-console

# Install dependencies
pnpm install

# Install pre-commit hooks (sensitive data detection)
./scripts/setup-githooks.sh

# Start development server
pnpm dev
```

The dev server starts at `http://localhost:5173` with hot module replacement.

## Environment Variables

Copy `.env.example` to `.env` and configure:

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_UPSTREAM` | `http://localhost:8443` | API Frontend URL for dev proxy |
| `VITE_MOCK_A2A` | `false` | Enable mock A2A mode |

## Development Modes

### Connected Mode (default)

Requires a running API Frontend. Port-forward from a Kind cluster:

```bash
kubectl port-forward -n kubernaut-system svc/apifrontend-service 8443:8443
```

Then `pnpm dev` — the Vite proxy routes `/a2a/`, `/mcp`, and `/.well-known/` to `localhost:8443`.

### Mock Mode

For frontend-only development without a backend:

```bash
VITE_MOCK_A2A=true pnpm dev
```

This uses `packages/ui-core/src/lib/a2a-mock.ts` which simulates:
- SSE streaming with realistic delays
- Investigation summary artifacts
- Execution progress steps
- Phase transitions

Mock mode is useful for UI development, styling, and component testing.

## Available Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `dev` | `pnpm dev` | Start Vite dev server with HMR |
| `build` | `pnpm build` | TypeScript check + production build (all packages) |
| `test` | `pnpm test` | Run all tests via Turbo (Vitest) |
| `lint` | `pnpm lint` | ESLint check |
| `storybook` | `pnpm storybook` | Start Storybook dev server on port 6006 |
| `test:visual` | `pnpm test:visual` | Run Playwright visual regression tests |

## Project Structure

This is a pnpm monorepo managed by Turborepo:

```
packages/
  ui-core/       — Shared UI component library (@kubernaut/ui-core)
  standalone/    — Standalone SPA wrapper (@kubernaut/standalone)
  plugin-backstage/ — Backstage/RHDH frontend plugin
  plugin-ocm/    — OCP/OCM dynamic console plugin
```

## Testing

### Framework

- **Vitest** — Test runner (Jest-compatible API)
- **Testing Library** — Component rendering and user interaction
- **jsdom** — DOM environment for unit tests
- **Playwright** — E2E and visual regression tests

### Test Structure

```
packages/ui-core/src/
  components/
    ChatContainer.integration.test.tsx      (IT tests)
    ChatContainer.status-stream.test.tsx     (IT tests — dual-channel status)
    WorkflowCards.test.tsx                   (UT tests)
    ApprovalCard.test.tsx                    (UT tests)
    ...
  hooks/
    useChat.test.ts                         (UT tests)
    useChat.integration.test.ts             (IT tests)
    useRRStatus.test.ts                     (UT tests)
  lib/
    a2a-client.test.ts                      (UT tests)
    a2a-status-client.test.ts               (UT tests)
    mcp-client.test.ts                      (UT tests)
    audit.test.ts                           (UT tests)
```

### Test ID Convention

Tests are identified by scenario IDs:

| Pattern | Meaning |
|---------|---------|
| `UT-CONSOLE-*` | Unit test — tests isolated logic |
| `IT-CONSOLE-*` | Integration test — tests component wiring and data flow |

Examples:
- `UT-CONSOLE-CHAT-016` — Unit test for phase parsing in useChat
- `IT-CONSOLE-STATUS-META-001` — Integration test for metadata extraction
- `IT-CONSOLE-BANNER-007` — Integration test for phase ratchet bypass

### Running Tests

```bash
# Run all tests (via Turbo — runs tests in ui-core and all packages)
pnpm test

# Run a specific test file
pnpm --filter @kubernaut/ui-core exec vitest run src/hooks/useChat.test.ts

# Run tests matching a pattern
pnpm --filter @kubernaut/ui-core exec vitest run --reporter=verbose -t "UT-CONSOLE-CHAT"

# Watch mode (re-runs on file changes)
pnpm --filter @kubernaut/ui-core exec vitest --watch

# Run with coverage
pnpm --filter @kubernaut/ui-core exec vitest run --coverage
```

### Test Coverage Areas

| Area | Coverage | Tests |
|------|----------|-------|
| A2A streaming client | Retry, abort, SSE parsing | `a2a-client.test.ts` |
| A2A status subscription | Dual-channel phase delivery, reconnection | `a2a-status-client.test.ts` |
| Chat state machine | Phase transitions, metadata, artifacts | `useChat.test.ts` |
| Status metadata extraction | RR context, phase mapping | `useChat.integration.test.ts` |
| Banner status stream | Dual-channel separation, ratchet bypass | `ChatContainer.status-stream.test.tsx` |
| Approval flow | MCP calls, card state | `ApprovalCard.test.tsx` |
| Workflow cards | Escalation, dismiss, display | `WorkflowCards.test.tsx` |
| Markdown rendering | XSS prevention, GFM | `MarkdownContent.test.tsx` |
| Audit events | Payload shape, delivery | `audit.test.ts` |
| MCP client | JSON-RPC, error handling | `mcp-client.test.ts` |

### Mock Strategy

- **Mock**: External APIs (A2A streaming, MCP endpoint, `fetch`, `sendBeacon`)
- **Real**: All React components, hooks, state management, DOM interactions
- **Polyfill**: `HTMLDialogElement.showModal()` (not available in jsdom)

## Code Style

### TypeScript

- Strict mode enabled
- No `any` unless absolutely necessary
- Explicit return types on exported functions
- Interfaces over type aliases for object shapes

### React

- Functional components only
- Hooks for all state and side effects
- `useCallback` for event handlers passed as props
- `useRef` for mutable values that don't trigger re-renders

### CSS

- PatternFly 6 components for `ui-core` (the shared library)
- Tailwind CSS v4 in `standalone` package only (CSS-native config, no `tailwind.config.js`)
- Custom design tokens in `packages/ui-core/src/styles/kubernaut-chat.css`
- Component-scoped styling via className props

### ESLint

ESLint with:
- `eslint-plugin-react-hooks` (Rules of Hooks, exhaustive deps)
- `eslint-plugin-react-refresh` (HMR compatibility)
- `typescript-eslint` (type-aware linting)

## Build and Deployment

### Local Build

```bash
pnpm build
```

Outputs to `packages/standalone/dist/` — a static SPA ready to serve via any HTTP server.

### Container Build

```bash
docker build -f packages/standalone/Containerfile -t kubernaut-console:dev .
```

Multi-stage build:
1. `ubi9/nodejs-22-minimal:1` — `pnpm install --frozen-lockfile && pnpm build`
2. `ubi9/nginx-126` — serves `dist/` with `deploy/nginx.conf`

### CI Pipeline

The CI workflow (`.github/workflows/ci.yml`) runs on every PR:

| Job | Steps |
|-----|-------|
| `build-and-test` | `pnpm build` + `pnpm test` |
| `security-scan` | Trivy filesystem scan |

### Release Pipeline

Tags matching `v*` trigger `.github/workflows/release.yaml`:
1. Run tests
2. Build multi-arch container image
3. Push to `quay.io/kubernaut-ai/demo-console:<version>`
4. Package Helm chart

## Pre-commit Hooks

The repository includes a pre-commit hook that detects sensitive data:

```bash
# Install hooks
./scripts/setup-githooks.sh
```

Detects: API keys, tokens, passwords, private keys, and other secrets in staged files.

## Architecture Decisions

See [docs/adr/](adr/) for documented architecture decisions including:
- ADR-001: OAuth2 Proxy sidecar pattern
- ADR-002: A2A over SSE (vs WebSocket)
- ADR-003: Phase-based status banner (vs step indicators)
- ADR-004: Static SPA with reverse proxy (vs server-rendered)
