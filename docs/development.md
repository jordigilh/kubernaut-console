# Development Guide

This document covers local development setup, mock mode, testing strategy, and contribution workflow.

## Prerequisites

- Node.js 22+ (LTS)
- npm 10+
- Git
- (Optional) kubectl + Kind cluster for integration testing

## Local Setup

```bash
# Clone the repository
git clone https://github.com/jordigilh/kubernaut-demo-console.git
cd kubernaut-demo-console

# Install dependencies
npm install

# Install pre-commit hooks (sensitive data detection)
./scripts/setup-githooks.sh

# Start development server
npm run dev
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

Then `npm run dev` — the Vite proxy routes `/a2a/`, `/mcp`, and `/.well-known/` to `localhost:8443`.

### Mock Mode

For frontend-only development without a backend:

```bash
VITE_MOCK_A2A=true npm run dev
```

This uses `src/lib/a2a-mock.ts` which simulates:
- SSE streaming with realistic delays
- Investigation summary artifacts
- Execution progress steps
- Phase transitions

Mock mode is useful for UI development, styling, and component testing.

## Available Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `dev` | `npm run dev` | Start Vite dev server with HMR |
| `build` | `npm run build` | TypeScript check + production build |
| `preview` | `npm run preview` | Preview production build locally |
| `test` | `npm test` | Run all tests (Vitest) |
| `test:watch` | `npm run test:watch` | Run tests in watch mode |
| `lint` | `npm run lint` | ESLint check |

## Testing

### Framework

- **Vitest** — Test runner (Jest-compatible API)
- **Testing Library** — Component rendering and user interaction
- **jsdom** — DOM environment for unit tests

### Test Structure

```
src/
  components/
    ChatContainer.integration.test.tsx  (IT tests)
    WorkflowCards.test.tsx              (UT tests)
    ApprovalCard.test.tsx               (UT tests)
    ...
  hooks/
    useChat.test.ts                     (UT tests)
    useChat.integration.test.ts         (IT tests)
  lib/
    a2a-client.test.ts                  (UT tests)
    mcp-client.test.ts                  (UT tests)
    audit.test.ts                       (UT tests)
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
- `IT-CONSOLE-JOURNEY-001` — End-to-end journey test

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npx vitest run src/hooks/useChat.test.ts

# Run tests matching a pattern
npx vitest run --reporter=verbose -t "UT-CONSOLE-CHAT"

# Watch mode (re-runs on file changes)
npm run test:watch

# Run with coverage (not configured in CI yet)
npx vitest run --coverage
```

### Test Coverage Areas

| Area | Coverage | Tests |
|------|----------|-------|
| A2A streaming client | Retry, abort, SSE parsing | `a2a-client.test.ts` |
| Chat state machine | Phase transitions, metadata, artifacts | `useChat.test.ts` |
| Status metadata extraction | RR context, phase mapping | `useChat.integration.test.ts` |
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

### CSS / Tailwind

- Tailwind CSS v4 (no `tailwind.config.js` — uses CSS-native config)
- Design tokens defined in `src/index.css`
- No inline styles unless overriding browser defaults
- Component-scoped styling via className props

### ESLint

ESLint with:
- `eslint-plugin-react-hooks` (Rules of Hooks, purity checks)
- `eslint-plugin-react-refresh` (HMR compatibility)
- `typescript-eslint` (type-aware linting)

The React compiler lint rules enforce:
- No impure function calls during render (`Date.now()`, `Math.random()`)
- No ref access during render (only in effects/handlers)
- Stable hook dependencies

## Build and Deployment

### Local Build

```bash
npm run build
```

Outputs to `dist/` — a static SPA ready to serve via any HTTP server.

### Container Build

```bash
docker build -t kubernaut-console:dev .
```

Multi-stage build:
1. `ubi9/nodejs-22` — `npm ci && npm run build`
2. `ubi9/nginx-126` — serves `dist/` with `deploy/nginx.conf`

### CI Pipeline

The CI workflow (`.github/workflows/ci.yaml`) runs on every PR:

| Job | Steps |
|-----|-------|
| `lint` | ESLint |
| `test` | Vitest (all 221 tests) |
| `security` | npm audit + Trivy scan |
| `build` | TypeScript + Vite build |
| `helm-lint` | Helm lint on chart/ |

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
