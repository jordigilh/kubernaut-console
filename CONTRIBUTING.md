# Contributing to Kubernaut Console

Thank you for your interest in contributing to Kubernaut Console.

## Getting Started

1. Fork the repository
2. Clone your fork and set up the development environment (see [Development Guide](docs/development.md))
3. Create a feature branch from `main`
4. Make your changes following the guidelines below
5. Submit a pull request

## Development Workflow

### Branch Naming

```
feat/<short-description>     # New features
fix/<short-description>      # Bug fixes
docs/<short-description>     # Documentation
refactor/<short-description> # Code improvements
test/<short-description>     # Test additions
```

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(component): add workflow parameter editing
fix(useChat): handle missing metadata gracefully
test: add status metadata integration tests
docs: update deployment guide for Helm 3.14
```

### Pull Request Process

1. Ensure all CI checks pass (lint, test, security, build, helm-lint)
2. Update documentation if behavior changes
3. Add tests for new functionality
4. Keep PRs focused — one logical change per PR
5. Reference related issues in the PR description

## Code Standards

### TypeScript

- Strict mode (`strict: true` in tsconfig)
- No `any` types unless unavoidable (document why in a comment)
- Use interfaces for object shapes, types for unions/intersections
- Explicit return types on exported functions

### React

- Functional components only
- Use hooks for state and side effects
- Wrap event handlers in `useCallback` when passed as props
- Avoid inline object/array literals in JSX props (causes unnecessary re-renders)

### Testing

- Write tests for all new functionality
- Use test scenario IDs: `UT-CONSOLE-<AREA>-<NUMBER>` for unit tests, `IT-CONSOLE-<AREA>-<NUMBER>` for integration
- Mock only external dependencies (fetch, sendBeacon)
- Use real React components and hooks in tests

### CSS / Tailwind

- Use Tailwind utility classes
- Design tokens defined in `src/index.css`
- No inline styles unless overriding browser defaults
- Ensure dark/light mode compatibility (when implemented)

### Accessibility

- All interactive elements must be keyboard-accessible
- Use semantic HTML (`<button>`, `<form>`, `<nav>`, `<main>`)
- Provide `aria-label` for icon-only buttons
- Include `role` and `aria-live` for dynamic content regions

## Security

- Never commit secrets, tokens, or credentials
- The pre-commit hook will block sensitive data — run `./scripts/setup-githooks.sh`
- Report vulnerabilities per [SECURITY.md](SECURITY.md)
- Follow FedRAMP control guidelines for new features touching auth or audit

## Review Criteria

Reviewers will assess:

- [ ] Tests pass and cover new behavior
- [ ] No new lint warnings or TypeScript errors
- [ ] Accessibility requirements met
- [ ] Security implications considered
- [ ] Documentation updated if user-facing behavior changes
- [ ] No unnecessary dependencies added

## Questions?

Open a GitHub Discussion or reach out to the maintainers listed in CODEOWNERS.
