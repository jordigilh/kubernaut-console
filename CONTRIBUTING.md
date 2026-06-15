# Contributing to Kubernaut Demo Console

Thank you for your interest in contributing! This document provides guidelines for contributing to the Kubernaut Demo Console.

## Prerequisites

- **Node.js 22+** (use `.nvmrc` or check CI for exact version)
- **npm** (comes with Node.js)
- **Git**
- For deployment testing: **kubectl**, **kind**, **Helm 3**

## Getting Started

### 1. Clone and Install

```bash
git clone https://github.com/jordigilh/kubernaut-demo-console.git
cd kubernaut-demo-console
npm ci
```

### 2. Set Up Git Hooks

```bash
./scripts/setup-githooks.sh
```

This installs a pre-commit hook that scans for accidentally committed secrets.

### 3. Run Locally

```bash
# With mock backend (no external dependencies)
VITE_MOCK_A2A=true npm run dev

# With real backend (requires port-forward to apifrontend)
cp .env.example .env
npm run dev
```

### 4. Run Tests

```bash
npm test          # Single run
npm run test:watch  # Watch mode
```

## Development Workflow

### Branch Naming

- `feat/<description>` — New features
- `fix/<description>` — Bug fixes
- `chore/<description>` — Maintenance, refactoring, docs
- `docs/<description>` — Documentation only

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]
```

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `ci`, `chore`

Scopes: `ux`, `auth`, `mcp`, `a2a`, `infra`, `types`, `test`

### Pull Request Process

1. Create a feature branch from `main`
2. Make your changes with tests
3. Ensure all CI checks pass:
   - `npm run lint` — ESLint
   - `npm test` — Vitest (unit + integration)
   - `npm run build` — TypeScript compilation + Vite build
4. Push and open a PR
5. Request review from a CODEOWNER

### CI Requirements

All PRs must pass:

| Job | Command | What it checks |
|-----|---------|----------------|
| lint | `eslint .` | Code style and errors |
| test | `vitest run` | Unit and integration tests |
| build | `tsc -b && vite build` | Type safety and bundling |
| security | `npm audit`, Trivy | Dependency and container vulnerabilities |
| helm-lint | `helm lint ./chart` | Helm chart validity |

## Coding Standards

### TypeScript

- Strict mode enabled (`tsconfig.json`)
- No `any` — use proper types or `unknown`
- Interfaces over type aliases for object shapes
- Export types alongside their implementations

### React

- Functional components only
- Custom hooks for shared logic (`src/hooks/`)
- CSS via Tailwind utility classes (no CSS modules)
- Accessibility: semantic HTML, ARIA attributes, keyboard navigation

### Testing

- Framework: **Vitest** + **Testing Library**
- Test files co-located with source: `Component.test.tsx`
- Test IDs: `UT-CONSOLE-<AREA>-<NUMBER>` (e.g., `UT-CONSOLE-MCP-001`)
- Mock only external boundaries (fetch, timers)
- Use `screen.getByTestId` / `screen.getByRole` for queries

### File Organization

```
src/
├── components/    # React components (one per file)
├── hooks/         # Custom React hooks
├── lib/           # Non-React utilities (clients, schemas)
├── index.css      # Global styles and Tailwind config
└── main.tsx       # Entry point
```

## Helm Chart Changes

When modifying `chart/`:

- Update `chart/values.yaml` with sensible defaults
- Add comments explaining non-obvious values
- Run `helm lint ./chart` before committing
- Test with `helm template kubernaut-console ./chart | kubectl apply --dry-run=client -f -`

## Getting Help

- Open a [GitHub Discussion](https://github.com/jordigilh/kubernaut-demo-console/discussions) for questions
- File an [Issue](https://github.com/jordigilh/kubernaut-demo-console/issues) for bugs or feature requests
- Check existing issues before creating new ones

## License

By contributing, you agree that your contributions will be licensed under the [Apache License 2.0](LICENSE).
