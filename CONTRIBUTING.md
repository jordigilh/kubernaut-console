# Contributing to Kubernaut Console

## Repository Structure

```
kubernaut-demo-console/
├── packages/
│   ├── ui-core/           # Shared UI components (@kubernaut/ui-core)
│   └── standalone/        # Standalone Vite application
├── e2e/                   # Playwright E2E tests
├── scripts/               # Build/CI utility scripts
└── docs/migration/        # Architecture and migration docs (deferred, see ADR-007)
```

> **Note**: `plugin-backstage` and `plugin-ocm` packages existed here previously
> as part of a multi-platform plugin architecture. That work is deferred — see
> [ADR-007](docs/adr/007-multi-platform-plugin-architecture.md) — and only
> `standalone` is actively maintained. The "Adding a New Platform Plugin"
> section below is retained for when that work resumes.

## Prerequisites

- Node.js 22+
- pnpm 11+ (`corepack enable && corepack prepare pnpm@latest --activate`)
- For E2E tests: `npx playwright install chromium`

## Getting Started

```bash
# Install dependencies
pnpm install

# Build all packages (respects dependency order via Turborepo)
pnpm build

# Run all tests
pnpm test

# Start standalone dev server (with mock A2A)
VITE_MOCK_A2A=true pnpm dev
```

## Development Workflow

### Working on ui-core

```bash
cd packages/ui-core
pnpm test -- --watch   # Run tests in watch mode
```

Changes to `ui-core` automatically propagate to downstream packages via `workspace:*` linking.

## Adding a New Platform Plugin

> Deferred — see the note at the top of this document. Kept here for when
> multi-platform work resumes.

1. Create `packages/plugin-<name>/` with a `package.json`
2. Add `@kubernaut/ui-core: "workspace:*"` as a dependency
3. Implement `KubernautAuthProvider` for your platform's auth
4. Create a `KubernautConfig` with the correct `backendUrl` (and optional `fetchFn`)
5. Wrap `<KubernautChat authProvider={...} config={...} />` in your platform's shell
6. Add appropriate CSS scoping (`.kubernaut-plugin-root`)

### Key Interfaces

```typescript
// From @kubernaut/ui-core
interface KubernautAuthProvider {
  getToken(): Promise<string>;
  getUser(): Promise<KubernautUser>;
}

interface KubernautConfig {
  backendUrl: string;
  fetchFn?: (url: string, init?: RequestInit) => Promise<Response>;
}
```

## Testing

### Unit Tests (Vitest)

```bash
pnpm test                          # All packages
pnpm --filter @kubernaut/ui-core test  # Single package
```

### E2E Tests (Playwright)

```bash
npx playwright test e2e/standalone.spec.ts    # Standalone mode
npx playwright test e2e/accessibility.spec.ts # WCAG 2.1 AA
npx playwright test e2e/visual.spec.ts        # Visual regression (needs Storybook)
```

### Bundle Size

```bash
./scripts/bundle-size.sh  # Check all bundles against budgets
```

## Code Style

- TypeScript strict mode
- PatternFly 6 components (no Tailwind CSS)
- React 19
- Imports from `@kubernaut/ui-core` should use the public API (`src/index.ts` exports)

## Commit Conventions

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(ui-core): add new component
fix(standalone): handle proxy timeout
docs: update deployment guide
chore: update dependencies
test: add E2E for approval workflow
```

## Architecture Decisions

See `docs/migration/design.md` for the full design document and `docs/migration/ROADMAP.md` for the implementation timeline.

## Pull Request Process

1. **Branch from `main`** using the naming convention: `feat/`, `fix/`, `docs/`, `chore/`, `test/`
2. **Write tests first** for any behavioral change (TDD preferred)
3. **Run the full suite** before opening: `pnpm build && pnpm test && pnpm lint`
4. **Open a PR** with a clear description:
   - What changed and why
   - How to test (steps or automated)
   - Screenshots for UI changes
5. **CI must pass** — build, lint, unit tests, E2E, and visual regression
6. **One approval required** from a CODEOWNER
7. **Squash merge** to `main` with a Conventional Commit message

### PR Checklist

- [ ] Tests added/updated for new behavior
- [ ] No lint errors (`pnpm lint`)
- [ ] CHANGELOG.md updated (if user-facing)
- [ ] Documentation updated (if API/behavior changed)
- [ ] Visual regression baselines updated (if component changed)

## Code of Conduct

This project follows the [Contributor Covenant](https://www.contributor-covenant.org/version/2/1/code_of_conduct/) Code of Conduct. Be respectful, inclusive, and constructive.
